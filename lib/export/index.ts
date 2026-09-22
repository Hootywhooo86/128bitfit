/**
 * Data export. CLAUDE.md makes this non-negotiable: CSV and JSON, always.
 *
 * Two formats with different jobs:
 *   - JSON: one lossless file, the whole export, the re-importable one.
 *   - CSV:  one file per table, for spreadsheets. Defensively escaped, so a
 *           cell that looks like a formula is neutralised (see csv.ts).
 *
 * Everything lands in a timestamped folder under the app's document directory
 * so repeated exports never clobber each other.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { collectExport } from './collect';
import { toCsv } from './csv';
import { buildEnvelope } from './json';

export type ExportedFile = {
  name: string;
  uri: string;
  /** Bytes on disk, or null if the platform did not report a size. */
  size: number | null;
  mimeType: string;
  /** Row count for a table file; null for the combined JSON. */
  rows: number | null;
};

export type ExportResult = {
  folderName: string;
  files: ExportedFile[];
  totalRows: number;
};

/** Filesystem-safe, sorts chronologically: `export-2026-09-21-030405`. */
function folderStamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return [
    'export-',
    now.getFullYear(),
    '-',
    p(now.getMonth() + 1),
    '-',
    p(now.getDate()),
    '-',
    p(now.getHours()),
    p(now.getMinutes()),
    p(now.getSeconds()),
  ].join('');
}

/**
 * Writes a full export and returns the files produced. Throws if the directory
 * cannot be created or a file cannot be written — the caller surfaces that to
 * the user rather than reporting a success that did not happen.
 */
export async function runExport(now: Date = new Date()): Promise<ExportResult> {
  const tables = await collectExport();
  const folderName = folderStamp(now);

  const dir = new Directory(Paths.document, 'exports', folderName);
  dir.create({ intermediates: true });

  const files: ExportedFile[] = [];

  for (const table of tables) {
    const file = new File(dir, `${table.name}.csv`);
    file.create({ overwrite: true });
    file.write(toCsv(table.rows, table.columns));
    files.push({
      name: `${table.name}.csv`,
      uri: file.uri,
      size: file.size,
      mimeType: 'text/csv',
      rows: table.rows.length,
    });
  }

  const jsonFile = new File(dir, '128bitfit-export.json');
  jsonFile.create({ overwrite: true });
  jsonFile.write(JSON.stringify(buildEnvelope(tables, now), null, 2));
  files.unshift({
    name: '128bitfit-export.json',
    uri: jsonFile.uri,
    size: jsonFile.size,
    mimeType: 'application/json',
    rows: null,
  });

  return {
    folderName,
    files,
    totalRows: tables.reduce((n, t) => n + t.rows.length, 0),
  };
}

export { collectExport } from './collect';
export { buildEnvelope, EXCLUDED } from './json';
export type { ExportTable } from './collect';
