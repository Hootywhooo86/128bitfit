/**
 * BYO-key fitness coach client.
 *
 * Anthropic, OpenAI, Gemini, OpenRouter, Hugging Face, and any custom
 * OpenAI-compatible endpoint. Keys go straight to the provider and never touch
 * our servers.
 *
 * Does not invent fake replies — errors surface to the UI.
 */
import { AI_TIMEOUT_MS, AI_WEB_TIMEOUT_MS, fetchWithTimeout } from './net';
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

/**
 * Providers that can search the web themselves, on the user's own key.
 *
 * Each uses its provider's built-in search, so there is still no server of
 * ours in the path. Hugging Face and custom endpoints have no equivalent.
 */
export const WEB_SEARCH_PROVIDERS: AiProviderId[] = ['anthropic', 'gemini', 'openai', 'openrouter'];

export function providerCanSearchWeb(id: AiProviderId): boolean {
  return WEB_SEARCH_PROVIDERS.includes(id);
}

/** A page the provider reported using. Taken from the API response, never from the model's text. */
export type WebSource = { url: string; title: string | null };

/**
 * What happened to web search on one call.
 *
 * `on` with no sources means search was available and the model did not use
 * it — which is not the same as having looked something up.
 */
export type WebSearchOutcome =
  | { status: 'off' }
  | { status: 'unsupported' }
  | { status: 'failed'; message: string }
  | { status: 'on'; sources: WebSource[] };

export type CoachChatRequest = {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  messages: ChatMessage[];
  /** Let the provider search the web. Ignored where it cannot. */
  webSearch?: boolean;
  /** Abort / timeout via AbortSignal */
  signal?: AbortSignal;
};

export type CoachChatResult = {
  content: string;
  provider: AiProviderId;
  model: string;
  web: WebSearchOutcome;
};

type Reply = { text: string; sources: WebSource[] };

function dedupeSources(sources: WebSource[]): WebSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

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
- If the user reports pain or an injury, train around it — swap or skip what aggravates it. Do not write rehab programmes. If it has lasted more than a couple of weeks or is getting worse, point them to a physio.
- Be careful with fasting, extreme deficits, or disordered-eating patterns: discourage unsafe restriction, encourage balanced fueling, and suggest professional help if distress around food/body image appears.
- Prefer progressive training advice (form, recovery, progressive overload) over ego lifts.
- Keep replies focused and scannable (short paragraphs or bullets). Avoid marketing fluff.
- If context is sparse, ask one clarifying question and still give a useful default tip.`;

const WEB_RULE = `
- You can search the web. Use it for facts you would otherwise guess: a branded or meal-kit product's nutrition, a restaurant dish, a published study. Name where a figure came from. If you could not find it, say the number is your estimate.`;

export function buildSystemPrompt(webSearch = false): string {
  return webSearch ? SYSTEM_PROMPT + WEB_RULE : SYSTEM_PROMPT;
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
  baseUrl: string,
  web: boolean
): Promise<Reply> {
  const url = `${stripTrailingSlash(baseUrl)}/chat/completions`;
  const body: Record<string, unknown> = {
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
  };
  // OpenRouter's web plugin works with any model it routes to.
  if (web) body.plugins = [{ id: 'web' }];

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: req.signal,
  }, { timeoutMs: AI_TIMEOUT_MS, label: 'Coach reply' });
  if (!res.ok) {
    throw new AiCoachError(await readErrorBody(res), res.status);
  }
  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[];
      };
    }[];
  };
  const message = data.choices?.[0]?.message;
  const content = message?.content?.trim();
  if (!content) throw new AiCoachError('Empty response from provider');
  const sources = (message?.annotations ?? [])
    .filter((a) => a.type === 'url_citation' && a.url_citation?.url)
    .map((a) => ({ url: a.url_citation!.url!, title: a.url_citation!.title ?? null }));
  return { text: content, sources: dedupeSources(sources) };
}

/**
 * OpenAI with search goes through the Responses API: chat completions only
 * searches on the dedicated search-preview models, which almost nobody has
 * selected.
 */
async function chatOpenAiResponses(req: CoachChatRequest, baseUrl: string): Promise<Reply> {
  const instructions = req.messages.find((m) => m.role === 'system')?.content;
  const input = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.image
        ? [
            { type: 'input_text', text: m.content },
            { type: 'input_image', image_url: `data:${m.image.mimeType};base64,${m.image.base64}` },
          ]
        : m.content,
    }));

  const res = await fetchWithTimeout(`${stripTrailingSlash(baseUrl)}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      instructions,
      input,
      tools: [{ type: 'web_search' }],
    }),
    signal: req.signal,
  }, { timeoutMs: AI_WEB_TIMEOUT_MS, label: 'Coach reply' });
  if (!res.ok) {
    throw new AiCoachError(await readErrorBody(res), res.status);
  }
  const data = (await res.json()) as {
    output?: {
      type?: string;
      content?: {
        type?: string;
        text?: string;
        annotations?: { type?: string; url?: string; title?: string }[];
      }[];
    }[];
  };
  const parts = (data.output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text' && c.text);
  const text = parts.map((c) => c.text).join('').trim();
  if (!text) throw new AiCoachError('Empty response from OpenAI');
  const sources = parts
    .flatMap((c) => c.annotations ?? [])
    .filter((a) => a.type === 'url_citation' && a.url)
    .map((a) => ({ url: a.url!, title: a.title ?? null }));
  return { text, sources: dedupeSources(sources) };
}

type AnthropicBlock = {
  type: string;
  text?: string;
  citations?: { type?: string; url?: string; title?: string }[];
  content?: { type?: string; url?: string; title?: string }[] | unknown;
};

async function chatAnthropic(req: CoachChatRequest, web: boolean): Promise<Reply> {
  const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
  const msgs: { role: 'user' | 'assistant'; content: unknown }[] = req.messages
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

  const blocks: AnthropicBlock[] = [];
  // A long search can stop with `pause_turn`; the documented way on is to send
  // the partial turn back. Bounded so a provider bug cannot loop forever.
  for (let round = 0; round < 3; round++) {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: web ? 2048 : 1024,
        system,
        messages: msgs,
        ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] } : {}),
      }),
      signal: req.signal,
    }, { timeoutMs: web ? AI_WEB_TIMEOUT_MS : AI_TIMEOUT_MS, label: 'Coach reply' });
    if (!res.ok) {
      throw new AiCoachError(await readErrorBody(res), res.status);
    }
    const data = (await res.json()) as { content?: AnthropicBlock[]; stop_reason?: string };
    const content = data.content ?? [];
    blocks.push(...content);
    if (data.stop_reason !== 'pause_turn') break;
    msgs.push({ role: 'assistant', content });
  }

  // With search on, one answer arrives as several text blocks split at each
  // citation. Joining them with anything would corrupt a JSON reply.
  const text = blocks
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join(web ? '' : '\n')
    .trim();
  if (!text) throw new AiCoachError('Empty response from Anthropic');

  const cited = blocks.flatMap((b) =>
    (b.citations ?? [])
      .filter((c) => c.url)
      .map((c) => ({ url: c.url!, title: c.title ?? null }))
  );
  // What it read but did not cite still counts as having looked something up.
  const read = blocks
    .filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
    .flatMap((b) => b.content as { type?: string; url?: string; title?: string }[])
    .filter((r) => r.type === 'web_search_result' && r.url)
    .map((r) => ({ url: r.url!, title: r.title ?? null }));
  return { text, sources: dedupeSources(cited.length > 0 ? cited : read) };
}

async function chatGemini(req: CoachChatRequest, web: boolean): Promise<Reply> {
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
    generationConfig: { temperature: 0.6, maxOutputTokens: web ? 2048 : 1024 },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  if (web) body.tools = [{ google_search: {} }];

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: req.signal,
  }, { timeoutMs: web ? AI_WEB_TIMEOUT_MS : AI_TIMEOUT_MS, label: 'Coach reply' });
  if (!res.ok) {
    throw new AiCoachError(await readErrorBody(res), res.status);
  }
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    }[];
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) throw new AiCoachError('Empty response from Gemini');
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((c) => c.web?.uri)
    .map((c) => ({ url: c.web!.uri!, title: c.web!.title ?? null }));
  return { text, sources: dedupeSources(sources) };
}

async function chatOnce(req: CoachChatRequest, web: boolean): Promise<Reply> {
  switch (req.provider) {
    case 'anthropic':
      return chatAnthropic(req, web);
    case 'gemini':
      return chatGemini(req, web);
    case 'openai': {
      const base = req.baseUrl?.trim() || getProviderMeta('openai').defaultBaseUrl!;
      return web ? chatOpenAiResponses(req, base) : chatOpenAiCompatible(req, base, false);
    }
    case 'openrouter': {
      const base =
        req.baseUrl?.trim() || getProviderMeta('openrouter').defaultBaseUrl!;
      return chatOpenAiCompatible(req, base, web);
    }
    case 'huggingface': {
      const base =
        req.baseUrl?.trim() || getProviderMeta('huggingface').defaultBaseUrl!;
      return chatOpenAiCompatible(req, base, false);
    }
    case 'custom': {
      const base = req.baseUrl?.trim();
      if (!base) throw new AiCoachError('Custom provider needs a base URL');
      return chatOpenAiCompatible(req, base, false);
    }
    default:
      throw new AiCoachError(`Unknown provider: ${req.provider as string}`);
  }
}

/**
 * Whether a failed search call is worth repeating without search.
 *
 * A request the provider rejected — search not enabled on the account, a
 * model that cannot use the tool — gets the same answer without it. A bad
 * key, an exhausted quota or a dropped connection would fail again anyway, and
 * retrying would only double the wait before the honest error.
 */
export function searchRejected(status: number | undefined): boolean {
  return status === 400 || status === 403 || status === 404 || status === 422;
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

  const done = (reply: Reply, web: WebSearchOutcome): CoachChatResult => ({
    content: reply.text,
    provider: req.provider,
    model: req.model,
    web,
  });

  if (!req.webSearch) return done(await chatOnce(req, false), { status: 'off' });
  if (!providerCanSearchWeb(req.provider)) {
    return done(await chatOnce(req, false), { status: 'unsupported' });
  }

  try {
    const reply = await chatOnce(req, true);
    return done(reply, { status: 'on', sources: reply.sources });
  } catch (e) {
    if (req.signal?.aborted) throw e;
    const status = e instanceof AiCoachError ? e.status : undefined;
    if (!searchRejected(status)) throw e;
    // Answer anyway, and say plainly that nothing was looked up.
    const message = e instanceof Error ? e.message : String(e);
    return done(await chatOnce(req, false), { status: 'failed', message });
  }
}

/**
 * A coach reply with the pages the provider reported reading, appended as
 * plain text so they survive in the saved thread and in an export.
 */
export function withSources(content: string, web: WebSearchOutcome): string {
  if (web.status !== 'on' || web.sources.length === 0) return content;
  const lines = web.sources.slice(0, 5).map((s) => `• ${s.title ? `${s.title} — ` : ''}${s.url}`);
  return `${content}\n\nSources:\n${lines.join('\n')}`;
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
