import { Injectable } from '@angular/core';
import { OllamaMessage } from '../models/message.model';
import { SettingsService } from './settings.service';
import { UsageService } from './usage.service';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAiStreamChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

@Injectable({ providedIn: 'root' })
export class OpenAiService {
  constructor(
    private settings: SettingsService,
    private usage: UsageService
  ) {}

  async *streamChat(
    messages: OllamaMessage[],
    systemPrompt: string,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const s = this.settings.get();

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
    ];

    const controller = new AbortController();
    if (signal) signal.addEventListener('abort', () => controller.abort());
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch('/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${s.openaiApiKey}`,
          'x-provider': s.openaiProvider,
        },
        body: JSON.stringify({
          model: s.openaiModel,
          messages: chatMessages,
          stream: true,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI-compatible API error: ${response.status} - ${err}`);
    }
    if (!response.body) throw new Error('OpenAI-compatible API error: No response body');

    yield* this.processResponse(response, s.openaiModel);
  }

  private async *processResponse(response: Response, model: string): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          if (promptTokens || completionTokens) this.usage.record(promptTokens, completionTokens, model);
          return;
        }
        try {
          const chunk: OpenAiStreamChunk = JSON.parse(data);
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) yield text;
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        } catch {}
      }
    }

    if (promptTokens || completionTokens) this.usage.record(promptTokens, completionTokens, model);
  }
}
