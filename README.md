# TUAN OS Enterprise

TUAN OS Enterprise is a unified control-center dashboard for AI-run business
units — hospitality, education, marketing, finance, and company-wide
operations — built with Next.js and deployable as a single Docker container
on [Coolify](https://coolify.io).

## Version

**v0.1.0** — initial dashboard release.

## Features

- **Sections**: CEO Dashboard, Hospitality AI, iSTEAM AI, Marketing AI,
  Finance AI, Logs, Settings
- **Hospitality card**: live status for Lavender Homestay, Ruby Homestay,
  and Cozy Garden, plus Reception AI status
- **AI Activity panel**: real-time-style feed of what the AI agents are
  currently doing (reading messages, checking the knowledge base, waiting
  for approval)
- Clean, modern, dark dashboard UI built with Tailwind CSS

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- Docker (standalone output) for deployment

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm run start
```

## Deploying on Coolify

This repo ships with a multi-stage `Dockerfile` that builds the app using
Next.js's `output: "standalone"` mode, producing a minimal production image.

1. In Coolify, create a new **Application** resource pointing at this Git
   repository.
2. Set the build pack to **Dockerfile** (Coolify will auto-detect the
   `Dockerfile` at the repo root).
3. Expose port **3000** (the container listens on `PORT=3000` by default;
   Coolify reads this from the Dockerfile).
4. Deploy — Coolify will build the image and run `node server.js`.

No additional environment variables are required for v0.1.

## Project structure

```
src/
  app/            App Router pages, layout, and global styles
  components/     Dashboard UI components (Sidebar, cards, panels)
  lib/            Static data (dashboard sections)
Dockerfile        Multi-stage production build for Coolify
```
