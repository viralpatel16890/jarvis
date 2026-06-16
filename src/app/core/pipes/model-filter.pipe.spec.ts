import { ModelFilterPipe } from './model-filter.pipe';

describe('ModelFilterPipe', () => {
  let pipe: ModelFilterPipe;

  beforeEach(() => { pipe = new ModelFilterPipe(); });

  const MODELS = [
    'gpt-oss:20b-cloud',       // cloud — compound tag (:20b-cloud)
    'kimi-k2-thinking:cloud',  // cloud — simple :cloud tag
    'minimax-m2:cloud',        // cloud — simple :cloud tag
    'deepseek-v3.1:671b-cloud',// cloud — compound tag (:671b-cloud)
    'llama3',                  // local — no tag
    'llama3.2:latest',         // local — non-cloud tag
  ];

  it('returns only cloud models', () => {
    expect(pipe.transform(MODELS, 'cloud')).toEqual([
      'gpt-oss:20b-cloud',
      'kimi-k2-thinking:cloud',
      'minimax-m2:cloud',
      'deepseek-v3.1:671b-cloud',
    ]);
  });

  it('returns only local models', () => {
    expect(pipe.transform(MODELS, 'local')).toEqual([
      'llama3',
      'llama3.2:latest',
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(pipe.transform([], 'cloud')).toEqual([]);
    expect(pipe.transform([], 'local')).toEqual([]);
  });

  it('detects compound cloud tags like :20b-cloud', () => {
    expect(pipe.transform(['gpt-oss:20b-cloud'], 'cloud')).toHaveLength(1);
    expect(pipe.transform(['gpt-oss:20b-cloud'], 'local')).toHaveLength(0);
  });
});
