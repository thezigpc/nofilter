import { useEffect, useRef, useState } from "react";
import { MAX_CARD_MODE_SUBMISSIONS } from "@tabletop-judge/shared";

// Ported from docs/mockups/table-layouts.html's computeFit/fillGrid - box
// geometry (column/row count, card width/height, scrolling fallback) AND
// font sizing, both container-driven. The whole point of the dynamic grid
// is that fewer submissions render bigger AND easier to read - text has to
// scale with the achieved card size, not just the box around it, or bigger
// cards just become empty space around unchanged-size text.
const MIN_CARD_W = 100;
const MIN_CARD_H = 90;
const GAP = 10;
const MAX_CARD_ASPECT = 1.3;
// Card Mode: portrait proportions close to a standard poker-size playing card (2.5:3.5),
// instead of capping how much WIDER than tall a card can get. Validated in
// an interactive mockup against the same computeFit search below -
// swapping just this constant was enough, the fitting search already picks
// more/narrower columns on its own once tall boxes score better on area
// than wide ones do.
const CARD_MODE_ASPECT = 0.68;

interface Fit {
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
  capped: boolean;
}

function computeFit(containerW: number, containerH: number, n: number, maxCardW: number, maxCardH: number): Fit {
  if (n <= 0) return { cols: 1, rows: 1, cardW: containerW, cardH: containerH, capped: false };
  let best: (Fit & { area: number }) | null = null;
  const maxCols = Math.max(1, Math.min(n, 8));
  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.ceil(n / cols);
    const rawW = (containerW - GAP * (cols - 1)) / cols;
    const rawH = (containerH - GAP * (rows - 1)) / rows;
    if (rawW <= 0 || rawH <= 0) continue;
    const cardW = Math.min(rawW, maxCardW);
    const cardH = Math.min(rawH, maxCardH);
    const area = cardW * cardH;
    // >=, not > : once cards are big enough to hit both the width and
    // height caps at once, adding more columns keeps the exact same
    // per-card area (still capped) for a stretch of cols values - a plain
    // `>` keeps whichever came first in the 1..maxCols loop, i.e. the
    // FEWEST columns, leaving the rest of the row visibly empty even
    // though a wider column count is equally valid and fills the space.
    // `>=` walks that whole tied plateau and keeps the last (most-columns)
    // one instead, so cards spread across the full row before wrapping.
    if (!best || area >= best.area) best = { cols, rows, cardW, cardH, area, capped: false };
  }
  if (!best) {
    best = {
      cols: 1,
      rows: n,
      cardW: Math.min(containerW, maxCardW),
      cardH: Math.min(containerH / n, maxCardH),
      area: 0,
      capped: false,
    };
  }
  best.capped =
    best.cardW * best.cols + GAP * (best.cols - 1) < containerW - 1 ||
    best.cardH * best.rows + GAP * (best.rows - 1) < containerH - 1;
  return best;
}

/** Card font size scales with the actual card size achieved, not just item
 * count - a fixed small font would waste the extra room a low-count round
 * earns itself. Accounts for fixed per-card padding/gap overhead (roughly
 * 1.4rem padding + a gap per extra line) so the estimate isn't just
 * dividing raw height by line count. Ported verbatim from the mockup. */
function computeFontPx(cardW: number, cardH: number, pickCount: number): number {
  const overheadPx = 22 + (pickCount - 1) * 8;
  const perLinePx = Math.max(10, (cardH - overheadPx) / pickCount);
  return Math.max(10, Math.min(26, Math.min(cardW / 9, perLinePx / 1.7)));
}

export interface FillGridResult {
  containerRef: React.RefObject<HTMLDivElement>;
  /** Apply as the outer wrapper's className. */
  wrapperClassName: string;
  /** Apply as the inner .judging-grid's inline style. */
  gridStyle: React.CSSProperties;
  /** Feeds --fill-card-h so .flip-card can actually fill its grid cell. */
  cardHeightPx: number;
  /** Replaces JudgingBoard's per-card fitFontSize() while fill-sized - text
   * needs to scale with the achieved card box, not just content length. */
  fontSizePx: number;
  /** Whether Card Mode is actually shaping this render - false either
   * because the room has it off, or because itemCount pushed past
   * MAX_CARD_MODE_SUBMISSIONS and it's being held off automatically. */
  cardModeActive: boolean;
}

/** Dynamic space-filling grid sizing for the Shared Screen's judging grid -
 * fewer submissions render bigger (up to maxCardSize), more shrink to fit,
 * never past a legibility floor (falls back to a scrolling grid instead).
 * cardMode swaps in taller, portrait-proportioned cards (CARD_MODE_ASPECT)
 * instead of the default squarish-to-wide cap - automatically held off
 * above MAX_CARD_MODE_SUBMISSIONS regardless of the room's own setting,
 * since portrait cards lose their whole point once there's no room to show
 * them at real card proportions. */
export function useFillGrid(itemCount: number, pickCount: number, maxCardSize: number | null, cardMode: boolean): FillGridResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<Omit<FillGridResult, "containerRef">>({
    wrapperClassName: "fill-grid",
    gridStyle: {},
    cardHeightPx: 130,
    fontSizePx: 16,
    cardModeActive: false,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function recompute() {
      if (!el) return;
      // clientWidth/clientHeight, not getBoundingClientRect() - the latter
      // returns the RENDERED (zoom-scaled) size, while maxCardSize is a
      // fixed, zoom-invariant CSS-pixel value. Mixing the two meant any
      // page zoom other than ~1 (the Template Editor's default 1.35x, or
      // production's own auto-fit whenever it settles meaningfully away
      // from 1) fed a scaled container size into a cap that never adjusted
      // for it, producing a completely different column/row layout at the
      // same effective content. Confirmed empirically: at zoom 1.35,
      // getBoundingClientRect() reported ~35% more width than clientWidth
      // for the identical element - clientWidth is zoom-invariant, the
      // same units maxCardSize is already in.
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) return;
      const cardModeActive = cardMode && itemCount <= MAX_CARD_MODE_SUBMISSIONS;
      const aspect = cardModeActive ? CARD_MODE_ASPECT : MAX_CARD_ASPECT;
      const maxW = maxCardSize ?? Infinity;
      const maxH = maxCardSize != null ? maxCardSize / aspect : Infinity;
      const fit = computeFit(width, height, itemCount, maxW, maxH);
      const minCardHForPick = MIN_CARD_H + (pickCount - 1) * 34;
      const scrolling = fit.cardW < MIN_CARD_W || fit.cardH < minCardHForPick;

      if (scrolling) {
        setResult({
          wrapperClassName: "fill-grid scrolling",
          gridStyle: {
            width: "100%",
            gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_CARD_W}px, 1fr))`,
            gridAutoRows: `minmax(${minCardHForPick}px, auto)`,
          },
          cardHeightPx: minCardHForPick,
          fontSizePx: computeFontPx(MIN_CARD_W, minCardHForPick, pickCount),
          cardModeActive,
        });
      } else if (fit.capped) {
        setResult({
          wrapperClassName: "fill-grid",
          gridStyle: {
            width: fit.cols * fit.cardW + GAP * (fit.cols - 1),
            height: fit.rows * fit.cardH + GAP * (fit.rows - 1),
            gridTemplateColumns: `repeat(${fit.cols}, 1fr)`,
            gridTemplateRows: `repeat(${fit.rows}, 1fr)`,
          },
          cardHeightPx: fit.cardH,
          fontSizePx: computeFontPx(fit.cardW, fit.cardH, pickCount),
          cardModeActive,
        });
      } else {
        setResult({
          wrapperClassName: "fill-grid",
          gridStyle: {
            width: "100%",
            height: "100%",
            gridTemplateColumns: `repeat(${fit.cols}, 1fr)`,
            gridTemplateRows: `repeat(${fit.rows}, 1fr)`,
          },
          cardHeightPx: fit.cardH,
          fontSizePx: computeFontPx(fit.cardW, fit.cardH, pickCount),
          cardModeActive,
        });
      }
    }

    recompute();
    // One rAF-delayed follow-up in case the container's first-paint size
    // isn't settled yet on mount - ResizeObserver alone only fires on a
    // subsequent change, not the initial measurement.
    const raf = requestAnimationFrame(recompute);
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [itemCount, pickCount, maxCardSize, cardMode]);

  return { containerRef, ...result };
}
