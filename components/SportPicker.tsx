import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SPORT_GROUPS, searchSports, type Sport, type SportId } from '@/lib/cardio';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/**
 * Choose the sport: searchable, grouped On foot / Cycling / Indoor.
 *
 * The badge is two letters in the pixel font rather than a picture: the UI is
 * monochrome, and a run/walk/ride glyph set in colour would be colour that
 * does not mean data.
 */
export function SportPicker({
  visible,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  selected: SportId;
  onPick: (sport: Sport) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  // Each opening starts with an empty search.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setQuery('');
  }
  const found = searchSports(query);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={s.sheet}>
        <View style={s.grab} />
        <View style={s.head}>
          <Text style={s.title}>CHOOSE A SPORT</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>
        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          {SPORT_GROUPS.map((g) => {
            const list = found.filter((sp) => sp.group === g.id);
            if (list.length === 0) return null;
            return (
              <View key={g.id}>
                <Text style={s.group}>{g.label}</Text>
                {list.map((sp) => {
                  const on = sp.id === selected;
                  return (
                    <Pressable
                      key={sp.id}
                      style={({ pressed }) => [s.row, pressed && s.pressed]}
                      onPress={() => onPick(sp)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <View style={[s.badge, on && s.badgeOn]}>
                        <Text style={[s.badgeT, on && s.badgeTOn]}>{sp.badge}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.name, on && s.nameOn]}>{sp.label}</Text>
                        {!sp.gps ? <Text style={s.sub}>No map — enter time and distance</Text> : null}
                      </View>
                      {on ? <Text style={s.tick}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
          {found.length === 0 ? <Text style={s.none}>No sport called “{query.trim()}”.</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
      maxHeight: '85%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
    },
    grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderBright, marginTop: 8 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
    title: { fontFamily: fonts.pixel, fontSize: 11, color: colors.text, letterSpacing: 1 },
    close: { color: colors.textMuted, fontSize: 20 },
    search: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 22,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      minHeight: 44,
      color: colors.text,
      fontSize: 15,
      fontFamily: fonts.body,
      marginBottom: 6,
    },
    group: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16, marginTop: 18, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    pressed: { opacity: 0.6 },
    badge: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeOn: { borderColor: colors.accent, backgroundColor: colors.accent },
    badgeT: { fontFamily: fonts.pixel, fontSize: 9, color: colors.text },
    badgeTOn: { color: colors.onAccent },
    name: { color: colors.text, fontSize: 16, fontFamily: fonts.body },
    nameOn: { color: colors.accent, fontFamily: fonts.bodySemi },
    sub: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: fonts.body },
    tick: { color: colors.accent, fontSize: 20, fontWeight: '800' },
    none: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  })
);
