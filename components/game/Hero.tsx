import React from 'react';
import { View } from 'react-native';
import type { Look } from '@/lib/game/cosmetics';
import { heroPixels, petPixels } from '@/lib/game/sprites';
import { PixelSprite } from './PixelSprite';

/** The hero in their current look, with the pet at their feet. */
export function Hero({ look, px = 4 }: { look: Look; px?: number }) {
  const pet = petPixels(look.pet);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: px * 2 }}>
      <PixelSprite pixels={heroPixels(look)} px={px} label="Your hero" />
      {pet ? <PixelSprite pixels={pet} px={Math.max(1, px - 1)} label={`Pet: ${look.pet}`} /> : null}
    </View>
  );
}
