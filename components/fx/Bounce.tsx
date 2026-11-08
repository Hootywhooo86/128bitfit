import React from 'react';
import { View } from 'react-native';
import { useFrames, useReduceMotion } from '@/lib/motion';

/** Up, down, a smaller hop, settle — in whole points, like a sprite. */
const HOPS = [-10, -16, -10, 0, -6, 0, -2, 0];

/** Bounces its child in once when it mounts. Still with Reduce motion on. */
export function Bounce({ children }: { children: React.ReactNode }) {
  const still = useReduceMotion();
  const frame = useFrames(HOPS.length, 55, !still, false);
  return <View style={{ transform: [{ translateY: still ? 0 : HOPS[frame] }] }}>{children}</View>;
}
