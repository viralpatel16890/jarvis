import { Injectable } from '@angular/core';
import { Message } from '../models/message.model';

const STORAGE_KEY = 'jarvis_memory';
const MAX_STORED = 200;
const CONTEXT_WINDOW = 10;

@Injectable({ providedIn: 'root' })
export class MemoryService {
  private messages: Message[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.messages = JSON.parse(raw).map((m: Message) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
      }
    } catch {
      this.messages = [];
    }
  }

  private save(): void {
    const toStore = this.messages.slice(-MAX_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  }

  add(message: Message): void {
    this.messages.push(message);
    this.save();
  }

  update(id: string, partial: Partial<Message>): void {
    const idx = this.messages.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.messages[idx] = { ...this.messages[idx], ...partial };
      this.save();
    }
  }

  getAll(): Message[] {
    return [...this.messages];
  }

  getContextWindow(): Message[] {
    return this.messages.slice(-CONTEXT_WINDOW);
  }

  clear(): void {
    this.messages = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}
