import { Injectable } from '@angular/core';
import { OllamaService } from '../services/ollama.service';
import { ClaudeService } from '../services/claude.service';
import { OpenAiService } from '../services/openai.service';
import { SettingsService } from '../services/settings.service';
import { ProfileService } from '../services/profile.service';
import { FactExtractionService } from '../services/fact-extraction.service';
import { OllamaMessage, JARVIS_PERSONA } from '../models/message.model';

@Injectable({ providedIn: 'root' })
export class JarvisAgent {
  constructor(
    private ollama: OllamaService,
    private claude: ClaudeService,
    private openai: OpenAiService,
    private settings: SettingsService,
    private profile: ProfileService,
    private factExtraction: FactExtractionService
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
    } else if (s.backend === 'openai') {
      for await (const token of this.openai.streamChat(messages, systemPrompt, signal)) {
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
        this.factExtraction.extract(userMessage, fullResponse);
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
    this.factExtraction.extract(userMessage, fullResponse);
  }
}
