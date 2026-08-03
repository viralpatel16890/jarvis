import { Component, EventEmitter, HostListener, Input, OnInit, Output, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../core/services/settings.service';
import { OllamaService } from '../../../../core/services/ollama.service';
import { HermesService } from '../../../../core/services/hermes.service';
import { AppSettings } from '../../../../core/models/message.model';
import { MemoryService } from '../../../../core/services/memory.service';
import { ModelFilterPipe } from '../../../../core/pipes/model-filter.pipe';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ModelFilterPipe],
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPanelComponent implements OnInit {
  @Input() isDocked = false;
  @Output() closed = new EventEmitter<void>();

  settings!: AppSettings;
  availableModels: string[] = [];
  ollamaStatus: 'checking' | 'online' | 'offline' = 'checking';
  hermesBridgeStatus: 'checking' | 'online' | 'offline' = 'checking';
  hermesCliStatus: 'checking' | 'installed' | 'not installed' = 'checking';
  saved = false;

  private cdr = inject(ChangeDetectorRef);

  constructor(
    private settingsService: SettingsService,
    private ollama: OllamaService,
    private hermesSvc: HermesService,
    private memory: MemoryService
  ) {}

  ngOnInit(): void {
    this.settings = { ...this.settingsService.get() };
    if (this.settings.backend === 'ollama') this.checkOllama();
    else this.ollamaStatus = 'offline';
    this.checkHermes();
  }

  checkOllama(): void {
    this.ollamaStatus = 'checking';
    this.ollama.isRunning().subscribe(running => {
      this.ollamaStatus = running ? 'online' : 'offline';
      this.cdr.markForCheck();
      if (running) this.loadModels();
    });
  }

  loadModels(): void {
    this.ollama.getModels().subscribe(models => {
      this.availableModels = models;
      this.cdr.markForCheck();
    });
  }

  checkHermes(): void {
    if (!this.settings.hermesEnabled) {
      this.hermesBridgeStatus = 'offline';
      this.hermesCliStatus = 'not installed';
      return;
    }
    this.hermesBridgeStatus = 'checking';
    this.hermesCliStatus = 'checking';
    this.hermesSvc.checkHealth().subscribe(h => {
      this.hermesBridgeStatus = h.ok ? 'online' : 'offline';
      this.hermesCliStatus    = h.hermesInstalled ? 'installed' : 'not installed';
      this.cdr.markForCheck();
    });
  }

  save(): void {
    this.settingsService.update(this.settings);
    this.saved = true;
    setTimeout(() => { this.saved = false; }, 2000);
  }

  clearMemory(): void {
    if (confirm('Clear all conversation history?')) this.memory.clear();
  }

  close(): void { this.closed.emit(); }

  // Bound to `document`, not the host element: focus normally stays on the
  // main chat input while this panel is open as an overlay, so a keydown
  // never bubbles through the panel's own DOM subtree — it must be caught
  // globally to work in the actual usage pattern.
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    // Mirrors the same 1024px breakpoint jarvis.component.scss uses to force
    // a docked panel into a full-screen overlay — that's the only case where
    // a docked panel is actually dismissible via Escape (or its close button).
    const isDockedButOverlaid = this.isDocked && typeof window !== 'undefined'
      && window.matchMedia('(max-width: 1024px)').matches;
    if (!this.isDocked || isDockedButOverlaid) {
      this.close();
    }
  }
}
