import { Injectable } from '@angular/core';
import { OllamaService } from '../services/ollama.service';
import { ClaudeService } from '../services/claude.service';
import { SettingsService } from '../services/settings.service';
import { ProfileService } from '../services/profile.service';
import { OllamaMessage, JARVIS_PERSONA } from '../models/message.model';

@Injectable({ providedIn: 'root' })
export class JarvisAgent {
  constructor(
    private ollama: OllamaService,
    private claude: ClaudeService,
    private settings: SettingsService,
    private profile: ProfileService
  ) {}

  async *stream(
    conversationHistory: OllamaMessage[],
    userMessage: string,
    toolResult?: string,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const s = this.settings.get();
    const facts = this.profile.getFacts();
    const systemPrompt = JARVIS_PERSONA(s.userName, facts);

    const userContent = toolResult
      ? `${userMessage}\n\n[Tool result: ${toolResult}]`
      : userMessage;

    const messages: OllamaMessage[] = [
      ...conversationHistory,
      { role: 'user', content: userContent },
    ];

    let fullResponse = '';

    if (s.backend === 'claude') {
      for await (const token of this.claude.streamChat(messages, systemPrompt, signal)) {
        fullResponse += token;
        yield token;
      }
    } else {
      const fullMessages: OllamaMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      // If circuit is already open and Claude key exists, skip straight to Claude
      if (this.ollama.isCircuitOpen() && s.claudeApiKey) {
        for await (const token of this.claude.streamChat(messages, systemPrompt, signal)) {
          fullResponse += token;
          yield token;
        }
        this.extractFacts(userMessage, fullResponse);
        return;
      }

      let ollamaYielded = false;
      try {
        for await (const token of this.ollama.streamChat(fullMessages, s.ollamaModel, signal)) {
          ollamaYielded = true;
          fullResponse += token;
          yield token;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        // Ollama failed — fall through to Claude if key is available
        ollamaYielded = false;
        fullResponse = '';
      }

      if (!ollamaYielded && s.claudeApiKey) {
        for await (const token of this.claude.streamChat(messages, systemPrompt, signal)) {
          fullResponse += token;
          yield token;
        }
      } else if (!ollamaYielded) {
        throw new Error('Ollama is unavailable and no Claude API key is configured.');
      }
    }

    // Proactive fact extraction in the background
    this.extractFacts(userMessage, fullResponse);
  }

  private async extractFacts(userMsg: string, aiMsg: string): Promise<void> {
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
