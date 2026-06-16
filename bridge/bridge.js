/**
 * Jarvis–Hermes Bridge Server  (port 3001)
 *
 * Routes:
 *   GET  /health   — bridge + Hermes CLI status
 *   GET  /skills   — list Hermes tools/skills
 *   POST /chat     — stream a Hermes response  { message, model? }
 *   POST /scrape   — fetch and clean webpage text
 *   GET  /files/list — list project files
 *   GET  /files/read — read a project file
 *   POST /files/search — search project files
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { execSync, spawn } = require('child_process');
const axios   = require('axios');
const cheerio = require('cheerio');

const app  = express();
const PORT = 3001;

// Ollama OpenAI-compatible endpoint
const OLLAMA_BASE_URL  = process.env.OLLAMA_BASE_URL  || 'http://127.0.0.1:11434/v1';
const OLLAMA_API_KEY   = process.env.OLLAMA_API_KEY   || 'ollama';
const DEFAULT_MODEL    = process.env.HERMES_MODEL     || 'gpt-oss:20b-cloud';

app.use(cors());
app.use(express.json());

// ── Hermes detection ──────────────────────────────────────────────────────────

function hermesPath() {
  const candidates = [
    process.env.HERMES_PATH,
    '/Users/viral5436/.local/bin/hermes',
  ].filter(Boolean);

  for (const p of candidates) {
    try { execSync(`"${p}" --version`, { encoding: 'utf8', timeout: 3000, stdio: 'pipe' }); return p; } catch {}
  }

  try {
    const p = execSync('which hermes 2>/dev/null || command -v hermes 2>/dev/null', { encoding: 'utf8' }).trim();
    if (p) return p;
  } catch {}

  return null;
}

function hermesVersion(path) {
  try {
    const out = execSync(`"${path}" --version`, { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
    return out.split('\n')[0].trim();
  } catch {
    return null;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  const path    = hermesPath();
  const version = path ? hermesVersion(path) : null;
  res.json({
    ok:              true,
    hermesInstalled: !!path,
    hermesVersion:   version,
    hermesPath:      path,
    ollamaBase:      OLLAMA_BASE_URL,
    defaultModel:    DEFAULT_MODEL,
    bridge:          'jarvis-hermes-bridge@1.0.0',
  });
});

app.get('/skills', (req, res) => {
  const path = hermesPath();
  if (!path) return res.status(503).json({ error: 'Hermes not installed', skills: [] });
  try {
    const out = execSync(`"${path}" tools 2>/dev/null`, { encoding: 'utf8', timeout: 8000 });
    const skills = out.split('\n').filter(l => l.trim()).map(l => l.trim());
    res.json({ skills });
  } catch {
    res.json({ skills: [] });
  }
});

app.post('/chat', (req, res) => {
  const { message, model } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const path = hermesPath();
  if (!path) {
    return res.status(503).json({
      error: 'Hermes CLI not installed',
      installCmd: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const chosenModel = model || DEFAULT_MODEL;

  const proc = spawn(
    path,
    ['-z', message, '-m', chosenModel, '--provider', 'openai'],
    {
      env: {
        ...process.env,
        OPENAI_BASE_URL: OLLAMA_BASE_URL,
        OPENAI_API_KEY:  OLLAMA_API_KEY,
        HERMES_CLI_MODE: '1',
        NO_COLOR:        '1',
        TERM:            'dumb',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  proc.stdin.end();

  let buffer   = '';
  let started  = false;

  const ANSI_RE = /\x1B\[[0-9;]*[mGKHFA-Z]|\r/g;
  const NOISE_RE = /^(Calling tool|Tool result|Running|Thinking|◆|│|┌|└|─|✓|✗|\[|\]|>{3}|hermes>|\s*$)/;

  proc.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const clean = line.replace(ANSI_RE, '').trim();
      if (!clean || NOISE_RE.test(clean)) continue;
      started = true;
      res.write(JSON.stringify({ token: clean + '\n' }) + '\n');
    }
  });

  proc.stderr.on('data', chunk => {
    const clean = chunk.toString().replace(ANSI_RE, '').trim();
    if (clean && (clean.includes('Error') || clean.includes('failed'))) {
      console.error('[bridge] hermes stderr:', clean);
    }
  });

  proc.on('close', code => {
    if (buffer.trim()) {
      const clean = buffer.replace(ANSI_RE, '').trim();
      if (clean && !NOISE_RE.test(clean)) res.write(JSON.stringify({ token: clean }) + '\n');
    }
    if (!started) {
      res.write(JSON.stringify({ error: `Hermes exited with code ${code} (no output). Check model config.` }) + '\n');
    }
    res.write(JSON.stringify({ done: true, exitCode: code }) + '\n');
    res.end();
  });

  proc.on('error', err => {
    res.write(JSON.stringify({ error: err.message }) + '\n');
    res.end();
  });

  req.on('close', () => proc.kill());
});

/**
 * POST /scrape  { url: string }
 */
app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    $('script, style, nav, footer, header, noscript, iframe').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 15000);
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: `Scrape failed: ${err.message}` });
  }
});

/**
 * GET /files/list
 */
app.get('/files/list', (req, res) => {
  const root = path.join(__dirname, '..');
  const ignore = ['node_modules', '.git', '.angular', 'dist', '.DS_Store'];
  function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (let file of list) {
      if (ignore.includes(file)) continue;
      const full = path.resolve(dir, file);
      const stat = fs.statSync(full);
      if (stat && stat.isDirectory()) results = results.concat(walk(full));
      else results.push(path.relative(root, full));
    }
    return results;
  }
  try { res.json({ files: walk(root) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /files/read?path=...
 */
app.get('/files/read', (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'path required' });
  try {
    const full = path.resolve(__dirname, '..', rel);
    if (!full.startsWith(path.resolve(__dirname, '..'))) return res.status(403).json({ error: 'Access denied' });
    res.json({ content: fs.readFileSync(full, 'utf8') });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /files/search { query }
 */
app.post('/files/search', (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const out = execSync(`grep -rli "${query}" .. --exclude-dir={node_modules,.git,.angular,dist}`, { encoding: 'utf8' });
    const files = out.split('\n').filter(f => f.trim()).map(f => path.relative(path.resolve(__dirname, '..'), path.resolve(__dirname, f)));
    res.json({ files });
  } catch (err) { res.json({ files: [] }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  const path    = hermesPath();
  const version = path ? hermesVersion(path) : null;
  console.log(`[bridge] Listening  → http://127.0.0.1:${PORT}`);
  console.log(`[bridge] Ollama     → ${OLLAMA_BASE_URL}  (model: ${DEFAULT_MODEL})`);
  console.log(`[bridge] Hermes CLI → ${path ? `✓ ${version}` : '✗ not found (fallback mode)'}`);
});
