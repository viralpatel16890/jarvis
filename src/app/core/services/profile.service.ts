import { Injectable, signal } from '@angular/core';

const PROFILE_KEY = 'jarvis_user_profile';

export interface UserProfile {
  name: string;
  facts: string[];
  lastUpdated: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private _profile = signal<UserProfile>(this.load());

  readonly profile = this._profile.asReadonly();

  private load(): UserProfile {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { name: 'sir', facts: [], lastUpdated: new Date().toISOString() };
  }

  getFacts(): string[] {
    return this._profile().facts;
  }

  addFact(fact: string): void {
    const current = this._profile();
    if (current.facts.includes(fact)) return;

    const updated = {
      ...current,
      facts: [...current.facts, fact].slice(-50), // Keep last 50 facts
      lastUpdated: new Date().toISOString()
    };
    this._profile.set(updated);
    this.save(updated);
  }

  updateName(name: string): void {
    const updated = { ...this._profile(), name, lastUpdated: new Date().toISOString() };
    this._profile.set(updated);
    this.save(updated);
  }

  private save(profile: UserProfile): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  reset(): void {
    const defaults = { name: 'sir', facts: [], lastUpdated: new Date().toISOString() };
    this._profile.set(defaults);
    this.save(defaults);
  }
}
