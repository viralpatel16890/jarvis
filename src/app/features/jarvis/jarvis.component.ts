import {
  Component, OnInit, OnDestroy, signal, computed, NgZone, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ArcReactorComponent } from './components/arc-reactor/arc-reactor.component';
import { MessageListComponent } from './components/message-list/message-list.component';
import { SettingsPanelComponent } from './components/settings-panel/settings-panel.component';

import { JarvisState, Message, OllamaMessage } from '../../core/models/message.model';
import { MemoryService } from '../../core/services/memory.service';
import { VoiceService } from '../../core/services/voice.service';
import { SettingsService } from '../../core/services/settings.service';
import { OllamaService } from '../../core/services/ollama.service';
import { RouterAgent } from '../../core/agents/router.agent';
import { ToolAgent } from '../../core/agents/tool.agent';
import { JarvisAgent } from '../../core/agents/jarvis.agent';

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

  readonly state = signal<JarvisState>('idle');
  readonly messages = signal<Message[]>([]);
  readonly inputText = signal<string>('');
  readonly isProcessing = signal<boolean>(false);
  readonly showSettings = signal<boolean>(false);
  readonly isListening = signal<boolean>(false);
  readonly isSpeaking = signal<boolean>(false);
  readonly backendOnline = signal<boolean | null>(null);
  readonly statusText = computed(() => {
    if (this.isProcessing()) return 'Processing...';
    if (this.isListening()) return 'Listening...';
    if (this.isSpeaking()) return 'Speaking...';
    return 'Standing by';
  });

  private subs = new Subscription();

  constructor(
    private memory: MemoryService,
    private voice: VoiceService,
    protected settings: SettingsService,
    private ollama: OllamaService,
    private router: RouterAgent,
    private toolAgent: ToolAgent,
    private jarvis: JarvisAgent,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.messages.set(this.memory.getAll());
    this.checkBackend();

    this.subs.add(this.voice.isListening$.subscribe(v => {
      this.zone.run(() => {
        this.isListening.set(v);
        if (v) this.state.set('listening');
        else if (!this.isProcessing() && !this.isSpeaking()) this.state.set('idle');
      });
    }));

    this.subs.add(this.voice.isSpeaking$.subscribe(v => {
      this.zone.run(() => {
        this.isSpeaking.set(v);
        if (v) this.state.set('speaking');
        else if (!this.isProcessing() && !this.isListening()) this.state.set('idle');
      });
    }));

    if (this.settings.get().wakeWordEnabled && this.voice.isSupported) {
      this.startWakeWord();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.voice.stopListening();
    this.voice.stopSpeaking();
  }

  checkBackend(): void {
    if (this.settings.get().backend === 'ollama') {
      this.ollama.isRunning().subscribe(online => {
        this.backendOnline.set(online);
      });
    } else {
      this.backendOnline.set(!!this.settings.get().claudeApiKey);
    }
  }

  startWakeWord(): void {
    this.voice.startListening((text) => {
      if (text && !this.isProcessing()) this.processInput(text);
    }, true);
  }

  toggleMic(): void {
    if (this.isListening()) {
      this.voice.stopListening();
      return;
    }
    this.voice.startListening((text) => {
      this.zone.run(() => {
        if (text) {
          this.inputText.set(text);
          this.send();
        }
      });
    }, false);
  }

  onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.inputText.set(el.value);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.inputText().trim();
    if (!text || this.isProcessing()) return;
    this.inputText.set('');
    this.processInput(text);
  }

  private async processInput(text: string): Promise<void> {
    this.zone.run(() => {
      this.isProcessing.set(true);
      this.state.set('thinking');
    });

    const userMsg: Message = {
      id: uuid(), role: 'user', content: text,
      timestamp: new Date(), status: 'done',
    };
    this.addMessage(userMsg);

    try {
      // 1. Route intent (fast, minimal tokens)
      const { intent, param } = await this.router.route(text);

      let toolResult: string | undefined;

      // 2. Execute tool if needed (no LLM required for most tools)
      if (intent !== 'CHAT') {
        const result = await this.toolAgent.execute(intent, param);
        if (result) {
          toolResult = result;
          const toolMsg: Message = {
            id: uuid(), role: 'tool', content: result,
            timestamp: new Date(), status: 'done', toolName: intent,
          };
          this.addMessage(toolMsg);
        }
      }

      // 3. Jarvis responds (streaming)
      const history = this.buildHistory();
      const assistantMsg: Message = {
        id: uuid(), role: 'assistant', content: '',
        timestamp: new Date(), status: 'streaming',
      };
      this.addMessage(assistantMsg);

      let fullResponse = '';

      for await (const chunk of this.jarvis.stream(history, text, toolResult)) {
        fullResponse += chunk;
        this.zone.run(() => {
          this.updateLastMessage(assistantMsg.id, { content: fullResponse });
        });
      }

      this.zone.run(() => {
        this.updateLastMessage(assistantMsg.id, { status: 'done', content: fullResponse });
        this.memory.update(assistantMsg.id, { status: 'done', content: fullResponse });
        this.isProcessing.set(false);
        this.state.set('idle');
      });

      if (this.settings.get().voiceEnabled && fullResponse) {
        this.voice.speak(fullResponse);
      }

    } catch (err) {
      const raw = (err as Error).message ?? 'Unknown error';
      const isOllamaDown = raw.includes('500') || raw.includes('fetch') || raw.includes('Failed');
      const errMsg = isOllamaDown
        ? `Ollama is offline or the model is not available.\n\n**To fix:**\n1. Run: \`OLLAMA_ORIGINS=* ollama serve\`\n2. Pull models: \`ollama pull llama3.2:3b\` and \`ollama pull llama3.2:1b\`\n3. Or select a different model in ⚙ CONFIG`
        : raw;
      const errorMsg: Message = {
        id: uuid(), role: 'assistant',
        content: `⚠ ${errMsg}`,
        timestamp: new Date(), status: 'error',
      };
      this.addMessage(errorMsg);
      this.zone.run(() => {
        this.isProcessing.set(false);
        this.state.set('idle');
      });
    }
  }

  private addMessage(msg: Message): void {
    this.zone.run(() => {
      this.messages.update(msgs => [...msgs, msg]);
    });
    this.memory.add(msg);
  }

  private updateLastMessage(id: string, partial: Partial<Message>): void {
    this.messages.update(msgs =>
      msgs.map(m => m.id === id ? { ...m, ...partial } : m)
    );
  }

  private buildHistory(): OllamaMessage[] {
    return this.memory.getContextWindow()
      .filter(m => m.role !== 'tool')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }

  clearChat(): void {
    this.memory.clear();
    this.messages.set([]);
    this.voice.stopSpeaking();
  }

  stopSpeaking(): void {
    this.voice.stopSpeaking();
  }
}
