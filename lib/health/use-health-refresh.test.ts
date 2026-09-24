import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-native cannot load here; AppState is the only thing this module needs
// from it, and the registry under test does not touch it.
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const { addHealthRefreshListener, broadcastHealthRefresh } = await import('./use-health-refresh');

const offs: (() => void)[] = [];
const listen = (fn: () => void) => {
  const off = addHealthRefreshListener(fn);
  offs.push(off);
  return off;
};

beforeEach(() => {
  while (offs.length) offs.pop()?.();
});

describe('a pull to refresh reaching the health cards', () => {
  it('reaches every mounted card, not just the screen that pulled', () => {
    // The bug: Home's pull re-read its own queries and nothing else, so the
    // readiness and weight cards kept what they read when they mounted.
    const readiness = vi.fn();
    const weight = vi.fn();
    listen(readiness);
    listen(weight);

    broadcastHealthRefresh();

    expect(readiness).toHaveBeenCalledTimes(1);
    expect(weight).toHaveBeenCalledTimes(1);
  });

  it('does not throw when no card is mounted', () => {
    expect(() => broadcastHealthRefresh()).not.toThrow();
  });

  it('stops calling a card once it unmounts', () => {
    const gone = vi.fn();
    const off = listen(gone);
    off();
    broadcastHealthRefresh();
    expect(gone).not.toHaveBeenCalled();
  });

  it('survives a card unmounting while it is being notified', () => {
    // A card can unmount on the same frame as the pull. Iterating the live set
    // would mutate it mid-loop and skip the card after it.
    const second = vi.fn();
    let offFirst: (() => void) | null = null;
    const first = vi.fn(() => offFirst?.());
    offFirst = listen(first);
    listen(second);

    expect(() => broadcastHealthRefresh()).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('calls a card again on a second pull', () => {
    const card = vi.fn();
    listen(card);
    broadcastHealthRefresh();
    broadcastHealthRefresh();
    expect(card).toHaveBeenCalledTimes(2);
  });
});
