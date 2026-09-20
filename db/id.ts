/** Simple unique id for offline rows (no crypto dependency). */
export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return prefix ? `${prefix}_${t}${rand}` : `${t}${rand}`;
}
