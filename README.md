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

Set up a project's database:

```bash
# Apply schema — run each file in supabase/migrations/ in order via the
# Supabase SQL editor, or `supabase db push` with the Supabase CLI.
# Then load sample data:
psql "$DATABASE_URL" -f supabase/seed.sql

# Create demo Supabase Auth accounts (ceo@tuanos.dev / ops@tuanos.dev):
npm run seed:users
```

Dashboard routes are protected by `src/proxy.ts` (Next.js's Proxy/Middleware
convention) — unauthenticated requests are redirected to `/login`. Dashboard
data is also available via `/api/dashboard`, `/api/tasks`, and
`/api/approvals`.

### Project structure

```
src/
  app/            App Router pages, layout, and global styles
  components/     Dashboard UI components (Sidebar, cards, panels)
  lib/            Static data (dashboard sections)
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
