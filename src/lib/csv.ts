// ============================================================
// CSV export helpers, shared by the send reports.
//
// Extracted from /broadcasts/[id]/page.tsx when the API campaign report
// needed the same "Export CSV" button. Two copies of quoting rules is
// how one of them ends up subtly wrong on the first field containing a
// comma.
// ============================================================

/**
 * RFC 4180 quoting. Every field is quoted rather than only the ones that
 * need it — a lone unquoted field containing a comma, a newline or a
 * quote is the whole class of bug this avoids, and spreadsheets read the
 * fully quoted form identically.
 */
export function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Filesystem-safe slug for a user-supplied campaign name. */
export function csvSlug(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
}
