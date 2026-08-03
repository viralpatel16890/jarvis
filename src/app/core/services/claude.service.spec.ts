import { TestBed } from '@angular/core/testing';
import { ClaudeService } from './claude.service';
import { SettingsService } from './settings.service';
import { UsageService } from './usage.service';

const mockSettings = {
  get: () => ({ claudeApiKey: 'test-api-key', claudeModel: 'claude-test-model' }),
};
const mockUsage = { record: vi.fn() };

/**
 * Builds a fake fetch Response whose `body` implements just enough of the
 * ReadableStream reader contract for ClaudeService#processResponse to consume
 * (getReader().read() -> {done, value}), without depending on the test
 * environment providing a real ReadableStream/TextEncoder-backed stream.
 */
function makeResponse(opts: { ok: boolean; status?: number; text?: string; bodyChunks?: string[] }): Response {
  const encoder = new TextEncoder();
  const chunks = opts.bodyChunks ?? [];
  let index = 0;

  const body = chunks.length
    ? {
        getReader: () => ({
          read: async () => {
            if (index < chunks.length) {
              const value = encoder.encode(chunks[index]);
              index++;
              return { done: false, value };
            }
            return { done: true, value: undefined };
          },
        }),
      }
    : null;

  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    text: async () => opts.text ?? '',
    body,
  } as unknown as Response;
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const token of gen) out.push(token);
  return out;
}

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(() => {
    mockUsage.record.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ClaudeService,
        { provide: SettingsService, useValue: mockSettings },
        { provide: UsageService, useValue: mockUsage },
      ],
    });
    service = TestBed.inject(ClaudeService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('yields the expected text deltas for a successful stream', async () => {
    const sseChunks = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n',
      'data: [DONE]\n',
    ];
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ ok: true, bodyChunks: sseChunks }));
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await collect(service.streamChat([{ role: 'user', content: 'hi' }], 'system prompt'));

    expect(tokens).toEqual(['Hello', ' world']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 500 and succeeds on the retry', async () => {
    const sseChunks = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n',
      'data: [DONE]\n',
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ ok: false, status: 500, text: 'server error' }))
      .mockResolvedValueOnce(makeResponse({ ok: true, bodyChunks: sseChunks }));
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await collect(service.streamChat([{ role: 'user', content: 'hi' }], 'system prompt'));

    expect(tokens).toEqual(['OK']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws after two consecutive 500 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ ok: false, status: 500, text: 'still broken' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(collect(service.streamChat([{ role: 'user', content: 'hi' }], 'system prompt'))).rejects.toThrow(
      /Claude API error: 500/
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on a 401 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ ok: false, status: 401, text: 'unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(collect(service.streamChat([{ role: 'user', content: 'hi' }], 'system prompt'))).rejects.toThrow(
      /Claude API error: 401/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
