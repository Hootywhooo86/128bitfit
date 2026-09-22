import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, getProviderMeta, isAiProviderId, type AiProviderId } from './ai-coach';

describe('AI providers', () => {
  it('offers Hugging Face', () => {
    const hf = AI_PROVIDERS.find((p) => p.id === 'huggingface');
    expect(hf).toBeDefined();
    expect(hf!.defaultBaseUrl).toBe('https://router.huggingface.co/v1');
    // Its router speaks the OpenAI API, so the user should not have to supply
    // a base URL to use it.
    expect(hf!.needsBaseUrl).toBe(false);
  });

  it('gives every provider a label, a default model and a hint', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.label.length, p.id).toBeGreaterThan(0);
      expect(p.defaultModel.length, p.id).toBeGreaterThan(0);
      expect(p.hint.length, p.id).toBeGreaterThan(0);
    }
  });

  it('gives a base URL to every provider that does not ask the user for one', () => {
    // Anthropic and Gemini use their own paths, so null is correct there; any
    // other provider with neither a default nor needsBaseUrl could not be
    // called at all.
    for (const p of AI_PROVIDERS) {
      if (p.needsBaseUrl) continue;
      if (p.id === 'anthropic' || p.id === 'gemini') continue;
      expect(p.defaultBaseUrl, p.id).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('recognises its own ids and nothing else', () => {
    for (const p of AI_PROVIDERS) expect(isAiProviderId(p.id)).toBe(true);
    expect(isAiProviderId('huggingface')).toBe(true);
    expect(isAiProviderId('not-a-provider')).toBe(false);
    expect(isAiProviderId('')).toBe(false);
  });

  it('falls back to a real provider for an unknown id', () => {
    expect(getProviderMeta('nope' as AiProviderId).id).toBe(AI_PROVIDERS[0].id);
  });
});
