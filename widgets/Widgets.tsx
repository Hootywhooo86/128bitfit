/**
 * The four home-screen widgets. Android only — this file is loaded by
 * index.ts and widgets/task-handler.tsx on Android and nowhere else.
 *
 * Monochrome like the app: the accent marks what can be tapped and the ring's
 * fill; colour that means something (the heat scale, over-target red) keeps
 * its fixed values. Pixel font for labels only.
 */
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { muscleGridSvg, ringSvg, trainedCount, type TodayModel, type WorkoutModel } from '@/lib/widget-model';
import { colors } from '@/lib/theme';
import type { MuscleTally } from '@/lib/muscle-load';

const PIXEL = 'Silkscreen_400Regular';
const BODY = 'Inter_400Regular';
const BODY_SEMI = 'Inter_600SemiBold';

type Hex = `#${string}`;
const hex = (c: string) => c as Hex;

const shell = {
  height: 'match_parent' as const,
  width: 'match_parent' as const,
  backgroundColor: hex(colors.bg),
  borderRadius: 20,
  padding: 12,
};

const label = (text: string) => (
  <TextWidget text={text} style={{ fontFamily: PIXEL, fontSize: 10, letterSpacing: 0.1, color: hex(colors.textMuted) }} />
);

const deepLink = (path: string) => ({ clickAction: 'OPEN_URI', clickActionData: { uri: `bitfit://${path}` } });

// ---- TODAY ------------------------------------------------------------------

export function TodayWidget({ model, wide }: { model: TodayModel; wide: boolean }) {
  return (
    <FlexWidget
      {...deepLink('fuel/add')}
      accessibilityLabel={`Today: ${model.calorieLine}. ${model.proteinLine}. ${model.burnedLine}. Tap to log food.`}
      style={{ ...shell, flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', flexGap: 10 }}
    >
      <FlexWidget style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
        <SvgWidget svg={ringSvg(model.fill, colors.accent, colors.track, 84)} style={{ width: 84, height: 84 }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', alignItems: wide ? 'flex-start' : 'center', flexGap: 3 }}>
        {label('TODAY')}
        <TextWidget
          text={model.calorieLine}
          maxLines={1}
          style={{ fontFamily: BODY_SEMI, fontSize: 13, color: hex(model.over ? colors.danger : colors.text) }}
        />
        <TextWidget text={model.proteinLine} maxLines={1} style={{ fontFamily: BODY, fontSize: 12, color: hex(colors.textMuted) }} />
        <TextWidget text={model.burnedLine} maxLines={1} style={{ fontFamily: BODY, fontSize: 12, color: hex(colors.textMuted) }} />
      </FlexWidget>
    </FlexWidget>
  );
}

// ---- QUICK LOG --------------------------------------------------------------

const QUICK: { text: string; path: string; a11y: string }[] = [
  { text: 'FOOD', path: 'fuel/add', a11y: 'Log food' },
  { text: 'SCAN', path: 'fuel/scan', a11y: 'Scan a barcode' },
  { text: 'TRAIN', path: 'train/start', a11y: 'Start a workout' },
  { text: 'WEIGH', path: 'home/weight', a11y: 'Log a weigh-in' },
  { text: 'PASS', path: 'train/gympass', a11y: 'Show gym pass' },
];

export function QuickLogWidget() {
  return (
    <FlexWidget style={{ ...shell, padding: 8, flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
      {QUICK.map((q) => (
        <FlexWidget
          key={q.path}
          {...deepLink(q.path)}
          accessibilityLabel={q.a11y}
          style={{
            flex: 1,
            height: 'match_parent',
            borderRadius: 12,
            backgroundColor: hex(colors.surfaceAlt),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextWidget text={q.text} style={{ fontFamily: PIXEL, fontSize: 11, color: hex(colors.accent) }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

// ---- WORKOUT IN PROGRESS ----------------------------------------------------

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function WorkoutWidget({ model, note }: { model: WorkoutModel; note?: string | null }) {
  if (model.state === 'none') {
    return (
      <FlexWidget
        {...deepLink('train/start')}
        accessibilityLabel="No workout running. Tap to start one."
        style={{ ...shell, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <FlexWidget style={{ flexDirection: 'column', flexGap: 3 }}>
          {label('WORKOUT')}
          <TextWidget text="No workout running" style={{ fontFamily: BODY_SEMI, fontSize: 14, color: hex(colors.text) }} />
        </FlexWidget>
        <TextWidget text="START" style={{ fontFamily: PIXEL, fontSize: 12, color: hex(colors.accent) }} />
      </FlexWidget>
    );
  }

  const open = deepLink(`train/active?id=${encodeURIComponent(model.sessionId)}`);
  const rest = model.restUntil ? `Rest until ${time(model.restUntil)}` : null;

  if (model.state === 'all_done') {
    return (
      <FlexWidget {...open} style={{ ...shell, flexDirection: 'column', justifyContent: 'center', flexGap: 3 }}>
        {label('WORKOUT')}
        <TextWidget text="Every set done" style={{ fontFamily: BODY_SEMI, fontSize: 14, color: hex(colors.text) }} />
        <TextWidget
          text={rest ?? 'Open the app to finish or add more'}
          style={{ fontFamily: BODY, fontSize: 12, color: hex(colors.textMuted) }}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={{ ...shell, flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
      <FlexWidget {...open} style={{ flex: 1, flexDirection: 'column', flexGap: 2 }}>
        {label(model.setLabel.toUpperCase())}
        <TextWidget text={model.exerciseName} maxLines={1} truncate="END" style={{ fontFamily: BODY_SEMI, fontSize: 14, color: hex(colors.text) }} />
        <TextWidget text={model.line} maxLines={1} style={{ fontFamily: BODY_SEMI, fontSize: 16, color: hex(colors.text) }} />
        <TextWidget
          text={note ?? rest ?? `Rest ${model.restSeconds}s after this set`}
          maxLines={1}
          style={{ fontFamily: BODY, fontSize: 11, color: hex(colors.textMuted) }}
        />
      </FlexWidget>
      {model.canLogFromWidget ? (
        <FlexWidget
          clickAction="DONE_SET"
          clickActionData={{ setId: model.setId }}
          accessibilityLabel={`Done: ${model.exerciseName}, ${model.line}`}
          style={{
            width: 72,
            height: 'match_parent',
            borderRadius: 14,
            backgroundColor: hex(colors.accent),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextWidget text="DONE" style={{ fontFamily: PIXEL, fontSize: 12, color: hex(colors.onAccent) }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

// ---- MUSCLE MAP -------------------------------------------------------------

export function MuscleWidget({ tally }: { tally: MuscleTally }) {
  const n = trainedCount(tally);
  return (
    <FlexWidget
      {...deepLink('progress')}
      accessibilityLabel={n === 0 ? 'No muscles trained this week yet.' : `${n} muscle groups trained this week.`}
      style={{ ...shell, flexDirection: 'column', flexGap: 6 }}
    >
      {label(n === 0 ? 'THIS WEEK · NOTHING YET' : 'THIS WEEK')}
      <SvgWidget svg={muscleGridSvg(tally, 300, 300)} style={{ width: 'match_parent', height: 'match_parent' }} />
    </FlexWidget>
  );
}
