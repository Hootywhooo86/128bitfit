/**
 * Runs an equipment identification against the user's own provider.
 *
 * Split from lib/ai-exercise.ts so the prompt and the parsing stay pure and
 * testable; this is only the call and the error wording.
 */
import { getAiRuntimeConfig } from '@/db/ai-settings';
import { AiCoachError, getProviderMeta, visionSupport } from './ai-coach';
import { callVision } from './ai-vision-call';
import {
  EQUIPMENT_PROMPT,
  equipmentSystemPrompt,
  parseIdentifiedExercise,
  type ExerciseIdResult,
} from './ai-exercise';

export type ExerciseIdOutcome =
  | ExerciseIdResult
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

export async function identifyEquipment(
  base64: string,
  mimeType = 'image/jpeg',
  signal?: AbortSignal
): Promise<ExerciseIdOutcome> {
  const cfg = await getAiRuntimeConfig();
  if (!cfg.apiKey) {
    return {
      status: 'unavailable',
      message: 'No AI key set. Add one in Settings → AI, or fill the exercise in by hand.',
    };
  }
  // Same rule as the food photos: on some providers this depends on the model,
  // so the message names whichever of the two the user has to change.
  const support = visionSupport(cfg.provider, cfg.modelVision);
  if (support === 'no') {
    return {
      status: 'unavailable',
      message: `${getProviderMeta(cfg.provider).label} cannot read photos. Switch to Anthropic, OpenAI, Gemini or a Hugging Face vision model in Settings → AI, or fill it in by hand.`,
    };
  }
  if (support === 'model-cannot') {
    return {
      status: 'unavailable',
      message: `${cfg.model} cannot read photos. Pick a model that can in Settings → AI — the list marks them — or fill it in by hand.`,
    };
  }

  try {
    // Rotates through the Hugging Face vision chain when a model runs out.
    const res = await callVision([
        { role: 'system', content: equipmentSystemPrompt() },
        { role: 'user', content: EQUIPMENT_PROMPT, image: { base64, mimeType } },
      ], signal);
    return parseIdentifiedExercise(res.content);
  } catch (e) {
    if (e instanceof AiCoachError) return { status: 'failed', message: e.message };
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : 'The identification failed. Try again, or fill it in by hand.',
    };
  }
}
