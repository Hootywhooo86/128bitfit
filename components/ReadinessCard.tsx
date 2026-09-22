import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, CardHead } from '@/components/ui';
import { useReadiness } from '@/lib/health/use-readiness';
import { GRADE_EMOJI, GRADE_LABEL } from '@/lib/readiness';
import { colors, fonts, spacing } from '@/lib/theme';

/**
 * Readiness and rest, side by side, each as a face.
 *
 * Both are estimates from Health Connect readings and the card says so. With
 * no sleep data there is no score — it asks for the permission instead of
 * showing a number it did not earn.
 */
export function ReadinessCard({ recentSets }: { recentSets: number | null }) {
  const { state } = useReadiness(recentSets);
  const router = useRouter();

  if (state.status === 'checking' || state.status === 'unavailable') return null;

  if (state.status === 'denied') {
    return (
      <Card onPress={() => router.push('/settings/privacy')}>
        <CardHead title="READINESS" note="Not connected" />
        <Text style={s.muted}>
          Needs {state.missing.join(' and ')} from Health Connect. Nothing is scored without it.
        </Text>
      </Card>
    );
  }

  const { readiness: r, rest } = state;

  return (
    <Card>
      <CardHead title="READINESS" note="Estimate" />
      <View style={s.row}>
        <View style={s.half}>
          {r.status === 'scored' ? (
            <>
              <Text style={s.face}>{GRADE_EMOJI[r.grade]}</Text>
              <Text style={s.grade}>{GRADE_LABEL[r.grade]}</Text>
              <Text style={s.score}>{r.score}/100</Text>
            </>
          ) : (
            <>
              <Text style={s.face}>–</Text>
              <Text style={s.grade}>No score</Text>
              <Text style={s.score}>needs {r.missing.join(', ')}</Text>
            </>
          )}
        </View>

        <View style={s.half}>
          {rest.status === 'scored' ? (
            <>
              <Text style={s.face}>{GRADE_EMOJI[rest.grade]}</Text>
              <Text style={s.grade}>Rest</Text>
              <Text style={s.score}>{rest.note}</Text>
            </>
          ) : (
            <>
              <Text style={s.face}>–</Text>
              <Text style={s.grade}>Rest</Text>
              <Text style={s.score}>no sleep recorded</Text>
            </>
          )}
        </View>
      </View>

      {r.status === 'scored' && r.reasons.length > 0 ? (
        <Text style={s.why}>{r.reasons.join(' · ')}</Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1, alignItems: 'center' },
  face: { fontSize: 30, lineHeight: 38 },
  grade: { color: colors.text, fontSize: 14, fontFamily: fonts.bodySemi, marginTop: 4 },
  score: {
    color: colors.textDim,
    fontSize: 11.5,
    marginTop: 3,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  muted: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.body },
  why: {
    color: colors.textDim,
    fontSize: 11.5,
    marginTop: spacing.md,
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
});
