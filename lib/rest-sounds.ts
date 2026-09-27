/**
 * Rest-timer alert sounds, from the prototype's rest-timer settings.
 *
 * The five named sounds are short WAVs in assets/sounds, generated for this
 * app, and shipped as Android raw resources by the expo-notifications plugin
 * (see app.json). "Phone default" is the system notification sound.
 */
export const REST_SOUNDS = [
  { id: 'beep', label: 'Beep', file: 'rest_beep.wav' },
  { id: 'chime', label: 'Chime', file: 'rest_chime.wav' },
  { id: 'bell', label: 'Bell', file: 'rest_bell.wav' },
  { id: 'arcade', label: 'Arcade', file: 'rest_arcade.wav' },
  { id: 'buzz', label: 'Buzz', file: 'rest_buzz.wav' },
  { id: 'default', label: 'Phone default', file: null },
  { id: 'off', label: 'Off', file: null },
] as const;

export type RestSound = (typeof REST_SOUNDS)[number]['id'];

export const DEFAULT_REST_SOUND: RestSound = 'chime';

export function isRestSound(v: string | null | undefined): v is RestSound {
  return REST_SOUNDS.some((s) => s.id === v);
}

/** What goes in the notification's `sound`: a raw resource name, 'default', or nothing. */
export function soundSetting(sound: RestSound): string | null {
  if (sound === 'off') return null;
  if (sound === 'default') return 'default';
  return REST_SOUNDS.find((s) => s.id === sound)!.file;
}

/**
 * The Android channel for a sound and vibration choice.
 *
 * A channel's sound and vibration are fixed when it is first created —
 * changing them later is silently ignored — so each combination is its own
 * channel. The original channel id is kept for the phone-default-with-
 * vibration case so phones that already have it keep using it.
 */
export function restChannelFor(sound: RestSound, vibrate: boolean): string {
  if (sound === 'default' && vibrate) return 'rest_timer';
  return `rest_timer_${sound}_${vibrate ? 'vib' : 'novib'}`;
}
