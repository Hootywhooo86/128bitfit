import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getExerciseById } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import { exerciseImageUrl, parseJsonArray } from '@/lib/exercise-images';
import { isUserExercise } from '@/lib/exercise-sources';
import { colors, spacing } from '@/lib/theme';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const row = await getExerciseById(decodeURIComponent(id));
      setExercise(row);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!exercise) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Exercise not found.</Text>
      </View>
    );
  }

  const primary = parseJsonArray(exercise.primaryMuscles);
  const secondary = parseJsonArray(exercise.secondaryMuscles);
  const instructions = parseJsonArray(exercise.instructions);
  const images = parseJsonArray(exercise.images);
  const imageUrl = exerciseImageUrl(images[0]);

  return (
    <>
      <Stack.Screen
        options={{
          title: exercise.name,
          // Only what you own. A bundled exercise would have the edit undone
          // by the next catalogue refresh, so the button is not offered.
          headerRight: () =>
            isUserExercise(exercise.category) ? (
              <Pressable
                onPress={() =>
                  router.push(`/exercise/new?id=${encodeURIComponent(exercise.id)}`)
                }
                hitSlop={8}
              >
                <Text style={{ color: colors.accent, fontWeight: '800' }}>Edit</Text>
              </Pressable>
            ) : null,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.muted}>No image</Text>
          </View>
        )}

        <Text style={styles.name}>{exercise.name}</Text>
        <Text style={styles.meta}>
          {[exercise.equipment, exercise.level, exercise.mechanic, exercise.force, exercise.category]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        <Section title="Primary muscles" body={primary.join(', ') || '—'} />
        <Section title="Secondary muscles" body={secondary.join(', ') || '—'} />

        <Text style={styles.sectionTitle}>Instructions</Text>
        {instructions.length === 0 ? (
          <Text style={styles.muted}>No instructions.</Text>
        ) : (
          instructions.map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  meta: { color: colors.textMuted, marginBottom: spacing.lg },
  sectionTitle: { color: colors.accent, fontWeight: '700', marginBottom: 6, fontSize: 14 },
  body: { color: colors.text, lineHeight: 20 },
  step: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stepNum: {
    color: colors.bg,
    backgroundColor: colors.accent,
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    fontWeight: '800',
    overflow: 'hidden',
    lineHeight: 22,
    fontSize: 12,
  },
  stepText: { color: colors.text, flex: 1, lineHeight: 20 },
  muted: { color: colors.textMuted },
});
