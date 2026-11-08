import React from 'react';
import { hourglassFrame, hourglassSideways } from '@/lib/fx-sprites';
import { useFrames, useReduceMotion } from '@/lib/motion';
import { PixelGrid } from './PixelGrid';

/**
 * A pixel hourglass that drains as the rest runs down, a grain falling
 * through the neck, and a flip onto its side in the last second. Sand is the
 * accent colour, the glass grey.
 */
export function Hourglass({ left, color, px = 2 }: { left: number; color: string; px?: number }) {
  const still = useReduceMotion();
  const ending = left <= 0.02;
  const tick = useFrames(2, ending ? 180 : 300, !still);
  const rows = ending && !still && tick === 1 ? hourglassSideways() : hourglassFrame(left, !still && tick === 1);
  return <PixelGrid rows={rows} palette={{ '#': '#8c8c8c', '*': color }} px={px} />;
}
