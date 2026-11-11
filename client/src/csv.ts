/**
 * Minimal but correct CSV reader, shared by Custom Sets' import
 * (CustomCardsPage) and Core Set's (CoreSetPanel).
 *
 * Parses the whole document in one pass rather than splitting into lines
 * first: card text can legitimately contain a newline inside a quoted
 * field, and a line-based split cuts those records in half - producing a
 * truncated card plus a junk row, with no error to notice. Also handles
 * embedded commas, ""-escaped quotes, CRLF, and a leading UTF-8 BOM (Excel
 * writes one, and it would otherwise end up glued to the first header
 * cell, so `pack` wouldn't match).
 *
 * Rows that are entirely blank are dropped, matching what a trailing
 * newline at the end of a file produces.
 */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  let i = raw.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);

  return rows.filter((r) => r.some((f) => f.trim().length > 0));
}
