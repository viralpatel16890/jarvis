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
    if (!s.claudeApiKey) throw new Error('Claude API key not set in settings.');

    const claudeMessages: ClaudeMessage[] = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

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
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${err}`);
    }

    if (!response.body) throw new Error('No response body');

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
