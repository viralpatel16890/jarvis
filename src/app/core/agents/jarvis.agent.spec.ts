import { TestBed } from '@angular/core/testing';
import { JarvisAgent } from './jarvis.agent';
import { OllamaService } from '../services/ollama.service';
import { ClaudeService } from '../services/claude.service';
import { SettingsService } from '../services/settings.service';
import { ProfileService } from '../services/profile.service';

async function* asyncGenFrom(items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

async function* throwingGen(message: string): AsyncGenerator<string> {
  // eslint-disable-next-line no-unreachable
  throw new Error(message);
}

describe('JarvisAgent', () => {
  let agent: JarvisAgent;
  let mockOllama: any;
  let mockClaude: any;
  let mockSettings: any;
  let mockProfile: any;

  beforeEach(() => {
    mockOllama = {
      isCircuitOpen: vi.fn().mockReturnValue(false),
      streamChat: vi.fn(),
      chatOnce: vi.fn().mockResolvedValue('[]'),
    };
    mockClaude = { streamChat: vi.fn() };
    mockSettings = {
      get: () => ({
        backend: 'ollama',
        claudeApiKey: 'test-claude-key',
        ollamaModel: 'llama3.2',
        userName: 'sir',
        routerModel: 'llama3.2',
      }),
    };
    mockProfile = { getFacts: () => [], addFact: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        JarvisAgent,
        { provide: OllamaService, useValue: mockOllama },
        { provide: ClaudeService, useValue: mockClaude },
        { provide: SettingsService, useValue: mockSettings },
        { provide: ProfileService, useValue: mockProfile },
      ],
    });
    agent = TestBed.inject(JarvisAgent);
  });

  async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const token of gen) out.push(token);
    return out;
  }

  it('falls back to Claude when the Ollama stream throws', async () => {
    mockOllama.streamChat.mockReturnValue(throwingGen('ollama unavailable'));
    mockClaude.streamChat.mockReturnValue(asyncGenFrom(['Fallback', ' response']));

    const tokens = await collect(agent.stream([], 'Hello there'));

    expect(tokens).toEqual(['Fallback', ' response']);
    expect(mockOllama.streamChat).toHaveBeenCalledTimes(1);
    expect(mockClaude.streamChat).toHaveBeenCalledTimes(1);
  });

  it('throws when Ollama fails and no Claude API key is configured', async () => {
    mockSettings.get = () => ({
      backend: 'ollama',
      claudeApiKey: '',
      ollamaModel: 'llama3.2',
      userName: 'sir',
      routerModel: 'llama3.2',
    });
    mockOllama.streamChat.mockReturnValue(throwingGen('ollama unavailable'));

    await expect(collect(agent.stream([], 'Hello there'))).rejects.toThrow(
      'Ollama is unavailable and no Claude API key is configured.'
    );
    expect(mockClaude.streamChat).not.toHaveBeenCalled();
  });

  it('uses Claude directly when the Ollama circuit is already open', async () => {
    mockOllama.isCircuitOpen.mockReturnValue(true);
    mockClaude.streamChat.mockReturnValue(asyncGenFrom(['Direct', ' Claude']));

    const tokens = await collect(agent.stream([], 'Hello there'));

    expect(tokens).toEqual(['Direct', ' Claude']);
    expect(mockOllama.streamChat).not.toHaveBeenCalled();
    expect(mockClaude.streamChat).toHaveBeenCalledTimes(1);
  });
});
