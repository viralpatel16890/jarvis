import { Injectable } from '@angular/core';
import { OllamaMessage } from '../models/message.model';
import { SettingsService } from './settings.service';
import { UsageService } from './usage.service';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeStreamEvent {
  type: string;
  delta?: { type: string; text: string };
  message?: { usage: { input_tokens: number; output_tokens: number } };
  usage?: { input_tokens: number; output_tokens: number };
}

@Injectable({ providedIn: 'root' })
export class ClaudeService {
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

    const claudeMessages: ClaudeMessage[] = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      // If user provided signal, listen for abort
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch('/anthropic/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': s.claudeApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: s.claudeModel,
            max_tokens: 1024,
            system: systemPrompt,
            messages: claudeMessages,
            stream: true,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          const error = new Error(`Claude API error: ${response.status} - ${err}`);
          // Retry on 5xx errors
          if (response.status >= 500 && attempt < 1) {
            lastError = error;
            await new Promise(r => setTimeout(r, 500)); // Wait before retry
            continue;
          }
          throw error;
        }

        return yield* this.processResponse(response, s);
      } catch (err) {
        lastError = err as Error;
        // Retry on network errors
        if (attempt < 1 && (err as Error).message.includes('fetch')) {
          await new Promise(r => setTimeout(r, 500)); // Wait before retry
          continue;
        }
        throw err;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    if (lastError) throw lastError;
  }

  private async *processResponse(
    response: Response,
    s: ReturnType<typeof this.settings.get>
  ): AsyncGenerator<string> {

    if (!response.body) throw new Error('Claude API error: No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

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
          if (inputTokens || outputTokens) {
            this.usage.record(inputTokens, outputTokens, s.claudeModel);
          }
          return;
        }
        try {
          const event: ClaudeStreamEvent = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield event.delta.text;
          }
          // Capture token usage from message_start or message_delta events
          if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens;
          }
          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens;
          }
        } catch {}
      }
    }

    if (inputTokens || outputTokens) {
      this.usage.record(inputTokens, outputTokens, s.claudeModel);
    }
  }
}
