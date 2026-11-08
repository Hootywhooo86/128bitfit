import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFrames, useReduceMotion } from '@/lib/motion';
import { colors, fonts } from '@/lib/theme';

const BLOCKS = 12;
const BLINKS = 6;

/**
 * The level-up moment: an XP bar fills block by block, then LEVEL UP! blinks
 * like an arcade cabinet and stays. With Reduce motion on, it starts full.
 */
export function LevelUpTitle({ color }: { color: string }) {
  const still = useReduceMotion();
  const frame = useFrames(BLOCKS + BLINKS + 1, 55, !still, false);
  const filled = still ? BLOCKS : Math.min(BLOCKS, frame + 1);
  const blinking = !still && frame >= BLOCKS && frame < BLOCKS + BLINKS;
  const titleOn = still || (frame >= BLOCKS && (!blinking || (frame - BLOCKS) % 2 === 1));
  return (
    <View style={s.wrap}>
      <Text style={[s.title, { color, opacity: titleOn ? 1 : 0 }]}>LEVEL UP!</Text>
      <View style={s.bar}>
        {Array.from({ length: BLOCKS }, (_, i) => (
          <View key={i} style={[s.block, { backgroundColor: i < filled ? color : colors.track }]} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.pixelBold, fontSize: 28, letterSpacing: 2 },
  bar: { flexDirection: 'row', gap: 2, padding: 2, borderWidth: 2, borderColor: colors.borderBright },
  block: { width: 12, height: 10 },
});
