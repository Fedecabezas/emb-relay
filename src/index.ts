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
import { createRemoteJWKSet, jwtVerify } from 'jose';

export { RelayRoom };

export interface Env {
  RELAY_ROOM:       DurableObjectNamespace;
  AUTH_SERVICE_URL: string;   // https://auth.embrague.xyz
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

    // ── Orchestrator WebSocket (Machine-to-Machine JWT) ────────────────────────
    if (url.pathname === '/connect' || url.pathname === '/ws/orchestrator') {
      const authHeader = req.headers.get('Authorization');
      let token = url.searchParams.get('token');

      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.substring(7);
      }

      if (!token) {
        return new Response('Unauthorized: Missing Token', { status: 401 });
      }

      try {
        const JWKS = createRemoteJWKSet(new URL(`${env.AUTH_SERVICE_URL}/.well-known/jwks.json`));
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: 'embrague-auth-service',
          audience: 'embrague-ecosystem'
        });

        // Verificamos que sea verdaderamente una máquina
        if (payload.type !== 'machine') {
          return new Response('Forbidden: Only machine accounts allowed', { status: 403 });
        }

        return forwardToRoom(req, env, 'orchestrator', payload.sub as string);
      } catch (err) {
        console.error('[JWT Verification Failed]', err);
        return new Response('Unauthorized: Invalid Token', { status: 401 });
      }
    }

    // ── Console (browser) WebSocket ──────────────────────────────────────────
    if (url.pathname === '/ws/console') {
      // Browser sends its session cookie → we validate against auth.embrague.xyz
      const sessionData = await validateSession(req, env);
      if (!sessionData) {
        return new Response('Unauthorized: Invalid Session', { status: 401 });
      }
      return forwardToRoom(req, env, 'console', sessionData.userId);
    }

    return new Response('Not found', { status: 404 });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Route the WebSocket upgrade request to the singleton RelayRoom DO. */
function forwardToRoom(req: Request, env: Env, role: 'orchestrator' | 'console', clientId: string): Promise<Response> {
  const id   = env.RELAY_ROOM.idFromName('global');
  const stub = env.RELAY_ROOM.get(id);

  // Pass the role and ID as headers so the DO knows exactly who connected
  const forwarded = new Request(req.url, {
    headers: { 
      ...Object.fromEntries(req.headers), 
      'x-client-role': role,
      'x-client-id': clientId 
    },
    body: req.body,
    method: req.method,
  });

  return stub.fetch(forwarded);
}

/** Validate the browser session cookie against auth.embrague.xyz/auth/me */
async function validateSession(req: Request, env: Env): Promise<{userId: string} | null> {
  try {
    const res = await fetch(`${env.AUTH_SERVICE_URL}/auth/me`, {
      headers: { cookie: req.headers.get('cookie') ?? '' }
    });
    
    if (res.ok) {
      const data = await res.json() as any;
      return { userId: data.user.id };
    }
    return null;
  } catch {
    return null;
  }
}

