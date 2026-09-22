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
      { id: 'meta-llama/Llama-3.3-70B-Instruct', provider: 'together', vision: false },
      { id: 'Qwen/Qwen2.5-72B-Instruct', provider: 'nebius', vision: false },
    ]);
  });

  it('leaves the provider null rather than inventing one', () => {
    expect(parseHfModels({ data: [{ id: 'a/b' }] })).toEqual([
      { id: 'a/b', provider: null, vision: false },
    ]);
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
    expect(models).toEqual([{ id: 'a/b', provider: null, vision: false }]);
  });

  it('reads image support from the modalities the router reports', () => {
    // Vision on Hugging Face is a property of the model, not the provider —
    // roughly a third of what the router serves takes images. This comes
    // straight from architecture.input_modalities, never guessed from the name.
    const models = parseHfModels({
      data: [
        { id: 'a/sees', architecture: { input_modalities: ['text', 'image'] } },
        { id: 'b/text', architecture: { input_modalities: ['text'] } },
      ],
    });
    expect(models.find((m) => m.id === 'a/sees')?.vision).toBe(true);
    expect(models.find((m) => m.id === 'b/text')?.vision).toBe(false);
  });

  it('assumes no image support when the router does not say', () => {
    // Claiming a capability that was not reported sends a photo that comes back
    // as an error, or worse, is silently ignored and answered anyway.
    for (const architecture of [undefined, {}, { input_modalities: 'image' }, null]) {
      expect(parseHfModels({ data: [{ id: 'a/b', architecture }] })[0].vision).toBe(false);
    }
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
    { id: 'meta-llama/Llama-3.3-70B-Instruct', provider: 'together', vision: false },
    { id: 'Qwen/Qwen2.5-72B-Instruct', provider: 'nebius', vision: true },
    { id: 'mistralai/Mistral-Small-24B', provider: null, vision: false },
  ];

  it('matches case-insensitively on the id', () => {
    expect(filterHfModels(models, 'llama').map((m) => m.id)).toEqual([
      'meta-llama/Llama-3.3-70B-Instruct',
    ]);
  });

  it('narrows to models that can read photos when asked', () => {
    expect(filterHfModels(models, '', true).map((m) => m.id)).toEqual([
      'Qwen/Qwen2.5-72B-Instruct',
    ]);
    // And combines with the search rather than replacing it.
    expect(filterHfModels(models, 'llama', true)).toEqual([]);
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
