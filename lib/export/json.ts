/**
 * The JSON export envelope.
 *
 * Kept free of filesystem and database imports so the shape can be verified
 * without a device.
 */
import type { ExportTable } from './collect';

/**
 * 2: custom_foods, food_logs.custom_name and session_exercises.superset_group
 * added, so a restore loses nothing.
 * 3: sets.distance_m and the weight x reps / weight x distance `track` on
 * routine and session exercises. Older files still restore.
 */
export const EXPORT_FORMAT_VERSION = 3;

export type ExportEnvelope = {
  format: '128bitfit-export';
  formatVersion: number;
  exportedAt: string;
  excluded: Record<string, string>;
  tables: Record<string, Record<string, unknown>[]>;
  /**
   * A full backup only: the app's photos, keyed by their path under the app's
   * document folder, as base64. Plain exports leave the pictures out.
   */
  files?: Record<string, string>;
  /** A full backup only: the document folder the photo paths started with. */
  documentDir?: string;
};

/** Tables the export leaves out, and the reason, stated in the file itself. */
export const EXCLUDED: Record<string, string> = {
  exercises: 'bundled public-domain reference data (exercises you made are in custom_exercises)',
  foods: 'bundled public-domain reference data (foods and recipes you made are in custom_foods)',
  off_food_cache: 'reconstructible Open Food Facts cache (ODbL)',
  meta: 'internal import bookkeeping',
};

export function buildEnvelope(tables: ExportTable[], exportedAt: Date): ExportEnvelope {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of tables) {
    data[t.name] = t.rows.map((row) => {
      // Project through the declared columns: this fixes key order and drops
      // the scratch keys the collector uses while resolving names.
      const out: Record<string, unknown> = {};
      for (const col of t.columns) {
        const v = row[col];
        if (v instanceof Date) {
          out[col] = Number.isNaN(v.getTime()) ? null : v.toISOString();
        } else {
          out[col] = v ?? null;
        }
      }
      return out;
    });
  }
  return {
    format: '128bitfit-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    excluded: EXCLUDED,
    tables: data,
  };
}
