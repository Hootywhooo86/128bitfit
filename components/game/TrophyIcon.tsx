import React from 'react';
import { trophyPixels } from '@/lib/game/sprites';
import { TROPHIES, type TrophyId } from '@/lib/game/trophies';
import { PixelSprite } from './PixelSprite';

/** A trophy's sprite: accent once earned, grey until then. */
export function TrophyIcon({ id, earned, size = 48 }: { id: TrophyId; earned: boolean; size?: number }) {
  const name = TROPHIES.find((t) => t.id === id)?.name ?? id;
  return (
    <PixelSprite
      pixels={trophyPixels(id, earned)}
      px={Math.max(1, Math.floor(size / 16))}
      label={`${name}${earned ? '' : ' (not earned yet)'}`}
    />
  );
}
