/**
 * The Hugging Face model list.
 *
 * Hugging Face hosts hundreds of thousands of models and the set that actually
 * serves chat completions changes weekly, so hardcoding a list would be wrong
 * within a month. The router publishes what it can serve; this fetches that and
 * lets the user search it.
 *
 * Offline path: the list is a convenience, not a requirement. The model field
 * stays typeable, so a user with no signal can still enter an id by hand.
 */
import { fetchWithTimeout, LOOKUP_TIMEOUT_MS } from './net';

export type HfModel = {
  id: string;
  /** Who serves it, when the router says. Shown so the user can tell them apart. */
  provider: string | null;
  /**
   * Whether the model takes images as well as text.
   *
   * Straight from the router's `architecture.input_modalities` — not a guess
   * from the name. Vision on Hugging Face is a property of the model, not the
   * provider: roughly a third of what the router serves takes images and the
   * rest does not, so "can Hugging Face see photos" has no single answer.
   */
  vision: boolean;
};

export type HfModelsResult =
  | { status: 'ok'; models: HfModel[] }
  | { status: 'failed'; message: string };

const ROUTER_MODELS = 'https://router.huggingface.co/v1/models';

/**
 * Models the router can serve, newest-looking first.
 *
 * The key is optional: the endpoint answers unauthenticated, but sending the
 * user's token returns what *they* can reach, which is the more useful answer.
 */
export async function listHfModels(
  apiKey?: string | null,
  signal?: AbortSignal
): Promise<HfModelsResult> {
  try {
    const res = await fetchWithTimeout(
      ROUTER_MODELS,
      {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        signal,
      },
      { timeoutMs: LOOKUP_TIMEOUT_MS, label: 'Hugging Face models' }
    );
    if (!res.ok) {
      return { status: 'failed', message: `Hugging Face returned ${res.status}.` };
    }
    const body = (await res.json()) as unknown;
    return { status: 'ok', models: parseHfModels(body) };
  } catch (e) {
    return {
      status: 'failed',
      message: e instanceof Error ? e.message : 'Could not reach Hugging Face.',
    };
  }
}

/** Pure, so the shape handling is tested without a network. */
export function parseHfModels(body: unknown): HfModel[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: HfModel[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    // The router reports providers as a list of objects; take the first name it
    // offers and do not invent one when it offers none.
    let provider: string | null = null;
    const providers = r.providers;
    if (Array.isArray(providers) && providers.length > 0) {
      const p = providers[0] as Record<string, unknown>;
      if (typeof p?.provider === 'string') provider = p.provider;
      else if (typeof providers[0] === 'string') provider = providers[0] as string;
    }

    // A model that does not say it takes images is treated as not taking them.
    // Claiming a capability the router did not report would send a photo that
    // comes back as an error, or worse, silently ignored.
    const modalities = (r.architecture as { input_modalities?: unknown } | undefined)
      ?.input_modalities;
    const vision = Array.isArray(modalities) && modalities.includes('image');

    out.push({ id, provider, vision });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Case-insensitive substring match on the id, for the picker's search box.
 *
 * `visionOnly` narrows to models that take images, which is what someone who
 * came here to photograph a recipe actually wants to choose from.
 */
export function filterHfModels(
  models: HfModel[],
  query: string,
  visionOnly = false
): HfModel[] {
  const pool = visionOnly ? models.filter((m) => m.vision) : models;
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  const terms = q.split(/\s+/);
  return pool.filter((m) => {
    const hay = `${m.id} ${m.provider ?? ''}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
