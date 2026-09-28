/**
 * Moving one item up or down a list, as the new order of ids.
 *
 * Returns the whole list rather than a swap of two positions: positions in
 * the database can have gaps or ties (an exercise added mid-workout, an old
 * import), and renumbering from the new order is the only way a move is
 * guaranteed to show up where the user put it.
 *
 * Null when there is nothing to do: unknown id, or already at that end.
 */
export function moveInOrder(ids: readonly string[], id: string, by: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
