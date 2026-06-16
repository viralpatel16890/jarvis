# J.A.R.V.I.S. — Just A Rather Very Intelligent System

An Iron Man-inspired AI assistant built with Angular 22, Ollama, Claude API, and an optional Hermes CLI integration for complex multi-agent tasks.

---

## Architecture

### Multi-Agent Routing Pipeline

```
User Input
    │
    ▼
Router Agent  ──── regex fast-path (0 LLM tokens)
    │               └─ tiny local model fallback (~50 tokens)
    │
    ├── TIME     → Tool Agent  (pure JS Date,        0 tokens)
    ├── WEATHER  → Tool Agent  (wttr.in HTTP,         0 tokens)
    ├── SEARCH   → Tool Agent  (DuckDuckGo API,       0 tokens)
    ├── OPEN_URL → Tool Agent  (window.open,          0 tokens)
    ├── COMPLEX  → Hermes Agent (Hermes CLI or in-app pipeline)
    └── CHAT     → Jarvis Agent (streaming, rolling 10-msg window)
```

Complex tasks (multi-step, research, file ops) are automatically routed to the **Hermes Agent**, which tries the Hermes CLI bridge first and falls back to an in-app parallel tool-execution pipeline.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 22 (standalone components, signals) |
| Styling | SCSS + Canvas API (arc reactor animation) |
| AI Backend (primary) | Ollama — local or cloud models |
| AI Backend (fallback) | Claude API (claude-sonnet / haiku / opus) |
| Multi-agent orchestration | Hermes CLI (optional) or built-in pipeline |
| Local bridge | Express 4 bridge server (`bridge/bridge.js`, port 3001) |
| Production server | Express 5 (`server.js`) — proxies Ollama + Claude, serves SPA |
| Voice Input | Web Speech API — SpeechRecognition |
| Voice Output | Web Speech API — SpeechSynthesis (British voice) |
| Markdown rendering | `marked` + Angular `DomSanitizer` |
| Weather | wttr.in JSON API (no key needed) |
| Search | DuckDuckGo Instant Answer API (no key needed) |
| Dev proxy | Angular `proxy.conf.json` (avoids CORS for Ollama + Claude) |

---

## Project Structure

```
jarvis/
├── server.js                        # Production server (Express 5, SPA + API proxy)
├── bridge/
│   ├── bridge.js                    # Local Hermes bridge (port 3001, Hermes CLI + scrape)
│   └── package.json
├── proxy.conf.json                  # Dev proxy (Ollama + Anthropic)
└── src/app/
    ├── core/
    │   ├── models/
    │   │   ├── message.model.ts     # Message, AppSettings, PlanStep, JARVIS_PERSONA
    │   │   └── tool.model.ts        # ToolMetadata, ToolDefinition interfaces
    │   ├── services/
    │   │   ├── settings.service.ts  # localStorage settings with schema versioning
    │   │   ├── memory.service.ts    # Conversation history (200 msg cap, 10-msg window)
    │   │   ├── ollama.service.ts    # Ollama REST API + circuit breaker + token tracking
    │   │   ├── claude.service.ts    # Anthropic SSE streaming (proxied) + token tracking
    │   │   ├── hermes.service.ts    # HTTP client for local Hermes bridge (SSE streaming)
    │   │   ├── skill-registry.service.ts # DI-based tool registry
    │   │   ├── usage.service.ts     # Token usage tracking (signal-based, persisted)
    │   │   ├── profile.service.ts   # Proactive user fact extraction + persistence
    │   │   └── voice.service.ts     # Wake word detection, mic, TTS
    │   ├── agents/
    │   │   ├── router.agent.ts      # Intent classification — regex first, LLM fallback
    │   │   ├── tool.agent.ts        # Dispatches to skill registry
    │   │   ├── jarvis.agent.ts      # Jarvis personality, streaming, circuit-breaker fallback
    │   │   └── hermes.agent.ts      # Complex task pipeline (Hermes CLI or in-app)
    │   ├── tools/
    │   │   ├── time.tool.ts         # Current date/time
    │   │   ├── weather.tool.ts      # wttr.in weather
    │   │   ├── search.tool.ts       # DuckDuckGo search + openURL
    │   │   └── scrape.tool.ts       # Web scraping via bridge /hermes/scrape
    │   └── pipes/
    │       └── model-filter.pipe.ts # Groups Ollama models into ☁ Cloud / 💻 Local
    └── features/
        └── jarvis/
            ├── jarvis.component.*   # Main shell — dual layout (startup / active sidebar)
            └── components/
                ├── arc-reactor/     # Canvas Arc Reactor (state-aware color/speed)
                ├── message-list/    # Streaming chat with markdown and auto-scroll
                └── settings-panel/  # Config panel (overlay on startup, docked in chat)
```

---

## Features

### UI — Dual Layout
- **Startup mode** — Arc Reactor centered, welcome greeting, single input field
- **Active mode** — Arc Reactor becomes compact sidebar, full chat area slides in
- Iron Man holographic interface: dark navy background, cyan/blue glow, hex grid
- Animated scanline overlay
- **Animated Arc Reactor** changes color/speed by state:
  - `IDLE` → cyan, slow rotation
  - `LISTENING` → green, pulse
  - `THINKING` → amber, fast rotation
  - `SPEAKING` → purple, fast pulse
- Agent badge in the top bar (JARVIS / HERMES / PIPELINE)
- Audio visualiser (20 bars, green=listening, purple=speaking)
- Streaming chat — tokens appear word-by-word with blinking cursor
- Markdown rendered in chat (code blocks, lists, bold, headings)
- Pipeline HUD — real-time progress bar and step list for multi-agent tasks
- Export chat as Markdown (⬇ EXPORT button)

### Voice
| Feature | Detail |
|---|---|
| Wake word | "Hey Jarvis" / "Jarvis" — continuous background mic |
| Push-to-talk | Mic button — single input then stops |
| Text-to-speech | Speaks every response in British male voice |
| Smart stripping | Code blocks and markdown stripped before speaking |

### AI Backends
| Backend | How | GPU required? |
|---|---|---|
| Ollama local | Runs on your machine | Yes (for large models) |
| Ollama cloud | `*:cloud` models — compute in Ollama's cloud | No |
| Claude API | Anthropic — claude-sonnet / haiku / opus | No |

### Reliability
- **Circuit breaker** in `OllamaService`: 3 failures → 60-second open circuit, auto-falls back to Claude
- **AbortController** support: cancel in-flight requests when user cancels or navigates
- **Token tracking**: prompt + completion tokens recorded per request, displayed in sidebar

### Multi-Agent Pipeline (Complex Tasks)
When a task is detected as complex (multi-step phrasing, file ops, scheduling, etc.):
1. **Hermes CLI** (if installed via bridge) — powerful external agent with 70+ skills
2. **In-app pipeline** — plan → parallel tool execution → streaming synthesis
   - Produces a visual step-by-step HUD in the chat area
   - Each step shows tool name, status (pending / running / done / error)

### Built-in Tools
| Tool | Trigger example | Cost |
|---|---|---|
| Time | "What time is it?" | 0 tokens |
| Weather | "Weather in Mumbai" | 0 tokens |
| Search | "Search for Angular signals" | 0 tokens |
| Open URL | "Open github.com" | 0 tokens |
| Scrape | (used internally by pipeline) | 0 tokens |

### Settings (⚙ CONFIG panel)
- Backend toggle: Ollama ↔ Claude API
- Model selector — cloud and local models in separate `<optgroup>`s
- Router model selector (recommended: smallest local model)
- Claude API key (proxied, stays local)
- Hermes section: enable/disable, bridge + CLI status, install hint
- Complex routing toggle
- Voice output toggle
- Wake word toggle
- Custom name (how Jarvis addresses you)
- Token usage display (prompt / completion / total)

---

## Running the App

### Prerequisites
- Node.js 22+ (or 24.14+)
- [Ollama](https://ollama.com) installed (`ollama --version` to verify)
- Bun 1.3+ (`bun --version`) — or use npm

### Development Setup

```bash
# Install frontend dependencies
bun install        # or: npm install

# Terminal 1 — Ollama server with browser CORS enabled
OLLAMA_ORIGINS=* ollama serve

# Terminal 2 — Angular dev server (proxies /ollama and /anthropic)
bun run dev        # or: npm run dev
```

Open **http://localhost:4200**

### Optional: Hermes Bridge (for complex tasks)

```bash
cd bridge
npm install

# Start the bridge server (port 3001)
node bridge.js
```

The bridge exposes:
- `GET /health` — Hermes CLI detection
- `GET /skills` — list Hermes tools
- `POST /chat` — stream Hermes CLI output (SSE)
- `POST /scrape` — fetch + clean webpage text

### Production Build & Server

```bash
# Build the Angular app
bun run build      # or: npm run build

# Start the production server
node server.js
```

The production server (`server.js`) serves the Angular SPA from `dist/jarvis/browser` and proxies:
- `/anthropic/*` → `https://api.anthropic.com`
- `/ollama/*` → `OLLAMA_URL` env variable

Copy `.env.example` to `.env` and fill in `OLLAMA_URL` and optionally `ANTHROPIC_KEY`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (auto-provided on GoDaddy, default 3000) |
| `OLLAMA_URL` | Cloud Ollama endpoint (HTTPS) — leave blank for local-only |
| `ANTHROPIC_KEY` | Claude API key (optional — can also be set in the app's ⚙ CONFIG) |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift + Enter` | New line in input |
| "Hey Jarvis …" | Wake word — activate + send in one phrase |

---

## Proxy Configuration

`proxy.conf.json` routes API calls through the Angular dev server to avoid CORS:

| Local path | Proxied to |
|---|---|
| `/ollama/*` | `http://localhost:11434` |
| `/anthropic/*` | `https://api.anthropic.com` |
| `/hermes/*` | `http://localhost:3001` |

---

## Available Cloud Models (no GPU needed)

| Model | Type |
|---|---|
| `gpt-oss:20b-cloud` | General purpose, 20B |
| `gpt-oss:120b-cloud` | General purpose, 120B |
| `kimi-k2-thinking:cloud` | Reasoning/thinking model |
| `minimax-m2:cloud` | General purpose |
| `deepseek-v3.1:671b-cloud` | Very large, high capability |
| `qwen3-coder:480b-cloud` | Code-focused |

Switch between them anytime in ⚙ CONFIG without restarting.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Orange offline banner | Run `OLLAMA_ORIGINS=* ollama serve` |
| 500 error on first message | Model not pulled — `ollama pull <model>` |
| No voice input | Allow microphone in browser permissions |
| No voice output | Enable in ⚙ CONFIG → Voice |
| Cloud models not listed | Start Ollama, open ⚙ CONFIG, click REFRESH |
| Hermes bridge offline | Run `node bridge/bridge.js` in a separate terminal |
| Stale settings after update | Settings auto-reset when schema version changes |
| Node.js version mismatch | Use Node.js 22.x or 24.14+ |
