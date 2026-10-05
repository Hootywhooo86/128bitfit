import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/**
 * The unlock sound: a four-note square-wave arpeggio, half a second long.
 * Off by default (Settings), silent when the phone is on silent, and mixed
 * with whatever else is playing rather than pausing someone's music.
 */
export async function playBlip(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
    const player = createAudioPlayer(require('@/assets/sounds/game_unlock.wav'));
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) {
        sub.remove();
        player.remove();
      }
    });
    player.play();
  } catch {
    // A sound that fails to play is not worth an error message: the banner
    // and the toast already said it.
  }
}
