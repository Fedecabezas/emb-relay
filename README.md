# emb-relay

## Overview
`emb-relay` is an edge-native WebSocket broker operating in a serverless environment via Cloudflare Workers. It functions as an immortal stateless-to-stateful router relaying bidirectional telemetrics, logging streams, and execution procedures strictly between isolated control nodes (`emb-orchestrator`) and web-based observer interfaces (`emb-console`). 

## Technical Architecture

- **`index.ts` (Edge Upgrade Router)**: Stateless ingress handler. Validates HTTP protocols, handles liveliness endpoints (`/health`), and performs strict zero-trust credential evaluation before promoting the connection stack to the WS protocol. 
  - `(/ws/orchestrator)`: Expects a `Bearer` authorization scheme. Uses `jose` to dynamically compile remote JWKS configurations, decoding the JWT to verify matching Audience values, and establishing the sub-account structure strictly requires a `'machine'` type definition.
  - `(/ws/console)`: Parses URL queries or native session cookies to evaluate standard human sessions dynamically acting through a back-proxy fetch confirmation against `auth.embrague.xyz/auth/me`. 

- **`relay-room.ts` (Durable Object Memory Core)**: Stateful object physically mapped to a guaranteed geographical V8 RAM sector. Replaces standard database reliance for active socket persistence. It maintains internal reference matrices `Map<string, OrchestratorConn>` and `Set<WebSocket>` representing machine endpoints vs monitoring browser endpoints concurrently.

## Wire Routing Mechanics (JSON Protocol)

The Durable Object logic explicitly divides event handling into a transparent dual stream system with custom namespace tagging `x-client-role` attached at the Edge Upgrade router level.

### Upstream (Orchestrator to Console Broadcasts)
The Relay broadcasts all events unconditionally to all entries living in the `Set<WebSocket>` belonging to Web Consoles.
- **Node Join**: Translates initial `HEARTBEAT`/`hello` structs directly mapping the initial payload array capabilities into a console broadcast mapped as `orchestrator:joined` while registering standard connected counters.
- **Node Left**: Synthesizes custom socket drop messages (`orchestrator:left`) by catching the native `webSocketClose()` or `webSocketError()` signals inside the worker engine.
- **Telemetry Loop**: Blindly passes through interval based metrics containing structural dictionaries.
- **Process Status & Logs**: Sub-string messages routed to updating internal console ring buffers per service ID.

### Downstream (Console to Orchestrator Mutations)
The Relay processes explicit executions targeted to endpoints implicitly without mutation algorithms aside from identifying the core node variable.
- The standard payload must contain a `target` attribute.
- The Worker queries its memory Map `this.orchestrators.get(targetId)` and flushes the entire message vector directly onto individual network threads natively attached to matching hardware devices.

## Build and Developer Deployment

This module utilizes the official Cloudflare tooling suite.

- **Engine**: V8 Isolates.
- **Compilation target**: ES-module structure via `wrangler.toml`.
- **Initialization**: `npm run dev` mapping miniflare instances simulating the edge node environments in an offline manner.
- **Observability in Production**: Replaces standard terminal output via `npm run logs`, actively subscribing through network traces to the production instance to observe live V8 environment `console.log` evaluations natively.
