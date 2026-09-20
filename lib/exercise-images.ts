const EXERCISE_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

/** Build a remote URL for a free-exercise-db relative image path. */
export function exerciseImageUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  const cleaned = relativePath.replace(/^\//, '');
  return `${EXERCISE_IMAGE_BASE}/${cleaned}`;
}

export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
