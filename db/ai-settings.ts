import {
  AI_PROVIDERS,
  getProviderMeta,
  isAiProviderId,
  type AiProviderId,
} from '@/lib/ai-coach';
import { getAiApiKey, setAiApiKey, clearAiApiKey, hasAiApiKey } from '@/lib/ai-secure';
import { sanitizeBaseUrl } from '@/lib/api-key';
import { getSetting, setSetting } from './settings-queries';

export type AiSettings = {
  provider: AiProviderId;
  model: string;
  baseUrl: string;
  /** Whether a key is present — never the key itself. */
  hasKey: boolean;
  /**
   * Whether the selected model takes images, as its provider's catalogue said
   * when it was chosen. null for a model typed by hand, which we know nothing
   * about.
   *
   * Recorded at selection time rather than looked up when a photo is taken: a
   * supermarket aisle is exactly where there is no signal, and the offline-first
   * rule says the UI never waits on the network to answer a question it could
   * have written down.
   */
  modelVision: boolean | null;
};

const KEY_PROVIDER = 'ai_provider';
const KEY_MODEL = 'ai_model';
const KEY_BASE_URL = 'ai_base_url';
const KEY_MODEL_VISION = 'ai_model_vision';

export async function getAiSettings(): Promise<AiSettings> {
  const [providerRaw, modelRaw, baseUrlRaw, visionRaw, hasKey] = await Promise.all([
    getSetting(KEY_PROVIDER),
    getSetting(KEY_MODEL),
    getSetting(KEY_BASE_URL),
    getSetting(KEY_MODEL_VISION),
    hasAiApiKey(),
  ]);

  const provider: AiProviderId =
    providerRaw && isAiProviderId(providerRaw) ? providerRaw : 'anthropic';
  const meta = getProviderMeta(provider);
  const model = (modelRaw && modelRaw.trim()) || meta.defaultModel;
  // Sanitised on read too, so an address saved broken by an earlier build is
  // repaired rather than failing every request until someone retypes it.
  const baseUrl = sanitizeBaseUrl(baseUrlRaw) || (meta.defaultBaseUrl ?? '') || '';

  // '' means "typed by hand, nothing known" and is not the same as '0'.
  const modelVision = visionRaw === '1' ? true : visionRaw === '0' ? false : null;

  return { provider, model, baseUrl, hasKey, modelVision };
}

export async function updateAiSettings(patch: {
  provider?: AiProviderId;
  model?: string;
  baseUrl?: string;
  /**
   * What the provider's catalogue says about this model's image support.
   * Pass null for a hand-typed model — that is "unknown", not "cannot".
   */
  modelVision?: boolean | null;
  /** Pass undefined to leave unchanged; empty string clears. */
  apiKey?: string;
}): Promise<AiSettings> {
  if (patch.provider != null) {
    await setSetting(KEY_PROVIDER, patch.provider);
    // A capability recorded against the old provider's model says nothing about
    // the new one's. Stale here means sending a photo somewhere it cannot go.
    if (patch.modelVision === undefined) await setSetting(KEY_MODEL_VISION, '');
  }
  if (patch.model != null) {
    await setSetting(KEY_MODEL, patch.model.trim());
    // Same for a model changed without saying what it can do.
    if (patch.modelVision === undefined) await setSetting(KEY_MODEL_VISION, '');
  }
  if (patch.modelVision !== undefined) {
    await setSetting(KEY_MODEL_VISION, patch.modelVision == null ? '' : patch.modelVision ? '1' : '0');
  }
  if (patch.baseUrl != null) {
    // Not trim(): a pasted address carries the same paste damage a pasted key
    // does, and a newline in it fails the request exactly as one in the key did.
    await setSetting(KEY_BASE_URL, sanitizeBaseUrl(patch.baseUrl));
  }
  if (patch.apiKey !== undefined) {
    if (patch.apiKey.trim()) {
      await setAiApiKey(patch.apiKey);
    } else {
      await clearAiApiKey();
    }
  }
  return getAiSettings();
}

/** Load runtime config for a coach call (includes key from SecureStore). */
export async function getAiRuntimeConfig(): Promise<{
  provider: AiProviderId;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  modelVision: boolean | null;
}> {
  const settings = await getAiSettings();
  const apiKey = await getAiApiKey();
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey,
    modelVision: settings.modelVision,
  };
}

export { AI_PROVIDERS, getProviderMeta };
