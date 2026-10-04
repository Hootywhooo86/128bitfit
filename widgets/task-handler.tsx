/**
 * Android's side of the widgets: draws each one when it is added, resized or
 * due for its periodic update, and handles DONE on the workout widget.
 *
 * Runs in a background JS context when the app is closed, so it loads the
 * accent itself and never assumes a screen has run first.
 */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadAccent } from '@/db/accent-settings';
import { completeSet, getInProgressSession, loadActiveWorkout } from '@/db/workout-queries';
import { scheduleRestEndNotification } from '@/lib/rest-timer-notifications';
import { DEFAULT_REST_SECONDS } from '@/lib/rest-timer-defaults';
import { afterSupersetTick } from '@/lib/superset';
import { widgetsChanged } from '@/lib/widget-refresh';
import { loadMuscles, loadToday, loadWorkout } from './data';
import { MuscleWidget, QuickLogWidget, TodayWidget, WorkoutWidget } from './Widgets';

export const WIDGET_NAMES = ['Today', 'QuickLog', 'Workout', 'Muscles'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** The widget's picture for its current data. `width` in dp decides the wide layout. */
export async function renderFor(name: string, width: number, note?: string | null): Promise<React.JSX.Element> {
  await loadAccent().catch(() => undefined);
  switch (name) {
    case 'Today':
      return <TodayWidget model={await loadToday()} wide={width >= 220} />;
    case 'QuickLog':
      return <QuickLogWidget />;
    case 'Workout':
      return <WorkoutWidget model={await loadWorkout()} note={note} />;
    case 'Muscles':
      return <MuscleWidget tally={await loadMuscles()} />;
    default:
      return <QuickLogWidget />;
  }
}

/**
 * DONE on the workout widget: the same completeSet the workout screen uses,
 * with the values already in the set (last session's, pre-filled), then the
 * same rest as the screen would start, as a scheduled notification. Returns
 * one honest sentence when it could not log.
 */
async function doneFromWidget(setId: unknown): Promise<string | null> {
  if (typeof setId !== 'string') return 'Open the app to log this set.';
  const session = await getInProgressSession();
  if (!session) return 'That workout has ended.';
  const active = await loadActiveWorkout(session.id);
  const owner = active?.exercises.find((e) => e.sets.some((s) => s.id === setId));
  const set = owner?.sets.find((s) => s.id === setId);
  if (!active || !owner || !set) return 'That set has changed — open the app.';
  if (set.completed) return null;
  await completeSet(setId);
  const next = afterSupersetTick(active.exercises, owner.id);
  if (next.rest) {
    const rest = owner.restSeconds ?? DEFAULT_REST_SECONDS;
    await scheduleRestEndNotification(Date.now() + rest * 1000, {
      sessionId: session.id,
      sessionExerciseId: owner.id,
    }).catch(() => null);
  }
  // Home, Today and the muscle map all count completed sets.
  widgetsChanged();
  return null;
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction } = props;
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(await renderFor(widgetInfo.widgetName, widgetInfo.width));
      break;
    case 'WIDGET_CLICK':
      if (props.clickAction === 'DONE_SET') {
        let note: string | null = null;
        try {
          note = await doneFromWidget(props.clickActionData?.setId);
        } catch (e) {
          note = `Not logged: ${e instanceof Error ? e.message : String(e)}`;
        }
        props.renderWidget(await renderFor(widgetInfo.widgetName, widgetInfo.width, note));
      }
      break;
    default:
      break;
  }
}
