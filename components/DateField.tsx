import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatBirthday, fromIsoDate, maxBirthday, minBirthday, toIsoDate } from '@/lib/birthday';
import { colors, spacing } from '@/lib/theme';

/**
 * A date button that opens the OS calendar.
 *
 * Typing `YYYY-MM-DD` into a text box is a small cruelty on a phone, and it
 * accepts dates that do not exist. The native picker cannot produce one, and
 * it is the control people already know.
 *
 * The value is kept as a local-calendar ISO string. See lib/birthday.ts for why
 * that is not `toISOString()`.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  min?: Date;
  max?: Date;
}) {
  const [open, setOpen] = useState(false);
  const current = fromIsoDate(value);
  const upper = max ?? maxBirthday();
  const lower = min ?? minBirthday();

  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    // Android fires once and closes itself; dismissing must not clear a value
    // the user already had.
    if (Platform.OS !== 'ios') setOpen(false);
    if (event.type === 'dismissed' || !picked) return;
    onChange(toIsoDate(picked));
  };

  return (
    <View>
      <View style={styles.row}>
        <Pressable style={styles.field} onPress={() => setOpen(true)}>
          <Text style={[styles.text, !current && styles.placeholder]}>
            {formatBirthday(value)}
          </Text>
        </Pressable>
        {current ? (
          <Pressable style={styles.clear} onPress={() => onChange(null)}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <DateTimePicker
          value={current ?? upper}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={lower}
          maximumDate={upper}
          onChange={onPicked}
        />
      ) : null}

      {open && Platform.OS === 'ios' ? (
        <Pressable style={styles.done} onPress={() => setOpen(false)}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  field: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  text: { color: colors.text, fontSize: 16 },
  placeholder: { color: colors.textMuted },
  clear: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  clearText: { color: colors.textMuted, fontWeight: '700' },
  done: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: { color: colors.chipActiveText, fontWeight: '900' },
});
