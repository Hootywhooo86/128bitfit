import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { TopBar } from '@/components/TopBar';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * The shell's building blocks, ported from prototype/app-shell.html.
 *
 * CLAUDE.md makes that prototype the visual spec, so each of these maps to one
 * of its CSS classes and the mapping is named in the comment. Screens are
 * assembled from these rather than restyled individually, which is what stopped
 * the app looking like the prototype the first time.
 */

/**
 * The page frame: the pixel top bar, then `main` — 14px gutters and enough
 * bottom padding to clear the tab bar, as in the prototype.
 */
export function Screen({
  section,
  children,
  back,
  right,
  scroll = true,
}: {
  section: string;
  children: React.ReactNode;
  back?: boolean;
  right?: 'gear' | 'none';
  scroll?: boolean;
}) {
  const router = useRouter();
  const bar = (
    <TopBar
      section={section}
      right={right}
      onBack={back ? () => (router.canGoBack() ? router.back() : router.replace('/')) : undefined}
    />
  );
  if (!scroll) {
    return (
      <View style={s.screen}>
        {bar}
        <View style={s.main}>{children}</View>
      </View>
    );
  }
  return (
    <View style={s.screen}>
      {bar}
      <ScrollView style={s.screen} contentContainerStyle={s.main} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

/** `.lbl` — the pixel section label above a block. */
export function Label({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.lblWrap, style]}>
      <Text style={s.lbl}>{children}</Text>
    </View>
  );
}

/** `.card` */
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [s.card, pressed && s.pressed, style]} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

/** `.ch` — a card's header: pixel title left, muted note right. */
export function CardHead({ title, note }: { title: string; note?: string }) {
  return (
    <View style={s.ch}>
      <Text style={s.chT}>{title}</Text>
      {note ? <Text style={s.chS}>{note}</Text> : null}
    </View>
  );
}

/** `.mrow` — the tappable list row the whole app is built from. */
export function MenuRow({
  icon,
  name,
  sub,
  value,
  onPress,
  href,
}: {
  icon?: string;
  name: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  href?: string;
}) {
  const router = useRouter();
  const press = onPress ?? (href ? () => router.push(href as never) : undefined);
  return (
    <Pressable style={({ pressed }) => [s.mrow, pressed && s.pressed]} onPress={press}>
      {icon ? <Text style={s.mrowIc}>{icon}</Text> : null}
      <View style={s.mrowTx}>
        <Text style={s.mrowN}>{name}</Text>
        {sub ? <Text style={s.mrowS}>{sub}</Text> : null}
      </View>
      {value ? <Text style={s.mrowV}>{value}</Text> : null}
      <Text style={s.mrowA}>›</Text>
    </Pressable>
  );
}

/** `.st3` — three stat tiles across. A null value shows a dash, never a zero. */
export function Stat3({
  items,
}: {
  items: { value: string | null; label: string }[];
}) {
  return (
    <View style={s.st3}>
      {items.map((it) => (
        <View key={it.label} style={s.st3Cell}>
          <Text style={s.st3B}>{it.value ?? '–'}</Text>
          <Text style={s.st3S}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** `.sess` — the accented "start a workout" card. */
export function SessionCard({
  title,
  sub,
  action,
  onPress,
}: {
  title: string;
  sub: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={s.sess}>
      <Text style={s.sessN}>{title}</Text>
      <Text style={s.sessS}>{sub}</Text>
      <Pressable style={({ pressed }) => [s.sessBtn, pressed && { opacity: 0.85 }]} onPress={onPress}>
        <Text style={s.sessBtnT}>{action}</Text>
      </Pressable>
    </View>
  );
}

/** `.mac` — one macro row: label, value over target, and a bar. */
export function MacroBar({
  label,
  value,
  target,
  tone = 'p',
}: {
  label: string;
  value: number | null;
  target: number;
  tone?: 'p' | 'c' | 'f';
}) {
  const pct = value == null || target <= 0 ? 0 : Math.min(100, (value / target) * 100);
  const fill = tone === 'p' ? colors.accent : tone === 'c' ? '#9a9a9a' : '#5e5e5e';
  return (
    <View style={s.mac}>
      <View style={s.macL}>
        <Text style={s.macLabel}>{label}</Text>
        <Text style={s.macVal}>
          {value == null ? '–' : Math.round(value)} / {Math.round(target)}g
        </Text>
      </View>
      <View style={s.macT}>
        <View style={[s.macFill, { width: `${pct}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

/** `.jbar` — a plain progress bar. */
export function Bar({ pct, height = 11 }: { pct: number; height?: number }) {
  return (
    <View style={[s.bar, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          s.barFill,
          { width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

/** `.qa` — the row of square quick-action buttons on Fuel. */
export function QuickActions({
  items,
}: {
  items: { icon: string; label: string; onPress: () => void }[];
}) {
  return (
    <View style={s.qa}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          style={({ pressed }) => [s.qaBtn, pressed && s.qaBtnOn]}
          onPress={it.onPress}
        >
          <Text style={s.qaIc}>{it.icon}</Text>
          <Text style={s.qaTx}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** `.note` — a muted paragraph with a rule down its left edge. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.note}>
      <Text style={s.noteT}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  main: { padding: spacing.md, paddingBottom: 104 },
  lblWrap: { marginTop: spacing.lg, marginBottom: 10 },
  lbl: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: colors.textDim,
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 10,
  },
  pressed: { borderColor: colors.borderBright },
  ch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 13,
  },
  chT: { fontFamily: fonts.pixel, fontSize: 9, letterSpacing: 1, color: colors.text },
  chS: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.body },

  mrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  mrowIc: { width: 26, textAlign: 'center', fontSize: 15, color: colors.textMuted },
  mrowTx: { flex: 1, minWidth: 0 },
  mrowN: { fontSize: 15, fontFamily: fonts.bodySemi, color: colors.text, lineHeight: 20 },
  mrowS: { fontSize: 12.5, color: colors.textDim, marginTop: 5, lineHeight: 18, fontFamily: fonts.body },
  mrowV: { fontSize: 12.5, color: colors.textMuted, fontFamily: fonts.body },
  mrowA: { color: colors.textDim, fontSize: 16 },

  st3: { flexDirection: 'row', gap: spacing.sm },
  st3Cell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingVertical: 13,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  st3B: { fontSize: 21, fontFamily: fonts.bodyBold, color: colors.text, letterSpacing: -0.6 },
  st3S: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: colors.textDim,
    letterSpacing: 1,
    marginTop: 5,
  },

  sess: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: 15,
    marginBottom: 10,
  },
  sessN: { fontFamily: fonts.pixel, fontSize: 11, letterSpacing: 1, color: colors.text },
  sessS: { fontSize: 12.5, color: colors.textMuted, marginTop: 7, fontFamily: fonts.body },
  sessBtn: {
    marginTop: 13,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sessBtnT: { fontFamily: fonts.pixel, fontSize: 10, color: colors.onAccent, letterSpacing: 1 },

  mac: { marginBottom: 11 },
  macL: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  macLabel: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.body },
  macVal: { fontSize: 12, color: colors.text, fontFamily: fonts.bodySemi },
  macT: { height: 6, backgroundColor: colors.track, borderRadius: 3, overflow: 'hidden' },
  macFill: { height: '100%', borderRadius: 3 },

  bar: { backgroundColor: colors.track, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.accent },

  qa: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  qaBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingVertical: 13,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 6,
  },
  qaBtnOn: { borderColor: colors.accent },
  qaIc: { fontSize: 16, color: colors.textMuted, lineHeight: 18 },
  qaTx: { fontFamily: fonts.pixel, fontSize: 7, color: colors.textMuted, letterSpacing: 0.5 },

  note: { borderLeftWidth: 2, borderLeftColor: colors.borderBright, paddingLeft: 11 },
  noteT: { fontSize: 12.5, color: colors.textMuted, lineHeight: 21, fontFamily: fonts.body },
});
