import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { OllamaMessage } from '../models/message.model';
import { SettingsService } from './settings.service';
import { UsageService } from './usage.service';

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaTagsResponse {
  models: { name: string; size: number }[];
}

@Injectable({ providedIn: 'root' })
export class OllamaService {
  private _failures = 0;
  private _circuitOpenUntil = 0;
  private readonly CIRCUIT_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_MS  = 60_000;
  private readonly FETCH_TIMEOUT_MS  = 30_000;

  constructor(
    private http: HttpClient,
    private settings: SettingsService,
    private usage: UsageService
  ) {}

  private get base(): string {
    return this.settings.get().ollamaBaseUrl;
  }

  isCircuitOpen(): boolean {
    if (this._circuitOpenUntil > 0 && Date.now() < this._circuitOpenUntil) return true;
    if (this._circuitOpenUntil > 0) { this._circuitOpenUntil = 0; this._failures = 0; }
    return false;
  }

  private recordSuccess(): void { this._failures = 0; this._circuitOpenUntil = 0; }

  private recordFailure(): void {
    this._failures++;
    if (this._failures >= this.CIRCUIT_THRESHOLD) {
      this._circuitOpenUntil = Date.now() + this.CIRCUIT_RESET_MS;
    }
  }

  // Returns a signal that aborts after timeoutMs, or earlier if parent signal fires.
  private makeTimeoutSignal(signal?: AbortSignal): AbortSignal {
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(new DOMException('Ollama request timed out after 30s', 'TimeoutError')),
      this.FETCH_TIMEOUT_MS
    );
    ctrl.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    return ctrl.signal;
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
    model: string,
    signal?: AbortSignal,
    options: Record<string, unknown> = { num_predict: 2048, temperature: 0.7 }
  ): AsyncGenerator<string> {
    if (this.isCircuitOpen()) throw new Error('OllamaCircuitOpen');

    let response: Response;
    try {
      response = await fetch(`${this.base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true, options }),
        signal: this.makeTimeoutSignal(signal),
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') this.recordFailure();
      throw err;
    }

    if (!response.ok) { this.recordFailure(); throw new Error(`Ollama error: ${response.status}`); }
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
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
            if (chunk.done) {
              const promptTok = chunk.prompt_eval_count ?? 0;
              const completionTok = chunk.eval_count ?? 0;
              if (promptTok || completionTok) this.usage.record(promptTok, completionTok, model);
              this.recordSuccess();
              return;
            }
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') this.recordFailure();
      throw err;
    }
  }

  async chatOnce(
    messages: OllamaMessage[],
    model: string,
    signal?: AbortSignal,
    options: Record<string, unknown> = { num_predict: 8, temperature: 0, top_k: 1 }
  ): Promise<string> {
    if (this.isCircuitOpen()) throw new Error('OllamaCircuitOpen');

    let response: Response;
    try {
      response = await fetch(`${this.base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false, options }),
        signal: this.makeTimeoutSignal(signal),
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') this.recordFailure();
      throw err;
    }

    if (!response.ok) { this.recordFailure(); throw new Error(`Ollama error: ${response.status}`); }
    const data: OllamaChatResponse = await response.json();

    const promptTok = data.prompt_eval_count ?? 0;
    const completionTok = data.eval_count ?? 0;
    if (promptTok || completionTok) this.usage.record(promptTok, completionTok, model);
    this.recordSuccess();

    return data.message?.content ?? '';
  }
}
