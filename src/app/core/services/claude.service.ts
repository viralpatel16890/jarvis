import { Injectable } from '@angular/core';
import { OllamaMessage } from '../models/message.model';
import { SettingsService } from './settings.service';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeStreamEvent {
  type: string;
  delta?: { type: string; text: string };
  message?: { usage: { input_tokens: number; output_tokens: number } };
}

@Injectable({ providedIn: 'root' })
export class ClaudeService {
  constructor(private settings: SettingsService) {}

  async *streamChat(
    messages: OllamaMessage[],
    systemPrompt: string
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
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${err}`);
    }

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const event: ClaudeStreamEvent = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield event.delta.text;
          }
        } catch {}
      }
    }
  }
}
