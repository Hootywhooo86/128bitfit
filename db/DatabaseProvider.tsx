import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import migrations from '../drizzle/migrations';
import { colors, spacing, themedStyles } from '../lib/theme';
import { loadAccent } from './accent-settings';
import { db } from './client';
import { ensureIndexes, getCounts, importBundledData, type ImportProgress } from './import';

type DbContextValue = {
  ready: boolean;
  exerciseCount: number;
  foodCount: number;
  refreshCounts: () => Promise<void>;
};

const DbContext = createContext<DbContextValue | null>(null);

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within DatabaseProvider');
  return ctx;
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations);
  const [importState, setImportState] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [foodCount, setFoodCount] = useState(0);

  const refreshCounts = async () => {
    const c = await getCounts();
    setExerciseCount(c.exercises);
    setFoodCount(c.foods);
  };

  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    (async () => {
      try {
        ensureIndexes();
        const result = await importBundledData((p) => {
          if (!cancelled) setImportState(p);
        });
        if (cancelled) return;
        // Before the first screen draws, so it never flashes the default.
        // A failed read keeps the default rather than blocking the app.
        await loadAccent().catch(() => undefined);
        if (cancelled) return;
        setExerciseCount(result.exerciseCount);
        setFoodCount(result.foodCount);
        setImportDone(true);
      } catch (e) {
        if (!cancelled) {
          setImportError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [success]);

  const value = useMemo(
    () => ({
      ready: importDone,
      exerciseCount,
      foodCount,
      refreshCounts,
    }),
    [importDone, exerciseCount, foodCount]
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Migration error</Text>
        <Text style={styles.muted}>{error.message}</Text>
      </View>
    );
  }

  if (!success || !importDone) {
    const progress = importState;
    const exTotal = progress?.exercisesTotal ?? 0;
    const foodTotal = progress?.foodsTotal ?? 0;
    const exDone = progress?.exercisesDone ?? 0;
    const foodDone = progress?.foodsDone ?? 0;
    const total = exTotal + foodTotal;
    const done = exDone + foodDone;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    if (importError) {
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Import failed</Text>
          <Text style={styles.muted}>{importError}</Text>
        </View>
      );
    }

    return (
      <View style={styles.center}>
        <Text style={styles.brand}>128BIT FIT</Text>
        <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: spacing.md }} />
        <Text style={styles.title}>
          {!success ? 'Preparing database…' : progress?.message ?? 'Loading offline data…'}
        </Text>
        {total > 0 && progress?.phase !== 'skipped' ? (
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        ) : null}
        {total > 0 && progress?.phase !== 'skipped' ? (
          <Text style={styles.muted}>
            {exDone}/{exTotal} exercises · {foodDone}/{foodTotal} foods ({pct}%)
          </Text>
        ) : null}
      </View>
    );
  }

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

const styles = themedStyles(() => StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  brand: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  barTrack: {
    width: '80%',
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
}));
