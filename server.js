/**
 * JARVIS Production Server
 *
 * Serves the Angular build and proxies AI backend calls.
 * Designed for Node.js Hosting (GoDaddy) — reads PORT from env,
 * outbound connections on port 443 (HTTPS) only.
 *
 * Environment variables:
 *   PORT          — provided automatically by the platform
 *   OLLAMA_URL    — full HTTPS URL of a cloud Ollama instance
 *                   e.g. https://your-ollama.example.com
 *                   (localhost:11434 is NOT reachable in production)
 *   ANTHROPIC_KEY — optional; if set, Claude API key is injected
 *                   server-side so it never reaches the client
 */

'use strict';

const express = require('express');
const compression = require('compression');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');

const app  = express();
app.use(compression());
const PORT = process.env.PORT || 3000;

// ── Locate Angular build ──────────────────────────────────────
const DIST_CANDIDATES = [
  path.join(__dirname, 'dist', 'jarvis', 'browser'),
  path.join(__dirname, 'dist', 'jarvis'),
  path.join(__dirname, 'dist'),
];
const DIST_DIR = DIST_CANDIDATES.find(p => fs.existsSync(path.join(p, 'index.html')));

if (!DIST_DIR) {
  console.error('[JARVIS] Angular build not found. Run: npm run build');
  process.exit(1);
}

// Note: no express.json() here — /anthropic and /ollama forward the raw
// request stream via req.pipe(proxyReq), and a body-parsing middleware
// would drain that stream first, leaving nothing to pipe upstream.

// ── Generic HTTP/HTTPS proxy helper ──────────────────────────
function makeProxy(targetBase) {
  return (req, res) => {
    let targetUrl;
    try { targetUrl = new URL(targetBase); }
    catch { return res.status(500).json({ error: 'Invalid proxy target URL' }); }

    const isHttps = targetUrl.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const port    = targetUrl.port ? Number(targetUrl.port) : (isHttps ? 443 : 80);

    // req.url already has the prefix stripped by Express router
    const proxyPath = (targetUrl.pathname.replace(/\/$/, '')) + req.url;

    // Forward only allowlisted headers
    const allowedHeaders = ['content-type', 'x-api-key', 'anthropic-version', 'anthropic-beta', 'accept'];
    const headers = { host: targetUrl.hostname };
    for (const h of allowedHeaders) {
      if (req.headers[h] !== undefined) headers[h] = req.headers[h];
    }

    const options = {
      hostname: targetUrl.hostname,
      port,
      path: proxyPath,
      method:  req.method,
      headers,
    };

    const proxyReq = lib.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy(new Error('Upstream request timed out'));
    });

    proxyReq.on('error', err => {
      if (!res.headersSent) res.status(502).json({ error: err.message });
    });

    req.pipe(proxyReq, { end: true });
  };
}

// ── Claude API proxy (/anthropic/*) ──────────────────────────
// Inject the server-side key when the client didn't send one, so
// ANTHROPIC_KEY works the same here as in the Vercel Edge Function.
app.use('/anthropic', (req, _res, next) => {
  if (!req.headers['x-api-key'] && process.env.ANTHROPIC_KEY) {
    req.headers['x-api-key'] = process.env.ANTHROPIC_KEY;
  }
  next();
}, makeProxy('https://api.anthropic.com'));

// ── OpenAI-compatible proxy (/openai/*) ───────────────────────
// Allow-listed providers only — the client selects one via x-provider,
// never a client-supplied URL, so this can't become an open SSRF proxy.
const OPENAI_COMPAT_PROVIDERS = {
  groq:       'https://api.groq.com/openai/v1',
  gemini:     'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  openai:     'https://api.openai.com/v1',
};

app.use('/openai', (req, res) => {
  const base = OPENAI_COMPAT_PROVIDERS[req.headers['x-provider']];
  if (!base) {
    return res.status(400).json({
      error: `Unknown or missing provider. Use one of: ${Object.keys(OPENAI_COMPAT_PROVIDERS).join(', ')}`,
    });
  }

  const targetUrl = new URL(base);
  const proxyPath = targetUrl.pathname.replace(/\/$/, '') + req.url;
  const headers = { host: targetUrl.hostname, 'content-type': 'application/json' };
  if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'];

  const proxyReq = https.request(
    { hostname: targetUrl.hostname, port: 443, path: proxyPath, method: req.method, headers },
    proxyRes => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.setTimeout(30000, () => proxyReq.destroy(new Error('Upstream request timed out')));
  proxyReq.on('error', err => { if (!res.headersSent) res.status(502).json({ error: err.message }); });

  req.pipe(proxyReq, { end: true });
});

// ── Env validation ───────────────────────────────────────────
if (process.env.PORT && (!Number.isInteger(Number(process.env.PORT)) || Number(process.env.PORT) <= 0)) {
  console.error('[JARVIS] Invalid PORT env var:', process.env.PORT);
  process.exit(1);
}
if (process.env.OLLAMA_URL) {
  try { new URL(process.env.OLLAMA_URL); }
  catch { console.error('[JARVIS] Invalid OLLAMA_URL env var:', process.env.OLLAMA_URL); process.exit(1); }
}

// ── Ollama proxy (/ollama/*) ─────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL || '';
if (OLLAMA_URL) {
  app.use('/ollama', makeProxy(OLLAMA_URL));
} else {
  app.use('/ollama', (_req, res) => {
    res.status(503).json({
      error: 'Ollama not configured.',
      hint:  'Set the OLLAMA_URL environment variable to a cloud Ollama HTTPS endpoint.',
    });
  });
}

// ── Hermes bridge (inline — CLI not available in production) ──
app.get('/hermes/health', (_req, res) => {
  res.json({
    ok:              true,
    hermesInstalled: false,
    hermesVersion:   null,
    bridge:          'jarvis-server@production',
    note:            'Hermes CLI not available on managed hosting. Using in-app multi-agent pipeline.',
  });
});

app.get('/hermes/skills', (_req, res) => res.json({ skills: [] }));

app.post('/hermes/chat', (_req, res) => {
  res.status(503).json({
    error: 'Hermes CLI is not available in this environment.',
    hint:  'Run the bridge server locally: cd bridge && node bridge.js',
  });
});

// ── Angular SPA ───────────────────────────────────────────────
app.use(express.static(DIST_DIR, { maxAge: '1y', index: false }));

// Express 5 requires named wildcard params — use (.*) for catch-all SPA fallback
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[JARVIS] Online → http://localhost:${PORT}`);
  console.log(`[JARVIS] Dist   → ${DIST_DIR}`);
  console.log(`[JARVIS] Ollama → ${OLLAMA_URL || '⚠  not configured (set OLLAMA_URL)'}`);
  console.log(`[JARVIS] Claude → proxied via /anthropic`);
  console.log(`[JARVIS] OpenAI-compat → proxied via /openai (groq, gemini, openrouter, openai)`);
});

// ── Graceful shutdown ─────────────────────────────────────────
function shutdown(signal) {
  console.log(`[JARVIS] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('[JARVIS] Server closed.');
    process.exit(0);
  });
  // Force exit if connections don't close within 10s
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
