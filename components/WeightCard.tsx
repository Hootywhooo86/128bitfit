/**
 * The latest weigh-in on Home.
 *
 * Shows whichever reading is newer — the one the user typed or the one their
 * scale wrote to Health Connect — and says which, because a figure from a scale
 * and a figure someone typed are different facts.
 *
 * Three distinct states, per the empty-state table in CLAUDE.md: not read yet
 * renders nothing (not the prompt, which would flash at a user who does have a
 * weight), nothing recorded anywhere renders the prompt, and a reading renders
 * the reading.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, MenuRow } from '@/components/ui';
import type { WeightEntry } from '@/db/schema';
import type { WeightUnit } from '@/db/settings-queries';
import { weightInKg } from '@/db/weight-queries';
import { useLatestWeight } from '@/lib/health/use-weight';
import { colors, fonts } from '@/lib/theme';
import { formatKg } from '@/lib/weight-source';
import { HEALTH_APP } from '@/lib/health/platform';

export function WeightCard({
  local,
  units,
  onPress,
}: {
  local: WeightEntry | null;
  units: WeightUnit;
  onPress: () => void;
}) {
  const reading = React.useMemo(
    () =>
      local && local.loggedAt
        ? { kg: weightInKg(local), at: new Date(local.loggedAt).getTime() }
        : null,
    [local]
  );
  const { state } = useLatestWeight(reading);

  // Still asking Health Connect. Saying "log your first weigh-in" now and
  // replacing it a moment later would be worse than a brief gap.
  if (state.status === 'checking') return <View style={styles.placeholder} />;

  if (state.status === 'none') {
    return (
      <MenuRow
        icon="◷"
        name="Log your first weigh-in"
        sub="The weight journey needs a starting point"
        onPress={onPress}
      />
    );
  }

  return (
    <Card onPress={onPress}>
      <View style={styles.top}>
        <Text style={styles.value}>{formatKg(state.kg, units)}</Text>
        <Text style={styles.label}>
          {state.source === 'health' ? `From ${HEALTH_APP}` : 'Latest weigh-in'}
        </Text>
      </View>
      <Text style={styles.note}>Two more weigh-ins and there is a trend worth showing.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Holds the card's height so the layout does not jump when the answer lands.
  placeholder: { height: 92 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  value: { fontSize: 30, fontFamily: fonts.bodyBold, color: colors.text, letterSpacing: -1.2 },
  label: { fontSize: 12.5, color: colors.textMuted, fontFamily: fonts.body },
  note: { fontSize: 12.5, color: colors.textDim, fontFamily: fonts.body, lineHeight: 18 },
});
