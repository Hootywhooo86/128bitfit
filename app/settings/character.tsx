import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AvatarCreator } from '@/components/AvatarCreator';
import { useDb } from '@/db/DatabaseProvider';
import {
  getAppSettings,
  updateAppSettings,
} from '@/db/settings-queries';
import { DEFAULT_AVATAR, type AvatarConfig } from '@/lib/avatar';
import { colors, spacing } from '@/lib/theme';

export default function CharacterSettingsScreen() {
  const router = useRouter();
  const { ready } = useDb();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [avatar, setAvatar] = useState<AvatarConfig>({ ...DEFAULT_AVATAR });

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const s = await getAppSettings();
      setAvatar(s.avatar);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateAppSettings({ avatar });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.muted}>
        Customize your pixel person. Changes save to local settings JSON.
      </Text>
      <AvatarCreator value={avatar} onChange={setAvatar} pose="idle" />
      <Pressable style={[styles.save, saving && { opacity: 0.6 }]} onPress={() => void onSave()}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}</Text>
      </Pressable>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>Back to Settings</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  save: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: { color: colors.chipActiveText, fontWeight: '900', fontSize: 16 },
  back: { marginTop: spacing.sm, paddingVertical: 12, alignItems: 'center' },
  backText: { color: colors.accent, fontWeight: '700' },
});
