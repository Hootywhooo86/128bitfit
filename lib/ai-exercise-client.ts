/**
 * Runs an equipment identification against the user's own provider.
 *
 * Split from lib/ai-exercise.ts so the prompt and the parsing stay pure and
 * testable; this is only the call and the error wording.
 */
import { getAiRuntimeConfig } from '@/db/ai-settings';
import { AiCoachError, coachChat, providerSupportsVision } from './ai-coach';
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
  if (!providerSupportsVision(cfg.provider)) {
    return {
      status: 'unavailable',
      message: `${cfg.provider} cannot read photos. Switch to Anthropic, OpenAI or Gemini in Settings → AI, or fill it in by hand.`,
    };
  }

  try {
    const res = await coachChat({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      signal,
      messages: [
        { role: 'system', content: equipmentSystemPrompt() },
        { role: 'user', content: EQUIPMENT_PROMPT, image: { base64, mimeType } },
      ],
    });
    return parseIdentifiedExercise(res.content);
  } catch (e) {
    if (e instanceof AiCoachError) return { status: 'failed', message: e.message };
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : 'The identification failed. Try again, or fill it in by hand.',
    };
  }
}
