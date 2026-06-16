import { TestBed } from '@angular/core/testing';
import { RouterAgent } from './router.agent';
import { OllamaService } from '../services/ollama.service';
import { SettingsService } from '../services/settings.service';
import { SkillRegistryService } from '../services/skill-registry.service';

const mockOllama = { chatOnce: vi.fn() };
const mockSettings = {
  get: () => ({ routerModel: 'llama3.2', complexRoutingEnabled: true }),
};
const mockRegistry = { getAllDefinitions: () => [] };

describe('RouterAgent', () => {
  let agent: RouterAgent;

  beforeEach(() => {
    mockOllama.chatOnce.mockResolvedValue('CHAT');
    TestBed.configureTestingModule({
      providers: [
        RouterAgent,
        { provide: OllamaService, useValue: mockOllama },
        { provide: SettingsService, useValue: mockSettings },
        { provide: SkillRegistryService, useValue: mockRegistry },
      ],
    });
    agent = TestBed.inject(RouterAgent);
  });

  describe('TIME fast-path', () => {
    it.each([
      'What time is it?',
      'What is the date today?',
      'What is the current time?',
      'Tell me the time now',
    ])('"%s" → TIME', async (msg) => {
      expect((await agent.route(msg)).intent).toBe('TIME');
    });
  });

  describe('WEATHER fast-path', () => {
    it.each([
      'What is the weather in Mumbai?',
      'Will it rain tomorrow?',
      'Is it hot in London?',
      "What's the forecast?",
    ])('"%s" → WEATHER', async (msg) => {
      expect((await agent.route(msg)).intent).toBe('WEATHER');
    });

    it('extracts location from weather query', async () => {
      const { intent, param } = await agent.route('weather in Mumbai?');
      expect(intent).toBe('WEATHER');
      expect(param).toBe('Mumbai');
    });
  });

  describe('SEARCH fast-path', () => {
    it.each([
      'Search for Angular signals',
      'Look up the best pizza recipe',
      'Google quantum computing',
    ])('"%s" → SEARCH', async (msg) => {
      expect((await agent.route(msg)).intent).toBe('SEARCH');
    });
  });

  describe('OPEN_URL fast-path', () => {
    it.each([
      'Open github.com',
      'Go to https://angular.dev',
      'Navigate to www.example.com',
    ])('"%s" → OPEN_URL', async (msg) => {
      expect((await agent.route(msg)).intent).toBe('OPEN_URL');
    });
  });

  it('falls back to CHAT for general conversation', async () => {
    mockOllama.chatOnce.mockResolvedValue('CHAT');
    expect((await agent.route('Tell me a joke')).intent).toBe('CHAT');
  });

  it('defaults to CHAT when LLM returns an unrecognised token', async () => {
    mockOllama.chatOnce.mockResolvedValue('UNKNOWN_TOKEN');
    expect((await agent.route('something random')).intent).toBe('CHAT');
  });
});
