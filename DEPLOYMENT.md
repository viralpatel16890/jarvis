# Deployment Guide

JARVIS runs as a **split deployment**: Vercel serves the static Angular SPA,
and Render runs the long-lived Express backend (`server.js`) that proxies
`/anthropic/*`, `/ollama/*`, `/openai/*`, and `/hermes/*`. The Angular app
always calls relative URLs, so Vercel rewrites those paths straight through
to the Render service — from the browser's perspective it's all same-origin.

Render is the single source of truth for backend/proxy logic. There is no
separate Vercel Edge Function implementation to keep in sync.

## Vercel (frontend)

Live at <https://jarvis-one-pearl.vercel.app>. Pushes to `main` auto-deploy.
Configuration lives in `vercel.json`:

- `buildCommand` / `outputDirectory` — builds and serves the Angular SPA
- `rewrites` — forwards `/anthropic/*`, `/ollama/*`, `/openai/*`, `/hermes/*`
  to the Render service (`https://jarvis-oeob.onrender.com`); everything
  else falls through to `index.html`

No environment variables or serverless functions needed on Vercel — it's a
pure static host plus a reverse proxy in front of Render.

## Render (backend)

1. Render dashboard → **New → Blueprint** → select this repo. The
   `render.yaml` at the repo root provisions a Node web service that builds
   the Angular app and runs `node server.js`.
2. Set `ANTHROPIC_KEY` (and optionally `OLLAMA_URL`) when prompted — they are
   declared `sync: false`, so values live only in the dashboard.
3. Health checks hit `/hermes/health`.

`server.js` injects `ANTHROPIC_KEY` into `/anthropic/*` requests when the
client didn't supply a key. `/openai/*` is proxied to an allow-listed set of
providers (Groq, Gemini, OpenRouter, OpenAI) selected via the `x-provider`
header — never a client-supplied URL — so it can't become an open proxy.

If the Render URL ever changes, update the four `destination` values in
`vercel.json` to match.

## Notes for both platforms

- **Node version**: Angular CLI 22 requires Node ≥ 22.22.3 or ≥ 24.15.0.
  Vercel is pinned to 24.x in project settings; Render is pinned via
  `NODE_VERSION` in `render.yaml`.
- **Ollama cannot run on either platform's standard tiers** — it needs a
  GPU/high-RAM host. `OLLAMA_URL` must point at an externally hosted
  instance; leave it unset to run Claude-only.
- **The Hermes bridge (`bridge/bridge.js`) is local-only.** It shells out to
  the Hermes CLI and a local Ollama, so it is not deployed; both platforms
  serve the built-in `/hermes/*` stubs instead.
