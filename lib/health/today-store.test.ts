import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-native cannot load here, and AppState is the only thing the store
// touches from it. The listener is captured so a resume can be simulated.
let appStateListener: ((s: string) => void) | null = null;
const removeSub = vi.fn(() => {
  appStateListener = null;
});
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_e: string, cb: (s: string) => void) => {
      appStateListener = cb;
      return { remove: removeSub };
    },
  },
}));

const getAvailability = vi.fn();
const getGrants = vi.fn();
const readDays = vi.fn();
vi.mock('./index', () => ({ health: { getAvailability, getGrants, readDays } }));

const { __resetTodayHealth, getTodayHealth, refreshTodayHealth, subscribeTodayHealth } =
  await import('./today-store');

const connected = (steps: number | null, activeCalories: number | null = null) => {
  getAvailability.mockResolvedValue('available');
  getGrants.mockResolvedValue({ read: ['steps'], write: [] });
  readDays.mockResolvedValue([{ date: '2026-09-24', steps, activeCalories }]);
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetTodayHealth();
});

describe('the two places that show steps', () => {
  it('shows both the same reading — the bug that made the card and the stat disagree', async () => {
    // Home and StepsCard each mount the hook. Before this store they held
    // separate state, so connecting in the card left Home's number on a dash
    // until the app was killed.
    const home = vi.fn();
    const card = vi.fn();
    subscribeTodayHealth(home);
    subscribeTodayHealth(card);

    connected(8412);
    await refreshTodayHealth();

    expect(getTodayHealth()).toEqual({ status: 'ready', steps: 8412, activeCalories: null });
    expect(home).toHaveBeenCalled();
    expect(card).toHaveBeenCalled();
  });

  it('reaches a subscriber that mounted after the read, without re-reading', async () => {
    connected(300);
    await refreshTodayHealth();
    expect(readDays).toHaveBeenCalledTimes(1);

    const late = vi.fn();
    subscribeTodayHealth(late);
    expect(getTodayHealth()).toEqual({ status: 'ready', steps: 300, activeCalories: null });
  });

  it('shares one read between callers that ask at the same moment', async () => {
    connected(120);
    await Promise.all([refreshTodayHealth(), refreshTodayHealth(), refreshTodayHealth()]);
    expect(readDays).toHaveBeenCalledTimes(1);
  });

  it('reads again on a later refresh, so pull-to-refresh is not a no-op', async () => {
    connected(120);
    await refreshTodayHealth();
    connected(900);
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'ready', steps: 900, activeCalories: null });
    expect(readDays).toHaveBeenCalledTimes(2);
  });
});

describe('coming back to the app', () => {
  it('re-reads on resume — steps accrue while the app is backgrounded', async () => {
    subscribeTodayHealth(vi.fn());
    connected(100);
    await refreshTodayHealth();

    connected(4000);
    appStateListener?.('active');
    await vi.waitFor(() => expect(getTodayHealth()).toEqual({ status: 'ready', steps: 4000, activeCalories: null }));
  });

  it('picks up a permission granted in the Health Connect app, which means leaving this one', async () => {
    subscribeTodayHealth(vi.fn());
    getAvailability.mockResolvedValue('available');
    getGrants.mockResolvedValue({ read: [], write: [] });
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'denied' });

    connected(0);
    appStateListener?.('active');
    // 0 is a real reading, not a dash.
    await vi.waitFor(() => expect(getTodayHealth()).toEqual({ status: 'ready', steps: 0, activeCalories: null }));
  });

  it('ignores backgrounding, which cannot change the reading', async () => {
    subscribeTodayHealth(vi.fn());
    connected(100);
    await refreshTodayHealth();
    expect(readDays).toHaveBeenCalledTimes(1);

    appStateListener?.('background');
    appStateListener?.('inactive');
    expect(readDays).toHaveBeenCalledTimes(1);
  });

  it('stops listening once nothing is mounted', async () => {
    const off = subscribeTodayHealth(vi.fn());
    expect(appStateListener).not.toBeNull();
    off();
    expect(removeSub).toHaveBeenCalled();
  });
});

describe('when it cannot read', () => {
  it('does not leave the card on "checking" when the read throws', async () => {
    getAvailability.mockRejectedValue(new Error('no provider'));
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'denied' });
  });

  it('survives a grants lookup that throws and still does not invent a reading', async () => {
    getAvailability.mockResolvedValue('available');
    getGrants.mockRejectedValue(new Error('boom'));
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'denied' });
    expect(readDays).not.toHaveBeenCalled();
  });

  it('never reads a day it was not granted', async () => {
    getAvailability.mockResolvedValue('unavailable');
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'unavailable' });
    expect(readDays).not.toHaveBeenCalled();
  });

  it('keeps a missing reading as null rather than zero', async () => {
    getAvailability.mockResolvedValue('available');
    getGrants.mockResolvedValue({ read: ['steps'], write: [] });
    readDays.mockResolvedValue([]);
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'ready', steps: null, activeCalories: null });
  });

  it('recovers on the next refresh after a failure', async () => {
    getAvailability.mockRejectedValue(new Error('transient'));
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'denied' });

    connected(77);
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'ready', steps: 77, activeCalories: null });
  });
});

describe('not waking subscribers for nothing', () => {
  it('does not notify when the reading is unchanged', async () => {
    connected(500);
    await refreshTodayHealth();

    const listener = vi.fn();
    subscribeTodayHealth(listener);
    await refreshTodayHealth();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does notify when it changes', async () => {
    connected(500);
    await refreshTodayHealth();

    const listener = vi.fn();
    subscribeTodayHealth(listener);
    connected(600);
    await refreshTodayHealth();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('a read that fails after permission was granted', () => {
  it('says "no reading", not "not connected" — the connection is not the problem', async () => {
    getAvailability.mockResolvedValue('available');
    getGrants.mockResolvedValue({ read: ['steps'], write: [] });
    readDays.mockRejectedValue(new Error('IPC died'));

    await refreshTodayHealth();
    // 'denied' here would send the user to fix a permission that is already on.
    expect(getTodayHealth()).toEqual({ status: 'ready', steps: null, activeCalories: null });
  });

  it('recovers the next time the read works', async () => {
    getAvailability.mockResolvedValue('available');
    getGrants.mockResolvedValue({ read: ['steps'], write: [] });
    readDays.mockRejectedValue(new Error('IPC died'));
    await refreshTodayHealth();

    connected(2200);
    await refreshTodayHealth();
    expect(getTodayHealth()).toEqual({ status: 'ready', steps: 2200, activeCalories: null });
  });
});

describe('keeping the number fresh while the screen is open', () => {
  it('re-reads every minute without anyone touching it', async () => {
    vi.useFakeTimers();
    try {
      subscribeTodayHealth(vi.fn());
      connected(100);
      await refreshTodayHealth();
      expect(readDays).toHaveBeenCalledTimes(1);

      connected(250);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(readDays).toHaveBeenCalledTimes(2);
      expect(getTodayHealth()).toEqual({ status: 'ready', steps: 250, activeCalories: null });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(readDays).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not read before the minute is up', async () => {
    vi.useFakeTimers();
    try {
      subscribeTodayHealth(vi.fn());
      connected(100);
      await refreshTodayHealth();

      await vi.advanceTimersByTimeAsync(59_000);
      expect(readDays).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops while the app is backgrounded, so it is not polling out of sight', async () => {
    vi.useFakeTimers();
    try {
      subscribeTodayHealth(vi.fn());
      connected(100);
      await refreshTodayHealth();
      expect(readDays).toHaveBeenCalledTimes(1);

      appStateListener?.('background');
      await vi.advanceTimersByTimeAsync(300_000);
      expect(readDays).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads once on the way back in, then resumes the minute cycle', async () => {
    vi.useFakeTimers();
    try {
      subscribeTodayHealth(vi.fn());
      connected(100);
      await refreshTodayHealth();
      appStateListener?.('background');
      await vi.advanceTimersByTimeAsync(300_000);
      expect(readDays).toHaveBeenCalledTimes(1);

      appStateListener?.('active');
      await vi.advanceTimersByTimeAsync(0);
      expect(readDays).toHaveBeenCalledTimes(2); // the resume read

      await vi.advanceTimersByTimeAsync(60_000);
      expect(readDays).toHaveBeenCalledTimes(3); // polling again
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops once nothing is showing the reading', async () => {
    vi.useFakeTimers();
    try {
      const off = subscribeTodayHealth(vi.fn());
      connected(100);
      await refreshTodayHealth();
      off();

      await vi.advanceTimersByTimeAsync(300_000);
      expect(readDays).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps one timer when both mount points subscribe', async () => {
    vi.useFakeTimers();
    try {
      // Home and StepsCard both subscribe. Two timers would double the reads.
      subscribeTodayHealth(vi.fn());
      subscribeTodayHealth(vi.fn());
      connected(100);
      await refreshTodayHealth();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(readDays).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
