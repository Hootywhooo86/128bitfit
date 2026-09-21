/**
 * CSV serialization for data export.
 *
 * Pure and dependency-free so it can be reasoned about (and tested) without a
 * device or a database.
 */

/** Values a cell can hold. Dates become ISO strings; null/undefined become empty. */
export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvRow = Record<string, CsvValue>;

/**
 * Characters that make a spreadsheet treat a cell as a formula. A note or a
 * coach message starting with one of these would execute on open in Excel or
 * Sheets, including for whoever the export gets forwarded to.
 *
 * Only *text* cells are guarded. Numbers are serialized from real numeric
 * values, so a legitimate negative number never reaches this check and is not
 * mangled into a quoted string.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeText(value: string): string {
  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
  // Quote when the value could otherwise break the row: separators, quotes,
  // newlines, or edge whitespace a parser would trim.
  const needsQuotes = /[",\n\r]/.test(guarded) || guarded !== guarded.trim();
  if (!needsQuotes) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function serializeCell(value: CsvValue): string {
  if (value == null) return '';
  if (value instanceof Date) {
    // Invalid dates stringify to "Invalid Date"; emit empty rather than that.
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return escapeText(value);
}

/**
 * Rows to a CSV document. Columns come from `columns` when given, otherwise
 * from the union of keys across all rows, so a field that is null in the first
 * row still gets a column.
 */
export function toCsv(rows: CsvRow[], columns?: string[]): string {
  const cols =
    columns ??
    Array.from(
      rows.reduce<Set<string>>((acc, row) => {
        Object.keys(row).forEach((k) => acc.add(k));
        return acc;
      }, new Set())
    );

  // A header alone is meaningful: it says "this table is empty", which is not
  // the same as a missing file.
  const lines = [cols.map((c) => escapeText(c)).join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => serializeCell(row[c])).join(','));
  }
  // Trailing newline: POSIX text convention, and some parsers drop the last row without it.
  return lines.join('\n') + '\n';
}
