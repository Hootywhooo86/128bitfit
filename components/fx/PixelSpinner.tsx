import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useAccent } from '@/lib/accent';
import { DUMBBELL_FRAMES } from '@/lib/fx-sprites';
import { useFrames, useReduceMotion } from '@/lib/motion';
import { PixelGrid } from './PixelGrid';

/**
 * The app's loading indicator: a pixel dumbbell turning in four frames. A
 * drop-in for ActivityIndicator. With Reduce motion on it holds still, which
 * still says "loading" next to the screen it sits on.
 */
export function PixelSpinner({
  color,
  size = 'small',
  style,
}: {
  color?: string;
  size?: 'small' | 'large';
  style?: ViewStyle;
}) {
  const accent = useAccent();
  const still = useReduceMotion();
  const frame = useFrames(DUMBBELL_FRAMES.length, 110, !still);
  const ink = color ?? accent;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <PixelGrid
        rows={DUMBBELL_FRAMES[still ? 0 : frame]}
        palette={{ '#': ink, '+': ink, '*': '#8c8c8c' }}
        px={size === 'large' ? 3 : 2}
      />
    </View>
  );
}
