import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TableLayout, TableStyle, TableStylePreset, TableTheme } from "@tabletop-judge/shared";
import {
  DEFAULT_BLACK_CARD_SCALE,
  DEFAULT_MAX_CARD_SIZE,
  DEFAULT_SCOREBOARD_SCALE,
  DEFAULT_SPOTLIGHT_SCALE,
  DEFAULT_TABLE_SCALE,
  DEFAULT_TABLE_STYLE,
  MAX_BLACK_CARD_SCALE,
  MAX_CARD_MODE_SUBMISSIONS,
  MAX_CARD_SIZE_STEP,
  MAX_MAX_CARD_SIZE,
  MAX_SCOREBOARD_SCALE,
  MAX_SPOTLIGHT_SCALE,
  MAX_TABLE_SCALE,
  MIN_BLACK_CARD_SCALE,
  MIN_MAX_CARD_SIZE,
  MIN_SCOREBOARD_SCALE,
  MIN_SPOTLIGHT_SCALE,
  MIN_TABLE_SCALE,
  TABLE_LAYOUTS,
  TABLE_LAYOUT_LABELS,
  TABLE_THEME_ACCENTS,
  TABLE_THEME_LABELS,
  THEMES_REQUIRING_SPOTLIGHT,
  BACKGROUND_STYLES,
  MIN_FACEDOWN_OPACITY,
  MAX_FACEDOWN_OPACITY,
  FACEDOWN_OPACITY_STEP,
} from "@tabletop-judge/shared";
import type { BackgroundStyle } from "@tabletop-judge/shared";
import TablePreviewStage from "../components/TablePreviewStage.js";
import TextPromptModal from "../components/TextPromptModal.js";
import { BackArrowIcon, CheckIcon, CloseCircleIcon, OpenWindowIcon } from "../components/Icons.js";
import {
  deleteTableStylePreset,
  loadTableStylePresets,
  onTableStylePresetsUpdated,
  saveTableStylePreset,
} from "../tableStylePresets.js";
import { EDITOR_PREVIEW_CHANNEL, type EditorPreviewConfig } from "../editorPreviewChannel.js";
import { socket } from "../socket.js";
import { fetchPublicConfig } from "../publicConfig.js";

const TABLE_THEMES: TableTheme[] = ["felt", "bulletin", "neon", "site", "techno", "beach", "parlour", "synthwave", "windward"];
const PICK_COUNTS: (1 | 2 | 3)[] = [1, 2, 3];
const DEFAULT_PREVIEW_PLAYERS = 6;
const DEFAULT_PREVIEW_PICK: 1 | 2 | 3 = 1;

const BACKGROUND_STYLE_LABELS: Record<BackgroundStyle, string> = {
  flat: "Flat",
  glow: "Glow",
  scene: "Scene",
};

// Illustrative dot-row colors per theme (stage background, white-card
// background) — matching the values baked into index.css's
// .page.role-table[data-table-theme] blocks and the earlier design
// mockup's THEMES map, so the theme picker previews the real look at a
// glance without needing to render a full mock page per option.
const THEME_DOT_COLORS: Record<TableTheme, { bg: string; whiteCard: string }> = {
  felt: { bg: "#101014", whiteCard: "#f5f4ee" },
  bulletin: { bg: "#0a0a0c", whiteCard: "#eceae3" },
  neon: { bg: "#0a0710", whiteCard: "#f7f2ff" },
  site: { bg: "#0d0d0e", whiteCard: "#ededea" },
  techno: { bg: "#0a0b10", whiteCard: "#eef0f3" },
  beach: { bg: "#fbf1dd", whiteCard: "#fffdf6" },
  parlour: { bg: "#1a1410", whiteCard: "#efe6d8" },
  synthwave: { bg: "#150a2e", whiteCard: "#fff4fb" },
  windward: { bg: "#0a1b28", whiteCard: "#ecdfc0" },
};

// Standalone design tool: no room to join, but presets are a shared
// design library stored server-side (see server/src/presets/store.ts) so
// the same list shows up on the host's phone, the Table, and here on any
// device - that needs an actual connection, unlike everything else on this
// page (<TablePreviewStage>'s reuse of <JudgingBoard> otherwise only calls
// the room-scoped socket.emit calls, which are harmless no-ops with no
// room joined).
export default function TemplateEditorPage() {
  const navigate = useNavigate();
  // Theme/accent default to the shared constant until the real admin
  // default loads (see the mount effect below) - a brief, harmless
  // mismatch on first paint, corrected as soon as the fetch resolves.
  // adminDefault is also what "Reset" returns to, not the hardcoded
  // constant, so resetting matches what a fresh page load actually shows.
  const [adminDefault, setAdminDefault] = useState({
    theme: DEFAULT_TABLE_STYLE.theme,
    accentIndex: DEFAULT_TABLE_STYLE.accentIndex,
    backgroundStyle: DEFAULT_TABLE_STYLE.backgroundStyle,
    backgroundAnimated: DEFAULT_TABLE_STYLE.backgroundAnimated,
    mobileBackgroundEnabled: DEFAULT_TABLE_STYLE.mobileBackgroundEnabled,
    facedownOpacity: DEFAULT_TABLE_STYLE.facedownOpacity,
  });
  const [theme, setTheme] = useState<TableTheme>(DEFAULT_TABLE_STYLE.theme);
  const [accentIndex, setAccentIndex] = useState(DEFAULT_TABLE_STYLE.accentIndex);
  const [spotlightEnabled, setSpotlightEnabled] = useState(DEFAULT_TABLE_STYLE.spotlightEnabled);
  const [cardMode, setCardMode] = useState(DEFAULT_TABLE_STYLE.cardMode);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>(DEFAULT_TABLE_STYLE.backgroundStyle);
  const [backgroundAnimated, setBackgroundAnimated] = useState(DEFAULT_TABLE_STYLE.backgroundAnimated);
  const [mobileBackgroundEnabled, setMobileBackgroundEnabled] = useState(DEFAULT_TABLE_STYLE.mobileBackgroundEnabled);
  const [facedownOpacity, setFacedownOpacity] = useState(DEFAULT_TABLE_STYLE.facedownOpacity);
  const [layout, setLayout] = useState<TableLayout>(DEFAULT_TABLE_STYLE.layout);
  const [blackCardScale, setBlackCardScale] = useState(DEFAULT_BLACK_CARD_SCALE);
  const [spotlightScale, setSpotlightScale] = useState(DEFAULT_SPOTLIGHT_SCALE);
  const [scoreboardScale, setScoreboardScale] = useState(DEFAULT_SCOREBOARD_SCALE);
  const [maxCardSizeSlider, setMaxCardSizeSlider] = useState(DEFAULT_TABLE_STYLE.maxCardSize ?? DEFAULT_MAX_CARD_SIZE);
  const [unlimited, setUnlimited] = useState(DEFAULT_TABLE_STYLE.maxCardSize === null);
  const [tableScale, setTableScale] = useState(DEFAULT_TABLE_SCALE);
  const [previewPlayerCount, setPreviewPlayerCount] = useState(DEFAULT_PREVIEW_PLAYERS);
  const [previewPickCount, setPreviewPickCount] = useState<1 | 2 | 3>(DEFAULT_PREVIEW_PICK);
  const [presets, setPresets] = useState<TableStylePreset[]>([]);
  const [presetNamePromptOpen, setPresetNamePromptOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const cardModeAvailable = previewPlayerCount <= MAX_CARD_MODE_SUBMISSIONS;
  const tableStyle: TableStyle = {
    theme,
    accentIndex,
    spotlightEnabled,
    cardMode: cardMode && cardModeAvailable,
    layout,
    maxCardSize: unlimited ? null : maxCardSizeSlider,
    backgroundStyle,
    backgroundAnimated,
    mobileBackgroundEnabled,
    facedownOpacity,
  };

  useEffect(() => {
    socket.connect();
    loadTableStylePresets().then(setPresets);
    const unsubscribe = onTableStylePresetsUpdated(setPresets);
    fetchPublicConfig().then((config) => {
      const next = {
        theme: config.defaultTheme,
        accentIndex: config.defaultAccentIndex,
        backgroundStyle: config.defaultBackgroundStyle,
        backgroundAnimated: config.defaultBackgroundAnimated,
        mobileBackgroundEnabled: config.defaultMobileBackgroundEnabled,
        facedownOpacity: config.defaultFacedownOpacity,
      };
      setAdminDefault(next);
      setTheme(next.theme);
      setAccentIndex(next.accentIndex);
      setBackgroundStyle(next.backgroundStyle);
      setBackgroundAnimated(next.backgroundAnimated);
      setMobileBackgroundEnabled(next.mobileBackgroundEnabled);
      setFacedownOpacity(next.facedownOpacity);
    });
    return () => {
      unsubscribe();
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(EDITOR_PREVIEW_CHANNEL);
    channelRef.current = channel;
    return () => channel.close();
  }, []);

  useEffect(() => {
    const config: EditorPreviewConfig = {
      theme,
      accentIndex,
      spotlightEnabled,
      cardMode: tableStyle.cardMode,
      layout,
      maxCardSize: tableStyle.maxCardSize,
      backgroundStyle,
      backgroundAnimated,
      mobileBackgroundEnabled,
      facedownOpacity,
      tableScale,
      blackCardScale,
      spotlightScale,
      scoreboardScale,
      players: previewPlayerCount,
      pick: previewPickCount,
    };
    channelRef.current?.postMessage(config);
  }, [
    theme,
    accentIndex,
    spotlightEnabled,
    tableStyle.cardMode,
    layout,
    tableStyle.maxCardSize,
    backgroundStyle,
    backgroundAnimated,
    mobileBackgroundEnabled,
    facedownOpacity,
    tableScale,
    blackCardScale,
    spotlightScale,
    scoreboardScale,
    previewPlayerCount,
    previewPickCount,
  ]);

  function openPopout() {
    const params = new URLSearchParams({
      theme,
      accentIndex: String(accentIndex),
      spotlightEnabled: String(spotlightEnabled),
      cardMode: String(tableStyle.cardMode),
      layout,
      maxCardSize: unlimited ? "unlimited" : String(maxCardSizeSlider),
      backgroundStyle,
      backgroundAnimated: String(backgroundAnimated),
      mobileBackgroundEnabled: String(mobileBackgroundEnabled),
      facedownOpacity: String(facedownOpacity),
      tableScale: String(tableScale),
      blackCardScale: String(blackCardScale),
      spotlightScale: String(spotlightScale),
      scoreboardScale: String(scoreboardScale),
      players: String(previewPlayerCount),
      pick: String(previewPickCount),
    });
    window.open(`/editor/preview?${params.toString()}`, "_blank", "width=1400,height=860");
  }

  function setThemeAndResetAccent(next: TableTheme) {
    setTheme(next);
    setAccentIndex(0);
    // Same enforcement Room.updateTableStyle applies for a real room -
    // Parlour's fanned cards only read correctly through Spotlight.
    if (THEMES_REQUIRING_SPOTLIGHT.includes(next)) setSpotlightEnabled(true);
  }

  const spotlightForced = THEMES_REQUIRING_SPOTLIGHT.includes(theme);

  function resetToDefaults() {
    setTheme(adminDefault.theme);
    setAccentIndex(adminDefault.accentIndex);
    setSpotlightEnabled(DEFAULT_TABLE_STYLE.spotlightEnabled);
    setCardMode(DEFAULT_TABLE_STYLE.cardMode);
    setBackgroundStyle(adminDefault.backgroundStyle);
    setBackgroundAnimated(adminDefault.backgroundAnimated);
    setMobileBackgroundEnabled(adminDefault.mobileBackgroundEnabled);
    setFacedownOpacity(adminDefault.facedownOpacity);
    setLayout(DEFAULT_TABLE_STYLE.layout);
    setBlackCardScale(DEFAULT_BLACK_CARD_SCALE);
    setSpotlightScale(DEFAULT_SPOTLIGHT_SCALE);
    setScoreboardScale(DEFAULT_SCOREBOARD_SCALE);
    setUnlimited(DEFAULT_TABLE_STYLE.maxCardSize === null);
    setMaxCardSizeSlider(DEFAULT_TABLE_STYLE.maxCardSize ?? DEFAULT_MAX_CARD_SIZE);
    setTableScale(DEFAULT_TABLE_SCALE);
    setPreviewPlayerCount(DEFAULT_PREVIEW_PLAYERS);
    setPreviewPickCount(DEFAULT_PREVIEW_PICK);
  }

  function saveCurrentAsPreset() {
    setPresetNamePromptOpen(true);
  }

  function confirmSavePreset(name: string) {
    setPresetNamePromptOpen(false);
    saveTableStylePreset({ name, tableStyle, tableScale, blackCardScale, spotlightScale, scoreboardScale }).then(setPresets);
  }

  function applyPreset(preset: TableStylePreset) {
    setTheme(preset.tableStyle.theme);
    setAccentIndex(preset.tableStyle.accentIndex);
    setSpotlightEnabled(preset.tableStyle.spotlightEnabled || THEMES_REQUIRING_SPOTLIGHT.includes(preset.tableStyle.theme));
    setCardMode(preset.tableStyle.cardMode ?? DEFAULT_TABLE_STYLE.cardMode);
    // A preset saved before this field existed has no backgroundStyle at
    // all (not even the old backgroundGlow - that boolean never mapped
    // cleanly onto three states, so it isn't read as a fallback either) -
    // falls back to the shared default like every other optional field
    // here already does.
    setBackgroundStyle(preset.tableStyle.backgroundStyle ?? DEFAULT_TABLE_STYLE.backgroundStyle);
    setBackgroundAnimated(preset.tableStyle.backgroundAnimated ?? DEFAULT_TABLE_STYLE.backgroundAnimated);
    setMobileBackgroundEnabled(preset.tableStyle.mobileBackgroundEnabled ?? DEFAULT_TABLE_STYLE.mobileBackgroundEnabled);
    setFacedownOpacity(preset.tableStyle.facedownOpacity ?? DEFAULT_TABLE_STYLE.facedownOpacity);
    setLayout(preset.tableStyle.layout ?? DEFAULT_TABLE_STYLE.layout);
    const presetMaxCardSize =
      preset.tableStyle.maxCardSize !== undefined ? preset.tableStyle.maxCardSize : DEFAULT_TABLE_STYLE.maxCardSize;
    setUnlimited(presetMaxCardSize === null);
    setMaxCardSizeSlider(presetMaxCardSize ?? DEFAULT_MAX_CARD_SIZE);
    if (preset.tableScale != null) setTableScale(preset.tableScale);
    if (preset.blackCardScale != null) setBlackCardScale(preset.blackCardScale);
    if (preset.spotlightScale != null) setSpotlightScale(preset.spotlightScale);
    if (preset.scoreboardScale != null) setScoreboardScale(preset.scoreboardScale);
  }

  function removePreset(name: string) {
    deleteTableStylePreset(name).then(setPresets);
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <button type="button" className="editor-back-btn" onClick={() => navigate("/")}>
          <BackArrowIcon /> Back
        </button>
        <h1>Shared Screen Style</h1>
      </header>
      <div className={railCollapsed ? "editor-layout rail-collapsed" : "editor-layout"}>
        <aside className="editor-rail">
          <button
            type="button"
            className="editor-rail-toggle"
            onClick={() => setRailCollapsed((c) => !c)}
            aria-label={railCollapsed ? "Show settings" : "Hide settings"}
            title={railCollapsed ? "Show settings" : "Hide settings"}
          >
            {railCollapsed ? "›" : "‹"}
          </button>

          <p className="sub">
            Design a look for the Shared Screen, then save it as a preset you can apply to any room. The color theme
            also carries over to Player and Judge phones — layout and card sizing stay Shared-Screen-only.
          </p>

          <div className="editor-field">
            <span className="field-title">Layout</span>
            {TABLE_LAYOUTS.map((l) => (
              <button
                key={l}
                type="button"
                className={layout === l ? "layout-option selected" : "layout-option"}
                onClick={() => setLayout(l)}
              >
                <strong>{TABLE_LAYOUT_LABELS[l].name}</strong>
                <span>{TABLE_LAYOUT_LABELS[l].desc}</span>
              </button>
            ))}
          </div>

          <div className="editor-field">
            <span className="field-title">Theme</span>
            {TABLE_THEMES.map((t) => (
              <button
                key={t}
                type="button"
                className={theme === t ? "theme-option selected" : "theme-option"}
                onClick={() => setThemeAndResetAccent(t)}
              >
                <span className="dot-row">
                  <span className="dot" style={{ background: THEME_DOT_COLORS[t].bg }} />
                  <span className="dot" style={{ background: TABLE_THEME_ACCENTS[t][0].color }} />
                  <span className="dot" style={{ background: THEME_DOT_COLORS[t].whiteCard }} />
                </span>
                <span>
                  <div className="option-name">{TABLE_THEME_LABELS[t].name}</div>
                  <div className="option-desc">{TABLE_THEME_LABELS[t].desc}</div>
                </span>
              </button>
            ))}
          </div>

          <div className="editor-field">
            <span className="field-title">Accent color</span>
            <div className="swatch-row">
              {TABLE_THEME_ACCENTS[theme].map((accent, i) => (
                <button
                  key={accent.color}
                  type="button"
                  title={accent.name}
                  onClick={() => setAccentIndex(i)}
                  className={i === accentIndex ? "swatch selected" : "swatch"}
                  style={{ background: accent.color }}
                >
                  {i === accentIndex && <CheckIcon className="check" />}
                </button>
              ))}
            </div>
            <p className="field-note">{TABLE_THEME_ACCENTS[theme][accentIndex]?.name}</p>
          </div>

          <div className="editor-field">
            <span className="field-title">Background</span>
            <div className="pick-row">
              {BACKGROUND_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  className={backgroundStyle === style ? "pick-btn selected" : "pick-btn"}
                  onClick={() => setBackgroundStyle(style)}
                >
                  {BACKGROUND_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
            <p className="field-note">
              {backgroundStyle === "flat" && "Plain stage color, no atmosphere."}
              {backgroundStyle === "glow" && "A soft gradient glow over the flat stage color."}
              {backgroundStyle === "scene" && "A real drawn scene matching this theme, not just a glow."}
            </p>
          </div>

          {backgroundStyle === "scene" && (
            <div className="editor-field">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={backgroundAnimated}
                  onChange={(e) => setBackgroundAnimated(e.target.checked)}
                />
                Animate scene
              </label>
              <p className="field-note">
                Subtle motion — a pulsing sign, swaying lights, scrolling waves. Automatically off for anyone with
                "reduce motion" set at the OS level.
              </p>
            </div>
          )}

          <div className="editor-field">
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={mobileBackgroundEnabled}
                onChange={(e) => setMobileBackgroundEnabled(e.target.checked)}
              />
              Show background on phones too
            </label>
            <p className="field-note">
              Off by default — glow/scene backgrounds were designed for the Shared Screen's open space, a phone's
              hand view is denser.
            </p>
          </div>

          <div className="editor-field">
            <span className="field-title">Face-down card opacity</span>
            <div className="slider-row">
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
            <p className="field-note">Lets the background show through not-yet-revealed cards instead of hiding behind them.</p>
          </div>

          <div className="editor-field">
            <span className="field-title">Black card size</span>
            <div className="slider-row">
              <input
                type="range"
                min={MIN_BLACK_CARD_SCALE}
                max={MAX_BLACK_CARD_SCALE}
                step={0.05}
                value={blackCardScale}
                onChange={(e) => setBlackCardScale(Number(e.target.value))}
              />
              <span className="slider-val">{blackCardScale.toFixed(2)}×</span>
            </div>
          </div>

          <div className="editor-field">
            <span className="field-title">Spotlight size (Shared Screen only)</span>
            <div className="slider-row">
              <input
                type="range"
                min={MIN_SPOTLIGHT_SCALE}
                max={MAX_SPOTLIGHT_SCALE}
                step={0.05}
                value={spotlightScale}
                onChange={(e) => setSpotlightScale(Number(e.target.value))}
              />
              <span className="slider-val">{spotlightScale.toFixed(2)}×</span>
            </div>
          </div>

          <div className="editor-field">
            <span className="field-title">Scoreboard text size (Shared Screen only)</span>
            <div className="slider-row">
              <input
                type="range"
                min={MIN_SCOREBOARD_SCALE}
                max={MAX_SCOREBOARD_SCALE}
                step={0.05}
                value={scoreboardScale}
                onChange={(e) => setScoreboardScale(Number(e.target.value))}
              />
              <span className="slider-val">{scoreboardScale.toFixed(2)}×</span>
            </div>
          </div>

          <div className="editor-field">
            <span className="field-title">Max card size</span>
            <div className="slider-row">
              <input
                type="range"
                min={MIN_MAX_CARD_SIZE}
                max={MAX_MAX_CARD_SIZE}
                step={MAX_CARD_SIZE_STEP}
                disabled={unlimited}
                value={maxCardSizeSlider}
                onChange={(e) => setMaxCardSizeSlider(Number(e.target.value))}
              />
              <span className="slider-val">{unlimited ? "Unlimited" : `${maxCardSizeSlider}px`}</span>
            </div>
            <label className="toggle-field">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
              Unlimited (old fill-everything behavior)
            </label>
          </div>

          <div className="editor-field">
            <span className="field-title">Text size</span>
            <div className="slider-row">
              <input
                type="range"
                min={MIN_TABLE_SCALE}
                max={MAX_TABLE_SCALE}
                step={0.05}
                value={tableScale}
                onChange={(e) => setTableScale(Number(e.target.value))}
              />
              <span className="slider-val">{tableScale.toFixed(2)}×</span>
            </div>
          </div>

          <div className="editor-field">
            <span className="field-title">Players in this round</span>
            <div className="slider-row">
              <input
                type="range"
                min={3}
                max={20}
                value={previewPlayerCount}
                onChange={(e) => setPreviewPlayerCount(Number(e.target.value))}
              />
              <span className="slider-val">{previewPlayerCount}</span>
            </div>
            <p className="field-note">Preview-only — doesn't affect any real game.</p>
          </div>

          <div className="editor-field">
            <span className="field-title">Black card pick count</span>
            <div className="pick-row">
              {PICK_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={previewPickCount === n ? "pick-btn selected" : "pick-btn"}
                  onClick={() => setPreviewPickCount(n)}
                >
                  Pick {n}
                </button>
              ))}
            </div>
          </div>

          <div className="editor-field">
            <label className="toggle-field">
              <input
                type="checkbox"
                disabled={spotlightForced}
                checked={spotlightEnabled || spotlightForced}
                onChange={(e) => setSpotlightEnabled(e.target.checked)}
              />
              Spotlight cards on reveal
            </label>
            {spotlightForced && (
              <p className="field-note">Parlour's fanned cards only read correctly through Spotlight — locked on.</p>
            )}
          </div>

          <div className="editor-field">
            <label className="toggle-field">
              <input
                type="checkbox"
                disabled={!cardModeAvailable}
                checked={cardMode}
                onChange={(e) => setCardMode(e.target.checked)}
              />
              Card-like sizing
            </label>
            <p className="field-note">
              {cardModeAvailable
                ? "Taller, portrait-shaped cards instead of wide tiles."
                : `Off above ${MAX_CARD_MODE_SUBMISSIONS} players — not enough room for real card proportions.`}
            </p>
          </div>

          <button type="button" className="editor-back-btn" onClick={resetToDefaults}>
            Reset to defaults
          </button>

          <div className="editor-field">
            <span className="field-title">Presets</span>
            <p className="field-note">Saved here, these also show up in any real room's Lobby.</p>
            <button type="button" className="editor-save-btn" onClick={saveCurrentAsPreset}>
              Save as preset
            </button>
            {presets.length > 0 && (
              <div className="editor-presets">
                {presets.map((preset) => (
                  <div className="editor-preset-row" key={preset.name}>
                    <button type="button" onClick={() => applyPreset(preset)}>
                      {preset.name}
                    </button>
                    <button type="button" onClick={() => removePreset(preset.name)} aria-label={`Delete preset ${preset.name}`}>
                      <CloseCircleIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="editor-stage">
          <div className="editor-stage-header">
            <p className="editor-stage-label">Live Shared Screen preview</p>
            <button type="button" className="editor-popout-btn" onClick={openPopout}>
              <OpenWindowIcon /> Open in a real window
            </button>
          </div>
          <TablePreviewStage
            tableStyle={tableStyle}
            tableScale={tableScale}
            blackCardScale={blackCardScale}
            spotlightScale={spotlightScale}
            scoreboardScale={scoreboardScale}
            playerCount={previewPlayerCount}
            pickCount={previewPickCount}
          />
        </div>
      </div>

      {presetNamePromptOpen && (
        <TextPromptModal
          title="Save preset"
          label="Name this Shared Screen style preset:"
          onConfirm={confirmSavePreset}
          onCancel={() => setPresetNamePromptOpen(false)}
        />
      )}
    </div>
  );
}
