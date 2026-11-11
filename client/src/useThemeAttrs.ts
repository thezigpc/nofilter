import { TABLE_THEME_ACCENTS, type TableTheme } from "@tabletop-judge/shared";
import type React from "react";

/**
 * Props to spread onto a page's root element so it picks up the Felt & Ink
 * / Bulletin token system (color, corner radius, button shape, display
 * font - see index.css's `.page[data-table-theme]` blocks) exactly the way
 * RoomPage already does for an in-room view. Used by the pages that have no
 * room of their own to inherit a theme from (HomePage, Card Management,
 * the admin page) - they render with the server's admin-chosen default
 * instead (see publicConfig.ts's fetchPublicConfig()).
 */
export function themeAttrs(theme: TableTheme, accentIndex: number): { "data-table-theme": TableTheme; style: React.CSSProperties } {
  const accent = TABLE_THEME_ACCENTS[theme][accentIndex]?.color;
  return {
    "data-table-theme": theme,
    style: (accent ? { "--accent": accent } : {}) as React.CSSProperties,
  };
}
