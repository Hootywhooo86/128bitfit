/**
 * Reading a product name off a photo of the front of a package.
 *
 * OCR hands back a flat block of text with no idea which line is the product
 * name — the brand, the weight, a slogan and the barcode digits all arrive the
 * same way. This picks the most plausible line.
 *
 * It is a guess and the UI treats it as one: it pre-fills an editable field and
 * says where it came from. That is the difference between this and the
 * forbidden kind of invention — a name the user reads and corrects before
 * saving is not a measurement presented as fact. Nothing here ever touches a
 * number; the nutrition figures come from the panel, parsed separately.
 *
 * When nothing looks like a name it returns null rather than the least bad
 * line. An empty field the user fills in beats a wrong one they have to notice.
 *
 * Pure: text in, a name or null out.
 */

/**
 * Lines that are never a product name.
 *
 * Front-of-pack text is mostly this: legal marks, weights, marketing, and the
 * start of the ingredient list.
 */
const NOT_A_NAME = [
  /^ingredients?\b/i,
  /^nutrition/i,
  /^distributed\b/i,
  /^manufactured\b/i,
  /^packed\b/i,
  /^produce of\b/i,
  /^product of\b/i,
  /^made in\b/i,
  /^best (before|by)\b/i,
  /^use by\b/i,
  /^exp\b/i,
  /^net (wt|weight)\b/i,
  /^keep refrigerated/i,
  /^store in\b/i,
  /^contains\b/i,
  /^may contain\b/i,
  /^allergen/i,
  /^serving/i,
  /^www\./i,
  /^https?:/i,
  /^\d+$/,
  // A weight or volume on its own: "500g", "1.5 L", "12 fl oz".
  /^[\d.,\s]*(g|kg|mg|ml|l|oz|lb|lbs|fl\s?oz)\b\.?$/i,
];

/**
 * Pack descriptors and marketing lines.
 *
 * These are the trap: "Family Size" and "Value Pack" are exactly as name-shaped
 * as "Corn Flakes" — two words, all letters, near the top — so no amount of
 * scoring separates them. They have to be named.
 */
const MARKETING = [
  /^(new|now|free)\b.{0,12}$/i,
  /\b(family|value|share|party|fun|jumbo|king|snack|travel|mini|bonus|club)\s+(size|pack|packs)\b/i,
  /^(family|value|share|party|jumbo|king|economy)\s+size$/i,
  /^(twin|multi|variety|value|bulk)\s?-?\s?pack$/i,
  /^limited edition$/i,
  /^original$/i,
  /^\d+\s*(pack|ct|count)$/i,
  /^resealable$/i,
  /^microwaveable$/i,
  /^gluten[\s-]?free$/i,
  /^(fat|sugar|carb|calorie)[\s-]?free$/i,
  /^no added (sugar|salt)$/i,
  /^high in protein$/i,
  /^source of \w+$/i,
];

/** Characters a product name is made of. Mostly letters, some punctuation. */
const letterRatio = (line: string): number => {
  const letters = (line.match(/[a-z]/gi) ?? []).length;
  return line.length === 0 ? 0 : letters / line.length;
};

function plausible(line: string): boolean {
  if (line.length < 3 || line.length > 40) return false;
  // Over 40 characters is an ingredient list or a legal paragraph, not a name.
  if (NOT_A_NAME.some((re) => re.test(line))) return false;
  if (MARKETING.some((re) => re.test(line))) return false;
  // "1 2 500 g" and barcode digits are mostly not letters.
  if (letterRatio(line) < 0.6) return false;
  // A single letter surrounded by punctuation is OCR noise.
  if (!/[a-z]{3}/i.test(line)) return false;
  return true;
}

/**
 * Scores a candidate. Higher is more name-like.
 *
 * Front-of-pack design puts the product name large and near the top, and OCR
 * reads roughly top to bottom — so earlier lines win, gently, rather than
 * absolutely, because a brand mark is usually above the name.
 */
function score(line: string, index: number): number {
  let n = 100 - index * 6;
  // A name is usually two or three words. One word is often the brand alone;
  // six is a slogan.
  const words = line.split(/\s+/).filter(Boolean).length;
  if (words >= 2 && words <= 5) n += 12;
  if (words === 1) n -= 8;
  if (words > 6) n -= 15;
  // ALL CAPS is common on packs, so it is not penalised — but a line that is
  // mostly caps *and* long reads like a legal notice.
  if (line.length > 28 && line === line.toUpperCase()) n -= 10;
  return n;
}

export function guessProductName(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    // Strip trailing marks OCR picks up from the artwork.
    .map((l) => l.replace(/[®™©]/g, '').trim())
    .filter(Boolean);

  let best: { line: string; n: number } | null = null;
  lines.forEach((line, i) => {
    if (!plausible(line)) return;
    const n = score(line, i);
    if (!best || n > best.n) best = { line, n };
  });

  return best ? (best as { line: string }).line : null;
}
