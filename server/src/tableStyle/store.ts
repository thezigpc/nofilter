import {
  BACKGROUND_STYLES,
  DEFAULT_TABLE_STYLE,
  MAX_FACEDOWN_OPACITY,
  MIN_FACEDOWN_OPACITY,
  TABLE_THEME_ACCENTS,
  TABLE_THEME_LABELS,
  type BackgroundStyle,
  type TableTheme,
} from "@tabletop-judge/shared";
import { DEFAULT_THEME_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";

/**
 * The server-wide default look: what a brand new room starts with, and
 * what the pages that have no room of their own (HomePage, Card
 * Management, the admin page) render with - those have nothing to inherit
 * a theme *from*, so an admin-chosen default fills that gap. Theme/accent
 * plus the background style (flat/glow/scene, animated, mobile, face-down
 * opacity) - the "brand identity" pieces - live here; spotlight/layout/
 * card sizing stay per-room gameplay tuning, set from the Lobby like
 * today, not something a whole deployment needs one answer for.
 */
export interface DefaultTheme {
  theme: TableTheme;
  accentIndex: number;
  backgroundStyle: BackgroundStyle;
  backgroundAnimated: boolean;
  mobileBackgroundEnabled: boolean;
  facedownOpacity: number;
}

// Old stored files (and old callers) only ever had theme/accentIndex - the
// background fields are read with a DEFAULT_TABLE_STYLE fallback rather
// than rejecting the file outright, so upgrading doesn't wipe an admin's
// existing theme/accent choice.
function isDefaultTheme(parsed: unknown): parsed is Pick<DefaultTheme, "theme" | "accentIndex"> {
  const p = parsed as DefaultTheme | null;
  return !!p && !!p.theme && p.theme in TABLE_THEME_LABELS && typeof p.accentIndex === "number";
}

let current: DefaultTheme = {
  theme: DEFAULT_TABLE_STYLE.theme,
  accentIndex: DEFAULT_TABLE_STYLE.accentIndex,
  backgroundStyle: DEFAULT_TABLE_STYLE.backgroundStyle,
  backgroundAnimated: DEFAULT_TABLE_STYLE.backgroundAnimated,
  mobileBackgroundEnabled: DEFAULT_TABLE_STYLE.mobileBackgroundEnabled,
  facedownOpacity: DEFAULT_TABLE_STYLE.facedownOpacity,
};
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  const stored = await loadJsonFile(DEFAULT_THEME_PATH, isDefaultTheme);
  if (stored) {
    const s = stored as Partial<DefaultTheme>;
    current = {
      theme: stored.theme,
      accentIndex: stored.accentIndex,
      backgroundStyle: s.backgroundStyle && BACKGROUND_STYLES.includes(s.backgroundStyle) ? s.backgroundStyle : DEFAULT_TABLE_STYLE.backgroundStyle,
      backgroundAnimated: typeof s.backgroundAnimated === "boolean" ? s.backgroundAnimated : DEFAULT_TABLE_STYLE.backgroundAnimated,
      mobileBackgroundEnabled:
        typeof s.mobileBackgroundEnabled === "boolean" ? s.mobileBackgroundEnabled : DEFAULT_TABLE_STYLE.mobileBackgroundEnabled,
      facedownOpacity:
        typeof s.facedownOpacity === "number"
          ? Math.min(MAX_FACEDOWN_OPACITY, Math.max(MIN_FACEDOWN_OPACITY, s.facedownOpacity))
          : DEFAULT_TABLE_STYLE.facedownOpacity,
    };
  }
  loaded = true;
}

/** Called once at server boot, alongside initGameName/initCustomCards -
 * RoomManager reads via the cached getDefaultTheme() below synchronously
 * on every room creation, not by awaiting this repeatedly. */
export async function initDefaultTheme(): Promise<void> {
  await ensureLoaded();
}

export function getDefaultTheme(): DefaultTheme {
  return current;
}

export async function setDefaultTheme(next: {
  theme: TableTheme;
  accentIndex: number;
  backgroundStyle: BackgroundStyle;
  backgroundAnimated: boolean;
  mobileBackgroundEnabled: boolean;
  facedownOpacity: number;
}): Promise<DefaultTheme> {
  await ensureLoaded();
  const maxIndex = TABLE_THEME_ACCENTS[next.theme].length - 1;
  const clampedAccent = Number.isInteger(next.accentIndex) ? Math.min(maxIndex, Math.max(0, next.accentIndex)) : 0;
  current = {
    theme: next.theme,
    accentIndex: clampedAccent,
    backgroundStyle: BACKGROUND_STYLES.includes(next.backgroundStyle) ? next.backgroundStyle : DEFAULT_TABLE_STYLE.backgroundStyle,
    backgroundAnimated: next.backgroundAnimated,
    mobileBackgroundEnabled: next.mobileBackgroundEnabled,
    facedownOpacity: Math.min(MAX_FACEDOWN_OPACITY, Math.max(MIN_FACEDOWN_OPACITY, next.facedownOpacity)),
  };
  await saveJsonFileAtomic(DEFAULT_THEME_PATH, current);
  return current;
}
