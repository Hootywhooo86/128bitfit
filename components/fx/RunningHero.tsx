import React from 'react';
import { PixelSprite } from '@/components/game/PixelSprite';
import type { Look } from '@/lib/game/cosmetics';
import { heroRunFrame } from '@/lib/game/sprites';
import { useFrames, useReduceMotion } from '@/lib/motion';

/** The hero running on the spot, for as long as it is shown. */
export function RunningHero({ look, px = 2 }: { look: Look; px?: number }) {
  const still = useReduceMotion();
  const frame = useFrames(4, 120, !still);
  return <PixelSprite pixels={heroRunFrame(look, still ? 1 : frame)} px={px} label="Refreshing" />;
}
