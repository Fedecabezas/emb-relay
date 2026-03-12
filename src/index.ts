/**
 * embrague-relay — Cloudflare Worker entry point
 *
 * Routes:
 *   GET /ws/orchestrator  → WebSocket upgrade for EmbragueEnvOrchestrator nodes
 *   GET /ws/console       → WebSocket upgrade for the Barebone dashboard (browser)
 *   GET /health           → simple liveness probe
 *
 * All WS connections are forwarded to the RelayRoom Durable Object, which
 * keeps every connection alive in memory and handles bidirectional routing.
 */

import { RelayRoom } from './relay-room';
export { RelayRoom };

export interface Env {
  RELAY_ROOM:       DurableObjectNamespace;
  AUTH_SERVICE_URL: string;   // https://auth.embrague.xyz
  RELAY_SECRET:     string;   // shared secret for orchestrator auth
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // ── Liveness ──────────────────────────────────────────────────────────────
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Orchestrator WebSocket ─────────────────────────────────────────────────
    if (url.pathname === '/ws/orchestrator') {
      // Orchestrators authenticate with a static RELAY_SECRET token.
      // In a future iteration this becomes a per-account JWT issued by auth.embrague.xyz.
      const token = url.searchParams.get('token') ?? req.headers.get('x-relay-token');
      if (token !== env.RELAY_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
      return forwardToRoom(req, env, 'orchestrator');
    }

    // ── Console (browser) WebSocket ──────────────────────────────────────────
    if (url.pathname === '/ws/console') {
      // Browser sends its session cookie → we validate against auth.embrague.xyz
      const authed = await validateSession(req, env);
      if (!authed) {
        return new Response('Unauthorized', { status: 401 });
      }
      return forwardToRoom(req, env, 'console');
    }

    return new Response('Not found', { status: 404 });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Route the WebSocket upgrade request to the singleton RelayRoom DO. */
function forwardToRoom(req: Request, env: Env, role: 'orchestrator' | 'console'): Promise<Response> {
  // Single global room — all orchestrators and consoles share one DO instance.
  const id   = env.RELAY_ROOM.idFromName('global');
  const stub = env.RELAY_ROOM.get(id);

  // Pass the role as a header so the DO knows what kind of client this is.
  const forwarded = new Request(req.url, {
    headers: { ...Object.fromEntries(req.headers), 'x-client-role': role },
    body: req.body,
    method: req.method,
  });

  return stub.fetch(forwarded);
}

/** Validate the browser session cookie against auth.embrague.xyz/auth/me */
async function validateSession(req: Request, env: Env): Promise<boolean> {
  try {
    const res = await fetch(`${env.AUTH_SERVICE_URL}/auth/me`, {
      headers: { cookie: req.headers.get('cookie') ?? '' },
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}
