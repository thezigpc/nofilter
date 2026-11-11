import { useMemo } from "react";
import type { TableTheme } from "@tabletop-judge/shared";
import { renderThemeScene } from "../themeScenes.js";

/** Renders behind everything else on a `.page` - the parent MUST have
 * `isolation: isolate` (see index.css's `.page` rule) or this element's
 * `z-index: -1` escapes past the page entirely and paints behind the
 * whole box, including the page's own background, instead of just behind
 * its content. Confirmed the hard way while building the design mockup
 * this was ported from. */
export default function ThemeScene({ theme, accent, animated }: { theme: TableTheme; accent: string; animated: boolean }) {
  const html = useMemo(() => renderThemeScene(theme, accent), [theme, accent]);
  return (
    <div
      className={animated ? "theme-scene animate" : "theme-scene"}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
