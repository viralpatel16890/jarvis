import { Injectable, signal } from '@angular/core';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastModel: string;
  lastUpdated: Date | null;
}

interface StoredTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastModel: string;
  lastUpdated: string | null;
}

@Injectable({ providedIn: 'root' })
export class UsageService {
  private readonly STORAGE_KEY = 'jarvis_usage';

  readonly usage = signal<TokenUsage>(this.loadFromStorage());

  private loadFromStorage(): TokenUsage {
    const defaults: TokenUsage = {
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      lastModel: '', lastUpdated: null,
    };
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return defaults;
      const parsed: StoredTokenUsage = JSON.parse(raw);
      return {
        promptTokens:     parsed.promptTokens     ?? 0,
        completionTokens: parsed.completionTokens ?? 0,
        totalTokens:      parsed.totalTokens      ?? 0,
        lastModel:        parsed.lastModel        ?? '',
        lastUpdated:      parsed.lastUpdated ? new Date(parsed.lastUpdated) : null,
      };
    } catch {
      return defaults;
    }
  }

  private persistToStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn('[UsageService] Failed to persist to localStorage:', err);
    }
  }

  record(promptTokens: number, completionTokens: number, model: string): void {
    this.usage.update(prev => ({
      promptTokens:     prev.promptTokens     + promptTokens,
      completionTokens: prev.completionTokens + completionTokens,
      totalTokens:      prev.totalTokens      + promptTokens + completionTokens,
      lastModel:        model,
      lastUpdated:      new Date(),
    }));
    const current = this.usage();
    const stored: StoredTokenUsage = {
      ...current,
      lastUpdated: current.lastUpdated ? current.lastUpdated.toISOString() : null,
    };
    this.persistToStorage(this.STORAGE_KEY, JSON.stringify(stored));
  }

  reset(): void {
    this.usage.set({
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      lastModel: '', lastUpdated: null,
    });
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
