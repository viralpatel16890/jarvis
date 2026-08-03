import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OllamaService } from './ollama.service';
import { SettingsService } from './settings.service';
import { UsageService } from './usage.service';

const mockSettings = { get: () => ({ ollamaBaseUrl: 'http://localhost:11434' }) };
const mockUsage = { record: vi.fn() };

function okChatResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: 'llama3.2',
      message: { role: 'assistant', content },
      done: true,
      prompt_eval_count: 1,
      eval_count: 1,
    }),
  } as unknown as Response;
}

describe('OllamaService', () => {
  let service: OllamaService;

  beforeEach(() => {
    mockUsage.record.mockClear();
    // Fake timers keep the 30s fetch-timeout AbortController timer from ever
    // becoming a real pending OS timer that could hold the test process open.
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        OllamaService,
        { provide: SettingsService, useValue: mockSettings },
        { provide: UsageService, useValue: mockUsage },
      ],
    });
    service = TestBed.inject(OllamaService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens the circuit after 3 consecutive failures and fails fast without a new request', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network fail'));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 3; i++) {
      await expect(service.chatOnce([{ role: 'user', content: 'hi' }], 'llama3.2')).rejects.toThrow('network fail');
    }

    expect(service.isCircuitOpen()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 4th call should fail fast on the open circuit without hitting fetch again.
    await expect(service.chatOnce([{ role: 'user', content: 'hi' }], 'llama3.2')).rejects.toThrow('OllamaCircuitOpen');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('resets the failure count after a successful call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    fetchMock.mockRejectedValueOnce(new Error('fail 1'));
    fetchMock.mockRejectedValueOnce(new Error('fail 2'));
    await expect(service.chatOnce([{ role: 'user', content: 'hi' }], 'llama3.2')).rejects.toThrow('fail 1');
    await expect(service.chatOnce([{ role: 'user', content: 'hi' }], 'llama3.2')).rejects.toThrow('fail 2');
    expect(service.isCircuitOpen()).toBe(false);

    fetchMock.mockResolvedValueOnce(okChatResponse('hello there'));
    const result = await service.chatOnce([{ role: 'user', content: 'hi' }], 'llama3.2');
    expect(result).toBe('hello there');
    expect(service.isCircuitOpen()).toBe(false);

    // Two more failures after the reset should not be enough to open the circuit
    // (threshold is 3 consecutive failures, and the count was reset by the success above).
    fetchMock.mockRejectedValueOnce(new Error('fail 3'));
    fetchMock.mockRejectedValueOnce(new Error('fail 4'));
    await expect(service.chatOnce([{ role: 'user', content: 'hi' }], 'llama3.2')).rejects.toThrow('fail 3');
    await expect(service.chatOnce([{ role: 'user', content: 'hi' }], 'llama3.2')).rejects.toThrow('fail 4');
    expect(service.isCircuitOpen()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
