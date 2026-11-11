import type { BackgroundStyle, TableLayout, TableTheme } from "@tabletop-judge/shared";

/** Shared shape/name for syncing the Template Editor's controls to a
 * popped-out full-screen preview window via BroadcastChannel — avoids
 * building the popup's document as an HTML string (the earlier design
 * mockup's approach, and the direct cause of an earlier `</script>`
 * truncation bug); the popup is a real route rendering real components. */
export const EDITOR_PREVIEW_CHANNEL = "ttj-editor-preview";

export interface EditorPreviewConfig {
  theme: TableTheme;
  accentIndex: number;
  spotlightEnabled: boolean;
  cardMode: boolean;
  backgroundStyle: BackgroundStyle;
  backgroundAnimated: boolean;
  mobileBackgroundEnabled: boolean;
  facedownOpacity: number;
  layout: TableLayout;
  maxCardSize: number | null;
  tableScale: number;
  blackCardScale: number;
  spotlightScale: number;
  scoreboardScale: number;
  players: number;
  pick: 1 | 2 | 3;
}
