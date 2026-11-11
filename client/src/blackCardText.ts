// Card data marks a blank with a single "_" (see CLAUDE.md). That's easy to
// miss as a blank at a glance, especially blown up large on a Table screen
// or at small sizes on a phone - lengthen it for display without touching
// the underlying text.
export function formatBlackCardText(text: string): string {
  return text.replace(/_+/g, "_____");
}

// A long prompt at the fixed blackCardScale formula alone just wraps onto
// more lines and pushes the rest of a phone's hand below the fold - this
// multiplier (applied via --black-card-length-scale, see index.css) shrinks
// the font as text length grows so a phone screen keeps showing the whole
// hand without scrolling. Tiered rather than measure-and-shrink (like the
// judging grid's per-card sizing) since this only ever needs to react to
// one known string per round, not a live DOM box.
export function blackCardLengthScale(text: string): number {
  const len = text.length;
  if (len < 60) return 1;
  if (len < 100) return 0.88;
  if (len < 150) return 0.76;
  if (len < 220) return 0.65;
  return 0.56;
}
