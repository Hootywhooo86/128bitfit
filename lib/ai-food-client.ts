/**
 * Runs an AI food estimate against the user's own provider.
 *
 * Separate from lib/ai-food.ts so the prompt building and reply parsing stay
 * pure and testable; this file is only the call and the error wording.
 *
 * Offline path: there is no server-side fallback and there cannot be — the key
 * is the user's and the request goes straight to their provider. When there is
 * no key, no network, or a provider that cannot see photos, the caller is told
 * in one sentence and pointed at the manual form.
 */
import { getAiRuntimeConfig } from '@/db/ai-settings';
import { AiCoachError, coachChat, providerSupportsVision } from './ai-coach';
import { PHOTO_PROMPT, describePrompt, parseAiFood, systemPrompt, type AiFoodResult } from './ai-food';

export type AiFoodRequest =
  | { kind: 'describe'; text: string }
  | { kind: 'photo'; base64: string; mimeType: string };

export type AiFoodOutcome =
  | AiFoodResult
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

export async function estimateFood(
  req: AiFoodRequest,
  signal?: AbortSignal
): Promise<AiFoodOutcome> {
  const cfg = await getAiRuntimeConfig();
  if (!cfg.apiKey) {
    return {
      status: 'unavailable',
      message: 'No AI key set. Add one in Settings → AI, or add the food by hand.',
    };
  }
  if (req.kind === 'photo' && !providerSupportsVision(cfg.provider)) {
    return {
      status: 'unavailable',
      message: `${cfg.provider} cannot read photos. Use Describe instead, or switch provider in Settings → AI.`,
    };
  }

  try {
    const result = await coachChat({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      signal,
      messages: [
        { role: 'system', content: systemPrompt() },
        req.kind === 'describe'
          ? { role: 'user', content: describePrompt(req.text) }
          : {
              role: 'user',
              content: PHOTO_PROMPT,
              image: { base64: req.base64, mimeType: req.mimeType },
            },
      ],
    });
    return parseAiFood(result.content);
  } catch (e) {
    if (e instanceof AiCoachError) {
      return { status: 'failed', message: e.message };
    }
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : 'The estimate failed. Try again, or add the food by hand.',
    };
  }
}
