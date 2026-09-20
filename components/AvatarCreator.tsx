import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PixelAvatar } from '@/components/PixelAvatar';
import {
  ACCESSORIES,
  BODY_TYPES,
  BODY_TYPE_LABELS,
  BOTTOMS,
  EYE_COLORS,
  FACIAL_HAIR,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  TOPS,
  type AvatarConfig,
  type AvatarPose,
  type BodyType,
} from '@/lib/avatar';
import { colors, spacing } from '@/lib/theme';

type Props = {
  value: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
  pose?: AvatarPose;
  compact?: boolean;
};

function ChipRow<T extends string | number>({
  label,
  options,
  selected,
  onSelect,
  renderSwatch,
}: {
  label: string;
  options: { id: T; label: string; color?: string }[];
  selected: T;
  onSelect: (id: T) => void;
  renderSwatch?: (opt: { id: T; label: string; color?: string }) => React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((opt) => {
          const on = selected === opt.id;
          return (
            <Pressable
              key={String(opt.id)}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onSelect(opt.id)}
            >
              {renderSwatch ? renderSwatch(opt) : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ColorRow({
  label,
  palette,
  selected,
  onSelect,
}: {
  label: string;
  palette: readonly string[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.colorRow}>
        {palette.map((c, i) => {
          const on = selected === i;
          return (
            <Pressable
              key={`${c}-${i}`}
              onPress={() => onSelect(i)}
              style={[
                styles.swatch,
                { backgroundColor: c },
                on && styles.swatchOn,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export function AvatarCreator({ value, onChange, pose = 'idle', compact }: Props) {
  const patch = (p: Partial<AvatarConfig>) => onChange({ ...value, ...p });

  return (
    <View>
      <View style={styles.preview}>
        <PixelAvatar config={value} pose={pose} size={compact ? 96 : 120} />
      </View>

      <ChipRow
        label="Body type"
        options={BODY_TYPES.map((id) => ({ id, label: BODY_TYPE_LABELS[id] }))}
        selected={value.bodyType}
        onSelect={(id) => patch({ bodyType: id as BodyType })}
      />

      <ColorRow
        label="Skin"
        palette={SKIN_TONES}
        selected={value.skinTone}
        onSelect={(i) => patch({ skinTone: i })}
      />

      <ColorRow
        label="Eyes"
        palette={EYE_COLORS}
        selected={value.eyeColor}
        onSelect={(i) => patch({ eyeColor: i })}
      />

      <ChipRow
        label="Hair style"
        options={[...HAIR_STYLES]}
        selected={value.hairStyle}
        onSelect={(id) => patch({ hairStyle: id })}
      />

      <ColorRow
        label="Hair color"
        palette={HAIR_COLORS}
        selected={value.hairColor}
        onSelect={(i) => patch({ hairColor: i })}
      />

      <ChipRow
        label="Facial hair"
        options={[...FACIAL_HAIR]}
        selected={value.facialHair}
        onSelect={(id) => patch({ facialHair: id })}
      />

      <ChipRow
        label="Top"
        options={[...TOPS]}
        selected={value.top}
        onSelect={(id) => patch({ top: id })}
        renderSwatch={(opt) =>
          opt.color ? <View style={[styles.miniSwatch, { backgroundColor: opt.color }]} /> : null
        }
      />

      <ChipRow
        label="Bottoms"
        options={[...BOTTOMS]}
        selected={value.bottom}
        onSelect={(id) => patch({ bottom: id })}
        renderSwatch={(opt) =>
          opt.color ? <View style={[styles.miniSwatch, { backgroundColor: opt.color }]} /> : null
        }
      />

      <ChipRow
        label="Accessory"
        options={[...ACCESSORIES]}
        selected={value.accessory}
        onSelect={(id) => patch({ accessory: id })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    minHeight: 160,
  },
  section: { marginBottom: spacing.md },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipRow: { gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
  },
  swatchOn: { borderColor: colors.accent, borderWidth: 3 },
  miniSwatch: { width: 12, height: 12, borderRadius: 3 },
});
