/**
 * Reads a Nutrition Facts panel out of OCR text.
 *
 * The rule this file exists to enforce: a number that could not be read stays
 * `null`. It is never inferred from another field, never rounded up from a
 * neighbour, and never defaulted to zero — a label that does not list fibre and
 * a label whose fibre line was too blurry to read are different facts, and a
 * `0` would claim the first when it might be the second.
 *
 * Everything this returns is a *reading*, not a measurement, and the caller is
 * expected to put it in front of the user for confirmation before it is saved.
 *
 * Pure: no camera, no OCR engine, no database. The OCR engine hands it text and
 * this turns text into numbers, which is the part worth testing.
 */

export type LabelField =
  | 'calories'
  | 'protein'
  | 'fat'
  | 'saturatedFat'
  | 'transFat'
  | 'cholesterol'
  | 'sodium'
  | 'carb'
  | 'fiber'
  | 'sugars'
  | 'addedSugars';

export type LabelReading = {
  /** Only the fields actually found. A missing key means "not read". */
  fields: Partial<Record<LabelField, number>>;
  servingSize: number | null;
  servingUnit: string | null;
  servingsPerContainer: number | null;
  /** Lines that looked like nutrition rows but could not be parsed. */
  unread: string[];
};

/**
 * Label rows in the order they must be matched. Order matters: "saturated fat"
 * has to win over "fat", and "added sugars" over "sugars", or the more general
 * pattern swallows the specific one.
 */
const ROWS: { field: LabelField; patterns: RegExp[] }[] = [
  { field: 'saturatedFat', patterns: [/\bsat(?:urated)?\.?\s*fat\b/i, /\bsat\.?\s*fat\b/i] },
  { field: 'transFat', patterns: [/\btrans\.?\s*fat\b/i] },
  { field: 'addedSugars', patterns: [/\bincl(?:udes)?\b.*\badded\s*sugars?\b/i, /\badded\s*sugars?\b/i] },
  { field: 'fiber', patterns: [/\b(?:dietary\s*)?fib(?:er|re)\b/i] },
  { field: 'sugars', patterns: [/\b(?:total\s*)?sugars?\b/i] },
  { field: 'cholesterol', patterns: [/\bcholest(?:erol)?\b/i] },
  { field: 'sodium', patterns: [/\bsodium\b/i, /\bsalt\b/i] },
  { field: 'carb', patterns: [/\b(?:total\s*)?carb(?:ohydrate)?s?\b/i] },
  { field: 'protein', patterns: [/\bprotein\b/i] },
  { field: 'fat', patterns: [/\b(?:total\s*)?fat\b/i] },
  { field: 'calories', patterns: [/\bcalories\b/i, /\benergy\b/i, /\bkcal\b/i] },
];

/** Fields a label states in milligrams. Stored in mg, as the app does. */
const MILLIGRAM_FIELDS = new Set<LabelField>(['sodium', 'cholesterol']);

const NUMBER = /(\d+(?:[.,]\d+)?)/;

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Pulls the amount off a nutrition row.
 *
 * Takes the first number that carries a unit (`12g`, `230mg`), because the
 * percent-daily-value column sits to the right of it and is not the amount.
 * A bare number is accepted only when the row has no unit-bearing number at
 * all, which is how the calories row reads.
 */
function amountOn(line: string, field: LabelField): number | null {
  const withUnit = [
    ...line.matchAll(new RegExp(`${NUMBER.source}\\s*(mcg|µg|ug|mg|g|kcal|cal)\\b`, 'gi')),
  ];
  for (const m of withUnit) {
    const value = toNumber(m[1]);
    if (value == null) continue;
    const unit = m[2].toLowerCase();
    if (MILLIGRAM_FIELDS.has(field)) {
      if (unit === 'g') return value * 1000;
      if (unit === 'mcg' || unit === 'µg' || unit === 'ug') return value / 1000;
      return value;
    }
    if (unit === 'mg') return value / 1000;
    if (unit === 'mcg' || unit === 'µg' || unit === 'ug') return value / 1_000_000;
    return value;
  }

  // No unit on the row. Drop a trailing percentage — that is the %DV column,
  // not the amount — then take what is left.
  const stripped = line.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ');
  const bare = stripped.match(new RegExp(`${NUMBER.source}`));
  return bare ? toNumber(bare[1]) : null;
}

/** "Serving size 2/3 cup (55g)" -> { size: 55, unit: 'g' } */
function parseServing(line: string): { size: number; unit: string } | null {
  const paren = line.match(/\((\d+(?:[.,]\d+)?)\s*([a-zµ]+)\)/i);
  if (paren) {
    const size = toNumber(paren[1]);
    if (size != null) return { size, unit: paren[2].toLowerCase() };
  }
  const plain = line.match(/serving\s*size\s*:?\s*(\d+(?:[.,]\d+)?)\s*([a-zµ]+)/i);
  if (plain) {
    const size = toNumber(plain[1]);
    if (size != null) return { size, unit: plain[2].toLowerCase() };
  }
  return null;
}

/** Rows whose value is a percentage only carry a %DV, never an amount. */
function isPercentOnly(line: string): boolean {
  return /%/.test(line) && !/\d+(?:[.,]\d+)?\s*(mcg|µg|ug|mg|g|kcal|cal)\b/i.test(line);
}

export function parseNutritionLabel(text: string): LabelReading {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fields: Partial<Record<LabelField, number>> = {};
  const unread: string[] = [];
  let servingSize: number | null = null;
  let servingUnit: string | null = null;
  let servingsPerContainer: number | null = null;

  for (const line of lines) {
    if (servingSize == null) {
      const s = parseServing(line);
      if (s) {
        servingSize = s.size;
        servingUnit = s.unit;
        continue;
      }
    }

    if (servingsPerContainer == null) {
      const per = line.match(/(?:about\s*)?(\d+(?:[.,]\d+)?)\s*servings?\s*per\s*container/i);
      if (per) {
        servingsPerContainer = toNumber(per[1]);
        continue;
      }
    }

    // An ingredient list names nutrients without stating any, so it is not a
    // row: "INGREDIENTS: OATS, SUGAR" is not a sugars reading.
    if (/\bingredients?\b/i.test(line)) continue;

    const row = ROWS.find((r) => r.patterns.some((p) => p.test(line)));
    if (!row) continue;
    // First match wins: a label states each row once, and the repeats further
    // down are the per-container column.
    if (fields[row.field] != null) continue;

    if (isPercentOnly(line) && row.field !== 'calories') {
      unread.push(line);
      continue;
    }

    const value = amountOn(line, row.field);
    if (value == null || value < 0) {
      unread.push(line);
      continue;
    }
    fields[row.field] = value;
  }

  return { fields, servingSize, servingUnit, servingsPerContainer, unread };
}

/** Human summary for the confirmation screen: what was read, what was not. */
export function describeReading(r: LabelReading): { read: number; missing: LabelField[] } {
  const all: LabelField[] = [
    'calories',
    'protein',
    'fat',
    'carb',
    'saturatedFat',
    'sugars',
    'fiber',
    'sodium',
  ];
  return {
    read: Object.keys(r.fields).length,
    missing: all.filter((f) => r.fields[f] == null),
  };
}
