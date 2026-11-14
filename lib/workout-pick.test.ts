import { describe, expect, it } from 'vitest';
import {
  buildPickPrompt,
  candidatesFor,
  COUNTS,
  freshestFirst,
  newestGeminiFlash,
  MAX_CANDIDATES,
  offlinePick,
  parsePick,
  SPLITS,
  topUp,
  type LibraryExercise,
  type PickHistory,
} from './workout-pick';
import type { MuscleGroup } from './muscle-load';

let n = 0;
function ex(primary: MuscleGroup[], patch: Partial<LibraryExercise> = {}): LibraryExercise {
  n++;
  return {
    id: `x${n}`,
    name: `Exercise ${n}`,
    equipment: 'barbell',
    category: 'strength',
    mechanic: 'compound',
    level: 'intermediate',
    primary,
    secondary: [],
    hasImage: true,
    ...patch,
  };
}

const split = (id: string) => SPLITS.find((s) => s.id === id)!;
const none: PickHistory = { done: new Set(), recentSets: {}, daysSince: {} };

const library: LibraryExercise[] = [
  ...['chest', 'shoulders', 'triceps', 'lats', 'middle back', 'biceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals']
    .flatMap((m) => [
      ex([m as MuscleGroup]),
      ex([m as MuscleGroup], { mechanic: 'isolation', equipment: 'dumbbell' }),
      ex([m as MuscleGroup], { equipment: 'body only' }),
    ]),
  ex(['chest'], { category: 'stretching' }),
  ex(['chest'], { category: 'cardio' }),
];

describe('workout pick: candidates', () => {
  it('offers the splits and counts the user asked for', () => {
    for (const id of ['push', 'pull', 'upper', 'lower', 'full']) expect(split(id)).toBeTruthy();
    expect([...COUNTS]).toEqual([4, 6, 8, 10]);
  });

  it('keeps to the split, the equipment and real strength work', () => {
    const push = candidatesFor(split('push'), 'gym', library, none);
    expect(push.length).toBeGreaterThan(0);
    for (const c of push) {
      expect(c.primary.some((m) => ['chest', 'shoulders', 'triceps'].includes(m))).toBe(true);
      expect(c.category).toBe('strength');
    }
    const bw = candidatesFor(split('push'), 'bodyweight', library, none);
    expect(bw.every((c) => c.equipment === 'body only')).toBe(true);
  });

  it('puts familiar lifts first and caps the list', () => {
    const fam = library.find((x) => x.primary[0] === 'chest' && x.mechanic === 'isolation')!;
    const c = candidatesFor(split('push'), 'gym', library, { ...none, done: new Set([fam.id]) });
    expect(c[0].id).toBe(fam.id);
    const big = Array.from({ length: 200 }, () => ex(['chest']));
    expect(candidatesFor(split('push'), 'gym', big, none).length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it('gives every candidate a short ref', () => {
    const c = candidatesFor(split('upper'), 'gym', library, none);
    expect(new Set(c.map((x) => x.ref)).size).toBe(c.length);
    expect(c[0].ref).toBe('e1');
  });
});

describe('workout pick: offline', () => {
  it('picks the count asked for, all different, compounds first', () => {
    const c = candidatesFor(split('full'), 'gym', library, none);
    for (const count of COUNTS) {
      const picks = offlinePick(split('full'), c, count, none);
      expect(picks).toHaveLength(count);
      expect(new Set(picks.map((p) => p.exerciseId)).size).toBe(count);
    }
    const picks = offlinePick(split('full'), c, 6, none);
    const firstIso = picks.findIndex((p) => c.find((x) => x.id === p.exerciseId)?.mechanic !== 'compound');
    if (firstIso >= 0) expect(picks.slice(firstIso).every((p) => c.find((x) => x.id === p.exerciseId)?.mechanic !== 'compound')).toBe(true);
  });

  it('trains the most rested muscles first', () => {
    const order = freshestFirst(['chest', 'lats', 'quadriceps'], {
      ...none,
      daysSince: { chest: 1, lats: 5, quadriceps: 3 },
    });
    expect(order).toEqual(['lats', 'quadriceps', 'chest']);
  });

  it('gives fewer when fewer fit, rather than repeating', () => {
    const tiny = candidatesFor(split('arms'), 'gym', [ex(['biceps']), ex(['triceps'])], none);
    expect(offlinePick(split('arms'), tiny, 6, none)).toHaveLength(2);
  });
});

describe('workout pick: model reply', () => {
  const c = candidatesFor(split('push'), 'gym', library, none);

  it('reads refs, sets and reps, and the why', () => {
    const r = parsePick('```json\n{"exercises":[{"ref":"e1","sets":4,"reps":6},{"ref":"E2","sets":"3","reps":"12"}],"why":"Chest is rested."}\n```', c, 4)!;
    expect(r.picks.map((p) => p.exerciseId)).toEqual([c[0].id, c[1].id]);
    expect(r.picks[0]).toMatchObject({ sets: 4, reps: 6 });
    expect(r.picks[1]).toMatchObject({ sets: 3, reps: 12 });
    expect(r.why).toBe('Chest is rested.');
  });

  it('drops refs it was never given, repeats, and anything past the count', () => {
    const r = parsePick('{"exercises":[{"ref":"e1"},{"ref":"e1"},{"ref":"e999"},{"ref":"Bench Press"},{"ref":"e2"},{"ref":"e3"}]}', c, 2)!;
    expect(r.picks).toHaveLength(2);
    expect(r.dropped).toBe(4);
  });

  it('holds sets and reps to sane numbers', () => {
    const r = parsePick('{"exercises":[{"ref":"e1","sets":40,"reps":0}]}', c, 4)!;
    expect(r.picks[0].sets).toBe(6);
    expect(r.picks[0].reps).toBe(1);
  });

  it('returns null for a reply with no workout in it', () => {
    expect(parsePick('Sorry, I cannot help with that.', c, 4)).toBeNull();
    expect(parsePick('{"nope":1}', c, 4)).toBeNull();
  });

  it('tops a short answer up from the offline pick without repeats', () => {
    const fallback = offlinePick(split('push'), c, 6, none);
    const r = parsePick('{"exercises":[{"ref":"e1"}]}', c, 6)!;
    const full = topUp(r.picks, fallback, 6);
    expect(full).toHaveLength(6);
    expect(full[0].exerciseId).toBe(c[0].id);
    expect(new Set(full.map((p) => p.exerciseId)).size).toBe(6);
  });
});

describe('workout pick: prompt', () => {
  it('lists only the candidates, the load and any injuries', () => {
    const c = candidatesFor(split('push'), 'dumbbells', library, none);
    const p = buildPickPrompt(
      { split: split('push'), count: 6, equipment: 'dumbbells', history: { ...none, recentSets: { chest: 9 }, daysSince: { chest: 1 } }, injuries: ['left shoulder (mild)'] },
      c
    );
    expect(p).toContain('Pick 6 exercises for a Push session');
    expect(p).toContain('Chest: 9 sets in 7 days, last trained 1 day ago');
    expect(p).toContain('left shoulder (mild)');
    for (const x of c) expect(p).toContain(`${x.ref} | ${x.name}`);
    expect(p).not.toContain('stretching');
  });
});

describe('newest Gemini Flash', () => {
  const gen = ['generateContent'];
  it('picks the highest-numbered full Flash that can generate text', () => {
    expect(
      newestGeminiFlash([
        { name: 'models/gemini-2.0-flash', methods: gen },
        { name: 'models/gemini-2.5-flash', methods: gen },
        { name: 'models/gemini-2.5-flash-lite', methods: gen },
        { name: 'models/gemini-3.0-flash-image', methods: gen },
        { name: 'models/gemini-2.5-pro', methods: gen },
        { name: 'models/text-embedding-004', methods: ['embedContent'] },
      ])
    ).toBe('gemini-2.5-flash');
  });

  it('takes lite when that is all there is, and null when there is nothing', () => {
    expect(newestGeminiFlash([{ name: 'models/gemini-3.1-flash-lite', methods: gen }])).toBe('gemini-3.1-flash-lite');
    expect(newestGeminiFlash([{ name: 'models/gemini-2.5-pro', methods: gen }])).toBeNull();
  });
});
