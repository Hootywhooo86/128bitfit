/**
 * "Get an AI breakdown of this workout?" when a session is finished.
 *
 * Only asked when an AI key is set up: offering a breakdown that then fails
 * for want of a key is a dead button. "Don't ask again" is remembered, and
 * Settings can turn the question back on.
 */
import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';
import { getAiRuntimeConfig } from '@/db/ai-settings';
import { getSetting, setSetting } from '@/db/settings-queries';

type Router = ReturnType<typeof useRouter>;

const KEY = 'ai_breakdown_prompt';

export async function breakdownPromptOn(): Promise<boolean> {
  return (await getSetting(KEY)) !== '0';
}

export const setBreakdownPrompt = (on: boolean) => setSetting(KEY, on ? '1' : '0');

/** Asks, if it should; Yes opens the coach's debrief and runs it straight away. */
export async function offerBreakdown(router: Router, opts: { cardioId?: string } = {}): Promise<void> {
  try {
    const [on, cfg] = await Promise.all([breakdownPromptOn(), getAiRuntimeConfig()]);
    if (!on || !cfg.apiKey) return;
  } catch {
    return;
  }
  Alert.alert('Get an AI breakdown of this workout?', 'Your coach looks at what you just did and your recent training.', [
    { text: "Don't ask again", style: 'destructive', onPress: () => void setBreakdownPrompt(false) },
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Yes',
      onPress: () => {
        autoAskArmed = true;
        router.push({
          pathname: '/coach/[mode]',
          params: { mode: 'debrief', auto: '1', ...(opts.cardioId ? { cardio: opts.cardioId } : {}) },
        });
      },
    },
  ]);
}

/**
 * Whether the coach may ask on its own, once. Set only by tapping "Yes"
 * above: `auto=1` in the address alone is not enough, because a link from any
 * website or app (bitfit://coach/debrief?auto=1) could otherwise make the app
 * send your training summary and spend your AI credit without a tap.
 */
let autoAskArmed = false;

export function consumeAutoAsk(): boolean {
  const armed = autoAskArmed;
  autoAskArmed = false;
  return armed;
}
