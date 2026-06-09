import { Injectable, signal } from '@angular/core';
import { AppSettings, DEFAULT_SETTINGS } from '../models/message.model';

const STORAGE_KEY = 'jarvis_settings';
const SETTINGS_VERSION = 2;

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private _settings = signal<AppSettings>(this.load());

  readonly settings = this._settings.asReadonly();

  private load(): AppSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed._version !== SETTINGS_VERSION) {
          // Stale settings — reset to new defaults
          localStorage.removeItem(STORAGE_KEY);
          return { ...DEFAULT_SETTINGS };
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  get(): AppSettings {
    return this._settings();
  }

  update(partial: Partial<AppSettings>): void {
    const updated = { ...this._settings(), ...partial };
    this._settings.set(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...updated, _version: SETTINGS_VERSION }));
  }

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._settings.set({ ...DEFAULT_SETTINGS });
  }
}
