import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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

  constructor(
    private settingsService: SettingsService,
    private ollama: OllamaService,
    private hermesSvc: HermesService,
    private memory: MemoryService
  ) {}

  ngOnInit(): void {
    this.settings = { ...this.settingsService.get() };
    this.checkOllama();
    this.checkHermes();
  }

  checkOllama(): void {
    this.ollamaStatus = 'checking';
    this.ollama.isRunning().subscribe(running => {
      this.ollamaStatus = running ? 'online' : 'offline';
      if (running) this.loadModels();
    });
  }

  loadModels(): void {
    this.ollama.getModels().subscribe(models => { this.availableModels = models; });
  }

  checkHermes(): void {
    this.hermesBridgeStatus = 'checking';
    this.hermesCliStatus = 'checking';
    this.hermesSvc.checkHealth().subscribe(h => {
      this.hermesBridgeStatus = h.ok ? 'online' : 'offline';
      this.hermesCliStatus    = h.hermesInstalled ? 'installed' : 'not installed';
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
}
