/**
 * Rotating through Hugging Face vision models when one runs out.
 *
 * A free Hugging Face token gets a monthly credit that different models draw
 * from at very different rates, and a provider serving one model can be busy
 * while another is idle. One model is therefore a single point of failure for
 * every photo feature in the app. The token is the same for all of them, so
 * moving to the next costs nothing but the retry.
 *
 * The order is by family, not by exact model id, because the router's
 * catalogue changes week to week — that is why the model list is fetched
 * rather than bundled. Hardcoding five ids would rot; hardcoding five families
 * and resolving them against whatever is actually being served does not.
 *
 * Pure: a catalogue and an error in, an ordered chain and a decision out.
 */
import type { HfModel } from './hf-models';

/**
 * The families to try, in order.
 *
 * Chosen by the user. Each resolves to the vision-capable model of that family
 * with the most live providers, because a model served by five providers is
 * far less likely to be the one that is busy.
 */
export const HF_VISION_FAMILIES = [
  { label: 'DeepSeek', match: /^deepseek-ai\//i },
  { label: 'Kimi', match: /^moonshotai\//i },
  { label: 'Qwen', match: /^qwen\//i },
  { label: 'Gemma', match: /^google\/gemma/i },
  { label: 'Apertus', match: /^swiss-ai\/apertus/i },
] as const;

/**
 * Concrete ids to fall back on when the catalogue cannot be fetched.
 *
 * A snapshot, and treated as one: it is only reached with no network answer to
 * work from, and a stale id simply fails over to the next family like any
 * other exhausted model.
 */
export const HF_VISION_FALLBACK_IDS = [
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'moonshotai/Kimi-K3',
  'Qwen/Qwen3-VL-235B-A22B-Instruct',
  'google/gemma-4-26B-A4B-it',
  'swiss-ai/Apertus-v1.5-70B',
] as const;

export type ChainEntry = { id: string; family: string };

/**
 * One vision model per family, in the configured order.
 *
 * Only vision models: a text-only model cannot read the photo and putting one
 * in the chain would spend a retry on a guaranteed failure. Families the
 * router is not currently serving a vision model for are skipped rather than
 * padded with a text model — Apertus has three models and only one of them
 * takes images.
 *
 * `preferred` goes first when it can see, so the model the user chose is still
 * the one that gets asked first and the rotation is only ever a fallback.
 */
export function buildHfVisionChain(
  models: readonly HfModel[],
  preferred?: string | null
): ChainEntry[] {
  const vision = models.filter((m) => m.vision);
  const chain: ChainEntry[] = [];
  const taken = new Set<string>();

  const add = (id: string, family: string) => {
    if (taken.has(id)) return;
    taken.add(id);
    chain.push({ id, family });
  };

  if (preferred) {
    const chosen = vision.find((m) => m.id === preferred);
    if (chosen) add(chosen.id, familyOf(chosen.id) ?? 'Your model');
  }

  for (const family of HF_VISION_FAMILIES) {
    const candidates = vision.filter((m) => family.match.test(m.id));
    if (candidates.length === 0) continue;
    // Most providers first: a model five providers serve is the least likely
    // to be the one that is busy.
    const best = [...candidates].sort(
      (a, b) => (b.providerCount ?? 0) - (a.providerCount ?? 0) || a.id.localeCompare(b.id)
    )[0];
    add(best.id, family.label);
  }
  return chain;
}

function familyOf(id: string): string | null {
  return HF_VISION_FAMILIES.find((f) => f.match.test(id))?.label ?? null;
}

/** The snapshot chain, for when there is no catalogue to resolve against. */
export function fallbackChain(): ChainEntry[] {
  return HF_VISION_FALLBACK_IDS.map((id) => ({ id, family: familyOf(id) ?? id }));
}

/**
 * Whether a failure is worth trying the next model for.
 *
 * The distinction that matters: a key problem repeats identically on all five
 * and would turn one honest error into five wasted round trips and a much
 * slower failure. Out of credit, rate limited, or a busy provider are the
 * cases another model genuinely fixes.
 */
export function shouldTryNextModel(status: number | undefined, message: string): boolean {
  // A bad or unauthorised key is the same key everywhere.
  if (status === 401 || status === 403) return false;
  // Our own request is malformed; a different model will reject it the same
  // way — unless it is the model that is the problem, handled below.
  if (status === 400) return /model|not found|unsupported|does not exist/i.test(message);

  if (status === 402) return true; // payment required — out of credit
  if (status === 404) return true; // this model is gone from the router
  if (status === 429) return true; // rate limited or quota exhausted
  if (status != null && status >= 500) return true; // provider is down or busy

  // No status: match on what the provider said, since the router and its
  // upstreams word exhaustion differently.
  return /quota|credit|exceed|rate.?limit|too many requests|insufficient|billing|capacity|overloaded|unavailable|busy|loading/i.test(
    message
  );
}
