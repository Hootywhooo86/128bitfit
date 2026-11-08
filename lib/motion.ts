import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the phone asks for less motion. Every pixel animation in the app
 * checks this and shows its last frame instead: the information is the same,
 * only the movement goes.
 *
 * Starts false and corrects itself after one read. An animation that briefly
 * plays before the answer arrives is harmless; one that never plays because
 * the read is slow would make the setting the default for everyone.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => alive && setReduce(r))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * A frame counter for sprite animation: 0, 1, 2 … every `ms`, while `running`.
 * Stops at `count - 1` when `loop` is false. Pixel art animates in whole
 * frames, never tweens, so this is a timer and not an Animated value.
 */
export function useFrames(count: number, ms: number, running = true, loop = true): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!running) return;
    setFrame(0);
    const t = setInterval(() => {
      setFrame((f) => {
        if (f + 1 < count) return f + 1;
        if (loop) return 0;
        clearInterval(t);
        return f;
      });
    }, ms);
    return () => clearInterval(t);
  }, [count, ms, running, loop]);
  return frame;
}
