import { Injectable } from '@angular/core';
import { OllamaService } from './ollama.service';
import { ProfileService } from './profile.service';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class FactExtractionService {
  constructor(
    private ollama: OllamaService,
    private profile: ProfileService,
    private settings: SettingsService
  ) {}

  async extract(userMsg: string, aiMsg: string): Promise<void> {
    if (!aiMsg || aiMsg.length < 20) return;

    const s = this.settings.get();
    const extractionPrompt = `Extract key permanent facts about the user from this exchange.
Only extract facts about their identity, preferences, ongoing projects, or location.
Ignore transient states (mood, current time).
Reply with a JSON array of strings. Each string should be a single standalone fact.
Example: ["User is a React developer", "User prefers dark mode", "User lives in London"]
If no new facts found, reply with [].

Exchange:
User: ${userMsg}
Assistant: ${aiMsg}`;

    try {
      const result = await this.ollama.chatOnce(
        [{ role: 'user', content: extractionPrompt }],
        s.routerModel
      );
      const facts = JSON.parse(result.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
      if (Array.isArray(facts)) {
        facts.forEach(f => this.profile.addFact(f));
      }
    } catch {}
  }
}
