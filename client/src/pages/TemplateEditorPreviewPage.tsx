import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { BackgroundStyle, TableLayout, TableStyle, TableTheme } from "@tabletop-judge/shared";
import {
  DEFAULT_BLACK_CARD_SCALE,
  DEFAULT_SCOREBOARD_SCALE,
  DEFAULT_SPOTLIGHT_SCALE,
  DEFAULT_TABLE_SCALE,
  DEFAULT_TABLE_STYLE,
} from "@tabletop-judge/shared";
import TablePreviewStage from "../components/TablePreviewStage.js";
import { EDITOR_PREVIEW_CHANNEL, type EditorPreviewConfig } from "../editorPreviewChannel.js";
import { useIsSharedScreen } from "../useVenue.js";

function readInitialConfig(search: URLSearchParams): EditorPreviewConfig {
  const maxCardSizeParam = search.get("maxCardSize");
  return {
    theme: (search.get("theme") as TableTheme) || DEFAULT_TABLE_STYLE.theme,
    accentIndex: Number(search.get("accentIndex") ?? DEFAULT_TABLE_STYLE.accentIndex),
    spotlightEnabled: search.get("spotlightEnabled") !== "false",
    cardMode: search.get("cardMode") === "true",
    backgroundStyle: (search.get("backgroundStyle") as BackgroundStyle) || DEFAULT_TABLE_STYLE.backgroundStyle,
    backgroundAnimated: search.get("backgroundAnimated") === "true",
    mobileBackgroundEnabled: search.get("mobileBackgroundEnabled") === "true",
    facedownOpacity: Number(search.get("facedownOpacity") ?? DEFAULT_TABLE_STYLE.facedownOpacity),
    layout: (search.get("layout") as TableLayout) || DEFAULT_TABLE_STYLE.layout,
    maxCardSize: maxCardSizeParam === "unlimited" ? null : Number(maxCardSizeParam ?? DEFAULT_TABLE_STYLE.maxCardSize),
    tableScale: Number(search.get("tableScale") ?? DEFAULT_TABLE_SCALE),
    blackCardScale: Number(search.get("blackCardScale") ?? DEFAULT_BLACK_CARD_SCALE),
    spotlightScale: Number(search.get("spotlightScale") ?? DEFAULT_SPOTLIGHT_SCALE),
    scoreboardScale: Number(search.get("scoreboardScale") ?? DEFAULT_SCOREBOARD_SCALE),
    players: Number(search.get("players") ?? 6),
    pick: (Number(search.get("pick") ?? 1) as 1 | 2 | 3),
  };
}

/**
 * What the Template Editor's "Open in a real window" button opens — a
 * genuine, resizable/full-screen browser window (not a squeezed-in
 * preview) so a Table style can be judged at real size. Starts from the
 * opener's current controls (passed via URL params) and stays live via
 * BroadcastChannel while both windows are open.
 */
export default function TemplateEditorPreviewPage() {
  const [search] = useSearchParams();
  const [config, setConfig] = useState<EditorPreviewConfig>(() => readInitialConfig(search));
  useIsSharedScreen(true);

  useEffect(() => {
    const channel = new BroadcastChannel(EDITOR_PREVIEW_CHANNEL);
    channel.onmessage = (e: MessageEvent<EditorPreviewConfig>) => setConfig(e.data);
    return () => channel.close();
  }, []);

  const tableStyle: TableStyle = {
    theme: config.theme,
    accentIndex: config.accentIndex,
    spotlightEnabled: config.spotlightEnabled,
    cardMode: config.cardMode,
    backgroundStyle: config.backgroundStyle,
    backgroundAnimated: config.backgroundAnimated,
    mobileBackgroundEnabled: config.mobileBackgroundEnabled,
    facedownOpacity: config.facedownOpacity,
    layout: config.layout,
    maxCardSize: config.maxCardSize,
  };

  return (
    <TablePreviewStage
      tableStyle={tableStyle}
      tableScale={config.tableScale}
      blackCardScale={config.blackCardScale}
      spotlightScale={config.spotlightScale}
      scoreboardScale={config.scoreboardScale}
      playerCount={config.players}
      pickCount={config.pick}
      fullscreen
    />
  );
}
