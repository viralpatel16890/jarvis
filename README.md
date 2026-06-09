# J.A.R.V.I.S. — Just A Rather Very Intelligent System

An Iron Man-inspired local AI assistant built with Angular 19, Ollama, and the Web Speech API.

---

## Chat Summary

This project was built in a single session covering:

1. **Research** — explored the Ollama Hermes agent and Hermes Desktop integrations (self-improving AI agent with 70+ skills, messaging platform integrations)
2. **Design decisions** — chose Angular web app, Ollama (local/cloud) as primary backend + Claude API as switchable fallback, multi-agent architecture for token efficiency, voice I/O, holographic Iron Man UI
3. **Full implementation** — scaffolded Angular 19 project, built all services, agents, tools, and UI components from scratch
4. **Cloud model switch** — discovered the user already had Ollama cloud models pulled (`gpt-oss:20b-cloud`, `kimi-k2-thinking:cloud`, etc.), switched defaults so no GPU is required
5. **Bug fixes** — resolved Ollama offline 500 errors with a status banner and helpful error messages, fixed all IDE diagnostics (accessibility `aria-label`, `type="button"`, `-webkit-backdrop-filter` Safari prefix, `field-sizing` browser compat, inline styles moved to SCSS)

---

## Architecture

### Multi-Agent System (Token-Efficient)

```
User Input
    │
    ▼
Router Agent  ──── regex fast-path (0 LLM tokens)
    │               └─ tiny local model fallback (~50 tokens)
    │
    ├── TIME    → Tool Agent  (pure JS Date,     0 tokens)
    ├── WEATHER → Tool Agent  (wttr.in HTTP,      0 tokens)
    ├── SEARCH  → Tool Agent  (DuckDuckGo API,    0 tokens)
    ├── OPEN    → Tool Agent  (window.open,       0 tokens)
    └── CHAT    → Jarvis Agent (streaming, rolling 10-msg window)
```

Only the final Jarvis response costs significant tokens. Routing and tool execution are regex-based or use the smallest available model.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 19 (standalone components, signals) |
| Styling | SCSS + Canvas API (arc reactor animation) |
| AI Backend (primary) | Ollama — local or cloud models |
| AI Backend (fallback) | Claude API (claude-sonnet / haiku / opus) |
| Voice Input | Web Speech API — SpeechRecognition |
| Voice Output | Web Speech API — SpeechSynthesis (British voice) |
| Markdown rendering | `marked` + Angular `DomSanitizer` |
| Weather | wttr.in JSON API (no key needed) |
| Search | DuckDuckGo Instant Answer API (no key needed) |
| Dev proxy | Angular `proxy.conf.json` (avoids CORS for Ollama + Claude) |

---

## Project Structure

```
src/app/
├── core/
│   ├── models/
│   │   └── message.model.ts         # Message, AppSettings, JarvisState types + defaults
│   ├── services/
│   │   ├── settings.service.ts      # localStorage settings with schema versioning
│   │   ├── memory.service.ts        # Conversation history (200 msg cap, 10-msg context window)
│   │   ├── ollama.service.ts        # Ollama REST API + async streaming via fetch()
│   │   ├── claude.service.ts        # Anthropic SSE streaming (proxied)
│   │   └── voice.service.ts         # Wake word detection, mic, TTS
│   ├── agents/
│   │   ├── router.agent.ts          # Intent classification — regex first, LLM fallback
│   │   ├── tool.agent.ts            # Dispatches to the right tool
│   │   └── jarvis.agent.ts          # Jarvis personality, streaming response
│   ├── tools/
│   │   ├── time.tool.ts             # Current date/time (no AI)
│   │   ├── weather.tool.ts          # wttr.in weather
│   │   └── search.tool.ts           # DuckDuckGo search + openURL
│   └── pipes/
│       └── model-filter.pipe.ts     # Groups Ollama models into ☁ Cloud / 💻 Local
└── features/
    └── jarvis/
        ├── jarvis.component.*       # Main shell — orchestrates all agents and state
        └── components/
            ├── arc-reactor/         # Canvas animated Arc Reactor (state-aware color/speed)
            ├── message-list/        # Streaming chat with markdown and auto-scroll
            └── settings-panel/      # Slide-in config panel
```

---

## Features

### UI
- Iron Man holographic interface — dark navy background, cyan/blue glow
- Hexagonal grid SVG background with animated scanline
- **Animated Arc Reactor** (HTML Canvas) changes color and speed by state:
  - `IDLE` → cyan, slow rotation
  - `LISTENING` → green, pulse
  - `THINKING` → amber, fast rotation
  - `SPEAKING` → purple, fast pulse
- Streaming chat — tokens appear word-by-word with blinking cursor
- Markdown rendered in chat (code blocks, lists, bold, headings)
- Offline status banner with exact commands to fix Ollama issues

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

### Built-in Tools
| Tool | Trigger example | Cost |
|---|---|---|
| Time | "What time is it?" | 0 tokens |
| Weather | "Weather in Mumbai" | 0 tokens |
| Search | "Search for Angular signals" | 0 tokens |
| Open URL | "Open github.com" | 0 tokens |

### Settings (⚙ CONFIG panel)
- Backend toggle: Ollama ↔ Claude API
- Model selector — cloud and local models in separate `<optgroup>`s
- Router model selector (recommended: smallest local model)
- Claude API key (proxied, stays local)
- Voice output toggle
- Wake word toggle
- Custom name (how Jarvis addresses you — default: "sir")
- Clear all conversation history

---

## Running the App

### Prerequisites
- Node.js 18+
- [Ollama](https://ollama.com) installed (`ollama --version` to verify)

### First-Time Setup

```bash
# Install dependencies
cd "/path/to/hermes"
npm install

# Pull the router model (local, small, fast — ~2 GB)
ollama pull llama3.2:latest

# Cloud models need no pull — check what's available:
ollama list
```

### Every Time

```bash
# Terminal 1 — Ollama server with browser CORS enabled
OLLAMA_ORIGINS=* ollama serve

# Terminal 2 — Angular dev server
npx ng serve
```

Open **http://localhost:4200**

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

---

## Available Cloud Models (no GPU needed)

These were already pulled in Ollama and work out of the box:

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
| Stale settings after update | Settings auto-reset when schema version changes |

---

## Future Ideas
- Calendar and reminder integration
- File system read/write tool
- Long-term memory with conversation summarization
- System stats tool (CPU, RAM, disk)
- Electron wrapper for native desktop app with system tray
- Custom wake word training
