/**
 * Identifying a piece of gym equipment from a photo.
 *
 * The model says what the machine is, which muscles it works, and how to use
 * it. Everything it returns is an estimate and lands on an editable form — a
 * model looking at an unfamiliar machine can be confidently wrong, and a
 * wrongly-tagged exercise would colour the muscle map with training that never
 * happened.
 *
 * The muscle mapping is the part that matters most. The app owns a closed list
 * of 17 groups and the map has artwork for exactly those; a model will happily
 * answer "pectoralis major" or "rear delts". Anything that cannot be mapped is
 * dropped and reported, never invented into the list.
 *
 * Pure: prompt in, parsed exercise out.
 */
import { MUSCLE_GROUPS, type MuscleGroup } from './muscle-load';

export type IdentifiedExercise = {
  name: string;
  /** Mapped onto the app's groups. */
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  /** How to use the machine, as steps. */
  instructions: string[];
  equipment: string | null;
  /** Muscle names the model gave that this app has no group for. */
  unmapped: string[];
  /** The model's own hedge, when it gave one. */
  note: string | null;
};

export type ExerciseIdResult =
  | { status: 'ok'; exercise: IdentifiedExercise }
  | { status: 'empty'; message: string }
  | { status: 'unreadable'; message: string; raw: string };

/**
 * Names a model actually uses for each group. Matched after lowercasing, so a
 * reply of "Pectoralis Major" or "pecs" both land on `chest`.
 */
const SYNONYMS: Record<string, MuscleGroup> = {
  pecs: 'chest',
  pec: 'chest',
  'pectoral': 'chest',
  'pectorals': 'chest',
  'pectoralis': 'chest',
  'pectoralis major': 'chest',
  'pectoralis minor': 'chest',
  abs: 'abdominals',
  abdominal: 'abdominals',
  core: 'abdominals',
  'rectus abdominis': 'abdominals',
  obliques: 'abdominals',
  'external oblique': 'abdominals',
  delts: 'shoulders',
  deltoid: 'shoulders',
  deltoids: 'shoulders',
  'anterior deltoid': 'shoulders',
  'posterior deltoid': 'shoulders',
  'rear delts': 'shoulders',
  'front delts': 'shoulders',
  'lateral deltoid': 'shoulders',
  quads: 'quadriceps',
  quad: 'quadriceps',
  'quadriceps femoris': 'quadriceps',
  hams: 'hamstrings',
  hamstring: 'hamstrings',
  'biceps femoris': 'hamstrings',
  glute: 'glutes',
  'gluteus maximus': 'glutes',
  'gluteus medius': 'abductors',
  'gluteus minimus': 'abductors',
  'hip abductors': 'abductors',
  'hip adductors': 'adductors',
  'inner thigh': 'adductors',
  'latissimus dorsi': 'lats',
  lat: 'lats',
  'lattissimus': 'lats',
  trapezius: 'traps',
  trap: 'traps',
  rhomboids: 'middle back',
  'rhomboid': 'middle back',
  'mid back': 'middle back',
  'upper back': 'middle back',
  'teres major': 'middle back',
  'infraspinatus': 'middle back',
  'erector spinae': 'lower back',
  'lumbar': 'lower back',
  'spinal erectors': 'lower back',
  'bicep': 'biceps',
  'biceps brachii': 'biceps',
  'tricep': 'triceps',
  'triceps brachii': 'triceps',
  forearm: 'forearms',
  'brachioradialis': 'forearms',
  'grip': 'forearms',
  calf: 'calves',
  gastrocnemius: 'calves',
  soleus: 'calves',
  'tibialis anterior': 'calves',
  'neck extensors': 'neck',
  'cervical': 'neck',
};

const KNOWN = new Set<string>(MUSCLE_GROUPS);

/** Maps one model-supplied muscle name onto a group, or null if it cannot. */
export function toMuscleGroup(raw: string): MuscleGroup | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if (KNOWN.has(t)) return t as MuscleGroup;
  if (SYNONYMS[t]) return SYNONYMS[t];
  // "Chest (pectorals)" and the like: try the leading words.
  const head = t.split(/[(,/]/)[0].trim();
  if (head && head !== t) {
    if (KNOWN.has(head)) return head as MuscleGroup;
    if (SYNONYMS[head]) return SYNONYMS[head];
  }
  return null;
}

export const EQUIPMENT_PROMPT =
  'Identify this piece of gym equipment. Say what the exercise done on it is called, which muscles it works, and how to use it.';

export function equipmentSystemPrompt(): string {
  return `You identify gym equipment from a photo for a workout logging app.

Reply with JSON only. No prose, no markdown fence:
{"name":"Seated Cable Row","equipment":"cable machine","primaryMuscles":["lats","middle back"],"secondaryMuscles":["biceps","forearms"],"instructions":["Sit facing the stack...","Pull the handle to your waist..."],"note":null}

Rules:
- name is what the exercise is called, not a description.
- Muscle names must come from this list exactly: ${MUSCLE_GROUPS.join(', ')}.
- primaryMuscles are what the movement targets; secondaryMuscles assist. Do not
  put the same muscle in both.
- instructions are 3-6 short steps for performing it on that machine.
- If you cannot tell what the equipment is, reply {"name":"","note":"<why>"}
  rather than guessing at a machine it might be.
- Put any uncertainty about the identification in "note", one sentence.`;

}

function unfence(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) return fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) return t.slice(first, last + 1);
  return t;
}

function muscleList(v: unknown, unmapped: string[]): MuscleGroup[] {
  if (!Array.isArray(v)) return [];
  const out: MuscleGroup[] = [];
  for (const entry of v) {
    if (typeof entry !== 'string') continue;
    const g = toMuscleGroup(entry);
    if (g) {
      if (!out.includes(g)) out.push(g);
    } else if (entry.trim()) {
      unmapped.push(entry.trim());
    }
  }
  return out;
}

export function parseIdentifiedExercise(raw: string): ExerciseIdResult {
  let data: unknown;
  try {
    data = JSON.parse(unfence(raw));
  } catch {
    return {
      status: 'unreadable',
      message: 'The model did not reply with usable JSON. Try again, or fill the exercise in by hand.',
      raw,
    };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      status: 'unreadable',
      message: 'The model replied in an unexpected shape. Try again, or fill it in by hand.',
      raw,
    };
  }

  const o = data as Record<string, unknown>;
  const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : null;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) {
    return {
      status: 'empty',
      message: note ?? 'The equipment could not be identified. Try another angle, or fill it in by hand.',
    };
  }

  const unmapped: string[] = [];
  const primaryMuscles = muscleList(o.primaryMuscles, unmapped);
  // A muscle cannot be both. Primary wins, because that is the harder claim.
  const secondaryMuscles = muscleList(o.secondaryMuscles, unmapped).filter(
    (m) => !primaryMuscles.includes(m)
  );

  const instructions = Array.isArray(o.instructions)
    ? o.instructions
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 8)
    : [];

  return {
    status: 'ok',
    exercise: {
      name,
      primaryMuscles,
      secondaryMuscles,
      instructions,
      equipment: typeof o.equipment === 'string' && o.equipment.trim() ? o.equipment.trim() : null,
      unmapped: [...new Set(unmapped)],
      note,
    },
  };
}
