/**
 * Keep a "working" indicator up long enough to be seen.
 *
 * A pull-to-refresh on Home reads local SQLite and the phone's health store —
 * both local, both often done inside a frame. The spinner was being dismissed
 * before it ever rendered, so a pull that genuinely worked looked like a pull
 * that did nothing, and the only way to tell them apart was whether the
 * numbers happened to change.
 *
 * This does not fake work. The refresh really ran; this only stops the
 * acknowledgement being shorter than human reaction time.
 */
export const MIN_VISIBLE_MS = 500;

export async function withMinimumDuration<T>(
  work: Promise<T>,
  ms: number = MIN_VISIBLE_MS,
  wait: (ms: number) => Promise<void> = (d) => new Promise((r) => setTimeout(r, d))
): Promise<T> {
  // Both are started before either is awaited, so the floor runs alongside the
  // work rather than after it — a refresh that takes longer than the floor is
  // not delayed at all.
  const floor = wait(ms);
  try {
    return await work;
  } finally {
    await floor;
  }
}
