import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = '128bitfit.db';

const expo = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

export const db = drizzle(expo, { schema });
export const sqlite = expo;
