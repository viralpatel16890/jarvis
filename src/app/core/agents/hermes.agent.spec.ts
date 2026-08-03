import { TestBed } from '@angular/core/testing';
import { HermesAgent, PlanEvent } from './hermes.agent';
import { HermesService } from '../services/hermes.service';
import { OllamaService } from '../services/ollama.service';
import { ClaudeService } from '../services/claude.service';
import { SettingsService } from '../services/settings.service';
import { SkillRegistryService } from '../services/skill-registry.service';
import { ProfileService } from '../services/profile.service';

async function* asyncGenFrom(items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

describe('HermesAgent', () => {
  let agent: HermesAgent;
  let mockHermesService: any;
  let mockOllama: any;
  let mockClaude: any;
  let mockSettings: any;
  let mockRegistry: any;
  let mockProfile: any;

  beforeEach(() => {
    mockHermesService = {
      checkHealth: vi.fn(),
      streamChat: vi.fn(),
    };
    mockOllama = {
      isCircuitOpen: vi.fn().mockReturnValue(false),
      chatOnce: vi.fn().mockResolvedValue('[]'),
      streamChat: vi.fn().mockReturnValue(asyncGenFrom(['Hello', ' world'])),
    };
    mockClaude = { streamChat: vi.fn() };
    mockSettings = {
      get: () => ({
        hermesEnabled: false,
        ollamaModel: 'llama3.2',
        routerModel: 'llama3.2',
        claudeApiKey: 'test-claude-key',
        userName: 'sir',
      }),
    };
    mockRegistry = { getAllDefinitions: () => [], execute: vi.fn() };
    mockProfile = { getFacts: () => [], addFact: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        HermesAgent,
        { provide: HermesService, useValue: mockHermesService },
        { provide: OllamaService, useValue: mockOllama },
        { provide: ClaudeService, useValue: mockClaude },
        { provide: SettingsService, useValue: mockSettings },
        { provide: SkillRegistryService, useValue: mockRegistry },
        { provide: ProfileService, useValue: mockProfile },
      ],
    });
    agent = TestBed.inject(HermesAgent);
  });

  async function collect(gen: AsyncGenerator<PlanEvent>): Promise<PlanEvent[]> {
    const out: PlanEvent[] = [];
    for await (const ev of gen) out.push(ev);
    return out;
  }

  // `PlanStep` objects are shared by reference across yielded events and mutated
  // in place as the pipeline progresses (status flips to 'running'/'done', a
  // `result` is attached) — so the 'plan' event's `steps` must be snapshotted
  // the moment it's seen, not read back after the generator has finished.
  async function collectSnapshottingPlan(
    gen: AsyncGenerator<PlanEvent>
  ): Promise<{ events: PlanEvent[]; planSteps: unknown }> {
    const out: PlanEvent[] = [];
    let planSteps: unknown;
    for await (const ev of gen) {
      out.push(ev);
      if (ev.type === 'plan' && planSteps === undefined) {
        planSteps = JSON.parse(JSON.stringify(ev.steps));
      }
    }
    return { events: out, planSteps };
  }

  it('degrades to a single-step plan when the planner response is not valid JSON', async () => {
    // Planner call throws — the pipeline must silently degrade rather than propagate.
    mockOllama.chatOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error('planner failed'))
      .mockResolvedValue('[]'); // subsequent chatOnce calls are for fact extraction

    const { events, planSteps } = await collectSnapshottingPlan(agent.stream('Tell me a joke', []));

    expect(planSteps).toEqual([
      { id: 's1', description: 'Tell me a joke', tool: 'none', status: 'pending' },
    ]);

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });

  it('degrades to a single-step plan when the planner response has unparsable JSON syntax', async () => {
    mockOllama.chatOnce = vi
      .fn()
      .mockResolvedValueOnce('[{"id": "s1", "description": not-quoted}]')
      .mockResolvedValue('[]');

    const { planSteps } = await collectSnapshottingPlan(agent.stream('What is the weather?', []));

    expect(planSteps).toEqual([
      { id: 's1', description: 'What is the weather?', tool: 'none', status: 'pending' },
    ]);
  });
});
