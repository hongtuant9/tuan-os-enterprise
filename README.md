# TUAN OS Enterprise

TUAN OS Enterprise is a unified control-center for AI-run business units —
hospitality, education, marketing, finance, and company-wide operations —
deployable on [Coolify](https://coolify.io).

## Dashboard app (v0.1)

The web dashboard lives at the repo root and is a Next.js (App Router +
TypeScript + Tailwind CSS) app with:

- **Sections**: CEO Dashboard, Hospitality AI, iSTEAM AI, Marketing AI,
  Finance AI, Logs, Settings
- **Hospitality card**: live status for Lavender Homestay, Ruby Homestay,
  and Cozy Garden, plus Reception AI status
- **AI Activity panel**: a feed of what the AI agents are currently doing
  (reading messages, checking the knowledge base, waiting for approval)

### Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm run start
```

### Deploying the dashboard on Coolify

The repo ships with a multi-stage `Dockerfile` that builds the app using
Next.js's `output: "standalone"` mode, producing a minimal production image.

1. In Coolify, create a new **Application** resource pointing at this Git
   repository.
2. Set the build pack to **Dockerfile** (Coolify auto-detects the
   `Dockerfile` at the repo root).
3. Expose port **3000** (the container listens on `PORT=3000` by default).
4. Deploy — Coolify builds the image and runs `node server.js`.

### Supabase backend (v1)

The dashboard is backed by Supabase (Postgres + Auth). Set these env vars
(see `.env.example`) before running the app:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Set up a project's database — either run each file in `supabase/migrations/`
in order followed by `supabase/seed.sql` (via `supabase db push` + `psql`, or
pasted into the Supabase SQL Editor), **or** paste the single consolidated
`supabase/full_setup.sql` into the SQL Editor and run it once (same content,
no CLI/`DATABASE_URL` required). Either path also seeds a demo admin account
(`admin@tuanos.vn` / `12345678`, role `owner`).

To create additional demo accounts via the Auth Admin API instead of SQL:

```bash
npm run seed:users
```

Dashboard routes are protected by `src/proxy.ts` (Next.js's Proxy/Middleware
convention) — unauthenticated requests are redirected to `/login`.

### API & architecture (v1)

Data access goes through a **Repository + Service** layer under `src/server/`:

```
src/server/
  repositories/   thin Supabase query wrappers, one per table
  services/       domain logic + row-to-domain-type mapping + activity logging
  auth/           session/role resolution (roles.ts, session.ts, api-auth.ts)
  api/            shared REST handler factories (business-unit-handlers.ts), webhook auth
  container.ts    wires repositories -> services; getRequestContainer() (RLS-scoped,
                  cookie session) vs getAdminContainer() (service-role, bypasses RLS)
```

Every mutation (approve/reject, task status change) goes through a service
method, which writes the row *and* an `activity_logs` entry in the same call
— logins, approvals, rejections, and task updates are recorded automatically.
The dashboard UI applies these optimistically (approvals, tasks, and the
Activity Logs feed all update immediately client-side, then reconcile with
the server).

Roles (`src/server/auth/roles.ts`): `owner` > `admin` > `manager` > `agent`.
Approving/rejecting requests and creating records via the business-unit API
namespaces require `manager` or above; everything else just requires being
signed in.

REST endpoints:

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/dashboard` | session or `x-api-key` | aggregate stats |
| `GET /api/tasks`, `GET /api/approvals` | session or `x-api-key` | full lists |
| `GET/POST /api/hospitality`, `/marketing`, `/finance`, `/education` | session or `x-api-key` | per-business-unit data; `POST` (manager+) creates a task/approval/log scoped to that unit |
| `POST /api/webhooks/google-drive`, `/telegram`, `/n8n`, `/agents` | per-source shared secret header | inbound integration events, logged to `activity_logs` |

`x-api-key` (checked against `N8N_API_KEY`) lets automation (e.g. n8n) call
the dashboard/business-unit endpoints without a browser session. Each webhook
under `/api/webhooks/*` instead checks its own secret
(`GOOGLE_DRIVE_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `N8N_WEBHOOK_SECRET`,
`AI_AGENTS_WEBHOOK_SECRET`) — unset = the endpoint responds `501` rather than
accepting unauthenticated calls. See `.env.example` for all of these.

### Google Sheets sync framework (v1.1)

Google Sheets is the source of truth for six sources; Supabase is the
operational database they sync into. **Google OAuth is not wired up yet** —
`src/server/sync/adapters/google-sheets.adapter.ts` is a stub that throws a
clear "not configured" error, so every run today fails fast in a way that
still exercises the rest of the framework end-to-end (a `sync_runs` row, an
`import_logs` entry, and an `activity_logs` entry all get written).

```
src/server/sync/
  types.ts               SyncAdapter / SyncMapper interfaces, shared types
  adapters/               google-sheets.adapter.ts (stub — real API access is later work)
  mappers/                one per source: writes into a typed table (tasks, approvals)
                          or, for sources with no dedicated table yet, into sync_records
  registry.ts             source key -> adapter + mapper
  sync-runner.ts          orchestrates one run: fetch -> upsert -> log -> summarize
  sync-status.service.ts  read-only status for the dashboard
```

Sources (`sync_sources` table, seeded by migration `0009`):

| Key | Target | Business unit |
| --- | --- | --- |
| `task-001` | `tasks` (typed) | — |
| `approval-001` | `approvals` (typed) | — |
| `fin-001` | `sync_records` (generic) | Finance AI |
| `business-portfolio` | `sync_records` (generic) | CEO Overview |
| `family` | `sync_records` (generic) | — |
| `health` | `sync_records` (generic) | — |

`sync_records` is both the idempotency ledger (mapping an external sheet row
to the internal row it produced, so re-syncing updates instead of
duplicating) *and*, for sources with no dedicated table, the operational
record itself — until a real schema is warranted once the actual sheet
columns are known.

Incremental sync is supported via an opaque cursor stored on
`sync_sources.last_cursor`, threaded through every adapter call; a full
adapter just always returns `nextCursor: null`.

Triggering a sync:

- **Manual**: "Run now" on the Sync Status dashboard card, or
  `POST /api/sync/[source]/run` (session, manager+, `trigger="manual"`).
- **n8n**: same endpoint with `x-api-key: $N8N_API_KEY` (`trigger="n8n"`).
- **Scheduled**: `POST /api/sync/scheduled` (session admin+, or `x-api-key`)
  runs every source with `schedule_enabled = true` that's past its
  `schedule_interval_minutes` since `last_synced_at`. Next.js has no
  built-in scheduler — point an external one (Coolify scheduled task, n8n
  Cron node, system cron) at this URL as often as you like; it no-ops for
  sources that aren't due.

`GET /api/sync` lists every source's status; `GET /api/sync/[source]/logs`
returns a run's `import_logs` (latest by default, or `?runId=`).

### Project structure

```
src/
  app/            App Router pages, layout, actions, and API routes
  components/     Dashboard UI components (Sidebar, cards, panels)
  server/         Repository + Service architecture, sync framework (see above)
  lib/            Supabase clients (client/server/admin) and shared config
  data/           Shared domain types (Task, Approval, Agent, ...)
Dockerfile        Multi-stage production build for the dashboard app
```

## Backend infrastructure

The repo also tracks the supporting infrastructure stack, deployed
separately via `docker-compose.yml`:

- PostgreSQL, Redis, Qdrant, n8n
- Agent structure: Hospitality, iSTEAM, Marketing, Finance, CEO

See `docs/README_SETUP_VN.md` for Coolify setup steps for that stack, and
`docs/ROADMAP.md` for the overall project roadmap. Agent prompts live under
`agents/`, and knowledge-base source files live under `knowledge/`.
