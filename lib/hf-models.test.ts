import { describe, expect, it } from 'vitest';
import { filterHfModels, parseHfModels, type HfModel } from './hf-models';

describe('parsing the router model list', () => {
  it('reads ids and the serving provider', () => {
    const models = parseHfModels({
      data: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', providers: [{ provider: 'together' }] },
        { id: 'Qwen/Qwen2.5-72B-Instruct', providers: [{ provider: 'nebius' }] },
      ],
    });
    // Sorted case-insensitively, which is what a person scanning a list wants;
    // a plain codepoint sort would put every capitalised id in its own block.
    expect(models).toEqual([
      { id: 'meta-llama/Llama-3.3-70B-Instruct', provider: 'together' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', provider: 'nebius' },
    ]);
  });

  it('leaves the provider null rather than inventing one', () => {
    expect(parseHfModels({ data: [{ id: 'a/b' }] })).toEqual([{ id: 'a/b', provider: null }]);
    expect(parseHfModels({ data: [{ id: 'a/b', providers: [] }] })[0].provider).toBeNull();
  });

  it('accepts a provider given as a plain string', () => {
    expect(parseHfModels({ data: [{ id: 'a/b', providers: ['hf-inference'] }] })[0].provider).toBe(
      'hf-inference'
    );
  });

  it('drops rows with no id, and de-duplicates', () => {
    const models = parseHfModels({
      data: [{ id: 'a/b' }, { id: '  ' }, {}, null, 'nope', { id: 'a/b' }],
    });
    expect(models).toEqual([{ id: 'a/b', provider: null }]);
  });

  it('returns nothing for a shape it does not recognise, rather than throwing', () => {
    expect(parseHfModels({})).toEqual([]);
    expect(parseHfModels(null)).toEqual([]);
    expect(parseHfModels({ data: 'oops' })).toEqual([]);
    expect(parseHfModels([{ id: 'a/b' }])).toEqual([]);
  });
});

describe('searching the list', () => {
  const models: HfModel[] = [
    { id: 'meta-llama/Llama-3.3-70B-Instruct', provider: 'together' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', provider: 'nebius' },
    { id: 'mistralai/Mistral-Small-24B', provider: null },
  ];

  it('matches case-insensitively on the id', () => {
    expect(filterHfModels(models, 'llama').map((m) => m.id)).toEqual([
      'meta-llama/Llama-3.3-70B-Instruct',
    ]);
  });

  it('matches on the provider too', () => {
    expect(filterHfModels(models, 'nebius').map((m) => m.id)).toEqual(['Qwen/Qwen2.5-72B-Instruct']);
  });

  it('requires every term, so a search narrows', () => {
    expect(filterHfModels(models, 'qwen 72b')).toHaveLength(1);
    expect(filterHfModels(models, 'qwen llama')).toHaveLength(0);
  });

  it('returns everything for an empty query', () => {
    expect(filterHfModels(models, '   ')).toHaveLength(3);
  });
});
