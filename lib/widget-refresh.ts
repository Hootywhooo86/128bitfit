/**
 * "Something the home-screen widgets show just changed."
 *
 * The database layer calls widgetsChanged() after a write; the Android entry
 * point (index.ts) registers what that actually does. Kept free of React
 * Native and of the widget library, so the database code — and its tests —
 * can call it anywhere without knowing widgets exist.
 *
 * Debounced: finishing a set writes several rows, and logging food can touch
 * water too. One redraw a moment later covers all of it, and nothing here ever
 * holds up the write that triggered it — the set is saved before any of this.
 */
let refresher: (() => Promise<void> | void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 800;

export function setWidgetRefresher(fn: (() => Promise<void> | void) | null): void {
  refresher = fn;
}

export function widgetsChanged(): void {
  if (!refresher) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      void Promise.resolve(refresher?.()).catch(() => undefined);
    } catch {
      // A widget that fails to redraw keeps its last picture; the app is unaffected.
    }
  }, DEBOUNCE_MS);
}
