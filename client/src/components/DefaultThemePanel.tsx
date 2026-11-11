import { useEffect, useState } from "react";
import {
  BACKGROUND_STYLES,
  DEFAULT_TABLE_STYLE,
  FACEDOWN_OPACITY_STEP,
  MAX_FACEDOWN_OPACITY,
  MIN_FACEDOWN_OPACITY,
  TABLE_THEME_ACCENTS,
  TABLE_THEME_LABELS,
  type BackgroundStyle,
  type TableTheme,
} from "@tabletop-judge/shared";
import { fetchPublicConfig, setDefaultTheme } from "../publicConfig.js";
import { loadTableStylePresets, onTableStylePresetsUpdated } from "../tableStylePresets.js";
import type { TableStylePreset } from "../tableStylePresets.js";

// Also missing "synthwave" before this pass - stale since that theme
// shipped, unrelated to the site/techno rename. Now lists all eight.
const TABLE_THEMES: TableTheme[] = ["felt", "bulletin", "neon", "site", "techno", "beach", "parlour", "synthwave", "windward"];

const BACKGROUND_STYLE_LABELS: Record<BackgroundStyle, string> = {
  flat: "Flat",
  glow: "Glow",
  scene: "Scene",
};

/**
 * Admin control for the deployment's default look - what a brand new room
 * starts with, and what HomePage/Card Management/this page itself render
 * with, since those have no room of their own to inherit a theme from (see
 * publicConfig.ts, client/src/useThemeAttrs.ts). A host can still change
 * their own room's theme from the Lobby afterward same as always; this
 * only sets the starting point.
 *
 * Explicit Save/Revert rather than the instant-apply-per-click pattern used
 * elsewhere (Lobby's Table Style, the Template Editor): those preview a
 * single room the admin is already in and own; this changes what every
 * future room and every room-less page in the whole deployment starts with,
 * so clicking around to compare options needs a way to back out before
 * committing. Clicking a swatch still previews live (this page re-themes
 * itself immediately via onChange) - only persisting to disk waits for Save.
 */
export default function DefaultThemePanel({ onChange }: { onChange?: (theme: TableTheme, accentIndex: number) => void }) {
  const [savedTheme, setSavedTheme] = useState<TableTheme>(DEFAULT_TABLE_STYLE.theme);
  const [savedAccentIndex, setSavedAccentIndex] = useState(DEFAULT_TABLE_STYLE.accentIndex);
  const [savedBackgroundStyle, setSavedBackgroundStyle] = useState<BackgroundStyle>(DEFAULT_TABLE_STYLE.backgroundStyle);
  const [savedBackgroundAnimated, setSavedBackgroundAnimated] = useState(DEFAULT_TABLE_STYLE.backgroundAnimated);
  const [savedMobileBackgroundEnabled, setSavedMobileBackgroundEnabled] = useState(DEFAULT_TABLE_STYLE.mobileBackgroundEnabled);
  const [savedFacedownOpacity, setSavedFacedownOpacity] = useState(DEFAULT_TABLE_STYLE.facedownOpacity);
  const [theme, setTheme] = useState<TableTheme>(DEFAULT_TABLE_STYLE.theme);
  const [accentIndex, setAccentIndex] = useState(DEFAULT_TABLE_STYLE.accentIndex);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>(DEFAULT_TABLE_STYLE.backgroundStyle);
  const [backgroundAnimated, setBackgroundAnimated] = useState(DEFAULT_TABLE_STYLE.backgroundAnimated);
  const [mobileBackgroundEnabled, setMobileBackgroundEnabled] = useState(DEFAULT_TABLE_STYLE.mobileBackgroundEnabled);
  const [facedownOpacity, setFacedownOpacity] = useState(DEFAULT_TABLE_STYLE.facedownOpacity);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<TableStylePreset[]>([]);

  useEffect(() => {
    fetchPublicConfig().then((config) => {
      setSavedTheme(config.defaultTheme);
      setSavedAccentIndex(config.defaultAccentIndex);
      setSavedBackgroundStyle(config.defaultBackgroundStyle);
      setSavedBackgroundAnimated(config.defaultBackgroundAnimated);
      setSavedMobileBackgroundEnabled(config.defaultMobileBackgroundEnabled);
      setSavedFacedownOpacity(config.defaultFacedownOpacity);
      setTheme(config.defaultTheme);
      setAccentIndex(config.defaultAccentIndex);
      setBackgroundStyle(config.defaultBackgroundStyle);
      setBackgroundAnimated(config.defaultBackgroundAnimated);
      setMobileBackgroundEnabled(config.defaultMobileBackgroundEnabled);
      setFacedownOpacity(config.defaultFacedownOpacity);
    });
  }, []);

  // Same shared preset library the Lobby and Template Editor already save
  // to (server/src/presets/store.ts) - lets an admin pick the deployment
  // default from a look they (or anyone) already designed and named,
  // instead of re-hunting for the right theme/accent/background combination
  // by hand. Layout/card sizing/spotlight still stay per-room, not
  // something a preset should push onto every future room in the
  // deployment - only the "brand identity" fields this panel now owns.
  useEffect(() => {
    loadTableStylePresets().then(setPresets);
    return onTableStylePresetsUpdated(setPresets);
  }, []);

  const dirty =
    theme !== savedTheme ||
    accentIndex !== savedAccentIndex ||
    backgroundStyle !== savedBackgroundStyle ||
    backgroundAnimated !== savedBackgroundAnimated ||
    mobileBackgroundEnabled !== savedMobileBackgroundEnabled ||
    facedownOpacity !== savedFacedownOpacity;

  function preview(nextTheme: TableTheme, nextAccentIndex: number) {
    setTheme(nextTheme);
    setAccentIndex(nextAccentIndex);
    onChange?.(nextTheme, nextAccentIndex);
    setError(null);
  }

  function previewFromPreset(preset: TableStylePreset) {
    preview(preset.tableStyle.theme, preset.tableStyle.accentIndex);
    setBackgroundStyle(preset.tableStyle.backgroundStyle ?? DEFAULT_TABLE_STYLE.backgroundStyle);
    setBackgroundAnimated(preset.tableStyle.backgroundAnimated ?? DEFAULT_TABLE_STYLE.backgroundAnimated);
    setMobileBackgroundEnabled(preset.tableStyle.mobileBackgroundEnabled ?? DEFAULT_TABLE_STYLE.mobileBackgroundEnabled);
    setFacedownOpacity(preset.tableStyle.facedownOpacity ?? DEFAULT_TABLE_STYLE.facedownOpacity);
  }

  function revert() {
    preview(savedTheme, savedAccentIndex);
    setBackgroundStyle(savedBackgroundStyle);
    setBackgroundAnimated(savedBackgroundAnimated);
    setMobileBackgroundEnabled(savedMobileBackgroundEnabled);
    setFacedownOpacity(savedFacedownOpacity);
  }

  function save() {
    setSaving(true);
    setError(null);
    setDefaultTheme({ theme, accentIndex, backgroundStyle, backgroundAnimated, mobileBackgroundEnabled, facedownOpacity }).then((res) => {
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save that.");
        return;
      }
      setSavedTheme(theme);
      setSavedAccentIndex(accentIndex);
      setSavedBackgroundStyle(backgroundStyle);
      setSavedBackgroundAnimated(backgroundAnimated);
      setSavedMobileBackgroundEnabled(mobileBackgroundEnabled);
      setSavedFacedownOpacity(facedownOpacity);
    });
  }

  return (
    <div className="panel" data-table-theme={theme} style={{ "--accent": TABLE_THEME_ACCENTS[theme][accentIndex]?.color } as React.CSSProperties}>
      <h2>Default look</h2>
      <p className="muted">
        The theme, accent, and background a brand new room starts with — and what this admin page, Card Management,
        and the home page render with, since they aren't tied to any one room's look. A host can still change their
        own room's look from the Lobby afterward.
      </p>
      {presets.length > 0 && (
        <>
          <p className="muted">Or start from a saved preset:</p>
          <div className="row">
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                disabled={saving}
                title={`Use "${preset.name}"'s look`}
                onClick={() => previewFromPreset(preset)}
                className={
                  theme === preset.tableStyle.theme && accentIndex === preset.tableStyle.accentIndex
                    ? "theme-btn selected"
                    : "theme-btn"
                }
              >
                {preset.name}
                <span className="muted"> — {TABLE_THEME_LABELS[preset.tableStyle.theme].name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="row">
        {TABLE_THEMES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={saving}
            className={theme === t ? "theme-btn selected" : "theme-btn"}
            onClick={() => preview(t, 0)}
          >
            {TABLE_THEME_LABELS[t].name}
            <span className="muted"> — {TABLE_THEME_LABELS[t].desc}</span>
          </button>
        ))}
      </div>
      <div className="row">
        {TABLE_THEME_ACCENTS[theme].map((accent, i) => (
          <button
            key={accent.color}
            type="button"
            disabled={saving}
            title={accent.name}
            onClick={() => preview(theme, i)}
            className={i === accentIndex ? "swatch-btn selected" : "swatch-btn"}
            style={{ background: accent.color }}
          />
        ))}
      </div>
      <div className="row">
        {BACKGROUND_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            disabled={saving}
            className={backgroundStyle === style ? "theme-btn selected" : "theme-btn"}
            onClick={() => {
              setBackgroundStyle(style);
              setError(null);
            }}
          >
            {BACKGROUND_STYLE_LABELS[style]}
          </button>
        ))}
      </div>
      {backgroundStyle === "scene" && (
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={backgroundAnimated}
            onChange={(e) => setBackgroundAnimated(e.target.checked)}
          />
          Animate scene
        </label>
      )}
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={mobileBackgroundEnabled}
          onChange={(e) => setMobileBackgroundEnabled(e.target.checked)}
        />
        Show background on phones too
      </label>
      <div className="slider-row">
        <span className="muted">Face-down card opacity</span>
        <input
          type="range"
          min={MIN_FACEDOWN_OPACITY}
          max={MAX_FACEDOWN_OPACITY}
          step={FACEDOWN_OPACITY_STEP}
          value={facedownOpacity}
          onChange={(e) => setFacedownOpacity(Number(e.target.value))}
        />
        <span className="slider-val">{facedownOpacity}%</span>
      </div>
      {dirty && (
        <div className="row">
          <button type="button" className="primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save default look"}
          </button>
          <button type="button" disabled={saving} onClick={revert}>
            Revert
          </button>
          <span className="muted">Previewing — not saved yet.</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
