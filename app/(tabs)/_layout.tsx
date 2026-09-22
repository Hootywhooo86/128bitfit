import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, fonts } from '@/lib/theme';

/**
 * Bottom tabs from prototype/app-shell.html `.tabs`: four pixel-type words, no
 * icons, the active one in white. Each screen draws its own TopBar, so the
 * stock header is off everywhere.
 */
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={[s.tab, focused && s.tabOn]}>{label}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: '#080808',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 74,
          paddingTop: 10,
          elevation: 0,
        },
        tabBarShowLabel: false,
      }}
    >
      {(
        [
          ['index', 'HOME'],
          ['train', 'TRAIN'],
          ['fuel', 'FUEL'],
          ['coach', 'COACH'],
        ] as const
      ).map(([name, label]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarIcon: ({ focused }) => <TabLabel label={label} focused={focused} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const s = StyleSheet.create({
  tab: {
    fontFamily: fonts.pixel,
    fontSize: 11.5,
    letterSpacing: 1,
    color: colors.textDim,
    textAlign: 'center',
    width: 90,
  },
  tabOn: { color: colors.accent },
});
