import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { SettingsService } from './settings.service';

export interface HermesHealth {
  ok: boolean;
  hermesInstalled: boolean;
  hermesVersion: string | null;
  bridge: string;
}

@Injectable({ providedIn: 'root' })
export class HermesService {
  constructor(private http: HttpClient, private settings: SettingsService) {}

  private get base(): string {
    return this.settings.get().hermesBaseUrl;
  }

  checkHealth(): Observable<HermesHealth> {
    return this.http.get<HermesHealth>(`${this.base}/health`).pipe(
      timeout(30000),
      catchError(() => of({ ok: false, hermesInstalled: false, hermesVersion: null, bridge: '' }))
    );
  }

  isBridgeRunning(): Observable<boolean> {
    return this.checkHealth().pipe(map(h => h.ok));
  }

  isHermesInstalled(): Observable<boolean> {
    return this.checkHealth().pipe(map(h => h.hermesInstalled));
  }

  getSkills(): Observable<string[]> {
    return this.http.get<{ skills: string[] }>(`${this.base}/skills`).pipe(
      timeout(30000),
      map(r => r.skills),
      catchError(() => of([]))
    );
  }

  /**
   * Stream a chat response from Hermes CLI via the bridge.
   * Yields raw text tokens.
   */
  async *streamChat(message: string): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${this.base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(err.error ?? `Bridge error ${response.status}`);
      }

      if (!response.body) throw new Error('No stream body');

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.error) throw new Error(chunk.error);
            if (chunk.token) yield chunk.token;
            if (chunk.done) return;
          } catch (e) {
            if ((e as Error).message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
