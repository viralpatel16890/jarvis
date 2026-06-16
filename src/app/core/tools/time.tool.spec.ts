import { TimeTool } from './time.tool';

describe('TimeTool', () => {
  it('returns a string with expected prefixes', () => {
    const result = TimeTool.execute({});
    expect(result).toMatch(/^Current date: .+\. Current time: .+/);
  });

  it('reflects mocked system time', () => {
    vi.setSystemTime(new Date('2024-06-15T14:30:00'));
    const result = TimeTool.execute({});
    expect(result).toContain('2024');
    vi.useRealTimers();
  });
});
