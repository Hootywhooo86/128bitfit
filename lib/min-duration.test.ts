import { describe, expect, it, vi } from 'vitest';
import { withMinimumDuration } from './min-duration';

describe('keeping a refresh indicator visible', () => {
  it('returns the work’s value', async () => {
    await expect(withMinimumDuration(Promise.resolve('done'), 0)).resolves.toBe('done');
  });

  it('waits the floor out when the work finishes instantly', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const wait = () =>
      new Promise<void>((r) => {
        release = () => {
          order.push('floor');
          r();
        };
      });

    const p = withMinimumDuration(Promise.resolve('x').then((v) => (order.push('work'), v)), 500, wait);
    await Promise.resolve();
    // The work is done but the call has not resolved, because the floor holds.
    expect(order).toEqual(['work']);
    release();
    await p;
    expect(order).toEqual(['work', 'floor']);
  });

  it('does not delay work that already outlasts the floor', async () => {
    // The floor is started alongside the work, not after it, so a slow refresh
    // pays nothing extra.
    const wait = vi.fn(() => Promise.resolve());
    const slow = new Promise<string>((r) => setTimeout(() => r('slow'), 5));
    await expect(withMinimumDuration(slow, 500, wait)).resolves.toBe('slow');
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('still waits the floor when the work rejects, then rethrows', async () => {
    // A failed refresh has to be acknowledged too, or an instant failure is
    // indistinguishable from the gesture not registering.
    const wait = vi.fn(() => Promise.resolve());
    await expect(
      withMinimumDuration(Promise.reject(new Error('read failed')), 500, wait)
    ).rejects.toThrow('read failed');
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('starts the floor without waiting for the work to settle', async () => {
    // Asserted against a promise that is still pending: if the floor only
    // started after the work resolved, wait would not have been called yet.
    let finishWork: (v: string) => void = () => {};
    const work = new Promise<string>((r) => {
      finishWork = r;
    });
    const wait = vi.fn(() => Promise.resolve());

    const p = withMinimumDuration(work, 500, wait);
    expect(wait).toHaveBeenCalledTimes(1);

    finishWork('ok');
    await expect(p).resolves.toBe('ok');
  });
});
