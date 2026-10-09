import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BACK_MASKS, FIGURE, FRONT_MASKS } from '@/lib/figure-assets';
import { MUSCLE_LABELS, type MuscleGroup, type MuscleRoles } from '@/lib/muscle-load';
import { colors, fonts, muscleRole, spacing } from '@/lib/theme';

/**
 * The muscle map.
 *
 * Front and back, drawn hollow: anatomical line art over a dark body, with a
 * muscle filled in only once it has actually been trained — red where it was
 * the exercise's target, yellow where it only assisted. An untrained map is
 * honest (nothing logged, nothing coloured) and it visibly wants filling in.
 *
 * Three layers, bottom to top: the body silhouette, the fills for whatever was
 * worked, then the line art. The lines have to sit on top or a filled muscle
 * would erase its own definition.
 */

/**
 * Flat fills with dark separating lines, not a wash over artwork.
 *
 * Translucent colour laid over light line art reads as a tint stuck on top of
 * a photo. Opaque fills under near-black lines read as one drawing, which is
 * how an anatomy chart is drawn: untrained muscle is a grey shape, trained
 * muscle is a coloured one, and the lines divide them.
 */
const BODY_TINT = '#3d3d3d';
const LINE_TINT = '#121212';

function Figure({
  view,
  roles,
  width,
}: {
  view: 'front' | 'back';
  roles: MuscleRoles;
  width: number;
}) {
  const spec = FIGURE[view];
  const masks = view === 'front' ? FRONT_MASKS : BACK_MASKS;
  const height = (width * spec.height) / spec.width;
  const layer = [StyleSheet.absoluteFill, { width, height }];

  return (
    <View style={{ width, height }}>
      <Image source={spec.body} style={{ width, height }} resizeMode="contain" tintColor={BODY_TINT} />
      {(Object.keys(masks) as MuscleGroup[]).map((m) => {
        const role = roles[m];
        if (role === 'none') return null;
        return (
          <Image
            key={m}
            source={masks[m]}
            style={[StyleSheet.absoluteFill, { width, height }]}
            resizeMode="contain"
            tintColor={muscleRole[role]}
          />
        );
      })}
      <Image source={spec.line} style={layer} resizeMode="contain" tintColor={LINE_TINT} />
    </View>
  );
}

export function MuscleMap({
  roles,
  width = 150,
  showLegend = true,
}: {
  roles: MuscleRoles;
  width?: number;
  showLegend?: boolean;
}) {
  const worked = (Object.keys(roles) as MuscleGroup[]).filter((m) => roles[m] !== 'none');

  return (
    <View style={s.wrap}>
      <View style={s.figures}>
        <View style={s.col}>
          <Figure view="front" roles={roles} width={width} />
          <Text style={s.caption}>FRONT</Text>
        </View>
        <View style={s.col}>
          <Figure view="back" roles={roles} width={width} />
          <Text style={s.caption}>BACK</Text>
        </View>
      </View>

      {showLegend ? (
        worked.length === 0 ? (
          <Text style={s.empty}>
            Nothing trained yet. Log a session and the muscles you worked colour in.
          </Text>
        ) : (
          <>
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.swatch, { backgroundColor: muscleRole.primary }]} />
                <Text style={s.legendText}>TARGETED</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.swatch, { backgroundColor: muscleRole.secondary }]} />
                <Text style={s.legendText}>ASSISTED</Text>
              </View>
            </View>
            <Text style={s.worked}>{worked.map((m) => MUSCLE_LABELS[m]).join(' · ')}</Text>
          </>
        )
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: spacing.sm },
  figures: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  col: { alignItems: 'center', gap: 6 },
  caption: {
    fontFamily: fonts.pixel,
    fontSize: 6,
    color: colors.textDim,
    letterSpacing: 1,
  },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontFamily: fonts.pixel, fontSize: 6, color: colors.textDim, letterSpacing: 0.7 },
  worked: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: fonts.body,
  },
  empty: {
    color: colors.textDim,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: fonts.body,
  },
});
