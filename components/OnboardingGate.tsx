import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useDb } from '@/db/DatabaseProvider';
import { isOnboardingComplete } from '@/db/settings-queries';
import { colors } from '@/lib/theme';

/**
 * After DB import, redirect to /onboarding when profile incomplete.
 * Skips while already on the onboarding route.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { ready } = useDb();
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [complete, setComplete] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const done = await isOnboardingComplete();
      if (cancelled) return;
      setComplete(done);
      setChecked(true);
      const onOnboarding = pathname?.includes('onboarding');
      if (!done && !onOnboarding) {
        router.replace('/onboarding');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, pathname, router]);

  if (!ready || !checked) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Allow onboarding screen even when incomplete
  if (!complete && !pathname?.includes('onboarding')) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
