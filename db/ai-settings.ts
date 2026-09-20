import {
  AI_PROVIDERS,
  getProviderMeta,
  isAiProviderId,
  type AiProviderId,
} from '@/lib/ai-coach';
import { getAiApiKey, setAiApiKey, clearAiApiKey, hasAiApiKey } from '@/lib/ai-secure';
import { getSetting, setSetting } from './settings-queries';

export type AiSettings = {
  provider: AiProviderId;
  model: string;
  baseUrl: string;
  /** Whether a key is present — never the key itself. */
  hasKey: boolean;
};

const KEY_PROVIDER = 'ai_provider';
const KEY_MODEL = 'ai_model';
const KEY_BASE_URL = 'ai_base_url';

export async function getAiSettings(): Promise<AiSettings> {
  const [providerRaw, modelRaw, baseUrlRaw, hasKey] = await Promise.all([
    getSetting(KEY_PROVIDER),
    getSetting(KEY_MODEL),
    getSetting(KEY_BASE_URL),
    hasAiApiKey(),
  ]);

  const provider: AiProviderId =
    providerRaw && isAiProviderId(providerRaw) ? providerRaw : 'anthropic';
  const meta = getProviderMeta(provider);
  const model = (modelRaw && modelRaw.trim()) || meta.defaultModel;
  const baseUrl =
    (baseUrlRaw && baseUrlRaw.trim()) || (meta.defaultBaseUrl ?? '') || '';

  return { provider, model, baseUrl, hasKey };
}

export async function updateAiSettings(patch: {
  provider?: AiProviderId;
  model?: string;
  baseUrl?: string;
  /** Pass undefined to leave unchanged; empty string clears. */
  apiKey?: string;
}): Promise<AiSettings> {
  if (patch.provider != null) {
    await setSetting(KEY_PROVIDER, patch.provider);
  }
  if (patch.model != null) {
    await setSetting(KEY_MODEL, patch.model.trim());
  }
  if (patch.baseUrl != null) {
    await setSetting(KEY_BASE_URL, patch.baseUrl.trim());
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
}> {
  const settings = await getAiSettings();
  const apiKey = await getAiApiKey();
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey,
  };
}

export { AI_PROVIDERS, getProviderMeta };
