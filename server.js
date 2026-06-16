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
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');

const app  = express();
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

app.use(express.json({ limit: '8mb' }));

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

    // Forward all headers except host; keep Authorization / x-api-key
    const headers = { ...req.headers, host: targetUrl.hostname };
    delete headers['content-length']; // let node recalculate

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

    proxyReq.on('error', err => {
      if (!res.headersSent) res.status(502).json({ error: err.message });
    });

    req.pipe(proxyReq, { end: true });
  };
}

// ── Claude API proxy (/anthropic/*) ──────────────────────────
app.use('/anthropic', makeProxy('https://api.anthropic.com'));

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
app.use(express.static(DIST_DIR));

// Express 5 requires named wildcard params — use (.*) for catch-all SPA fallback
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[JARVIS] Online → http://localhost:${PORT}`);
  console.log(`[JARVIS] Dist   → ${DIST_DIR}`);
  console.log(`[JARVIS] Ollama → ${OLLAMA_URL || '⚠  not configured (set OLLAMA_URL)'}`);
  console.log(`[JARVIS] Claude → proxied via /anthropic`);
});
