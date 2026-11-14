/**
 * Asks a model to pick today's workout: Gemini first, always.
 *
 * Gemini is used when it is the coach's provider, or when a separate Gemini
 * key has been saved for the picker. If Gemini is not set up or does not
 * answer, the coach's own provider is asked next. If nothing answers — no key,
 * no signal — the app picks by its own rules, so the button always produces a
 * workout, and the screen says which of these happened.
 *
 * Keys go straight from the phone to the provider, as everywhere else.
 */
import { getAiRuntimeConfig } from '@/db/ai-settings';
import { loadPickHistory, loadPickInjuries, loadPickLibrary } from '@/db/workout-pick-queries';
import { AiCoachError, coachChat, getProviderMeta, type AiProviderId } from './ai-coach';
import { getGeminiKey } from './ai-secure';
import { fetchWithTimeout } from './net';
import { describeNetworkFailure } from './net-errors';
import {
  buildPickPrompt,
  newestGeminiFlash,
  candidatesFor,
  offlinePick,
  parsePick,
  PICK_SYSTEM,
  SPLITS,
  topUp,
  type EquipmentId,
  type Pick,
  type SplitId,
} from './workout-pick';

export type PickSource = { kind: 'ai'; provider: string; model: string } | { kind: 'offline'; reason: string };

export type PickOutcome =
  | { status: 'ok'; picks: Pick[]; why: string | null; source: PickSource; note: string | null }
  | { status: 'empty'; message: string };

type Attempt = { provider: AiProviderId; apiKey: string; model: string; baseUrl: string | null };

/** Who to ask, in order: Gemini, then the coach's provider if that is something else. */
async function attempts(): Promise<Attempt[]> {
  const cfg = await getAiRuntimeConfig();
  const list: Attempt[] = [];
  const geminiKey = cfg.provider === 'gemini' && cfg.apiKey ? cfg.apiKey : await getGeminiKey();
  if (geminiKey) {
    list.push({
      provider: 'gemini',
      apiKey: geminiKey,
      model: cfg.provider === 'gemini' ? cfg.model : getProviderMeta('gemini').defaultModel,
      baseUrl: null,
    });
  }
  if (cfg.provider !== 'gemini' && cfg.apiKey) {
    list.push({ provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl || null });
  }
  return list;
}

export async function pickWorkout(
  opts: { split: SplitId; count: number; equipment: EquipmentId },
  signal?: AbortSignal
): Promise<PickOutcome> {
  const split = SPLITS.find((s) => s.id === opts.split) ?? SPLITS[0];
  const [library, history, injuries] = await Promise.all([loadPickLibrary(), loadPickHistory(), loadPickInjuries()]);
  const candidates = candidatesFor(split, opts.equipment, library, history);
  if (candidates.length === 0) {
    return {
      status: 'empty',
      message: `No ${split.label.toLowerCase()} exercises in the library fit that equipment. Try another equipment option.`,
    };
  }
  const fallback = offlinePick(split, candidates, opts.count, history);
  const prompt = buildPickPrompt({ split, count: opts.count, equipment: opts.equipment, history, injuries }, candidates);

  const failures: string[] = [];
  for (const a of await attempts()) {
    const label = getProviderMeta(a.provider).label;
    const ask = (model: string) =>
      coachChat({
        provider: a.provider,
        apiKey: a.apiKey,
        model,
        baseUrl: a.baseUrl,
        messages: [
          { role: 'system', content: PICK_SYSTEM },
          { role: 'user', content: prompt },
        ],
        webSearch: false,
        signal,
      });
    try {
      let reply;
      try {
        reply = await ask(a.model);
      } catch (e) {
        // A retired Gemini model answers 404. Ask Google what exists and try
        // its newest Flash once, rather than failing on a stale name.
        if (!(a.provider === 'gemini' && e instanceof AiCoachError && e.status === 404)) throw e;
        const newer = await currentGeminiFlash(a.apiKey, signal);
        if (!newer || newer === a.model) throw e;
        reply = await ask(newer);
        a.model = newer;
      }
      const parsed = parsePick(reply.content, candidates, opts.count);
      if (!parsed || parsed.picks.length === 0) {
        failures.push(`${label} did not answer with a workout`);
        continue;
      }
      const picks = topUp(parsed.picks, fallback, opts.count);
      const filled = picks.length - parsed.picks.length;
      return {
        status: 'ok',
        picks,
        why: parsed.why,
        source: { kind: 'ai', provider: label, model: a.model },
        note:
          [
            failures.length ? `${failures.join('; ')}, so ${label} picked instead.` : null,
            filled > 0 ? `${label} gave ${parsed.picks.length}; the app added ${filled} to make ${opts.count}.` : null,
          ]
            .filter(Boolean)
            .join(' ') || null,
      };
    } catch (e) {
      if (signal?.aborted) throw e;
      const why = e instanceof AiCoachError ? e.message : describeNetworkFailure(e, `${label}`);
      failures.push(`${label}: ${why}`);
    }
  }

  return {
    status: 'ok',
    picks: fallback,
    why: null,
    source: {
      kind: 'offline',
      reason: failures.length
        ? `No AI answer (${failures.join('; ')}). Picked by the app's own rules: most rested muscles first.`
        : "No AI key set. Picked by the app's own rules: most rested muscles first. Add a Gemini key below to have Gemini pick.",
    },
    note: fallback.length < opts.count ? `Only ${fallback.length} exercises fit; there were not ${opts.count}.` : null,
  };
}

/** The newest Flash model this Gemini key can use, or null if the list cannot be read. */
async function currentGeminiFlash(apiKey: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
      { signal },
      { timeoutMs: 15_000, label: 'Gemini model list' }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    return newestGeminiFlash(
      (data.models ?? []).map((m) => ({ name: m.name ?? '', methods: m.supportedGenerationMethods ?? [] }))
    );
  } catch {
    return null;
  }
}
