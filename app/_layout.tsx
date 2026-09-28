import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Silkscreen_400Regular, Silkscreen_700Bold } from '@expo-google-fonts/silkscreen';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { OnboardingGate } from '@/components/OnboardingGate';
// Registers the background GPS task; it has to exist before any fix arrives.
import '@/lib/cardio-tracker';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { useAccent } from '@/lib/accent';
import { RestTimerProvider } from '@/lib/rest-timer';
import { colors, fonts } from '@/lib/theme';


export default function RootLayout() {
  // Silkscreen is the pixel face for labels and headers; Inter is body text.
  // Holding the first frame until they load avoids a flash of the system font
  // reflowing every label in the app.
  const accent = useAccent();
  const navTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        primary: accent,
      },
    }),
    [accent]
  );
  const [fontsReady] = useFonts({
    Silkscreen_400Regular,
    Silkscreen_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ThemeProvider value={navTheme}>
      <DatabaseProvider>
        <RestTimerProvider>
          <OnboardingGate>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              // The pixel TopBar is part of each screen, so the stack header is
              // off by default. Screens not yet ported to it re-enable a styled
              // one below rather than being left with no way back.
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: fonts.pixel, fontSize: 11 },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding/index"
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="exercise/index"
              options={{ headerShown: true, title: 'Exercise Library', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="exercise/[id]"
              options={{ headerShown: true, title: 'Exercise', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="train/active"
              options={{ headerShown: true, title: 'Workout', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="train/add-exercise"
              options={{ headerShown: true, title: 'Add exercise', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="train/summary"
              options={{ headerShown: true, title: 'Summary', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="fuel/add"
              options={{ title: 'Add food', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="fuel/scan"
              options={{ headerShown: true, title: 'Scan barcode', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="fuel/custom"
              options={{ title: 'Custom food', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="fuel/edit/[id]"
              options={{ headerShown: true, title: 'Edit food', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="coach/[mode]"
              options={{ headerShown: true, title: 'Coach', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="settings/index"
              options={{ title: 'Settings', headerStyle: { backgroundColor: colors.bg } }}
            />
            <Stack.Screen
              name="home/weight"
              options={{ title: 'Weight', headerStyle: { backgroundColor: colors.bg } }}
            />
          </Stack>
          </OnboardingGate>
        </RestTimerProvider>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
