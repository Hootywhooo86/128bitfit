/**
 * One request, tried across the Hugging Face chain until a model answers.
 *
 * A free Hugging Face token runs out partway through a month and different
 * models draw on it at very different rates, so a single model is a single
 * point of failure for every AI feature in the app. The token is the same for
 * all of them — moving to the next costs one retry and nothing else.
 *
 * The chain is built from vision models, as asked, but it is used for text
 * requests too: every model that reads a photo also reads a sentence, so
 * describing a meal gets the same protection for free. Leaving text on a
 * single model would have meant the Describe tab failing with nowhere to go
 * while the photo tabs beside it rotated happily.
 *
 * Only Hugging Face rotates. Anthropic, OpenAI and Gemini each serve one
 * vision family on the user's own account, so there is nowhere to move to and
 * their error is the answer.
 *
 * What it will not do is retry a key problem. A bad or unauthorised key fails
 * identically on all five, and rotating would turn one honest error into five
 * round trips and a much slower failure — see shouldTryNextModel.
 */
import { getAiRuntimeConfig } from '@/db/ai-settings';
import { AiCoachError, coachChat, type ChatMessage, type WebSearchOutcome } from './ai-coach';
import { buildHfVisionChain, fallbackChain, shouldTryNextModel, type ChainEntry } from './ai-fallback';
import { listHfModels } from './hf-models';

export type VisionAttempt = {
  /** The model that answered, so the caller can say which one did. */
  model: string;
  family: string;
  content: string;
  /** Models that were out of credit or too busy, in the order they were tried. */
  skipped: { model: string; reason: string }[];
  web: WebSearchOutcome;
};

/**
 * The chain to try, best effort.
 *
 * Asks the router what it is serving so the order resolves to models that
 * actually exist today; falls back to a snapshot when there is no answer,
 * because a stale id simply fails over to the next family like any other
 * exhausted model.
 */
export async function hfVisionChain(
  apiKey: string,
  preferred: string | null,
  signal?: AbortSignal
): Promise<ChainEntry[]> {
  const listed = await listHfModels(apiKey, signal).catch(() => null);
  if (listed?.status === 'ok' && listed.models.length > 0) {
    const chain = buildHfVisionChain(listed.models, preferred);
    if (chain.length > 0) return chain;
  }
  return fallbackChain();
}

/**
 * Runs the request, moving down the chain while failures are the kind another
 * model would fix.
 *
 * On a provider that does not rotate, this is a single call and behaves
 * exactly as it did before.
 */
export async function callWithRotation(
  messages: ChatMessage[],
  signal?: AbortSignal,
  opts: { webSearch?: boolean } = {}
): Promise<VisionAttempt> {
  const cfg = await getAiRuntimeConfig();
  if (!cfg.apiKey) throw new AiCoachError('No AI key set.', 401);

  const single = async (model: string) =>
    coachChat({
      provider: cfg.provider,
      apiKey: cfg.apiKey!,
      model,
      baseUrl: cfg.baseUrl,
      signal,
      messages,
      webSearch: opts.webSearch,
    });

  if (cfg.provider !== 'huggingface') {
    const res = await single(cfg.model);
    return { model: cfg.model, family: cfg.provider, content: res.content, skipped: [], web: res.web };
  }

  const chain = await hfVisionChain(cfg.apiKey, cfg.model, signal);
  const skipped: { model: string; reason: string }[] = [];
  let last: unknown = null;

  for (const entry of chain) {
    try {
      const res = await single(entry.id);
      return { model: entry.id, family: entry.family, content: res.content, skipped, web: res.web };
    } catch (e) {
      last = e;
      // A cancelled request is the user's decision, not a model running out.
      if (signal?.aborted) throw e;

      const status = e instanceof AiCoachError ? e.status : undefined;
      const message = e instanceof Error ? e.message : String(e);
      if (!shouldTryNextModel(status, message)) throw e;
      skipped.push({ model: entry.id, reason: message });
    }
  }

  // Everything in the chain was exhausted. The last failure is the honest one
  // to report, and the caller says how many were tried.
  throw last instanceof Error
    ? last
    : new AiCoachError('Every Hugging Face vision model was unavailable.');
}
