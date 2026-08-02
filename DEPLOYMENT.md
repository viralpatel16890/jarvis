# Deployment Guide

JARVIS ships with two deployment paths that share the same frontend contract:
the Angular app always calls **relative** URLs (`/anthropic/*`, `/ollama/*`),
so whatever serves the SPA must also proxy those routes.

| | Vercel (current production) | Render |
|---|---|---|
| Model | Static SPA + Edge Functions | Long-running Express server (`server.js`) |
| Config | `vercel.json` + `api/*.js` | `render.yaml` |
| Streaming | SSE via Edge runtime | SSE via Node proxy, no duration limits |
| Free tier | Always-on CDN | Spins down after ~15 min idle (cold start ≈ 30–60 s) |
| CI/CD | Auto-deploy from `main` (already wired) | Auto-deploy from `main` once Blueprint is created |

## Vercel (primary)

Already live at <https://jarvis-one-pearl.vercel.app>. Pushes to `main`
auto-deploy. Configuration lives in:

- `vercel.json` — build command, output dir (`dist/jarvis/browser`), rewrites
- `api/anthropic.js` — Edge proxy to `api.anthropic.com` (falls back to `ANTHROPIC_KEY` env var)
- `api/ollama.js` — Edge proxy to `OLLAMA_URL` env var

Environment variables (Vercel → Settings → Environment Variables):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_KEY` | Server-side Claude key (optional — users can enter one in the CONFIG panel) |
| `OLLAMA_URL` | HTTPS URL of a cloud Ollama instance (optional) |

## Render

1. Render dashboard → **New → Blueprint** → select this repo. The
   `render.yaml` at the repo root provisions a Node web service that builds
   the Angular app and runs `node server.js`.
2. Set `ANTHROPIC_KEY` (and optionally `OLLAMA_URL`) when prompted — they are
   declared `sync: false`, so values live only in the dashboard.
3. Health checks hit `/hermes/health`.

`server.js` injects `ANTHROPIC_KEY` into `/anthropic/*` requests when the
client didn't supply a key, matching the Vercel Edge Function behavior.

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
