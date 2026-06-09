import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { OllamaMessage } from '../models/message.model';
import { SettingsService } from './settings.service';

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
}

interface OllamaTagsResponse {
  models: { name: string; size: number }[];
}

@Injectable({ providedIn: 'root' })
export class OllamaService {
  constructor(private http: HttpClient, private settings: SettingsService) {}

  private get base(): string {
    return this.settings.get().ollamaBaseUrl;
  }

  getModels(): Observable<string[]> {
    return this.http.get<OllamaTagsResponse>(`${this.base}/api/tags`).pipe(
      map(res => res.models.map(m => m.name)),
      catchError(() => of([]))
    );
  }

  isRunning(): Observable<boolean> {
    return this.http.get(`${this.base}/api/tags`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  async *streamChat(
    messages: OllamaMessage[],
    model: string
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
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
        if (!line.trim()) continue;
        try {
          const chunk: OllamaChatResponse = JSON.parse(line);
          if (chunk.message?.content) yield chunk.message.content;
          if (chunk.done) return;
        } catch {}
      }
    }
  }

  async chatOnce(messages: OllamaMessage[], model: string): Promise<string> {
    const response = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data: OllamaChatResponse = await response.json();
    return data.message?.content ?? '';
  }
}
