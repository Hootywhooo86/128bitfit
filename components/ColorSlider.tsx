import React, { useId, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '@/lib/theme';

/**
 * One drag bar for the custom colour picker: a gradient track and a knob.
 * `stops` paints the track so the bar shows what dragging will do.
 * Value 0–1. Tapping anywhere on the track jumps there.
 */
export function ColorSlider({
  value,
  stops,
  onChange,
  label,
}: {
  value: number;
  stops: string[];
  onChange: (v: number) => void;
  label: string;
}) {
  const [width, setWidth] = useState(0);
  // Unique per slider so two gradients never share an id; letters only, as SVG url(#…) wants.
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const move = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    onChange(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)));
  };

  return (
    <View
      style={s.wrap}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // Keep the drag when the finger strays onto the screen's scroll view.
      onResponderTerminationRequest={() => false}
      onResponderGrant={move}
      onResponderMove={move}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        onChange(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))))
      }
    >
      <View pointerEvents="none" style={s.track}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              {stops.map((c, i) => (
                <Stop key={i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={c} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" rx="7" fill={`url(#${id})`} />
        </Svg>
      </View>
      <View
        pointerEvents="none"
        style={[s.knob, { left: Math.min(Math.max(0, width - KNOB), Math.max(0, value * width - KNOB / 2)) }]}
      >
        <View style={s.knobInner} />
      </View>
    </View>
  );
}

const KNOB = 22;

const s = StyleSheet.create({
  wrap: { height: 32, justifyContent: 'center', marginVertical: 6 },
  track: { height: 14, borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  // A dark ring inside the white one, so the knob shows on a white track too.
  knobInner: { flex: 1, borderRadius: KNOB / 2, borderWidth: 2, borderColor: '#000000' },
});
