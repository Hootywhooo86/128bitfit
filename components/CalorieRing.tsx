import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts } from '@/lib/theme';

/**
 * The calorie ring from prototype/app-shell.html `.rwrap` — a stroked arc with
 * the number left in the middle.
 *
 * `consumed: null` means nothing has been logged today, which is not the same
 * as eating zero. The ring then shows the target with an empty track and the
 * caption says so, rather than drawing a filled 0%.
 */
export function CalorieRing({
  consumed,
  target,
  size = 112,
}: {
  consumed: number | null;
  target: number;
  size?: number;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = consumed == null || target <= 0 ? 0 : Math.min(1.2, consumed / target);
  const over = pct > 1;
  const left = consumed == null ? target : Math.round(target - consumed);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? colors.danger : colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - Math.min(1, pct))}
          fill="none"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.mid]}>
        <Text style={[s.b, over && { color: colors.danger }]}>
          {consumed == null ? target : Math.abs(left)}
        </Text>
        <Text style={s.small}>{consumed == null ? 'TARGET' : over ? 'OVER' : 'LEFT'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  mid: { alignItems: 'center', justifyContent: 'center' },
  b: { fontSize: 25, fontFamily: fonts.bodyBold, color: colors.text, letterSpacing: -1 },
  small: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: colors.textDim,
    letterSpacing: 1,
    marginTop: 5,
  },
});
