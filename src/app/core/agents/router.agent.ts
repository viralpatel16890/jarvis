import { Injectable } from '@angular/core';
import { OllamaService } from '../services/ollama.service';
import { SettingsService } from '../services/settings.service';

export type Intent =
  | 'CHAT'
  | 'TIME'
  | 'WEATHER'
  | 'SEARCH'
  | 'OPEN';

const SYSTEM_PROMPT = `Classify the user message intent. Reply with EXACTLY one word only:
CHAT - general conversation, questions, tasks, coding, writing
TIME - asking about current time or date
WEATHER - asking about weather
SEARCH - asking to search, look up, or find information online
OPEN - asking to open a URL or website

Reply with only the single word. No explanation.`;

const WEATHER_KEYWORDS = /\b(weather|temperature|forecast|rain|sunny|cloudy|hot|cold|humid|wind|storm|snow|climate)\b/i;
const TIME_KEYWORDS = /\b(time|date|day|today|now|current time|what time|what day|clock)\b/i;
const SEARCH_KEYWORDS = /\b(search|look up|find online|google|bing|duckduckgo|browse|lookup)\b/i;
const OPEN_KEYWORDS = /\b(open|navigate to|go to|visit|launch)\s+(https?:\/\/|www\.|\w+\.(com|org|io|net|dev|co))/i;

@Injectable({ providedIn: 'root' })
export class RouterAgent {
  constructor(
    private ollama: OllamaService,
    private settings: SettingsService
  ) {}

  async route(userMessage: string): Promise<{ intent: Intent; param?: string }> {
    // Fast local classification first — no LLM tokens needed
    if (TIME_KEYWORDS.test(userMessage)) return { intent: 'TIME' };
    if (OPEN_KEYWORDS.test(userMessage)) {
      const match = userMessage.match(/(https?:\/\/[^\s]+|www\.[^\s]+|\w+\.(com|org|io|net|dev|co)[^\s]*)/i);
      return { intent: 'OPEN', param: match?.[0] ?? userMessage };
    }
    if (WEATHER_KEYWORDS.test(userMessage)) {
      const locationMatch = userMessage.match(/weather\s+(?:in|for|at)?\s+([a-zA-Z\s,]+?)(?:\?|$)/i);
      return { intent: 'WEATHER', param: locationMatch?.[1]?.trim() };
    }
    if (SEARCH_KEYWORDS.test(userMessage)) {
      const q = userMessage.replace(SEARCH_KEYWORDS, '').replace(/\?|['"]/g, '').trim();
      return { intent: 'SEARCH', param: q || userMessage };
    }

    // Fallback: use the tiny router model for ambiguous cases
    try {
      const model = this.settings.get().routerModel;
      const result = await this.ollama.chatOnce(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        model
      );
      const intent = result.trim().toUpperCase().split(/\s+/)[0] as Intent;
      if (['CHAT', 'TIME', 'WEATHER', 'SEARCH', 'OPEN'].includes(intent)) {
        return { intent };
      }
    } catch {}

    return { intent: 'CHAT' };
  }
}
