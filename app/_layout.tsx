import { Stack } from 'expo-router';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { colors } from '@/lib/theme';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navTheme}>
      <DatabaseProvider>
        <StatusBar style="light" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="exercise/index"
            options={{ title: 'Exercise Library', headerStyle: { backgroundColor: colors.surface } }}
          />
          <Stack.Screen
            name="exercise/[id]"
            options={{ title: 'Exercise', headerStyle: { backgroundColor: colors.surface } }}
          />
        </Stack>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
