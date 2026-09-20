import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  cancelRestNotification,
  ensureRestNotificationSetup,
  findScheduledRestEndsAt,
  getRestNotificationPermission,
  isRestNotification,
  notificationsSupported,
  requestRestNotificationPermission,
  REST_ACTION_ADD_15,
  REST_ACTION_SKIP,
  scheduleRestEndNotification,
  type RestNotificationData,
} from '@/lib/rest-timer-notifications';

/**
 * Rest timer — in-app countdown synced to OS local notifications.
 *
 * `endsAt` drives the UI clock. Completion when backgrounded/killed relies on the
 * scheduled OS notification (not setTimeout alone). Foreground still uses a short
 * JS timeout so the bar clears promptly without waiting for the system banner.
 */

export type RestTimerSnapshot = {
  /** Absolute ms when rest ends; null if idle */
  endsAt: number | null;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
  sessionExerciseId: string | null;
  sessionId: string | null;
};

export type RestTimerEngine = {
  /** Called when a timer starts; return a cancel fn. */
  schedule: (endsAt: number, onFire: () => void) => () => void;
};

const jsEngine: RestTimerEngine = {
  schedule: (endsAt, onFire) => {
    const ms = Math.max(0, endsAt - Date.now());
    const id = setTimeout(onFire, ms);
    return () => clearTimeout(id);
  },
};

type RestTimerApi = RestTimerSnapshot & {
  start: (
    seconds: number,
    sessionExerciseId?: string | null,
    sessionId?: string | null
  ) => void;
  addSeconds: (delta: number) => void;
  skip: () => void;
  /** Swap later for alternate engines without UI changes */
  setEngine: (engine: RestTimerEngine) => void;
};

const RestTimerContext = createContext<RestTimerApi | null>(null);

const DEFAULT_REST = 60;

/** Module flag: only prompt once per process for the educational Alert. */
let permissionPromptShown = false;

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(DEFAULT_REST);
  const [sessionExerciseId, setSessionExerciseId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const engineRef = useRef<RestTimerEngine>(jsEngine);
  const cancelRef = useRef<(() => void) | null>(null);
  const endsAtRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionExerciseIdRef = useRef<string | null>(null);
  const permissionsReadyRef = useRef(false);

  endsAtRef.current = endsAt;
  sessionIdRef.current = sessionId;
  sessionExerciseIdRef.current = sessionExerciseId;

  const clearSchedule = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  const clearOsNotification = useCallback(() => {
    void cancelRestNotification();
  }, []);

  const stop = useCallback(() => {
    clearSchedule();
    clearOsNotification();
    setEndsAt(null);
    setSessionExerciseId(null);
    setSessionId(null);
  }, [clearSchedule, clearOsNotification]);

  const armOs = useCallback(
    (nextEnds: number, seId: string | null, sid: string | null) => {
      if (!notificationsSupported() || !permissionsReadyRef.current) return;
      void scheduleRestEndNotification(nextEnds, {
        sessionId: sid,
        sessionExerciseId: seId,
      });
    },
    []
  );

  const arm = useCallback(
    (nextEnds: number, seId: string | null, sid: string | null) => {
      clearSchedule();
      cancelRef.current = engineRef.current.schedule(nextEnds, () => {
        // Foreground completion — OS notification may still fire; cancel it.
        void cancelRestNotification();
        setEndsAt(null);
        setSessionExerciseId(null);
        setSessionId(null);
        cancelRef.current = null;
      });
      armOs(nextEnds, seId, sid);
    },
    [clearSchedule, armOs]
  );

  const ensurePermissionsForRest = useCallback(async (): Promise<boolean> => {
    if (!notificationsSupported()) return false;
    await ensureRestNotificationSetup();
    const current = await getRestNotificationPermission();
    if (current === 'granted') {
      permissionsReadyRef.current = true;
      return true;
    }
    if (current === 'denied') {
      permissionsReadyRef.current = false;
      if (!permissionPromptShown) {
        permissionPromptShown = true;
        Alert.alert(
          'Notifications off',
          'Rest timer will still count down in the app, but won’t alert you when the screen is locked. Enable notifications in system Settings for lock-screen alerts.',
          [{ text: 'OK' }]
        );
      }
      return false;
    }

    // undetermined — explain then request (first timed rest)
    if (!permissionPromptShown) {
      permissionPromptShown = true;
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Rest timer alerts',
          'Allow notifications so 128BIT FIT can tell you when rest is over — even if the screen is locked or the app is in the background.\n\nNote: iOS Silent / Focus mode may mute the sound.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Allow', onPress: () => resolve(true) },
          ]
        );
      });
      if (!proceed) {
        permissionsReadyRef.current = false;
        return false;
      }
    }

    const result = await requestRestNotificationPermission();
    permissionsReadyRef.current = result === 'granted';
    if (result !== 'granted') {
      Alert.alert(
        'Notifications denied',
        'In-app rest countdown still works. You can enable alerts later in system Settings.'
      );
    }
    return result === 'granted';
  }, []);

  const start = useCallback(
    (seconds: number, seId: string | null = null, sid: string | null = null) => {
      const secs = Math.max(1, Math.round(seconds));
      const next = Date.now() + secs * 1000;
      setTotalSeconds(secs);
      setEndsAt(next);
      setSessionExerciseId(seId);
      setSessionId(sid);
      arm(next, seId, sid);
      // Request permissions asynchronously; schedule OS notify once granted.
      void (async () => {
        const ok = await ensurePermissionsForRest();
        if (ok && endsAtRef.current === next) {
          armOs(next, seId, sid);
        }
      })();
    },
    [arm, armOs, ensurePermissionsForRest]
  );

  const addSeconds = useCallback(
    (delta: number) => {
      setEndsAt((prev) => {
        const seId = sessionExerciseIdRef.current;
        const sid = sessionIdRef.current;
        if (prev == null) {
          const secs = Math.max(1, delta);
          const next = Date.now() + secs * 1000;
          setTotalSeconds(secs);
          arm(next, seId, sid);
          return next;
        }
        const next = prev + delta * 1000;
        const remaining = Math.max(1, Math.ceil((next - Date.now()) / 1000));
        setTotalSeconds((t) => Math.max(t, remaining));
        arm(next, seId, sid);
        return next;
      });
    },
    [arm]
  );

  const skip = useCallback(() => {
    stop();
  }, [stop]);

  const setEngine = useCallback((engine: RestTimerEngine) => {
    engineRef.current = engine;
  }, []);

  // Restore timer from a scheduled OS notification after process death.
  useEffect(() => {
    if (!notificationsSupported()) return;
    let cancelled = false;
    void (async () => {
      await ensureRestNotificationSetup();
      const perm = await getRestNotificationPermission();
      if (perm === 'granted') permissionsReadyRef.current = true;
      const scheduled = await findScheduledRestEndsAt();
      if (!cancelled && scheduled) {
        setEndsAt(scheduled.endsAt);
        setSessionId(scheduled.sessionId);
        setSessionExerciseId(scheduled.sessionExerciseId);
        setTotalSeconds(Math.max(1, Math.ceil((scheduled.endsAt - Date.now()) / 1000)));
        arm(scheduled.endsAt, scheduled.sessionExerciseId, scheduled.sessionId);
      }

      // Cold start from notification tap
      const last = Notifications.getLastNotificationResponse();
      if (!cancelled && last && isRestNotification(last.notification)) {
        const data = last.notification.request.content.data as RestNotificationData;
        Notifications.clearLastNotificationResponse();
        // Defer nav until root is mounted
        setTimeout(() => navigateToWorkout(data.sessionId ?? null), 400);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Notification delivered (foreground) or user interacts (+15 / Skip / tap).
  useEffect(() => {
    if (!notificationsSupported()) return;

    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (!isRestNotification(notification)) return;
      // Rest end fired while app is open — clear UI (JS timeout may have already).
      if (endsAtRef.current != null) {
        clearSchedule();
        setEndsAt(null);
        setSessionExerciseId(null);
        setSessionId(null);
      }
    });

    const response = Notifications.addNotificationResponseReceivedListener((resp) => {
      const notification = resp.notification;
      if (!isRestNotification(notification)) return;
      const data = notification.request.content.data as RestNotificationData;
      const action = resp.actionIdentifier;

      if (action === REST_ACTION_ADD_15) {
        const secs = 15;
        const next = Date.now() + secs * 1000;
        setTotalSeconds(secs);
        setEndsAt(next);
        setSessionId(data.sessionId ?? sessionIdRef.current);
        setSessionExerciseId(data.sessionExerciseId ?? sessionExerciseIdRef.current);
        arm(next, data.sessionExerciseId ?? sessionExerciseIdRef.current, data.sessionId ?? sessionIdRef.current);
        navigateToWorkout(data.sessionId ?? sessionIdRef.current);
        return;
      }

      if (action === REST_ACTION_SKIP) {
        stop();
        navigateToWorkout(data.sessionId ?? sessionIdRef.current);
        return;
      }

      // Default tap — open active workout if possible.
      if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // Timer already ended when notification fired; clear stale UI.
        if (endsAtRef.current != null && endsAtRef.current <= Date.now() + 250) {
          stop();
        }
        navigateToWorkout(data.sessionId ?? sessionIdRef.current);
      }
    });

    return () => {
      received.remove();
      response.remove();
    };
  }, [arm, clearSchedule, stop]);

  // Re-sync countdown when returning from background (JS timers throttle).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  // 250ms UI tick while running
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => () => clearSchedule(), [clearSchedule]);

  const remainingSeconds =
    endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

  void tick;

  const value = useMemo<RestTimerApi>(
    () => ({
      endsAt,
      totalSeconds,
      remainingSeconds,
      running: endsAt != null && remainingSeconds > 0,
      sessionExerciseId,
      sessionId,
      start,
      addSeconds,
      skip,
      setEngine,
    }),
    [
      endsAt,
      totalSeconds,
      remainingSeconds,
      sessionExerciseId,
      sessionId,
      start,
      addSeconds,
      skip,
      setEngine,
    ]
  );

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}

function navigateToWorkout(sessionId: string | null) {
  try {
    if (sessionId) {
      router.push(`/train/active?id=${encodeURIComponent(sessionId)}`);
    } else {
      router.push('/(tabs)/train');
    }
  } catch {
    // Navigation may fail if root not ready; ignore.
  }
}

export function useRestTimer(): RestTimerApi {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error('useRestTimer must be used within RestTimerProvider');
  return ctx;
}

export function formatRestClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export const DEFAULT_REST_SECONDS = DEFAULT_REST;
