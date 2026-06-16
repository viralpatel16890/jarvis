import { Injectable } from '@angular/core';
import { OllamaService } from '../services/ollama.service';
import { SettingsService } from '../services/settings.service';
import { SkillRegistryService } from '../services/skill-registry.service';

export type Intent = 'CHAT' | 'COMPLEX' | string;

const WEATHER_KEYWORDS  = /\b(weather|temperature|forecast|rain|sunny|cloudy|hot|cold|humid|wind|storm|snow|climate)\b/i;
const TIME_KEYWORDS     = /\b(time|date|day|today|now|current time|what time|what day|clock)\b/i;
const SEARCH_KEYWORDS   = /\b(search|look up|find online|google|bing|duckduckgo|browse|lookup)\b/i;
const OPEN_KEYWORDS     = /\b(open|navigate to|go to|visit|launch)\s+(https?:\/\/|www\.|\w+\.(com|org|io|net|dev|co))/i;

// Multi-signal COMPLEX detection — requires at least 2 signals to avoid false positives
const COMPLEX_SIGNALS: RegExp[] = [
  /\b(send|compose|draft)\s+(an?\s+)?(email|message|slack|telegram|whatsapp)\b/i,
  /\b(read|write|create|delete|move|copy)\s+(a\s+)?file\b/i,
  /\b(schedule|remind|set\s+a?\s*reminder|add\s+to\s+calendar|meeting|appointment)\b/i,
  /\b(run|execute|compile)\s+(this\s+)?(code|script|command|bash|python)\b/i,
  /\b(research|investigate|analyse|analyze|compare|summarize\s+and)\b/i,
  /\b(and\s+then|first.+then|step\s+\d|finally)\b/i,         // multi-step phrasing
  /\b(system\s+info|cpu\s+usage|memory\s+usage|disk\s+space|processes)\b/i,
  /\b(download|upload|git\s+(clone|pull|push|commit))\b/i,
  /\b(todo|task|project|checklist|note)\b.*\b(create|add|update|complete)\b/i,
];

function isComplex(message: string): boolean {
  let hits = 0;
  for (const re of COMPLEX_SIGNALS) {
    if (re.test(message)) {
      hits++;
      if (hits >= 2) return true; // two independent signals = definitively complex
    }
  }
  // One strong signal + minimum meaningful length (avoids "send me a file" false positives)
  if (hits >= 1 && message.length > 40) return true;
  // Long requests with multi-step connectors but no explicit signal
  return message.length > 120 && /\b(and|then|also|plus|additionally)\b/i.test(message);
}

@Injectable({ providedIn: 'root' })
export class RouterAgent {
  constructor(
    private ollama: OllamaService,
    private settings: SettingsService,
    private registry: SkillRegistryService
  ) {}

  private getSystemPrompt(): string {
    const tools = this.registry.getAllDefinitions();
    const toolList = tools.map(t => `${t.name.toUpperCase()} - ${t.description}`).join('\n');

    return `Classify the user message intent. Reply with EXACTLY one word only from the following list:
CHAT    - general conversation, questions, simple tasks, coding help, writing
COMPLEX - multi-step task, research, or anything requiring sequential actions
${toolList}

Reply with only the single word. No explanation.`;
  }

  async route(userMessage: string, signal?: AbortSignal): Promise<{ intent: Intent; param?: string }> {
    const s = this.settings.get();

    // ── Fast regex fast-path (0 tokens) ──────────────────────────────────────
    if (TIME_KEYWORDS.test(userMessage))    return { intent: 'TIME' };
    if (OPEN_KEYWORDS.test(userMessage)) {
      const match = userMessage.match(/(https?:\/\/[^\s]+|www\.[^\s]+|\w+\.(com|org|io|net|dev|co)[^\s]*)/i);
      return { intent: 'OPEN_URL', param: match?.[0] ?? userMessage };
    }
    if (WEATHER_KEYWORDS.test(userMessage)) {
      const loc = userMessage.match(/weather\s+(?:in|for|at)?\s+([a-zA-Z\s,]+?)(?:\?|$)/i);
      return { intent: 'WEATHER', param: loc?.[1]?.trim() };
    }
    if (SEARCH_KEYWORDS.test(userMessage)) {
      const q = userMessage.replace(SEARCH_KEYWORDS, '').replace(/[?'"]/g, '').trim();
      return { intent: 'SEARCH', param: q || userMessage };
    }
    if (s.complexRoutingEnabled && isComplex(userMessage)) {
      return { intent: 'COMPLEX' };
    }

    // ── LLM fallback (tiny local model, ~50 tokens) ───────────────────────────
    try {
      const result = await this.ollama.chatOnce(
        [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: userMessage },
        ],
        s.routerModel,
        signal
      );
      const intent = result.trim().toUpperCase().split(/\s+/)[0];
      const validIntents = ['CHAT', 'COMPLEX', ...this.registry.getAllDefinitions().map(t => t.name.toUpperCase())];

      if (validIntents.includes(intent)) {
        return { intent: intent === 'OPEN' ? 'OPEN_URL' : intent }; // normalize legacy names if LLM still uses them
      }
    } catch {}

    return { intent: 'CHAT' };
  }
}
