/**
 * BYO-key fitness coach client.
 *
 * Anthropic, OpenAI, Gemini, OpenRouter, Hugging Face, and any custom
 * OpenAI-compatible endpoint. Keys go straight to the provider and never touch
 * our servers.
 *
 * Does not invent fake replies — errors surface to the UI.
 */
import { AI_TIMEOUT_MS, fetchWithTimeout } from './net';
import { describeKeyProblem } from './api-key';

export type AiProviderId =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'huggingface'
  | 'custom';

export type AiProviderMeta = {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  /** Fixed base URL; custom uses user-provided. Empty = N/A (Gemini/Anthropic use their own paths). */
  defaultBaseUrl: string | null;
  needsBaseUrl: boolean;
  hint: string;
};

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseUrl: null,
    needsBaseUrl: false,
    hint: 'API key from console.anthropic.com',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    needsBaseUrl: false,
    hint: 'API key from platform.openai.com',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    defaultBaseUrl: null,
    needsBaseUrl: false,
    hint: 'AI Studio key from aistudio.google.com',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    needsBaseUrl: false,
    hint: 'Key from openrouter.ai — OpenAI-compatible',
  },
  {
    id: 'huggingface',
    // The Inference Providers router speaks the OpenAI chat-completions API, so
    // it needs no client of its own — only its own base URL and key.
    label: 'Hugging Face',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    needsBaseUrl: false,
    hint: 'Access token from huggingface.co/settings/tokens',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    defaultModel: 'llama3.1',
    defaultBaseUrl: 'http://localhost:11434/v1',
    needsBaseUrl: true,
    hint: 'Ollama, LM Studio, Azure, etc. — /v1 chat completions',
  },
];

export function getProviderMeta(id: AiProviderId): AiProviderMeta {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

export function isAiProviderId(v: string): v is AiProviderId {
  return AI_PROVIDERS.some((p) => p.id === v);
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /**
   * A photo to send alongside the text, base64 with no data: prefix.
   *
   * Only Anthropic, OpenAI and Gemini take images. Any other provider gets the
   * text alone and the caller is told, rather than the image being dropped
   * silently and the model asked to describe a photo it never received.
   */
  image?: { base64: string; mimeType: string };
};

/**
 * Providers where every model we can reach takes images.
 *
 * These three serve one vision-capable family each, so the provider alone
 * answers the question.
 */
export const VISION_PROVIDERS: AiProviderId[] = ['anthropic', 'openai', 'gemini'];

/**
 * Providers where it depends which model is selected.
 *
 * Hugging Face's router serves ~140 models and roughly a third of them take
 * images. Treating the provider as blind, which is what this used to do, locked
 * a user out of the photo features for a capability they had all along;
 * treating it as sighted would send a photo to a text-only model and get an
 * error or, worse, a confident answer about an image it never saw. Only the
 * model id settles it.
 */
export const MODEL_DEPENDENT_VISION: AiProviderId[] = ['huggingface'];

export type VisionSupport =
  /** Send the photo. */
  | 'yes'
  /** This provider cannot take one at all. */
  | 'no'
  /** This model cannot, but another from the same provider could. */
  | 'model-cannot'
  /** A hand-typed model we have no capability data for. Worth attempting. */
  | 'unknown';

/**
 * Whether a photo can be sent with this provider and model.
 *
 * `modelVision` is what the provider's own catalogue said about the selected
 * model when it was chosen, or null when it was typed by hand. Unknown is
 * deliberately not a refusal: blocking a capable model because we lack
 * metadata about it would be the same mistake in the other direction, and the
 * provider's own error is a better answer than our guess.
 */
export function visionSupport(
  id: AiProviderId,
  modelVision?: boolean | null
): VisionSupport {
  if (VISION_PROVIDERS.includes(id)) return 'yes';
  if (!MODEL_DEPENDENT_VISION.includes(id)) return 'no';
  if (modelVision === true) return 'yes';
  if (modelVision === false) return 'model-cannot';
  return 'unknown';
}

/**
 * Whether to attempt a photo call at all.
 *
 * True for 'unknown' — see visionSupport.
 */
export function providerSupportsVision(
  id: AiProviderId,
  modelVision?: boolean | null
): boolean {
  const support = visionSupport(id, modelVision);
  return support === 'yes' || support === 'unknown';
}

export type CoachChatRequest = {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  messages: ChatMessage[];
  /** Abort / timeout via AbortSignal */
  signal?: AbortSignal;
};

export type CoachChatResult = {
  content: string;
  provider: AiProviderId;
  model: string;
};

export class AiCoachError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiCoachError';
    this.status = status;
  }
}

const SYSTEM_PROMPT = `You are 128BIT FIT Coach — a practical fitness and nutrition coach inside an offline-first training app.

Rules:
- Give actionable, concise coaching grounded in the user's local context (macros, workouts, weight, goals).
- You are NOT a doctor. Do not diagnose, prescribe, or give medical advice. Suggest seeing a qualified professional for health concerns.
- Be careful with fasting, extreme deficits, or disordered-eating patterns: discourage unsafe restriction, encourage balanced fueling, and suggest professional help if distress around food/body image appears.
- Prefer progressive training advice (form, recovery, progressive overload) over ego lifts.
- Keep replies focused and scannable (short paragraphs or bullets). Avoid marketing fluff.
- If context is sparse, ask one clarifying question and still give a useful default tip.`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as {
        error?: { message?: string } | string;
        message?: string;
      };
      if (typeof json.error === 'string') return json.error;
      if (json.error && typeof json.error === 'object' && json.error.message) {
        return json.error.message;
      }
      if (json.message) return json.message;
    } catch {
      // not JSON
    }
    return text.slice(0, 280);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function chatOpenAiCompatible(
  req: CoachChatRequest,
  baseUrl: string
): Promise<string> {
  const url = `${stripTrailingSlash(baseUrl)}/chat/completions`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages.map((m) =>
        m.image
          ? {
              role: m.role,
              content: [
                { type: 'text', text: m.content },
                {
                  type: 'image_url',
                  image_url: { url: `data:${m.image.mimeType};base64,${m.image.base64}` },
                },
              ],
            }
          : { role: m.role, content: m.content }
      ),
      temperature: 0.6,
    }),
    signal: req.signal,
  }, { timeoutMs: AI_TIMEOUT_MS, label: 'Coach reply' });
  if (!res.ok) {
    throw new AiCoachError(await readErrorBody(res), res.status);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AiCoachError('Empty response from provider');
  return content;
}

async function chatAnthropic(req: CoachChatRequest): Promise<string> {
  const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
  const msgs = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.image
        ? [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: m.image.mimeType,
                data: m.image.base64,
              },
            },
            { type: 'text' as const, text: m.content },
          ]
        : m.content,
    }));

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 1024,
      system,
      messages: msgs,
    }),
    signal: req.signal,
  }, { timeoutMs: AI_TIMEOUT_MS, label: 'Coach reply' });
  if (!res.ok) {
    throw new AiCoachError(await readErrorBody(res), res.status);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content
    ?.filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('\n')
    .trim();
  if (!text) throw new AiCoachError('Empty response from Anthropic');
  return text;
}

async function chatGemini(req: CoachChatRequest): Promise<string> {
  const system = req.messages.find((m) => m.role === 'system')?.content;
  const contents = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.image
        ? [
            { inline_data: { mime_type: m.image.mimeType, data: m.image.base64 } },
            { text: m.content },
          ]
        : [{ text: m.content }],
    }));

  const model = encodeURIComponent(req.model);
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(req.apiKey)}`;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: req.signal,
  }, { timeoutMs: AI_TIMEOUT_MS, label: 'Coach reply' });
  if (!res.ok) {
    throw new AiCoachError(await readErrorBody(res), res.status);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) throw new AiCoachError('Empty response from Gemini');
  return text;
}

/** Single-shot coach completion (no fake responses). */
export async function coachChat(req: CoachChatRequest): Promise<CoachChatResult> {
  const keyProblem = describeKeyProblem(req.apiKey);
  if (keyProblem) {
    // Checked here so the failure is a sentence the user can act on. Without
    // it Android throws IllegalArgumentException naming a byte offset into a
    // string the user never sees.
    throw new AiCoachError(keyProblem, 401);
  }
  if (!req.model.trim()) {
    throw new AiCoachError('No model name configured');
  }

  let content: string;
  switch (req.provider) {
    case 'anthropic':
      content = await chatAnthropic(req);
      break;
    case 'gemini':
      content = await chatGemini(req);
      break;
    case 'openai': {
      const base = req.baseUrl?.trim() || getProviderMeta('openai').defaultBaseUrl!;
      content = await chatOpenAiCompatible(req, base);
      break;
    }
    case 'openrouter': {
      const base =
        req.baseUrl?.trim() || getProviderMeta('openrouter').defaultBaseUrl!;
      content = await chatOpenAiCompatible(req, base);
      break;
    }
    case 'huggingface': {
      const base =
        req.baseUrl?.trim() || getProviderMeta('huggingface').defaultBaseUrl!;
      content = await chatOpenAiCompatible(req, base);
      break;
    }
    case 'custom': {
      const base = req.baseUrl?.trim();
      if (!base) throw new AiCoachError('Custom provider needs a base URL');
      content = await chatOpenAiCompatible(req, base);
      break;
    }
    default:
      throw new AiCoachError(`Unknown provider: ${req.provider as string}`);
  }

  return { content, provider: req.provider, model: req.model };
}

export function defaultUserPromptForMode(
  mode: 'debrief' | 'ask' | 'checkin',
  contextBlock: string,
  userQuestion?: string
): string {
  const q = userQuestion?.trim();
  switch (mode) {
    case 'debrief':
      return [
        'Please give a post-workout debrief based on my local data.',
        'Cover: what went well, one improvement for next time, recovery/fuel tip.',
        '',
        '--- Local context ---',
        contextBlock,
        q ? `\nAdditional note from me: ${q}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'checkin':
      return [
        'Weekly check-in: review my recent training + nutrition context and suggest priorities for the next week.',
        '',
        '--- Local context ---',
        contextBlock,
        q ? `\nFocus area: ${q}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'ask':
    default:
      return [
        q || 'Any coaching tips based on my current context?',
        '',
        '--- Local context ---',
        contextBlock,
      ].join('\n');
  }
}
