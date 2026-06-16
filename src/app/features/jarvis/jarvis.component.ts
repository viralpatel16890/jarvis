import {
  Component, OnInit, OnDestroy, signal, computed, effect, untracked,
  NgZone, ViewChild, ElementRef
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ArcReactorComponent } from './components/arc-reactor/arc-reactor.component';
import { MessageListComponent } from './components/message-list/message-list.component';
import { SettingsPanelComponent } from './components/settings-panel/settings-panel.component';

import { JarvisState, Message, OllamaMessage, PlanStep } from '../../core/models/message.model';
import { MemoryService } from '../../core/services/memory.service';
import { VoiceService } from '../../core/services/voice.service';
import { SettingsService } from '../../core/services/settings.service';
import { OllamaService } from '../../core/services/ollama.service';
import { HermesService } from '../../core/services/hermes.service';
import { UsageService } from '../../core/services/usage.service';
import { RouterAgent } from '../../core/agents/router.agent';
import { ToolAgent } from '../../core/agents/tool.agent';
import { JarvisAgent } from '../../core/agents/jarvis.agent';
import { HermesAgent, PlanEvent } from '../../core/agents/hermes.agent';

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

@Component({
  selector: 'app-jarvis',
  standalone: true,
  imports: [CommonModule, FormsModule, ArcReactorComponent, MessageListComponent, SettingsPanelComponent],
  templateUrl: './jarvis.component.html',
  styleUrls: ['./jarvis.component.scss'],
})
export class JarvisComponent implements OnInit, OnDestroy {
  @ViewChild('inputRef') inputRef!: ElementRef<HTMLTextAreaElement>;

  readonly state            = signal<JarvisState>('idle');
  readonly messages         = signal<Message[]>([]);
  readonly inputText        = signal<string>('');
  readonly isProcessing     = signal<boolean>(false);
  readonly showSettings     = signal<boolean>(true);
  readonly isListening      = signal<boolean>(false);
  readonly isSpeaking       = signal<boolean>(false);
  readonly backendOnline    = signal<boolean | null>(null);
  readonly hermesInstalled  = signal<boolean | null>(null);
  readonly bridgeOnline     = signal<boolean>(false);
  readonly activeAgent      = signal<'jarvis' | 'hermes' | 'pipeline'>('jarvis');
  readonly planSteps        = signal<PlanStep[]>([]);
  readonly planProgress     = computed(() => {
    const steps = this.planSteps();
    return { done: steps.filter(s => s.status === 'done').length, total: steps.length };
  });

  // Startup/active layout — reactor is centered until first message
  readonly hasMessages = computed(() => this.messages().length > 0 || this.isProcessing());

  // Audio visualiser bars (20 items for CSS waveform)
  readonly audioVizBars = Array.from({ length: 20 }, (_, i) => i);

  // Time of day greeting for startup screen
  readonly timeOfDay = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  });

  readonly statusText = computed(() => {
    if (this.isProcessing()) {
      const a = this.activeAgent();
      if (a === 'hermes')   return 'Hermes thinking...';
      if (a === 'pipeline') return 'Multi-agent pipeline...';
      return 'Processing...';
    }
    if (this.isListening()) return 'Listening...';
    if (this.isSpeaking())  return 'Speaking...';
    return 'Standing by';
  });

  private subs = new Subscription();
  private abortController: AbortController | null = null;
  private pipelineCancelled = false;

  constructor(
    private memory:    MemoryService,
    private voice:     VoiceService,
    protected settings: SettingsService,
    private ollama:    OllamaService,
    private hermesSvc: HermesService,
    readonly usage:    UsageService,
    private router:    RouterAgent,
    private toolAgent: ToolAgent,
    private jarvis:    JarvisAgent,
    private hermes:    HermesAgent,
    private zone:      NgZone
  ) {
    const listeningSignal = toSignal(this.voice.isListening$, { initialValue: false });
    const speakingSignal  = toSignal(this.voice.isSpeaking$,  { initialValue: false });

    effect(() => {
      const v = listeningSignal();
      this.isListening.set(v);
      if (v) this.state.set('listening');
      else if (!untracked(() => this.isProcessing()) && !untracked(() => this.isSpeaking())) {
        this.state.set('idle');
      }
    });

    effect(() => {
      const v = speakingSignal();
      this.isSpeaking.set(v);
      if (v) this.state.set('speaking');
      else if (!untracked(() => this.isProcessing()) && !untracked(() => this.isListening())) {
        this.state.set('idle');
      }
    });
  }

  ngOnInit(): void {
    this.messages.set(this.memory.getAll());
    this.checkBackend();
    this.checkHermesBridge();

    if (this.settings.get().wakeWordEnabled && this.voice.isSupported) {
      this.startWakeWord();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.voice.stopListening();
    this.voice.stopSpeaking();
    this.abortController?.abort();
  }

  checkBackend(): void {
    if (this.settings.get().backend === 'ollama') {
      this.subs.add(this.ollama.isRunning().subscribe(online => this.backendOnline.set(online)));
    } else {
      this.backendOnline.set(!!this.settings.get().claudeApiKey);
    }
  }

  checkHermesBridge(): void {
    if (!this.settings.get().hermesEnabled) return;
    this.subs.add(this.hermesSvc.checkHealth().subscribe(h => {
      this.zone.run(() => {
        this.bridgeOnline.set(h.ok);
        this.hermesInstalled.set(h.hermesInstalled);
      });
    }));
  }

  startWakeWord(): void {
    this.voice.startListening(text => {
      if (text && !this.isProcessing()) this.processInput(text);
    }, true);
  }

  toggleMic(): void {
    if (this.isListening()) { this.voice.stopListening(); return; }
    this.voice.startListening(text => {
      this.zone.run(() => { if (text) { this.inputText.set(text); this.send(); } });
    }, false);
  }

  onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.inputText.set(el.value);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.send(); }
  }

  send(): void {
    const text = this.inputText().trim();
    if (!text || this.isProcessing()) return;
    this.inputText.set('');
    this.processInput(text);
  }

  cancelRun(): void {
    this.pipelineCancelled = true;
    this.abortController?.abort();
  }

  exportChat(): void {
    const msgs = this.messages();
    if (!msgs.length) return;
    const md = msgs
      .filter(m => m.role !== 'tool')
      .map(m => {
        const role = m.role === 'user' ? '**You**' : '**JARVIS**';
        const time = new Date(m.timestamp).toLocaleTimeString();
        return `### ${role} — ${time}\n\n${m.content}`;
      })
      .join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async processInput(text: string): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    let assistantMsgId: string | undefined;

    this.zone.run(() => { this.isProcessing.set(true); this.state.set('thinking'); });

    const userMsg: Message = {
      id: uuid(), role: 'user', content: text, timestamp: new Date(), status: 'done',
    };
    this.addMessage(userMsg);

    try {
      const { intent, param } = await this.router.route(text, signal);

      if (signal.aborted) { this.cleanup(); return; }

      if (intent === 'COMPLEX') {
        await this.runComplexPipeline(text, signal);
        return;
      }

      let toolResult: string | undefined;
      if (intent !== 'CHAT') {
        const result = await this.toolAgent.execute(intent, param);
        if (result) {
          toolResult = result;
          this.addMessage({
            id: uuid(), role: 'tool', content: result,
            timestamp: new Date(), status: 'done', toolName: intent, agentUsed: 'tool',
          });
        }
      }

      this.zone.run(() => this.activeAgent.set('jarvis'));
      const history = this.buildHistory();
      const assistantMsg: Message = {
        id: uuid(), role: 'assistant', content: '',
        timestamp: new Date(), status: 'streaming', agentUsed: 'jarvis',
      };
      assistantMsgId = assistantMsg.id;
      this.addMessage(assistantMsg);

      let full = '';
      for await (const chunk of this.jarvis.stream(history, text, toolResult, signal)) {
        if (signal.aborted) break;
        full += chunk;
        this.zone.run(() => this.updateMsg(assistantMsg.id, { content: full }));
      }

      this.finalise(assistantMsg.id, full);

    } catch (err) {
      if ((err as Error).name === 'AbortError') { this.cleanup(); return; }
      this.handleError(err as Error, assistantMsgId);
    }
  }

  private async runComplexPipeline(text: string, signal: AbortSignal): Promise<void> {
    this.pipelineCancelled = false;
    this.zone.run(() => {
      this.activeAgent.set('pipeline');
      this.planSteps.set([]);
    });
    const history = this.buildHistory();

    const assistantMsg: Message = {
      id: uuid(), role: 'assistant', content: '',
      timestamp: new Date(), status: 'streaming', agentUsed: 'hermes',
    };
    this.addMessage(assistantMsg);

    let full = '';
    let usedHermes = false;

    try {
      for await (const event of this.hermes.stream(text, history, signal)) {
        if (this.pipelineCancelled || signal.aborted) break;

        this.zone.run(() => {
          switch (event.type) {
            case 'plan':
              this.planSteps.set(event.steps ?? []);
              this.updateMsg(assistantMsg.id, { content: '⟳ Planning...' });
              break;
            case 'step_start':
            case 'step_done':
              this.planSteps.set(event.steps ?? []);
              break;
            case 'token':
              if (!usedHermes && !full) {
                usedHermes = true;
                this.activeAgent.set('hermes');
              }
              full += event.token ?? '';
              this.updateMsg(assistantMsg.id, { content: full });
              break;
            case 'done':
              break;
          }
        });
      }

      this.finalise(assistantMsg.id, full);

    } catch (err) {
      if ((err as Error).name === 'AbortError') { this.cleanup(); return; }
      this.handleError(err as Error, assistantMsg.id);
    }
  }

  private finalise(id: string, content: string): void {
    this.pipelineCancelled = false;
    this.zone.run(() => {
      this.updateMsg(id, { status: 'done', content });
      this.memory.update(id, { status: 'done', content });
      this.isProcessing.set(false);
      this.state.set('idle');
      this.activeAgent.set('jarvis');
      this.planSteps.set([]);
    });
    if (this.settings.get().voiceEnabled && content) this.voice.speak(content);
  }

  private cleanup(): void {
    this.pipelineCancelled = false;
    this.zone.run(() => {
      this.isProcessing.set(false);
      this.state.set('idle');
      this.planSteps.set([]);
    });
  }

  private handleError(err: Error, msgId?: string): void {
    const raw = err.message ?? 'Unknown error';
    const isDown = raw.includes('500') || raw.includes('fetch') || raw.includes('Failed');
    const content = isDown
      ? `Ollama is offline or the model is unavailable.\n\n**To fix:**\n1. \`OLLAMA_ORIGINS=* ollama serve\`\n2. Check ⚙ CONFIG for the selected model`
      : raw;

    if (msgId) {
      this.zone.run(() => this.updateMsg(msgId, { status: 'error', content: `⚠ ${content}` }));
    } else {
      this.addMessage({
        id: uuid(), role: 'assistant', content: `⚠ ${content}`,
        timestamp: new Date(), status: 'error',
      });
    }
    this.zone.run(() => { this.isProcessing.set(false); this.state.set('idle'); this.planSteps.set([]); });
  }

  private addMessage(msg: Message): void {
    this.zone.run(() => this.messages.update(msgs => [...msgs, msg]));
    this.memory.add(msg);
  }

  private updateMsg(id: string, partial: Partial<Message>): void {
    this.messages.update(msgs => msgs.map(m => m.id === id ? { ...m, ...partial } : m));
  }

  private buildHistory(): OllamaMessage[] {
    return this.memory.getContextWindow()
      .filter(m => m.role !== 'tool')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  clearChat(): void {
    this.memory.clear();
    this.messages.set([]);
    this.voice.stopSpeaking();
    this.usage.reset();
  }

  stopSpeaking(): void { this.voice.stopSpeaking(); }
}
