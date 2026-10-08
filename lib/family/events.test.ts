import { describe, expect, it } from 'vitest';
import { emptyHealthDay } from '@/lib/health/types';
import { OUTBOX_MAX, cardioEvent, enqueue, healthDayEvent, strengthEvent, type OutboxItem } from './events';

const put = (id: string, n = 0): OutboxItem => ({
  op: 'put',
  event: { id, app: 'fit', type: 'health.day', at: n, data: { steps: n } },
});

describe('family outbox', () => {
  it('keeps only the latest state per id', () => {
    let q = enqueue([], put('a', 1));
    q = enqueue(q, put('b', 1));
    q = enqueue(q, put('a', 2));
    expect(q).toEqual([put('b', 1), put('a', 2)]);
  });

  it('a delete replaces a put still waiting', () => {
    const q = enqueue([put('a')], { op: 'delete', id: 'a' });
    expect(q).toEqual([{ op: 'delete', id: 'a' }]);
  });

  it('drops the oldest past the cap', () => {
    let q: OutboxItem[] = [];
    for (let i = 0; i < OUTBOX_MAX + 5; i++) q = enqueue(q, put(`e${i}`));
    expect(q).toHaveLength(OUTBOX_MAX);
    expect(q[0]).toEqual(put('e5'));
  });
});

describe('family events', () => {
  it('a strength session carries its length, exercises and sets', () => {
    const e = strengthEvent({ id: 's1', startedAt: 0, endedAt: 45 * 60_000, title: 'Bench, Row', exercises: 2, sets: 9 });
    expect(e).toEqual({
      id: 'fit-s1',
      app: 'fit',
      type: 'workout.logged',
      at: 45 * 60_000,
      data: { kind: 'strength', name: 'Bench, Row', minutes: 45, exercises: 2, sets: 9 },
    });
  });

  it('cardio without a measured distance says null, not 0', () => {
    const e = cardioEvent({ id: 'c1', startedAt: 0, endedAt: 30 * 60_000, sport: 'Swim', distanceM: null });
    expect(e.data.km).toBeNull();
    expect(cardioEvent({ id: 'c1', startedAt: 0, endedAt: 1, sport: 'Run', distanceM: 5234 }).data.km).toBe(5.23);
  });

  it('a day with nothing read sends nothing', () => {
    expect(healthDayEvent(emptyHealthDay('2026-10-07'))).toBeNull();
  });

  it('a zero reading is sent as zero; unread fields stay null; weight never goes', () => {
    const day = { ...emptyHealthDay('2026-10-07'), steps: 0, weightKg: 80 };
    const e = healthDayEvent(day, Date.now() + 10 ** 12)!;
    expect(e.id).toBe('fit-health-2026-10-07');
    expect(e.data).toEqual({
      date: '2026-10-07',
      steps: 0,
      sleepMinutes: null,
      restingHeartRate: null,
      activeCalories: null,
      km: null,
    });
    expect(new Date(e.at).getHours()).toBe(23);
  });

  it("today's totals are stamped now, not in the future", () => {
    const now = new Date(2026, 9, 7, 9, 30).getTime();
    expect(healthDayEvent({ ...emptyHealthDay('2026-10-07'), steps: 1200 }, now)!.at).toBe(now);
  });
});
