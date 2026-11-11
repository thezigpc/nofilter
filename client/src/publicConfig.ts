import {
  BACKGROUND_STYLES,
  DEFAULT_GAME_NAME,
  DEFAULT_ROLE_NAMES,
  normalizeRoleNames,
  type RoleNames,
  DEFAULT_TABLE_STYLE,
  TABLE_THEME_LABELS,
  type BackgroundStyle,
  type TableTheme,
} from "@tabletop-judge/shared";
import { serverUrl, socket } from "./socket.js";

export { DEFAULT_GAME_NAME };

export interface PublicConfig {
  gameName: string;
  /** What new rooms call the Judge and the Wild Card bot. */
  defaultRoleNames: RoleNames;
  /** True while this server still has no admin password - see the
   * HomePage's setup warning and server/src/admin/auth.ts. */
  setupNeeded: boolean;
  /** What HomePage, Card Management, the admin page, and a brand new room
   * render/start with - see server/src/tableStyle/store.ts. Those pages
   * have no room of their own to inherit a look from. */
  defaultTheme: TableTheme;
  defaultAccentIndex: number;
  defaultBackgroundStyle: BackgroundStyle;
  defaultBackgroundAnimated: boolean;
  defaultMobileBackgroundEnabled: boolean;
  defaultFacedownOpacity: number;
}

const FALLBACK: PublicConfig = {
  gameName: DEFAULT_GAME_NAME,
  defaultRoleNames: DEFAULT_ROLE_NAMES,
  setupNeeded: false,
  defaultTheme: DEFAULT_TABLE_STYLE.theme,
  defaultAccentIndex: DEFAULT_TABLE_STYLE.accentIndex,
  defaultBackgroundStyle: DEFAULT_TABLE_STYLE.backgroundStyle,
  defaultBackgroundAnimated: DEFAULT_TABLE_STYLE.backgroundAnimated,
  defaultMobileBackgroundEnabled: DEFAULT_TABLE_STYLE.mobileBackgroundEnabled,
  defaultFacedownOpacity: DEFAULT_TABLE_STYLE.facedownOpacity,
};

/** A plain HTTP GET, not a socket event - the browser tab title and the
 * HomePage heading need this before any socket connection exists (or, on
 * most pages, ever needs to). Falls back to safe defaults on any failure
 * so a slow/offline first load never shows a blank title, and never
 * shows a spurious "no password set" warning it can't actually confirm. */
export async function fetchPublicConfig(): Promise<PublicConfig> {
  try {
    const res = await fetch(`${serverUrl}/api/config`);
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as {
      gameName?: unknown;
      defaultRoleNames?: unknown;
      setupNeeded?: unknown;
      defaultTheme?: unknown;
      defaultAccentIndex?: unknown;
      defaultBackgroundStyle?: unknown;
      defaultBackgroundAnimated?: unknown;
      defaultMobileBackgroundEnabled?: unknown;
      defaultFacedownOpacity?: unknown;
    };
    return {
      gameName: typeof data.gameName === "string" && data.gameName ? data.gameName : DEFAULT_GAME_NAME,
      defaultRoleNames: normalizeRoleNames(data.defaultRoleNames),
      setupNeeded: data.setupNeeded === true,
      defaultTheme:
        typeof data.defaultTheme === "string" && data.defaultTheme in TABLE_THEME_LABELS
          ? (data.defaultTheme as TableTheme)
          : FALLBACK.defaultTheme,
      defaultAccentIndex: typeof data.defaultAccentIndex === "number" ? data.defaultAccentIndex : FALLBACK.defaultAccentIndex,
      defaultBackgroundStyle:
        typeof data.defaultBackgroundStyle === "string" && BACKGROUND_STYLES.includes(data.defaultBackgroundStyle as BackgroundStyle)
          ? (data.defaultBackgroundStyle as BackgroundStyle)
          : FALLBACK.defaultBackgroundStyle,
      defaultBackgroundAnimated:
        typeof data.defaultBackgroundAnimated === "boolean" ? data.defaultBackgroundAnimated : FALLBACK.defaultBackgroundAnimated,
      defaultMobileBackgroundEnabled:
        typeof data.defaultMobileBackgroundEnabled === "boolean"
          ? data.defaultMobileBackgroundEnabled
          : FALLBACK.defaultMobileBackgroundEnabled,
      defaultFacedownOpacity:
        typeof data.defaultFacedownOpacity === "number" ? data.defaultFacedownOpacity : FALLBACK.defaultFacedownOpacity,
    };
  } catch {
    return FALLBACK;
  }
}

export async function fetchGameName(): Promise<string> {
  return (await fetchPublicConfig()).gameName;
}

/** Admin-only write, via the same login/token pool as Custom Cards/Core
 * Set - see server/src/admin/auth.ts. */
export function setGameName(name: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  return new Promise((resolve) => socket.emit("setGameName", { name }, resolve));
}

export function setDefaultTheme(next: {
  theme: TableTheme;
  accentIndex: number;
  backgroundStyle: BackgroundStyle;
  backgroundAnimated: boolean;
  mobileBackgroundEnabled: boolean;
  facedownOpacity: number;
}): Promise<{
  ok: boolean;
  error?: string;
  theme?: TableTheme;
  accentIndex?: number;
  backgroundStyle?: BackgroundStyle;
  backgroundAnimated?: boolean;
  mobileBackgroundEnabled?: boolean;
  facedownOpacity?: number;
}> {
  return new Promise((resolve) => socket.emit("setDefaultTheme", next, resolve));
}

/** Admin-only - the Judge/Wild Card names every new room starts with. */
export function setDefaultRoleNames(roleNames: RoleNames): Promise<{ ok: boolean; error?: string; roleNames?: RoleNames }> {
  return new Promise((resolve) => socket.emit("setDefaultRoleNames", { roleNames }, resolve));
}
