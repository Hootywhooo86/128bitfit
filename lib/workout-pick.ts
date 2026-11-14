/**
 * Picking today's workout.
 *
 * The user chooses a split (push, pull, upper…), how many exercises and what
 * equipment they have. The library is narrowed here to exercises that fit, so
 * a model only ever chooses from real exercises the app has — it cannot
 * invent one, and its reply is checked against the list it was given.
 *
 * Without a model (no key, no signal, a provider that failed) `offlinePick`
 * builds the session from the same candidates by plain rules, so the button
 * always produces a workout.
 *
 * Pure: library and history in, prompt and parsed picks out.
 */
import { MUSCLE_LABELS, type MuscleGroup } from './muscle-load';

export type SplitId =
  | 'push'
  | 'pull'
  | 'upper'
  | 'lower'
  | 'full'
  | 'arms'
  | 'chest-back'
  | 'shoulders-arms'
  | 'glutes-hams'
  | 'core'
  | 'coach';

export type Split = { id: SplitId; label: string; muscles: MuscleGroup[]; hint: string };

const PUSH: MuscleGroup[] = ['chest', 'shoulders', 'triceps'];
const PULL: MuscleGroup[] = ['lats', 'middle back', 'traps', 'biceps', 'forearms'];
const LOWER: MuscleGroup[] = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'lower back'];

export const SPLITS: Split[] = [
  { id: 'push', label: 'Push', muscles: PUSH, hint: 'Chest, shoulders, triceps' },
  { id: 'pull', label: 'Pull', muscles: PULL, hint: 'Back, biceps, forearms' },
  { id: 'upper', label: 'Upper', muscles: [...PUSH, ...PULL], hint: 'Everything above the waist' },
  { id: 'lower', label: 'Lower', muscles: LOWER, hint: 'Quads, hamstrings, glutes, calves' },
  {
    id: 'full',
    label: 'Full body',
    muscles: ['quadriceps', 'chest', 'lats', 'hamstrings', 'shoulders', 'glutes', 'middle back', 'abdominals', 'triceps', 'biceps'],
    hint: 'A bit of everything',
  },
  { id: 'arms', label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'], hint: 'Biceps, triceps, forearms' },
  { id: 'chest-back', label: 'Chest & back', muscles: ['chest', 'lats', 'middle back'], hint: 'Pressing and rowing' },
  {
    id: 'shoulders-arms',
    label: 'Shoulders & arms',
    muscles: ['shoulders', 'biceps', 'triceps', 'traps'],
    hint: 'Delts, arms, traps',
  },
  {
    id: 'glutes-hams',
    label: 'Glutes & hamstrings',
    muscles: ['glutes', 'hamstrings', 'abductors', 'lower back'],
    hint: 'The back of the legs',
  },
  { id: 'core', label: 'Core', muscles: ['abdominals', 'lower back'], hint: 'Abs and lower back' },
  {
    id: 'coach',
    label: "Coach's pick",
    muscles: ['quadriceps', 'chest', 'lats', 'hamstrings', 'shoulders', 'glutes', 'middle back', 'abdominals', 'triceps', 'biceps', 'calves', 'traps'],
    hint: 'Trains whatever is most rested',
  },
];

export type EquipmentId = 'gym' | 'dumbbells' | 'home' | 'bodyweight';

export const EQUIPMENT: { id: EquipmentId; label: string; allows: (equipment: string | null) => boolean }[] = [
  { id: 'gym', label: 'Full gym', allows: () => true },
  { id: 'dumbbells', label: 'Dumbbells', allows: (e) => e === 'dumbbell' || e === 'body only' },
  {
    id: 'home',
    label: 'Home',
    allows: (e) => ['dumbbell', 'kettlebells', 'bands', 'body only', 'exercise ball', 'medicine ball'].includes(e ?? ''),
  },
  { id: 'bodyweight', label: 'Bodyweight', allows: (e) => e === 'body only' },
];

export const COUNTS = [4, 6, 8, 10] as const;
export type Count = (typeof COUNTS)[number];

/** Kinds of exercise a strength session is built from. Stretches and cardio are not picked. */
const TRAINING = new Set(['strength', 'powerlifting']);

export type LibraryExercise = {
  id: string;
  name: string;
  equipment: string | null;
  category: string | null;
  mechanic: string | null;
  level: string | null;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  hasImage: boolean;
};

/** What the user has done, for preferring familiar lifts and resting tired muscles. */
export type PickHistory = {
  /** Exercise ids with completed sets, ever. */
  done: ReadonlySet<string>;
  /** Sets per muscle in the last 7 days. */
  recentSets: Partial<Record<MuscleGroup, number>>;
  /** Days since each muscle last had a set; missing means never. */
  daysSince: Partial<Record<MuscleGroup, number>>;
};

export type Candidate = LibraryExercise & { ref: string; familiar: boolean; score: number };

/** At most this many go to the model: enough to choose from, small enough to stay cheap. */
export const MAX_CANDIDATES = 60;

/**
 * Exercises that fit the split and the equipment, best first, with every
 * muscle in the split represented. Each gets a short ref ("e1", "e2"…) that
 * the model answers with, so a reply cannot name an exercise not on the list.
 */
export function candidatesFor(
  split: Split,
  equipment: EquipmentId,
  library: readonly LibraryExercise[],
  history: PickHistory
): Candidate[] {
  const allows = EQUIPMENT.find((e) => e.id === equipment)?.allows ?? (() => true);
  const wanted = new Set(split.muscles);
  const fit = library
    .filter((x) => TRAINING.has(x.category ?? '') && allows(x.equipment) && x.primary.some((m) => wanted.has(m)))
    .map((x) => {
      const familiar = history.done.has(x.id);
      const score =
        (familiar ? 3 : 0) +
        (x.mechanic === 'compound' ? 2 : 0) +
        (x.hasImage ? 0.5 : 0) +
        (x.level === 'expert' ? -1 : 0);
      return { ...x, familiar, score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Round-robin by muscle so a long list of chest presses cannot crowd out triceps.
  const byMuscle = split.muscles.map((m) => fit.filter((x) => x.primary[0] === m || x.primary.includes(m)));
  const chosen: typeof fit = [];
  const taken = new Set<string>();
  for (let round = 0; chosen.length < MAX_CANDIDATES && byMuscle.some((l) => l.length > round); round++) {
    for (const list of byMuscle) {
      const x = list[round];
      if (x && !taken.has(x.id) && chosen.length < MAX_CANDIDATES) {
        taken.add(x.id);
        chosen.push(x);
      }
    }
  }
  return chosen.map((x, i) => ({ ...x, ref: `e${i + 1}` }));
}

export type Pick = { exerciseId: string; name: string; sets: number; reps: number };

/** Sets and reps when the picker decides: heavier and fewer on compounds. */
function defaultDose(x: LibraryExercise): { sets: number; reps: number } {
  return x.mechanic === 'compound' ? { sets: 3, reps: 8 } : { sets: 3, reps: 12 };
}

/**
 * The split's muscles in the order to train them: the most rested first.
 * Never trained counts as most rested.
 */
export function freshestFirst(muscles: readonly MuscleGroup[], history: PickHistory): MuscleGroup[] {
  const rest = (m: MuscleGroup) => history.daysSince[m] ?? 999;
  return [...muscles].sort((a, b) => rest(b) - rest(a) || (history.recentSets[a] ?? 0) - (history.recentSets[b] ?? 0));
}

/**
 * The no-model pick: walk the split's muscles, most rested first, taking the
 * best unused exercise for each until there are `count`. Compounds go first in
 * the session, isolation after.
 */
export function offlinePick(split: Split, candidates: readonly Candidate[], count: number, history: PickHistory): Pick[] {
  const order = freshestFirst(split.muscles, history);
  const chosen: Candidate[] = [];
  const taken = new Set<string>();
  for (let guard = 0; chosen.length < count && guard < 20; guard++) {
    let added = false;
    for (const m of order) {
      if (chosen.length >= count) break;
      const x = candidates.find((c) => !taken.has(c.id) && c.primary.includes(m));
      if (!x) continue;
      taken.add(x.id);
      chosen.push(x);
      added = true;
    }
    if (!added) break;
  }
  return chosen
    .sort((a, b) => Number(b.mechanic === 'compound') - Number(a.mechanic === 'compound'))
    .map((x) => ({ exerciseId: x.id, name: x.name, ...defaultDose(x) }));
}

export type PickContext = {
  split: Split;
  count: number;
  equipment: EquipmentId;
  history: PickHistory;
  /** Active injuries, as the user wrote them. Empty when they chose not to tell the coach. */
  injuries: string[];
};

export const PICK_SYSTEM = `You are 128BIT FIT Coach choosing one strength session for today.

Rules:
- Choose ONLY from the numbered exercise list. Answer with their refs (e1, e2…), never a name you made up.
- Choose exactly the number of exercises asked for, all different.
- Put big compound lifts first and isolation work after.
- Prefer muscles that are rested. A muscle with many sets in the last 2–3 days gets less volume or is skipped if the split allows.
- If the user lists pain or an injury, stay off exercises that load it. You are not a doctor: no diagnosis and no rehab.
- Sets 2–5, reps 5–20.
- The "why" is one or two plain sentences. If a normal session is fine, say so; do not invent a problem.
- Reply with JSON only, no other text:
{"exercises":[{"ref":"e1","sets":3,"reps":8}],"why":"…"}`;

/** The user message: the ask, the recent load, and the list to choose from. */
export function buildPickPrompt(ctx: PickContext, candidates: readonly Candidate[]): string {
  const { split, history } = ctx;
  const load = split.muscles
    .map((m) => {
      const sets = history.recentSets[m] ?? 0;
      const since = history.daysSince[m];
      return `${MUSCLE_LABELS[m]}: ${sets} sets in 7 days, ${since == null ? 'never trained' : `last trained ${since} day${since === 1 ? '' : 's'} ago`}`;
    })
    .join('\n');
  const list = candidates
    .map((c) => {
      const muscles = c.primary.map((m) => MUSCLE_LABELS[m]).join('/');
      const extra = c.secondary.length ? ` (+${c.secondary.map((m) => MUSCLE_LABELS[m]).join('/')})` : '';
      return `${c.ref} | ${c.name} | ${muscles}${extra} | ${c.equipment ?? 'none'} | ${c.mechanic ?? '?'}${c.familiar ? ' | done before' : ''}`;
    })
    .join('\n');
  const ask =
    split.id === 'coach'
      ? `Pick ${ctx.count} exercises for whichever muscles are most rested, and say which you chose to train in "why".`
      : `Pick ${ctx.count} exercises for a ${split.label} session (${split.hint}).`;
  const equip = EQUIPMENT.find((e) => e.id === ctx.equipment)?.label ?? 'Full gym';
  const injuries = ctx.injuries.length ? `\nPain or injuries (user-reported):\n${ctx.injuries.map((i) => `- ${i}`).join('\n')}\n` : '';
  return `${ask}\nEquipment: ${equip}.\n\nRecent load:\n${load}\n${injuries}\nExercises to choose from:\n${list}`;
}

export type ParsedPick = { picks: Pick[]; why: string | null; dropped: number };

/**
 * The model's reply, checked against the list it was sent. Unknown refs and
 * repeats are dropped and counted, never guessed at; sets and reps are held
 * to sane ranges. Returns null when there is no usable JSON at all.
 */
export function parsePick(text: string, candidates: readonly Candidate[], count: number): ParsedPick | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = (data as { exercises?: unknown }).exercises;
  if (!Array.isArray(raw)) return null;
  const byRef = new Map(candidates.map((c) => [c.ref.toLowerCase(), c]));
  const taken = new Set<string>();
  const picks: Pick[] = [];
  let dropped = 0;
  for (const item of raw) {
    const ref = String((item as { ref?: unknown })?.ref ?? '').trim().toLowerCase();
    const c = byRef.get(ref);
    if (!c || taken.has(c.id) || picks.length >= count) {
      dropped++;
      continue;
    }
    taken.add(c.id);
    const dose = defaultDose(c);
    const num = (v: unknown, lo: number, hi: number, fallback: number) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
    };
    picks.push({
      exerciseId: c.id,
      name: c.name,
      sets: num((item as { sets?: unknown }).sets, 1, 6, dose.sets),
      reps: num((item as { reps?: unknown }).reps, 1, 30, dose.reps),
    });
  }
  const whyRaw = (data as { why?: unknown }).why;
  const why = typeof whyRaw === 'string' && whyRaw.trim() ? whyRaw.trim().slice(0, 400) : null;
  return { picks, why, dropped };
}

/** Fills a short model answer up to `count` from the offline pick, keeping the model's choices first. */
export function topUp(picks: Pick[], fallback: readonly Pick[], count: number): Pick[] {
  const out = [...picks];
  const taken = new Set(out.map((p) => p.exerciseId));
  for (const p of fallback) {
    if (out.length >= count) break;
    if (!taken.has(p.exerciseId)) {
      taken.add(p.exerciseId);
      out.push(p);
    }
  }
  return out;
}

/**
 * The newest general Gemini Flash model in a catalogue, for when the app's
 * default model has been retired. Google renames models often; asking which
 * ones exist beats a hardcoded name going stale. Skips image, audio, live and
 * experimental variants, and "lite" when a full Flash is on offer.
 */
export function newestGeminiFlash(models: readonly { name: string; methods: readonly string[] }[]): string | null {
  const version = (id: string) => (id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0').split('.').map(Number);
  const usable = models
    .map((m) => ({ id: m.name.replace(/^models\//, ''), methods: m.methods }))
    .filter(
      (m) =>
        /^gemini-\d/.test(m.id) &&
        m.id.includes('flash') &&
        m.methods.includes('generateContent') &&
        !/image|audio|tts|live|exp|thinking|embedding/.test(m.id)
    );
  if (usable.length === 0) return null;
  const rank = (id: string) => {
    const [maj = 0, min = 0] = version(id);
    return maj * 100 + min * 10 + (id.includes('lite') ? 0 : 5) + (id.includes('preview') ? 0 : 1);
  };
  return usable.sort((a, b) => rank(b.id) - rank(a.id) || a.id.localeCompare(b.id))[0].id;
}
