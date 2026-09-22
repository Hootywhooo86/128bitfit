/**
 * Birthday formatting for the date picker.
 *
 * Pure, because the two things that go wrong here are both off-device bugs:
 * building the ISO string via toISOString (which converts to UTC and can land
 * on the wrong day for anyone west of Greenwich), and letting a picker return
 * a date that makes no sense for an age.
 */

/** `YYYY-MM-DD` in the *local* calendar. Never toISOString — see lib/health/dates. */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parses `YYYY-MM-DD` as a local date, or null. */
export function fromIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Rejects 2026-02-31, which the Date constructor would roll into March.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Oldest birthday the picker offers: 120 years is past any real user. */
export function minBirthday(now: Date = new Date()): Date {
  return new Date(now.getFullYear() - 120, now.getMonth(), now.getDate());
}

/**
 * Youngest birthday the picker offers. 13 is the floor the app's own terms
 * assume, and a future birthday is not a birthday.
 */
export function maxBirthday(now: Date = new Date()): Date {
  return new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
}

/** Readable form for the button. Falls back to a prompt when unset. */
export function formatBirthday(iso: string | null | undefined): string {
  const d = fromIsoDate(iso);
  if (!d) return 'Choose date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
