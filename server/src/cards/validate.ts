import { MIN_HAND_SIZE } from "@tabletop-judge/shared";

const MAX_TEXT_LENGTH = 300;

/**
 * Upper bound on a black card's pick, capped at the smallest hand a room
 * can legally be configured with. Above that, a player in a minimum-size
 * room could not physically submit the required number of cards and the
 * round would stall forever - so this is a playability guarantee, not a
 * stylistic limit.
 *
 * Deliberately *not* 3, even though the card-authoring UIs only offer
 * 1-3: real card sets contain pick-4 cards (7 of them in the corpus this
 * project was built against, each with 4 genuine blanks), and clamping
 * those to 3 silently asked for 3 cards to fill 4 blanks.
 */
const MAX_PICK = MIN_HAND_SIZE;

export interface RawCardLike {
  text?: unknown;
  pick?: unknown;
}

export interface RepairReport {
  emptyDropped: number;
  pickCorrected: number;
  textTruncated: number;
}

export function countBlanks(text: string): number {
  return (text.match(/_/g) ?? []).length;
}

/**
 * The blank count in a black card's text is ground truth for how many white
 * cards it should collect - not whatever `pick` value happened to travel
 * with the raw data. This is exactly the class of bug a real uploaded card
 * was found with: a pick-3 card mislabeled as pick-1 in its source file
 * (CLAUDE.md's "hercules" note). Zero-blank "open question" cards (e.g. "Why
 * did the chicken cross the road?") have no blank to check against, so a
 * supplied pick is trusted there instead, clamped to sane bounds and
 * defaulting to 1.
 */
export function resolvePick(text: string, suppliedPick: unknown): number {
  const blanks = countBlanks(text);
  if (blanks > 0) return Math.min(MAX_PICK, Math.max(1, blanks));
  const supplied = typeof suppliedPick === "number" && Number.isFinite(suppliedPick) ? Math.floor(suppliedPick) : 1;
  return Math.min(MAX_PICK, Math.max(1, supplied || 1));
}

export function cleanCardText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Validates and repairs a raw `{ white, black }` card upload - the shape
 * used throughout this codebase for Custom Cards, Custom Sets, and the Core
 * Set. One shared pass so a fix made here (like the pick/blank-count repair
 * above) applies everywhere a human can type or upload cards, instead of
 * being re-implemented per upload path and drifting out of sync.
 */
export function validateAndRepairCards(input: { white?: RawCardLike[]; black?: RawCardLike[] }): {
  white: { text: string }[];
  black: { text: string; pick: number }[];
  report: RepairReport;
} {
  const report: RepairReport = { emptyDropped: 0, pickCorrected: 0, textTruncated: 0 };

  const white: { text: string }[] = [];
  for (const raw of input.white ?? []) {
    const original = typeof raw?.text === "string" ? raw.text : "";
    const text = cleanCardText(raw?.text);
    if (!text) {
      report.emptyDropped++;
      continue;
    }
    if (original.length > MAX_TEXT_LENGTH) report.textTruncated++;
    white.push({ text });
  }

  const black: { text: string; pick: number }[] = [];
  for (const raw of input.black ?? []) {
    const original = typeof raw?.text === "string" ? raw.text : "";
    const text = cleanCardText(raw?.text);
    if (!text) {
      report.emptyDropped++;
      continue;
    }
    if (original.length > MAX_TEXT_LENGTH) report.textTruncated++;
    const pick = resolvePick(text, raw?.pick);
    const suppliedPick = typeof raw?.pick === "number" ? Math.floor(raw.pick) : undefined;
    if (suppliedPick !== pick) report.pickCorrected++;
    black.push({ text, pick });
  }

  return { white, black, report };
}
