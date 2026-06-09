import { Injectable } from '@angular/core';
import { OllamaService } from '../services/ollama.service';
import { ClaudeService } from '../services/claude.service';
import { SettingsService } from '../services/settings.service';
import { OllamaMessage } from '../models/message.model';

function buildSystemPrompt(userName: string): string {
  const now = new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the AI assistant created by Tony Stark.

Personality:
- Formal, precise, and highly efficient
- Address the user as "${userName}"
- Occasionally witty with dry British humor
- Confident but never arrogant
- Always helpful and direct

Rules:
- Keep responses concise unless detail is explicitly requested
- Use markdown formatting for code, lists, and structure
- If tool results are provided, synthesize them naturally into your response
- Current datetime: ${now}

You are running as a local AI system on the user's machine.`;
}

@Injectable({ providedIn: 'root' })
export class JarvisAgent {
  constructor(
    private ollama: OllamaService,
    private claude: ClaudeService,
    private settings: SettingsService
  ) {}

  async *stream(
    conversationHistory: OllamaMessage[],
    userMessage: string,
    toolResult?: string
  ): AsyncGenerator<string> {
    const s = this.settings.get();
    const systemPrompt = buildSystemPrompt(s.userName);

    const userContent = toolResult
      ? `${userMessage}\n\n[Tool result: ${toolResult}]`
      : userMessage;

    const messages: OllamaMessage[] = [
      ...conversationHistory,
      { role: 'user', content: userContent },
    ];

    if (s.backend === 'claude') {
      yield* this.claude.streamChat(messages, systemPrompt);
    } else {
      const fullMessages: OllamaMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];
      yield* this.ollama.streamChat(fullMessages, s.ollamaModel);
    }
  }
}
