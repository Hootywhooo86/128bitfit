import { describe, expect, it } from 'vitest';
import {
  buildHfVisionChain,
  fallbackChain,
  HF_VISION_FAMILIES,
  shouldTryNextModel,
} from './ai-fallback';
import type { HfModel } from './hf-models';

const m = (
  id: string,
  vision: boolean,
  providerCount = 1
): HfModel => ({ id, provider: null, vision, providerCount });

/** A catalogue shaped like the real router's. */
const catalogue: HfModel[] = [
  m('deepseek-ai/DeepSeek-V4.1-Flash', true, 5),
  m('deepseek-ai/DeepSeek-V4-Flash-Vision-Exp', true, 2),
  m('deepseek-ai/DeepSeek-R1', false, 6),
  m('moonshotai/Kimi-K3', true, 4),
  m('moonshotai/Kimi-K2-Instruct', false, 9),
  m('Qwen/Qwen3.5-397B-A17B', true, 5),
  m('Qwen/Qwen3-32B', false, 8),
  m('google/gemma-4-26B-A4B-it', true, 4),
  m('google/gemma-3-4b-it', true, 2),
  // Apertus ships three models and only one of them reads images.
  m('swiss-ai/Apertus-v1.5-70B', true, 2),
  m('swiss-ai/Apertus-70B-Instruct-2509', false, 2),
  m('meta-llama/Llama-3.3-70B-Instruct', false, 7),
];

describe('building the chain', () => {
  it('follows the configured family order', () => {
    expect(buildHfVisionChain(catalogue).map((c) => c.family)).toEqual([
      'DeepSeek',
      'Kimi',
      'Qwen',
      'Gemma',
      'Apertus',
    ]);
  });

  it('never includes a model that cannot read a photo', () => {
    const chain = buildHfVisionChain(catalogue);
    const blind = catalogue.filter((x) => !x.vision).map((x) => x.id);
    for (const entry of chain) expect(blind).not.toContain(entry.id);
    // Specifically: Apertus's text-only models must not stand in for its
    // vision one, or a retry is spent on a guaranteed failure.
    expect(chain.map((c) => c.id)).toContain('swiss-ai/Apertus-v1.5-70B');
    expect(chain.map((c) => c.id)).not.toContain('swiss-ai/Apertus-70B-Instruct-2509');
  });

  it('picks the most widely served model within a family', () => {
    // Five providers beats two: less likely to be the one that is busy.
    const chain = buildHfVisionChain(catalogue);
    expect(chain[0].id).toBe('deepseek-ai/DeepSeek-V4.1-Flash');
    expect(chain.find((c) => c.family === 'Gemma')?.id).toBe('google/gemma-4-26B-A4B-it');
  });

  it('asks the model the user chose first', () => {
    const chain = buildHfVisionChain(catalogue, 'google/gemma-3-4b-it');
    expect(chain[0].id).toBe('google/gemma-3-4b-it');
    // And is not then asked twice.
    expect(chain.filter((c) => c.id === 'google/gemma-3-4b-it')).toHaveLength(1);
  });

  it('ignores a chosen model that cannot see, rather than leading with it', () => {
    const chain = buildHfVisionChain(catalogue, 'Qwen/Qwen3-32B');
    expect(chain[0].family).toBe('DeepSeek');
    expect(chain.map((c) => c.id)).not.toContain('Qwen/Qwen3-32B');
  });

  it('skips a family the router is serving no vision model for', () => {
    const thin = catalogue.filter((x) => !x.id.startsWith('moonshotai/'));
    const chain = buildHfVisionChain(thin);
    expect(chain.map((c) => c.family)).toEqual(['DeepSeek', 'Qwen', 'Gemma', 'Apertus']);
  });

  it('has nothing to offer from a catalogue with no vision models', () => {
    expect(buildHfVisionChain(catalogue.filter((x) => !x.vision))).toEqual([]);
  });

  it('falls back to the snapshot when there is no catalogue', () => {
    const chain = fallbackChain();
    expect(chain).toHaveLength(HF_VISION_FAMILIES.length);
    expect(chain.map((c) => c.family)).toEqual([
      'DeepSeek',
      'Kimi',
      'Qwen',
      'Gemma',
      'Apertus',
    ]);
  });
});

describe('deciding whether to rotate', () => {
  it('rotates when the model is out of credit or too busy', () => {
    expect(shouldTryNextModel(402, 'Payment Required')).toBe(true);
    expect(shouldTryNextModel(429, 'Too Many Requests')).toBe(true);
    expect(shouldTryNextModel(503, 'Service Unavailable')).toBe(true);
    expect(shouldTryNextModel(500, 'upstream error')).toBe(true);
    expect(shouldTryNextModel(404, 'model not found')).toBe(true);
  });

  it('does not rotate on a key problem', () => {
    // The same key everywhere. Rotating turns one honest error into five
    // wasted round trips and a much slower failure.
    //
    // The wording matters: Hugging Face says "Insufficient permissions" on a
    // 403 and "rate limit for anonymous requests" on an unauthenticated 401,
    // both of which the message regex below would otherwise match. The status
    // has to win, or a bad key rotates through the whole chain.
    expect(shouldTryNextModel(403, 'Insufficient permissions for this model')).toBe(false);
    expect(shouldTryNextModel(401, 'Rate limit reached for anonymous requests')).toBe(false);
    expect(shouldTryNextModel(401, 'Invalid credentials in Authorization header')).toBe(false);
  });

  it('reads the message when there is no status', () => {
    expect(shouldTryNextModel(undefined, 'You have exceeded your monthly quota')).toBe(true);
    expect(shouldTryNextModel(undefined, 'insufficient credits')).toBe(true);
    expect(shouldTryNextModel(undefined, 'Model is currently loading')).toBe(true);
    expect(shouldTryNextModel(undefined, 'rate limit reached')).toBe(true);
    expect(shouldTryNextModel(undefined, 'Something else went wrong')).toBe(false);
  });

  it('rotates on a 400 only when the model itself is the complaint', () => {
    expect(shouldTryNextModel(400, 'model does not exist')).toBe(true);
    // Our own malformed request will be malformed for all five.
    expect(shouldTryNextModel(400, 'invalid image encoding')).toBe(false);
  });
});
