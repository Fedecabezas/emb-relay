/**
 * RelayRoom — Durable Object
 *
 * Holds all active WebSocket connections in memory:
 *   - "orchestrator" connections: EmbragueEnvOrchestrator nodes
 *   - "console" connections: Barebone dashboard browser tabs
 *
 * Message routing:
 *   orchestrator → console  : logs, status, telemetry (broadcast to all consoles)
 *   console → orchestrator  : commands (start, stop, restart) — routed by orchestrator_id
 *
 * Wire protocol (JSON):
 *
 *   Orchestrator → Relay:
 *     { type: "hello",  id: string, hostname: string, meta: OrchestratorMeta }
 *     { type: "status", service: string, running: boolean, pid?: number }
 *     { type: "log",    service_id: string, line: string, timestamp_ms: number, is_stderr: boolean }
 *     { type: "telemetry", cpu_pct: number, ram_mb: number, services: Record<string, { cpu: number, ram_mb: number }> }
 *
 *   Console → Relay → Orchestrator:
 *     { type: "start",   orchestrator_id: string, service: string, mode?: string }
 *     { type: "stop",    orchestrator_id: string, service: string }
 *     { type: "restart", orchestrator_id: string, service: string }
 *
 *   Relay → Console (broadcast):
 *     { type: "init",                 orchestrators: OrchestratorSnapshot[] }
 *     { type: "orchestrator:joined",  node: OrchestratorSnapshot }
 *     { type: "orchestrator:left",    id: string }
 *     { type: "status",  orchestrator_id, service, running, pid? }
 *     { type: "log",     orchestrator_id, service_id, line, timestamp_ms, is_stderr }
 *     { type: "telemetry", orchestrator_id, cpu_pct, ram_mb, services }
 */

export interface Env {}

interface OrchestratorConn {
  ws:       WebSocket;
  id:       string;
  hostname: string;
  meta:     unknown;         // OrchestratorMeta — passed through as-is
  connectedAt: number;
}

export class RelayRoom {
  private orchestrators = new Map<string, OrchestratorConn>();
  private consoles      = new Set<WebSocket>();

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const role = req.headers.get('x-client-role') as 'orchestrator' | 'console';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server, [role]);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Durable Object WebSocket event handlers ─────────────────────────────────

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const tags = this.state.getTags(ws);
    const role = tags[0] as 'orchestrator' | 'console';

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    if (role === 'orchestrator') {
      await this.handleOrchestrator(ws, msg);
    } else {
      await this.handleConsole(msg);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const tags = this.state.getTags(ws);
    const role = tags[0] as 'orchestrator' | 'console';

    if (role === 'orchestrator') {
      // Find and remove this orchestrator
      for (const [id, conn] of this.orchestrators) {
        if (conn.ws === ws) {
          this.orchestrators.delete(id);
          this.broadcastToConsoles({ type: 'orchestrator:left', id });
          break;
        }
      }
    } else {
      this.consoles.delete(ws);
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  // ── Orchestrator → Relay ───────────────────────────────────────────────────

  private async handleOrchestrator(ws: WebSocket, msg: Record<string, unknown>): Promise<void> {
      switch (msg.event ?? msg.type) {
        // En Rust le pusimos { event: "HEARTBEAT", target: "M7", inventory: [] }
        case 'HEARTBEAT':
        case 'hello': {
          const id = (msg.target ?? msg.id) as string;
          const conn: OrchestratorConn = {
            ws,
            id,
            hostname:    msg.hostname as string | undefined ?? 'Local-M7',
            meta:        msg.inventory ?? msg.meta,
            connectedAt: Date.now(),
          };
          this.orchestrators.set(conn.id, conn);
          type: 'orchestrator:joined',
          node: { id: conn.id, hostname: conn.hostname, meta: conn.meta, connected_at: conn.connectedAt, status: {} },
        });
        break;
      }

      case 'status':
      case 'log':
      case 'telemetry': {
        // Find this orchestrator's id from the open connections map
        const conn = [...this.orchestrators.values()].find(c => c.ws === ws);
        if (!conn) return;
        this.broadcastToConsoles({ ...msg, orchestrator_id: conn.id });
        break;
      }
    }
  }

  // ── Console → Relay → Orchestrator ────────────────────────────────────────

  private async handleConsole(msg: Record<string, unknown>): Promise<void> {
      // Ahora la consola manda { target: 'M7', command: 'restart', ... }
      const targetId = msg.target as string | undefined;
      if (!targetId) return;

      const conn = this.orchestrators.get(targetId);
      if (!conn) {
        // Podríamos responder a la consola con un error, pero el pasamanos silencioso es seguro
    // Forward command as-is to the target orchestrator
    conn.ws.send(JSON.stringify(msg));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private broadcastToConsoles(msg: unknown): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.consoles) {
      try {
        ws.send(payload);
      } catch {
        this.consoles.delete(ws);
      }
    }
  }

  // Send full snapshot to a newly connected console
  private sendInitSnapshot(ws: WebSocket): void {
    const orchestrators = [...this.orchestrators.values()].map(c => ({
      id:           c.id,
      hostname:     c.hostname,
      meta:         c.meta,
      connected_at: c.connectedAt,
      status:       {},
    }));
    ws.send(JSON.stringify({ type: 'init', orchestrators }));
  }
}
