/**
 * The JSON export envelope.
 *
 * Kept free of filesystem and database imports so the shape can be verified
 * without a device.
 */
import type { ExportTable } from './collect';

export type ExportEnvelope = {
  format: '128bitfit-export';
  formatVersion: number;
  exportedAt: string;
  excluded: Record<string, string>;
  tables: Record<string, Record<string, unknown>[]>;
};

/** Tables the export leaves out, and the reason, stated in the file itself. */
export const EXCLUDED: Record<string, string> = {
  exercises: 'bundled public-domain reference data',
  foods: 'bundled public-domain reference data',
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
    formatVersion: 1,
    exportedAt: exportedAt.toISOString(),
    excluded: EXCLUDED,
    tables: data,
  };
}
