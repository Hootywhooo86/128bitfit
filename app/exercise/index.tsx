import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ExerciseBrowser } from '@/components/ExerciseBrowser';
import { colors, spacing, themedStyles } from '@/lib/theme';

export default function ExerciseLibraryScreen() {
  // Re-read on coming back, so an exercise just made or edited is in the list.
  const [visits, setVisits] = useState(0);
  useFocusEffect(useCallback(() => setVisits((n) => n + 1), []));

  return (
    <View style={styles.container}>
      <ExerciseBrowser
        mode="browse"
        reloadKey={visits}
        header={
          <Link href="/exercise/new" asChild>
            <Pressable style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ Add exercise — photograph the machine</Text>
            </Pressable>
          </Link>
        }
      />
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  addBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  addBtnText: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
}));
