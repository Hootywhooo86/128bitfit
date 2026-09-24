/**
 * One shared copy of today's health reading.
 *
 * It used to be per-hook state, and useTodaySteps is mounted twice — once by
 * Home for the STEPS figure and once by StepsCard for the connect prompt. Two
 * mounts meant two disconnected copies, so pressing Connect in the card
 * updated the card and left Home's number on a dash until the app was killed
 * and relaunched. The card said 8,412 and the stat above it said "—", which is
 * exactly the kind of disagreement that reads as "it stopped working".
 *
 * A module-level store also means the read happens once for both, and a
 * refresh from either reaches both.
 *
 * Refreshed on app resume as well as on mount. Permission is granted in the
 * Health Connect app, which means leaving this one — without the resume hook
 * the user comes back to the same "Not connected" card they just fixed. Steps
 * also keep accruing while the app sits in the background.
 */
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { today } from './dates';
import { health } from './index';
import { sameTodayHealth, todayHealthGate, type TodayHealth } from './today-gate';

type Listener = () => void;

let state: TodayHealth = { status: 'checking' };
const listeners = new Set<Listener>();
let inFlight: Promise<void> | null = null;
let appStateSub: NativeEventSubscription | null = null;

function publish(next: TodayHealth): void {
  // useSyncExternalStore compares snapshots by identity, so an unchanged
  // reading must keep the same object or every subscriber re-renders on every
  // resume.
  if (sameTodayHealth(state, next)) return;
  state = next;
  for (const l of [...listeners]) l();
}

export function getTodayHealth(): TodayHealth {
  return state;
}

async function read(): Promise<void> {
  const availability = await health.getAvailability();

  // A grants lookup that throws is not a denial, but it is not a reading
  // either — the gate turns both into "not connected", which is the only
  // honest thing to show when we cannot tell.
  let grants = null;
  try {
    grants = await health.getGrants();
  } catch {
    grants = null;
  }

  const gate = todayHealthGate(availability, grants);
  if (gate !== 'read') return publish(gate);

  const day = today();
  try {
    const [reading] = await health.readDays(day, day);
    publish({ status: 'ready', steps: reading?.steps ?? null });
  } catch {
    // Steps is granted — we just checked — so the connection is not the
    // problem and saying "Not connected" would send the user off to fix
    // something that is not broken. A granted scope that would not read is
    // "no reading", which the card already has copy for.
    publish({ status: 'ready', steps: null });
  }
}

/**
 * Re-read, sharing one in-flight read between callers.
 *
 * Both mount points refresh on the same resume, and Home's pull-to-refresh can
 * land on top of that; without the dedupe that is three reads of the same day.
 */
export function refreshTodayHealth(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = read()
    .catch(() => {
      // Must not leave the card stuck on "checking" forever.
      publish({ status: 'denied' });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function onAppState(next: AppStateStatus): void {
  if (next === 'active') void refreshTodayHealth();
}

export function subscribeTodayHealth(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && !appStateSub) {
    appStateSub = AppState.addEventListener('change', onAppState);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      appStateSub?.remove();
      appStateSub = null;
    }
  };
}

/** Test seam: drops the shared state so one test cannot leak into the next. */
export function __resetTodayHealth(): void {
  state = { status: 'checking' };
  listeners.clear();
  inFlight = null;
  appStateSub?.remove();
  appStateSub = null;
}
