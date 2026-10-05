import { eq } from 'drizzle-orm';
import { db } from './client';
import { settings } from './schema';

/**
 * The key-value settings table, read and written one key at a time.
 *
 * Its own module so food-queries and settings-queries can both use it without
 * importing each other.
 */
export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}
