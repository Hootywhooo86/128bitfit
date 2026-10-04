import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, CardHead } from '@/components/ui';
import type { EnergyResult } from '@/lib/workout-energy';
import { colors, fonts, themedStyles } from '@/lib/theme';
import { HEALTH_APP } from '@/lib/health/platform';

/** Active calories, and whether they were measured or worked out — never shown the same way. */
export function EnergyCard({ energy }: { energy: EnergyResult | null }) {
  if (!energy) return null;
  if (energy.status === 'unknown') {
    return (
      <Card>
        <CardHead title="CALORIES" />
        <Text style={s.energyNote}>
          No figure yet — needs {energy.missing.join(' and ')}.
          {energy.missing.includes('your body weight') ? ' Log a weigh-in and this fills in.' : ''}
        </Text>
      </Card>
    );
  }
  const measured = energy.status === 'measured';
  return (
    <Card>
      <CardHead title="ACTIVE CALORIES" note={measured ? 'measured' : 'estimate'} />
      <Text style={s.energyValue}>
        {measured ? '' : '~'}
        {energy.kcal.toLocaleString()} kcal
      </Text>
      <Text style={s.energyNote}>
        {measured
          ? `Measured by ${energy.source === 'Health Connect' ? HEALTH_APP : energy.source} for this session — what you burned on top of what your body uses at rest.`
          : `${energy.basis}. ${energy.caveat}`}
      </Text>
    </Card>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    energyValue: { color: colors.text, fontSize: 26, fontFamily: fonts.bodyBold },
    energyNote: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 6, fontFamily: fonts.body },
  })
);
