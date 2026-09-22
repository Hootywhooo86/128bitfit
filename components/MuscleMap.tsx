import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BACK_MASKS, FIGURE, FRONT_MASKS } from '@/lib/figure-assets';
import { MUSCLE_LABELS, type MuscleGroup, type MuscleRoles } from '@/lib/muscle-load';
import { colors, muscleRole, spacing } from '@/lib/theme';

/**
 * The muscle map.
 *
 * A front and a back view of the same figure, with a muscle tinted only once it
 * has actually been trained: red where it was the target, yellow where it only
 * assisted. Everything else is left as the plain figure, which is honest —
 * nothing logged, nothing coloured — and it visibly wants filling in.
 *
 * Each muscle is a separate alpha mask stacked over the base artwork and tinted
 * with `tintColor`. Only the trained ones are rendered, so a typical session
 * costs a handful of images rather than one per muscle.
 */

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

  return (
    <View style={{ width, height }}>
      <Image source={spec.base} style={{ width, height }} resizeMode="contain" />
      {(Object.keys(masks) as MuscleGroup[]).map((m) => {
        const role = roles[m];
        if (role === 'none') return null;
        return (
          <Image
            key={m}
            source={masks[m]}
            style={[StyleSheet.absoluteFill, { width, height, opacity: 0.72 }]}
            resizeMode="contain"
            tintColor={muscleRole[role]}
          />
        );
      })}
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
    <View style={styles.wrap}>
      <View style={styles.figures}>
        <View style={styles.figureCol}>
          <Figure view="front" roles={roles} width={width} />
          <Text style={styles.caption}>Front</Text>
        </View>
        <View style={styles.figureCol}>
          <Figure view="back" roles={roles} width={width} />
          <Text style={styles.caption}>Back</Text>
        </View>
      </View>

      {showLegend ? (
        worked.length === 0 ? (
          <Text style={styles.empty}>
            Nothing trained yet. Log a session and the muscles you worked colour in.
          </Text>
        ) : (
          <>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: muscleRole.primary }]} />
                <Text style={styles.legendText}>Targeted</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: muscleRole.secondary }]} />
                <Text style={styles.legendText}>Assisted</Text>
              </View>
            </View>
            <Text style={styles.worked}>
              {worked.map((m) => MUSCLE_LABELS[m]).join(' · ')}
            </Text>
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  figures: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  figureCol: { alignItems: 'center', gap: 4 },
  caption: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: colors.textMuted, fontSize: 12 },
  worked: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
