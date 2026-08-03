import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { JarvisComponent } from './jarvis.component';

import { MemoryService } from '../../core/services/memory.service';
import { VoiceService } from '../../core/services/voice.service';
import { SettingsService } from '../../core/services/settings.service';
import { OllamaService } from '../../core/services/ollama.service';
import { HermesService } from '../../core/services/hermes.service';
import { UsageService } from '../../core/services/usage.service';
import { RouterAgent } from '../../core/agents/router.agent';
import { ToolAgent } from '../../core/agents/tool.agent';
import { JarvisAgent } from '../../core/agents/jarvis.agent';
import { HermesAgent } from '../../core/agents/hermes.agent';
import type { PlanEvent } from '../../core/agents/hermes.agent';
import { DEFAULT_SETTINGS } from '../../core/models/message.model';

// ── async-generator helpers ──────────────────────────────────────────────
async function* asyncGenFrom(items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

async function* throwingGen(message: string): AsyncGenerator<string> {
  // eslint-disable-next-line no-unreachable
  throw new Error(message);
}

async function* hermesGenFrom(events: PlanEvent[]): AsyncGenerator<PlanEvent> {
  for (const ev of events) yield ev;
}

describe('JarvisComponent', () => {
  let component: JarvisComponent;

  let mockMemory: any;
  let mockVoice: any;
  let mockSettings: any;
  let mockOllama: any;
  let mockHermesSvc: any;
  let mockUsage: any;
  let mockRouter: any;
  let mockToolAgent: any;
  let mockJarvisAgent: any;
  let mockHermesAgent: any;

  beforeEach(() => {
    mockMemory = {
      getAll: vi.fn().mockReturnValue([]),
      add: vi.fn(),
      update: vi.fn(),
      getContextWindow: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
    };

    mockVoice = {
      isListening$: new BehaviorSubject<boolean>(false),
      isSpeaking$: new BehaviorSubject<boolean>(false),
      isSupported: false,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      stopSpeaking: vi.fn(),
      speak: vi.fn(),
    };

    mockSettings = {
      get: vi.fn().mockReturnValue({
        ...DEFAULT_SETTINGS,
        backend: 'claude',
        claudeApiKey: 'test-claude-key',
        voiceEnabled: false,
        wakeWordEnabled: false,
        hermesEnabled: false,
      }),
    };

    mockOllama = {
      isRunning: vi.fn().mockReturnValue(of(true)),
    };

    mockHermesSvc = {
      checkHealth: vi.fn().mockReturnValue(of({ ok: false, hermesInstalled: false })),
    };

    mockUsage = { reset: vi.fn() };

    mockRouter = { route: vi.fn().mockResolvedValue({ intent: 'CHAT' }) };

    mockToolAgent = { execute: vi.fn() };

    mockJarvisAgent = { stream: vi.fn() };
    mockHermesAgent = { stream: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        JarvisComponent,
        { provide: MemoryService, useValue: mockMemory },
        { provide: VoiceService, useValue: mockVoice },
        { provide: SettingsService, useValue: mockSettings },
        { provide: OllamaService, useValue: mockOllama },
        { provide: HermesService, useValue: mockHermesSvc },
        { provide: UsageService, useValue: mockUsage },
        { provide: RouterAgent, useValue: mockRouter },
        { provide: ToolAgent, useValue: mockToolAgent },
        { provide: JarvisAgent, useValue: mockJarvisAgent },
        { provide: HermesAgent, useValue: mockHermesAgent },
      ],
    });

    // Created without fixture.detectChanges() on purpose: we never render the
    // real template (arc-reactor's canvas, message-list, settings-panel), so
    // ngOnInit / lifecycle hooks never fire. We drive the component purely
    // through its public API and inspect its signals, which is all that's
    // under test here and keeps this spec independent of child-component DOM
    // concerns and of NgZone/zone.js availability.
    const fixture = TestBed.createComponent(JarvisComponent);
    component = fixture.componentInstance;
  });

  // processInput() is private; invoked via bracket access so we can await its
  // completion directly rather than racing send()'s fire-and-forget call.
  function processInput(text: string): Promise<void> {
    return (component as any).processInput(text);
  }

  it('appends a user message and a streamed assistant message for a simple CHAT-routed input', async () => {
    mockRouter.route.mockResolvedValue({ intent: 'CHAT' });
    mockJarvisAgent.stream.mockReturnValue(asyncGenFrom(['Hello', ' sir']));

    await processInput('Good morning');

    const msgs = component.messages();
    expect(msgs.length).toBe(2);

    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('Good morning');

    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('Hello sir');
    expect(msgs[1].status).toBe('done');

    expect(mockToolAgent.execute).not.toHaveBeenCalled();
    expect(mockHermesAgent.stream).not.toHaveBeenCalled();
    expect(component.isProcessing()).toBe(false);
  });

  it('classifies a Claude API 401 error with the Claude-specific message', async () => {
    mockRouter.route.mockResolvedValue({ intent: 'CHAT' });
    mockJarvisAgent.stream.mockReturnValue(throwingGen('Claude API error: 401 unauthorized'));

    await processInput('Do something');

    const msgs = component.messages();
    const last = msgs[msgs.length - 1];

    expect(last.role).toBe('assistant');
    expect(last.status).toBe('error');
    expect(last.content).toContain('Invalid Claude API key');
    expect(last.content).not.toContain('Ollama is offline');
  });

  it('classifies an Ollama error with the Ollama-offline message', async () => {
    mockRouter.route.mockResolvedValue({ intent: 'CHAT' });
    mockJarvisAgent.stream.mockReturnValue(throwingGen('Ollama error: connection refused'));

    await processInput('Do something');

    const msgs = component.messages();
    const last = msgs[msgs.length - 1];

    expect(last.role).toBe('assistant');
    expect(last.status).toBe('error');
    expect(last.content).toContain('Ollama is offline or the model is unavailable');
  });

  it('classifies an OllamaCircuitOpen error with the Ollama-offline message', async () => {
    mockRouter.route.mockResolvedValue({ intent: 'CHAT' });
    mockJarvisAgent.stream.mockReturnValue(throwingGen('OllamaCircuitOpen: circuit tripped'));

    await processInput('Do something');

    const msgs = component.messages();
    const last = msgs[msgs.length - 1];

    expect(last.status).toBe('error');
    expect(last.content).toContain('Ollama is offline or the model is unavailable');
  });

  it('routes a COMPLEX intent to the Hermes pipeline instead of the plain JarvisAgent path', async () => {
    mockRouter.route.mockResolvedValue({ intent: 'COMPLEX' });
    mockHermesAgent.stream.mockReturnValue(
      hermesGenFrom([
        { type: 'token', token: 'Working on it' },
        { type: 'done' },
      ] as PlanEvent[])
    );

    await processInput('Research three things and then email me a summary');

    expect(mockHermesAgent.stream).toHaveBeenCalledTimes(1);
    expect(mockJarvisAgent.stream).not.toHaveBeenCalled();

    const msgs = component.messages();
    const assistantMsg = msgs.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe('Working on it');
    expect(assistantMsg!.status).toBe('done');
    expect(assistantMsg!.agentUsed).toBe('hermes');
  });
});
