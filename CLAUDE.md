# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Hub is a centralized agent collaboration platform that enables autonomous software agents to register, discover each other, communicate in real time, and coordinate task execution. It consists of a Fastify server and a publishable client SDK (`@drok/agent-hub-sdk`).

## Commands

```bash
# Development
npm install                # Install dependencies
npm run dev                # Start dev server with hot-reload (tsx watch)
npm run build              # TypeScript compile (type-check only, see note below)
npm run start              # Run compiled output (node dist/index.js)

# Database
cp .env.example .env       # Create environment config (JWT_SECRET required, min 32 chars)
npm run db:generate        # Generate Drizzle migrations from schema changes
npm run db:migrate         # Apply pending migrations to SQLite
npm run db:studio          # Open Drizzle Studio (browser UI)

# SDK (separate package, not linked via workspaces)
cd sdk && npm install && npm run build

# Production
pm2 start ecosystem.config.js   # Deploy with PM2

# MCP Server Testing
# After starting dev server, test with MCP Inspector:
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

**Note:** The root `tsconfig.json` has `noEmit: true`, so `npm run build` only type-checks — it does not produce `dist/` output. The `npm run start` script will fail without output files. For dev, use `npm run dev` instead.

## Architecture

### Triple Transport

REST (Fastify) handles CRUD and queries; WebSocket (`ws` library, `noServer` mode) handles real-time bidirectional communication; MCP (`@modelcontextprotocol/sdk`) enables agent integration via the Model Context Protocol. All three layers share a single `ConnectionManager` instance.

### Key Components

- **`src/index.ts`** — Bootstrap: config validation → DB init → Fastify server → routes → ConnectionManager → WebSocket server → MCP server → heartbeat checker
- **`src/config.ts`** — Zod-validated environment variables (exits on failure)
- **`src/db/schema.ts`** — Drizzle ORM schema: `agents`, `agent_tokens`, `tasks`, `messages`
- **`src/db/index.ts`** — Singleton DB connection (`initDatabase`/`getDatabase`)
- **`src/auth/`** — JWT auth via `jose` (HS256). HTTP: Bearer token in header. WebSocket: token in query param `?token=`
- **`src/ws/connection.ts`** — `ConnectionManager`: in-memory registry of live WS connections, channel pub/sub, heartbeat tracking
- **`src/ws/handler.ts`** — WS message dispatcher
- **`src/mcp/server.ts`** — MCP server session management (create/get/delete sessions)
- **`src/mcp/tools.ts`** — 15 MCP tool definitions covering agent, task, message, and state domains
- **`src/utils/errors.ts`** — Typed error catalog with HTTP status codes

### MCP Server

The MCP server is mounted at `/mcp` on the same Fastify server. It uses `StreamableHTTPServerTransport` with session management — each client gets a session ID via the `Mcp-Session-Id` response header, which must be sent back on subsequent requests.

MCP tools bypass the REST layer and directly access the database. Each tool accepts a `token` parameter (JWT from `register_agent`) for authentication.

**Available MCP tools:** `register_agent`, `list_agents`, `get_agent`, `update_agent`, `deregister_agent`, `create_task`, `list_tasks`, `get_task`, `update_task`, `cancel_task`, `send_message`, `get_messages`, `broadcast_message`, `set_state`, `get_state`

**Agent connection flow:**
1. Call `register_agent` → get JWT token
2. Use token in all subsequent tool calls
3. Use `create_task` / `list_tasks` to coordinate work

### Task State Machine

```
pending → assigned | cancelled
assigned → running | cancelled
running → completed | failed
completed → (terminal)
failed → (terminal)
cancelled → (terminal)
```

### API Response Envelope

All REST endpoints return `{ ok: boolean, data: T, error?: { code, message } }`.

### SDK (`sdk/`)

Separate npm package with its own `package.json`/`tsconfig.json`. `AgentClient` extends `EventEmitter`, connects via WebSocket with auto-reconnect (exponential backoff). Exports: `AgentClient`, `AgentConfig`, `Agent`, `Task`, `Message`, `StateChange`, `Events`.

## Known Issues

- `vitest`, `eslint`, `prettier` are in npm scripts but not installed as devDependencies
- Shared state (`/api/v1/state/:key`) is in-memory only — lost on restart
- Task timeout detection is not implemented (design doc describes it, code does not)
- No test files exist despite `vitest` being the declared test runner

## Conventions

- ESM modules (`"type": "module"`)
- Path alias: `@/*` maps to `src/*`
- JSON fields in SQLite are stored as text and parsed/serialized manually
- Database uses WAL mode for concurrent read/write
