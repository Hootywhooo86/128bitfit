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
import { AiCoachError, getProviderMeta, visionSupport, type WebSearchOutcome } from './ai-coach';
import { callWithRotation } from './ai-rotate';
import { describeNetworkFailure } from './net-errors';
import {
  PHOTO_PROMPT,
  describePrompt,
  parseAiFood,
  recipeLinkPrompt,
  recipePhotosPrompt,
  systemPrompt,
  type AiFoodResult,
} from './ai-food';
import type { ChatMessage } from './ai-coach';

export type AiPhoto = { base64: string; mimeType: string };

export type AiFoodRequest =
  | { kind: 'describe'; text: string }
  | { kind: 'photo'; base64: string; mimeType: string }
  | { kind: 'recipe-photos'; photos: AiPhoto[]; servings: number }
  | { kind: 'recipe-link'; url: string; servings: number };

/** More than this and the request gets large enough to time out on mobile data. */
export const MAX_RECIPE_PHOTOS = 5;

export type AiFoodOutcome =
  | (Exclude<AiFoodResult, { status: 'ok' }>)
  | (Extract<AiFoodResult, { status: 'ok' }> & { web: WebSearchOutcome; providerLabel: string })
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
  const needsVision = req.kind === 'photo' || req.kind === 'recipe-photos';
  if (needsVision) {
    // Vision is a property of the model on some providers, not the provider.
    // The message has to say which of the two is the problem, because the fix
    // is different: switch provider, or switch model within it.
    const support = visionSupport(cfg.provider, cfg.modelVision);
    if (support === 'no') {
      return {
        status: 'unavailable',
        message: `${getProviderMeta(cfg.provider).label} cannot read photos. Use Describe or a link instead, or switch provider in Settings → AI.`,
      };
    }
    if (support === 'model-cannot') {
      return {
        status: 'unavailable',
        message: `${cfg.model} cannot read photos. Pick a model that can in Settings → AI — the list marks them — or use Describe instead.`,
      };
    }
  }
  if (req.kind === 'recipe-photos' && req.photos.length === 0) {
    return { status: 'unavailable', message: 'Add at least one photo of the recipe.' };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(cfg.webSearch) },
    ...userMessages(req),
  ];

  try {
    // Every request, not only the photo ones. callWithRotation is a single
    // call on a provider that does not rotate, so this is the old behaviour
    // everywhere except Hugging Face — where describing a meal now falls over
    // to the next model exactly as photographing one does.
    const attempt = await callWithRotation(messages, signal, { webSearch: cfg.webSearch });
    const searched = attempt.web.status === 'on' && attempt.web.sources.length > 0;
    const parsed = parseAiFood(attempt.content, new Date(), searched);
    if (parsed.status !== 'ok') return parsed;
    return { ...parsed, web: attempt.web, providerLabel: getProviderMeta(cfg.provider).label };
  } catch (e) {
    if (e instanceof AiCoachError) {
      // The provider's own words when it answered; a translated sentence when
      // the request never left the phone.
      return {
        status: 'failed',
        message: e.status != null ? e.message : describeNetworkFailure(e, 'your food estimate'),
      };
    }
    return { status: 'failed', message: describeNetworkFailure(e, 'your food estimate') };
  }
}

/**
 * The user turns of the request.
 *
 * Several photos become several messages, because every provider's image
 * format carries one image per message; the prompt on the first says they are
 * one recipe, so the model does not return each ingredient once per photo.
 */
function userMessages(req: AiFoodRequest): ChatMessage[] {
  switch (req.kind) {
    case 'describe':
      return [{ role: 'user', content: describePrompt(req.text) }];
    case 'photo':
      return [
        {
          role: 'user',
          content: PHOTO_PROMPT,
          image: { base64: req.base64, mimeType: req.mimeType },
        },
      ];
    case 'recipe-link':
      return [{ role: 'user', content: recipeLinkPrompt(req.url, req.servings) }];
    case 'recipe-photos':
      return req.photos.map((p, i) => ({
        role: 'user' as const,
        content:
          i === 0
            ? recipePhotosPrompt(req.photos.length, req.servings)
            : `Photo ${i + 1} of ${req.photos.length} of the same recipe.`,
        image: p,
      }));
  }
}
