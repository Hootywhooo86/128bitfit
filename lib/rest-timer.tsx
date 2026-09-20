import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Rest timer — JS countdown for v1.
 * Structured so a future OS notification / background task can replace the ticker
 * by swapping the `engine` implementation while keeping the same React API.
 */

export type RestTimerSnapshot = {
  /** Absolute ms when rest ends; null if idle */
  endsAt: number | null;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
  sessionExerciseId: string | null;
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
  start: (seconds: number, sessionExerciseId?: string | null) => void;
  addSeconds: (delta: number) => void;
  skip: () => void;
  /** Swap later for notification-backed engine without UI changes */
  setEngine: (engine: RestTimerEngine) => void;
};

const RestTimerContext = createContext<RestTimerApi | null>(null);

const DEFAULT_REST = 60;

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(DEFAULT_REST);
  const [sessionExerciseId, setSessionExerciseId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const engineRef = useRef<RestTimerEngine>(jsEngine);
  const cancelRef = useRef<(() => void) | null>(null);

  const clearSchedule = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  const stop = useCallback(() => {
    clearSchedule();
    setEndsAt(null);
    setSessionExerciseId(null);
  }, [clearSchedule]);

  const arm = useCallback(
    (nextEnds: number) => {
      clearSchedule();
      cancelRef.current = engineRef.current.schedule(nextEnds, () => {
        setEndsAt(null);
        setSessionExerciseId(null);
        cancelRef.current = null;
      });
    },
    [clearSchedule]
  );

  const start = useCallback(
    (seconds: number, seId: string | null = null) => {
      const secs = Math.max(1, Math.round(seconds));
      const next = Date.now() + secs * 1000;
      setTotalSeconds(secs);
      setEndsAt(next);
      setSessionExerciseId(seId);
      arm(next);
    },
    [arm]
  );

  const addSeconds = useCallback(
    (delta: number) => {
      setEndsAt((prev) => {
        if (prev == null) {
          const secs = Math.max(1, delta);
          const next = Date.now() + secs * 1000;
          setTotalSeconds(secs);
          arm(next);
          return next;
        }
        const next = prev + delta * 1000;
        const remaining = Math.max(1, Math.ceil((next - Date.now()) / 1000));
        setTotalSeconds((t) => Math.max(t, remaining));
        arm(next);
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

  // 1s UI tick while running
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => () => clearSchedule(), [clearSchedule]);

  const remainingSeconds =
    endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

  // silence unused tick lint by referencing it
  void tick;

  const value = useMemo<RestTimerApi>(
    () => ({
      endsAt,
      totalSeconds,
      remainingSeconds,
      running: endsAt != null && remainingSeconds > 0,
      sessionExerciseId,
      start,
      addSeconds,
      skip,
      setEngine,
    }),
    [endsAt, totalSeconds, remainingSeconds, sessionExerciseId, start, addSeconds, skip, setEngine]
  );

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
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
