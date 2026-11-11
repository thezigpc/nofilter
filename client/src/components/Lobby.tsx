import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RoleNamesFields from "./RoleNamesFields.js";
import type { PackSelectionPreset, PackSummary, RoomStateForClient, TableStyle, TableTheme } from "@tabletop-judge/shared";
import {
  DEFAULT_MAX_CARD_SIZE,
  MAX_ACTION_CARD_DENSITY,
  MIN_ACTION_CARD_DENSITY,
  MAX_BLACK_CARD_SCALE,
  MAX_CARD_MODE_SUBMISSIONS,
  MAX_CARD_SIZE_STEP,
  MAX_DOUBLE_DOWN_WINDOW_SECONDS,
  MAX_HAND_SIZE,
  MAX_MAX_CARD_SIZE,
  MAX_SCOREBOARD_SCALE,
  MAX_SPOTLIGHT_SCALE,
  MAX_TABLE_SCALE,
  MIN_BLACK_CARD_SCALE,
  MIN_DOUBLE_DOWN_WINDOW_SECONDS,
  MIN_HAND_SIZE,
  MAX_PERSONAL_CARDS_MAX_COUNT,
  MAX_PERSONAL_CARDS_WINDOW_MINUTES,
  MIN_MAX_CARD_SIZE,
  MIN_PERSONAL_CARDS_MAX_COUNT,
  MIN_PERSONAL_CARDS_WINDOW_MINUTES,
  MIN_SCOREBOARD_SCALE,
  MIN_SPOTLIGHT_SCALE,
  MIN_TABLE_SCALE,
  minPlayersToStart,
  TABLE_LAYOUT_LABELS,
  TABLE_LAYOUTS,
  TABLE_THEME_ACCENTS,
  TABLE_THEME_LABELS,
  THEMES_REQUIRING_SPOTLIGHT,
  BACKGROUND_STYLES,
  MIN_FACEDOWN_OPACITY,
  MAX_FACEDOWN_OPACITY,
  FACEDOWN_OPACITY_STEP,
} from "@tabletop-judge/shared";
import type { BackgroundStyle } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { clearSession } from "../session.js";
import { COLLAPSE_THRESHOLD, groupPacksByCategory } from "../packGrouping.js";
import ActionCardTierPanel from "./ActionCardTierPanel.js";
import SettingsSection from "./SettingsSection.js";
import QuickSetupPanel from "./QuickSetupPanel.js";
import InvitePanel from "./InvitePanel.js";
import BufferedNumberInput from "./BufferedNumberInput.js";
import PackSection from "./PackSection.js";
import PackPreviewModal from "./PackPreviewModal.js";
import TextPromptModal from "./TextPromptModal.js";
import { CloseCircleIcon } from "./Icons.js";
import {
  changesFromDefault,
  houseRulesSummary,
  packsSummary,
  sharedScreenSummary,
} from "../lobbySummary.js";
import {
  deleteTableStylePreset,
  loadTableStylePresets,
  onTableStylePresetsUpdated,
  saveTableStylePreset,
} from "../tableStylePresets.js";
import type { TableStylePreset } from "../tableStylePresets.js";
import {
  loadPackSelectionPresets,
  onPackSelectionPresetsUpdated,
} from "../packSelectionPresets.js";

const TABLE_THEMES: TableTheme[] = ["felt", "bulletin", "neon", "site", "techno", "beach", "parlour", "synthwave", "windward"];

const BACKGROUND_STYLE_LABELS: Record<BackgroundStyle, string> = {
  flat: "Flat",
  glow: "Glow",
  scene: "Scene",
};

export default function Lobby({ state }: { state: RoomStateForClient }) {
  const isHost = state.you.isHost;
  // Game-options settings are shared authority with the Table (see
  // Room.requireLobbyAuthority) so an operator at the shared screen can
  // drive setup without a phone. Start Game / Kick / Make host stay
  // isHost-only below.
  const hasLobbyAuthority = state.you.isHost || state.you.role === "table";
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"name" | "size">("name");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  // Sections start expanded unless there'd be a lot of rows to look at -
  // there's no fixed category any more (a Core Set upload can carry
  // whatever sections its admin gave it), so this is decided per-section
  // once the actual groups are known, not hardcoded up front.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [autoCollapseApplied, setAutoCollapseApplied] = useState(false);
  const [previewPack, setPreviewPack] = useState<PackSummary | null>(null);
  const [presets, setPresets] = useState<TableStylePreset[]>([]);
  const [packSelectionPresets, setPackSelectionPresets] = useState<PackSelectionPreset[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadTableStylePresets().then(setPresets);
    return onTableStylePresetsUpdated(setPresets);
  }, []);

  useEffect(() => {
    loadPackSelectionPresets().then(setPackSelectionPresets);
    return onPackSelectionPresetsUpdated(setPackSelectionPresets);
  }, []);

  const selected = new Set(state.selectedPackIds);

  // Every category actually present, regardless of the active filters -
  // this is what powers the filter chips themselves, so picking one never
  // makes the others disappear.
  const allCategories = useMemo(
    () => [...new Set(state.packs.filter((p) => !p.isCustomSet).map((p) => p.category))].sort((a, b) => a.localeCompare(b)),
    [state.packs]
  );

  const { categoryGroups, customSetPacks } = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = state.packs;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    if (showSelectedOnly) list = list.filter((p) => selected.has(p.id));
    if (categoryFilter) list = list.filter((p) => p.isCustomSet || p.category === categoryFilter);
    const sorted = [...list].sort((a, b) =>
      sortMode === "name" ? a.name.localeCompare(b.name) : b.whiteCount + b.blackCount - (a.whiteCount + a.blackCount)
    );
    return groupPacksByCategory(sorted);
  }, [state.packs, filter, categoryFilter, showSelectedOnly, sortMode, state.selectedPackIds]);

  // A section starts collapsed the first time it's seen if it's long
  // enough that opening it by default would dump a wall of rows on the
  // page - applied once per mount (not on every re-render) so toggling a
  // section back open sticks even as the pack list itself changes.
  useEffect(() => {
    if (autoCollapseApplied) return;
    if (state.packs.length === 0) return;
    setAutoCollapseApplied(true);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      for (const g of categoryGroups) {
        if (g.packs.length > COLLAPSE_THRESHOLD) next.add(g.category);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.packs.length]);

  // Actively searching/filtering overrides manual collapse - a match
  // hiding behind a collapsed section header would be worse than just
  // showing whatever narrow result set there is.
  const isActivelyFiltering = filter.trim().length > 0 || showSelectedOnly || categoryFilter !== null;

  function toggleSectionCollapsed(section: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function applyPackSelectionPreset(preset: PackSelectionPreset) {
    socket.emit("updatePackSelection", { packIds: preset.packIds });
    socket.emit("updateExcludedCards", { cardIds: preset.excludedCardIds });
  }

  const totalWhite = state.packs
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + p.whiteCount, 0);
  const totalBlack = state.packs
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + p.blackCount, 0);

  const playerCount = state.players.filter((p) => p.role === "player").length;
  const minPlayers = minPlayersToStart(state.houseRules);

  const blockers: string[] = [];
  if (selected.size === 0 && !state.deckOptions.useCustomCards) {
    blockers.push("Select at least one pack (or enable Use Submitted Custom Cards).");
  }
  if (playerCount < minPlayers) {
    blockers.push(`Need at least ${minPlayers} players (currently ${playerCount}).`);
  }

  function togglePack(id: string) {
    if (!hasLobbyAuthority) return;
    const next = selected.has(id) ? state.selectedPackIds.filter((p) => p !== id) : [...state.selectedPackIds, id];
    socket.emit("updatePackSelection", { packIds: next });
  }

  function selectAll() {
    socket.emit("updatePackSelection", { packIds: state.packs.map((p) => p.id) });
  }

  function clearSelection() {
    socket.emit("updatePackSelection", { packIds: [] });
  }

  function leaveRoom() {
    socket.emit("leaveRoom");
    clearSession();
    navigate("/", { replace: true });
  }

  function applyTableStyle(patch: Partial<TableStyle>) {
    socket.emit("updateTableStyle", { tableStyle: patch });
  }

  // tableScale deliberately never travels with a preset - it's a "fit this
  // specific screen right now" zoom concern (it has its own remote +/-
  // nudge in the header for exactly that reason), not part of a look. The
  // other three scales (black card/spotlight/scoreboard text size) ARE
  // part of the look, same as theme/background - a preset used to silently
  // drop them even when it carried real values (e.g. one saved from the
  // Template Editor, which always includes them), which read as "the
  // preset doesn't actually apply." `!= null` guards presets saved before
  // these existed at all, same pattern TemplateEditorPage's own applyPreset
  // already uses.
  function applyPreset(preset: TableStylePreset) {
    applyTableStyle(preset.tableStyle);
    if (preset.blackCardScale != null) socket.emit("setBlackCardScale", { value: preset.blackCardScale });
    if (preset.spotlightScale != null) socket.emit("setSpotlightScale", { value: preset.spotlightScale });
    if (preset.scoreboardScale != null) socket.emit("setScoreboardScale", { value: preset.scoreboardScale });
  }

  const [presetNamePromptOpen, setPresetNamePromptOpen] = useState(false);

  function saveCurrentAsPreset() {
    setPresetNamePromptOpen(true);
  }

  function confirmSavePreset(name: string) {
    setPresetNamePromptOpen(false);
    saveTableStylePreset({
      name,
      tableStyle: state.tableStyle,
      blackCardScale: state.blackCardScale,
      spotlightScale: state.spotlightScale,
      scoreboardScale: state.scoreboardScale,
    }).then(setPresets);
  }

  function removePreset(name: string) {
    deleteTableStylePreset(name).then(setPresets);
  }

  return (
    <div className="stack">
      <InvitePanel roomCode={state.code} />

      <div className="panel">
        <h2>Players</h2>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className="player-row">
              <span>
                {p.name} {p.role === "table" && <span className="tag">Shared Screen</span>}
                {p.isHost && <span className="tag">Host</span>}
                {p.isWildCard && <span className="tag">Bot</span>}
                {!p.connected && <span className="tag muted">Disconnected</span>}
              </span>
              {isHost && p.id !== state.you.id && !p.isWildCard && (
                <span className="player-actions">
                  {p.role !== "table" && (
                    <button type="button" onClick={() => socket.emit("transferHost", { playerId: p.id })}>
                      Make host
                    </button>
                  )}
                  <button type="button" onClick={() => socket.emit("kickPlayer", { playerId: p.id })}>
                    Kick
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={leaveRoom}>
          Leave room
        </button>
      </div>

      <QuickSetupPanel state={state} disabled={!hasLobbyAuthority} />

      <SettingsSection title="House Rules" summary={houseRulesSummary(state)}>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.wildCard}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { wildCard: e.target.checked } })}
          />
          {state.roleNames.wildCard}
        </label>
        {state.houseRules.wildCard && (
          <label className="toggle-row">
            <input
              type="checkbox"
              disabled={!hasLobbyAuthority}
              checked={state.houseRules.wildCardCanScore}
              onChange={(e) => socket.emit("updateHouseRules", { houseRules: { wildCardCanScore: e.target.checked } })}
            />
            {state.roleNames.wildCard} can win
            <span className="muted"> (a normal competitor — scores, and the game can end on {state.roleNames.wildCard}'s score)</span>
          </label>
        )}
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.singleAnswerOnly}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { singleAnswerOnly: e.target.checked } })}
          />
          Single Answer Cards Only
          <span className="muted"> (only pick-1 black cards get dealt — no pick-2/3 prompts)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.doubleDown}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { doubleDown: e.target.checked } })}
          />
          Double Down
          <span className="muted"> (single-response/pick-1 rounds only; the replacement card always auto-draws immediately, regardless of the Auto Draw setting)</span>
        </label>
        {state.houseRules.doubleDown && (
          <label className="toggle-row">
            Double Down window
            <input
              type="range"
              min={MIN_DOUBLE_DOWN_WINDOW_SECONDS}
              max={MAX_DOUBLE_DOWN_WINDOW_SECONDS}
              step={1}
              disabled={!hasLobbyAuthority}
              value={state.doubleDownWindowSeconds}
              onChange={(e) => socket.emit("updateDoubleDownWindow", { value: Number(e.target.value) })}
            />
            <span className="muted">
              {state.doubleDownWindowSeconds === 0 ? "off (locks in instantly)" : `${state.doubleDownWindowSeconds}s`}
            </span>
            <span className="muted"> (pause after everyone submits so a pending wager can still be made)</span>
          </label>
        )}
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.tradeIn}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { tradeIn: e.target.checked } })}
          />
          Trade-In
          <span className="muted"> (spend a won black card — and the point that came with it — to discard &amp; redraw any number of cards)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.handRefresh}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { handRefresh: e.target.checked } })}
          />
          Hand Refresh
          <span className="muted"> (once per game, discard your whole hand and draw a fresh one for free)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.customPrompts}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { customPrompts: e.target.checked } })}
          />
          Custom Prompts
          <span className="muted"> (the {state.roleNames.judge} can write their own black card instead of drawing one)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.crowdFavorite}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { crowdFavorite: e.target.checked } })}
          />
          Crowd Favorite
          <span className="muted"> (no {state.roleNames.judge} — everyone submits, everyone votes, majority wins)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.noScorekeeping}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { noScorekeeping: e.target.checked } })}
          />
          No Scorekeeping
          <span className="muted"> (hides the scoreboard — only the host's End Game button ends it)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.autoDraw}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { autoDraw: e.target.checked } })}
          />
          Auto Draw
          <span className="muted"> (refills your hand right after you submit — off means a manual draw, one card at a time)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.pickBonus}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { pickBonus: e.target.checked } })}
          />
          Pick Bonus
          <span className="muted"> (on a pick-2/3 round, everyone gets one extra card dealt — always automatic, regardless of Auto Draw)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.actionCards}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { actionCards: e.target.checked } })}
          />
          Action Cards
          <span className="muted"> (a handful of special-effect cards get mixed into the white deck — steal, peek, discard bombs, and more)</span>
        </label>
        {state.houseRules.actionCards && (
          <label className="toggle-row">
            Action Card density
            <input
              type="range"
              min={MIN_ACTION_CARD_DENSITY}
              max={MAX_ACTION_CARD_DENSITY}
              step={1}
              disabled={!hasLobbyAuthority}
              value={state.actionCardDensity}
              onChange={(e) => socket.emit("setActionCardDensity", { value: Number(e.target.value) })}
            />
            <span className="muted">
              {state.actionCardDensity}% (~{Math.max(1, Math.round(totalWhite * (state.actionCardDensity / 100)))} Action
              Card{Math.max(1, Math.round(totalWhite * (state.actionCardDensity / 100))) === 1 ? "" : "s"} in a{" "}
              {totalWhite}-card deck)
            </span>
          </label>
        )}
        {state.houseRules.actionCards && <ActionCardTierPanel state={state} disabled={!hasLobbyAuthority} />}
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.catchUpNewPlayers}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { catchUpNewPlayers: e.target.checked } })}
          />
          Catch Up New Players
          <span className="muted"> (someone joining mid-game gets enough won black cards to match the lowest player)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.houseRules.personalCards}
            onChange={(e) => socket.emit("updateHouseRules", { houseRules: { personalCards: e.target.checked } })}
          />
          Personal Cards
          <span className="muted"> (after Start Game, everyone gets a timed window to write their own white cards before the first round)</span>
        </label>
        {state.houseRules.personalCards && (
          <>
            <label className="toggle-row">
              Writing window
              <input
                type="range"
                min={MIN_PERSONAL_CARDS_WINDOW_MINUTES}
                max={MAX_PERSONAL_CARDS_WINDOW_MINUTES}
                step={1}
                disabled={!hasLobbyAuthority}
                value={state.personalCardsWindowMinutes}
                onChange={(e) =>
                  socket.emit("updatePersonalCardsSettings", { windowMinutes: Number(e.target.value) })
                }
              />
              <span className="muted">{state.personalCardsWindowMinutes}m</span>
            </label>
            <label className="toggle-row">
              Max personal cards
              <input
                type="range"
                min={MIN_PERSONAL_CARDS_MAX_COUNT}
                max={MAX_PERSONAL_CARDS_MAX_COUNT}
                step={1}
                disabled={!hasLobbyAuthority}
                value={state.personalCardsMaxCount}
                onChange={(e) => socket.emit("updatePersonalCardsSettings", { maxCount: Number(e.target.value) })}
              />
              <span className="muted">{state.personalCardsMaxCount}</span>
            </label>
          </>
        )}
        <label className="toggle-row">
          {state.winCondition.mode === "rounds" ? "Play" : "Win at"}
          <BufferedNumberInput
            value={state.winCondition.target}
            min={1}
            disabled={!isHost}
            onCommit={(n) => socket.emit("updateWinCondition", { target: n })}
          />
          {state.winCondition.mode === "rounds" ? "rounds" : "black cards"}
          <span className="muted"> (host only — can be changed anytime, even mid-game)</span>
        </label>
        <div className="row">
          {(["blackCards", "rounds"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!isHost}
              className={state.winCondition.mode === mode ? "primary" : undefined}
              onClick={() => socket.emit("updateWinCondition", { target: state.winCondition.target, mode })}
            >
              {mode === "blackCards" ? "First to N" : "Fixed rounds"}
            </button>
          ))}
        </div>
        <p className="muted">
          {state.winCondition.mode === "rounds"
            ? "The game ends after a set number of rounds and whoever's ahead wins — good when you want a known end time."
            : "The game ends as soon as someone reaches the target number of black cards."}
        </p>
        <label className="toggle-row">
          Hand size
          <BufferedNumberInput
            value={state.handSize}
            min={MIN_HAND_SIZE}
            max={MAX_HAND_SIZE}
            disabled={!hasLobbyAuthority}
            onCommit={(n) => socket.emit("updateHandSize", { value: n })}
          />
          cards
          <span className="muted"> (Lobby only, before the game starts)</span>
        </label>
        <h3 className="settings-subhead">Names</h3>
        <RoleNamesFields
          value={state.roleNames}
          disabled={!hasLobbyAuthority}
          onCommit={(roleNames) => socket.emit("updateRoleNames", { roleNames })}
        />
      </SettingsSection>

      <SettingsSection title="Shared Screen" summary={sharedScreenSummary(state)}>
        <p className="muted">
          These change the live Shared Screen straight away. To design a look ahead of time without a room, use the{" "}
          <button type="button" className="link-btn" onClick={() => navigate("/editor")}>
            Template Editor
          </button>
          .
        </p>
        <p className="muted">
          Sets the color theme and layout of the Shared Screen. The color theme also carries over to every player's
          own phone view — layout and card sizing stay Shared-Screen-only. Hands and gameplay never change.
        </p>
        <div className="row">
          {TABLE_LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={!hasLobbyAuthority}
              className={state.tableStyle.layout === l ? "theme-btn selected" : "theme-btn"}
              onClick={() => applyTableStyle({ layout: l })}
            >
              {TABLE_LAYOUT_LABELS[l].name}
              <span className="muted"> — {TABLE_LAYOUT_LABELS[l].desc}</span>
            </button>
          ))}
        </div>
        <div className="row">
          {TABLE_THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              disabled={!hasLobbyAuthority}
              className={state.tableStyle.theme === theme ? "theme-btn selected" : "theme-btn"}
              onClick={() => applyTableStyle({ theme, accentIndex: 0 })}
            >
              {TABLE_THEME_LABELS[theme].name}
              <span className="muted"> — {TABLE_THEME_LABELS[theme].desc}</span>
            </button>
          ))}
        </div>
        <div className="row">
          {TABLE_THEME_ACCENTS[state.tableStyle.theme].map((accent, i) => (
            <button
              key={accent.color}
              type="button"
              disabled={!hasLobbyAuthority}
              title={accent.name}
              onClick={() => applyTableStyle({ accentIndex: i })}
              className={i === state.tableStyle.accentIndex ? "swatch-btn selected" : "swatch-btn"}
              style={{ background: accent.color }}
            />
          ))}
        </div>
        <div className="row">
          {BACKGROUND_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              disabled={!hasLobbyAuthority}
              className={state.tableStyle.backgroundStyle === style ? "theme-btn selected" : "theme-btn"}
              onClick={() => applyTableStyle({ backgroundStyle: style })}
            >
              {BACKGROUND_STYLE_LABELS[style]}
              {style === "flat" && <span className="muted"> — plain stage color</span>}
              {style === "glow" && <span className="muted"> — a soft atmospheric gradient</span>}
              {style === "scene" && <span className="muted"> — a real drawn scene, matching this theme</span>}
            </button>
          ))}
        </div>
        {state.tableStyle.backgroundStyle === "scene" && (
          <label className="toggle-row">
            <input
              type="checkbox"
              disabled={!hasLobbyAuthority}
              checked={state.tableStyle.backgroundAnimated}
              onChange={(e) => applyTableStyle({ backgroundAnimated: e.target.checked })}
            />
            Animate scene
            <span className="muted"> (subtle motion — a pulsing sign, swaying lights, scrolling waves; automatically off for anyone with "reduce motion" set)</span>
          </label>
        )}
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.tableStyle.mobileBackgroundEnabled}
            onChange={(e) => applyTableStyle({ mobileBackgroundEnabled: e.target.checked })}
          />
          Show background on phones too
          <span className="muted"> (off by default — glow/scene backgrounds were designed for the Shared Screen's open space, a phone's hand view is denser)</span>
        </label>
        <label className="toggle-row">
          Face-down card opacity
          <input
            type="range"
            min={MIN_FACEDOWN_OPACITY}
            max={MAX_FACEDOWN_OPACITY}
            step={FACEDOWN_OPACITY_STEP}
            disabled={!hasLobbyAuthority}
            value={state.tableStyle.facedownOpacity}
            onChange={(e) => applyTableStyle({ facedownOpacity: Number(e.target.value) })}
          />
          <span className="muted">{state.tableStyle.facedownOpacity}%</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority || THEMES_REQUIRING_SPOTLIGHT.includes(state.tableStyle.theme)}
            checked={state.tableStyle.spotlightEnabled}
            onChange={(e) => applyTableStyle({ spotlightEnabled: e.target.checked })}
          />
          Spotlight cards on reveal
          {THEMES_REQUIRING_SPOTLIGHT.includes(state.tableStyle.theme) ? (
            <span className="muted"> ({TABLE_THEME_LABELS[state.tableStyle.theme].name}'s fanned cards only read correctly through Spotlight — locked on)</span>
          ) : (
            <span className="muted"> (tap brings a card forward, large; off just flips it in place)</span>
          )}
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority || playerCount > MAX_CARD_MODE_SUBMISSIONS}
            checked={state.tableStyle.cardMode}
            onChange={(e) => applyTableStyle({ cardMode: e.target.checked })}
          />
          Card-like sizing
          {playerCount > MAX_CARD_MODE_SUBMISSIONS ? (
            <span className="muted"> (off above {MAX_CARD_MODE_SUBMISSIONS} players — not enough room for real card proportions)</span>
          ) : (
            <span className="muted"> (taller, portrait-shaped cards instead of wide tiles — best with a smaller table)</span>
          )}
        </label>
        <label className="toggle-row">
          Text size
          <input
            type="range"
            min={MIN_TABLE_SCALE}
            max={MAX_TABLE_SCALE}
            step={0.05}
            disabled={!hasLobbyAuthority}
            value={state.tableScale}
            onChange={(e) => socket.emit("setTableScale", { value: Number(e.target.value) })}
          />
          <span className="muted">{state.tableScale.toFixed(2)}×</span>
        </label>
        <label className="toggle-row">
          Black card text size
          <input
            type="range"
            min={MIN_BLACK_CARD_SCALE}
            max={MAX_BLACK_CARD_SCALE}
            step={0.05}
            disabled={!hasLobbyAuthority}
            value={state.blackCardScale}
            onChange={(e) => socket.emit("setBlackCardScale", { value: Number(e.target.value) })}
          />
          <span className="muted">{state.blackCardScale.toFixed(2)}×</span>
        </label>
        <label className="toggle-row">
          Spotlight size <span className="muted">(Shared Screen only)</span>
          <input
            type="range"
            min={MIN_SPOTLIGHT_SCALE}
            max={MAX_SPOTLIGHT_SCALE}
            step={0.05}
            disabled={!hasLobbyAuthority}
            value={state.spotlightScale}
            onChange={(e) => socket.emit("setSpotlightScale", { value: Number(e.target.value) })}
          />
          <span className="muted">{state.spotlightScale.toFixed(2)}×</span>
        </label>
        <label className="toggle-row">
          Scoreboard text size <span className="muted">(Shared Screen only)</span>
          <input
            type="range"
            min={MIN_SCOREBOARD_SCALE}
            max={MAX_SCOREBOARD_SCALE}
            step={0.05}
            disabled={!hasLobbyAuthority}
            value={state.scoreboardScale}
            onChange={(e) => socket.emit("setScoreboardScale", { value: Number(e.target.value) })}
          />
          <span className="muted">{state.scoreboardScale.toFixed(2)}×</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.tableStyle.maxCardSize === null}
            onChange={(e) =>
              applyTableStyle({ maxCardSize: e.target.checked ? null : DEFAULT_MAX_CARD_SIZE })
            }
          />
          Unlimited card size
          <span className="muted"> (old fill-everything behavior)</span>
        </label>
        <label className="toggle-row">
          Max card size
          <input
            type="range"
            min={MIN_MAX_CARD_SIZE}
            max={MAX_MAX_CARD_SIZE}
            step={MAX_CARD_SIZE_STEP}
            disabled={!hasLobbyAuthority || state.tableStyle.maxCardSize === null}
            value={state.tableStyle.maxCardSize ?? DEFAULT_MAX_CARD_SIZE}
            onChange={(e) => applyTableStyle({ maxCardSize: Number(e.target.value) })}
          />
          <span className="muted">
            {state.tableStyle.maxCardSize === null ? "Unlimited" : `${state.tableStyle.maxCardSize}px`}
          </span>
        </label>
        <p className="muted">
          Black card text is independent of overall Shared Screen size — adjustable anytime, not just here.
        </p>
        <p className="muted">
          During a round, the {state.roleNames.judge} or Shared Screen can also nudge size up/down remotely from the +/− buttons in the header.
        </p>
        {hasLobbyAuthority && (
          <div className="row">
            <button type="button" onClick={saveCurrentAsPreset}>
              Save as preset
            </button>
          </div>
        )}
        {presets.length > 0 && (
          <div className="stack">
            {presets.map((preset) => (
              <div className="player-row" key={preset.name}>
                <button type="button" disabled={!hasLobbyAuthority} onClick={() => applyPreset(preset)}>
                  {preset.name}
                </button>
                <button type="button" onClick={() => removePreset(preset.name)} aria-label={`Delete preset ${preset.name}`}>
                  <CloseCircleIcon />
                </button>
              </div>
            ))}
          </div>
        )}

      </SettingsSection>

      <SettingsSection title="Packs" summary={packsSummary(state, totalWhite, totalBlack)}>
        <p className="muted">
          {selected.size} packs selected · {totalWhite} white · {totalBlack} black
          {state.deckOptions.useCustomCards && " · plus your submitted custom cards"}
        </p>
        {hasLobbyAuthority && packSelectionPresets.length > 0 && (
          <div className="row">
            <span className="field-title">Apply a saved preset:</span>
            {packSelectionPresets.map((p) => (
              <button key={p.name} type="button" onClick={() => applyPackSelectionPreset(p)}>
                {p.name}
              </button>
            ))}
            <button type="button" className="link-btn" onClick={() => navigate("/custom-cards")}>
              Build one
            </button>
          </div>
        )}
        {hasLobbyAuthority && (
          <div className="row">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter packs…"
            />
            <button type="button" onClick={selectAll}>
              Select all
            </button>
            <button type="button" onClick={clearSelection}>
              Clear
            </button>
          </div>
        )}
        {allCategories.length > 1 && (
          <div className="row">
            <button
              type="button"
              className={categoryFilter === null ? "filter-chip selected" : "filter-chip"}
              onClick={() => setCategoryFilter(null)}
            >
              All sections
            </button>
            {allCategories.map((c) => (
              <button
                key={c}
                type="button"
                className={categoryFilter === c ? "filter-chip selected" : "filter-chip"}
                onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          <span className="pick-row">
            <button
              type="button"
              className={sortMode === "name" ? "pick-btn selected" : "pick-btn"}
              onClick={() => setSortMode("name")}
            >
              Name
            </button>
            <button
              type="button"
              className={sortMode === "size" ? "pick-btn selected" : "pick-btn"}
              onClick={() => setSortMode("size")}
            >
              Size
            </button>
          </span>
          <label className="toggle-row" style={{ marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={showSelectedOnly}
              onChange={(e) => setShowSelectedOnly(e.target.checked)}
            />
            Selected only
          </label>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.deckOptions.excludeDuplicates}
            onChange={(e) =>
              socket.emit("updateDeckOptions", { deckOptions: { excludeDuplicates: e.target.checked } })
            }
          />
          Exclude duplicate cards
          <span className="muted"> (drops repeats of the same card text across packs)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority || state.deckOptions.vulgarOnly}
            checked={state.deckOptions.excludeVulgar}
            onChange={(e) => socket.emit("updateDeckOptions", { deckOptions: { excludeVulgar: e.target.checked } })}
          />
          Exclude vulgar cards
          <span className="muted"> (filters crude/explicit language — keyword-based, not perfect)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority || state.deckOptions.excludeVulgar}
            checked={state.deckOptions.vulgarOnly}
            onChange={(e) => socket.emit("updateDeckOptions", { deckOptions: { vulgarOnly: e.target.checked } })}
          />
          Vulgar white cards only
          <span className="muted"> (keeps only white cards flagged as vulgar — can't be combined with Exclude vulgar cards)</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            disabled={!hasLobbyAuthority}
            checked={state.deckOptions.useCustomCards}
            onChange={(e) => socket.emit("updateDeckOptions", { deckOptions: { useCustomCards: e.target.checked } })}
          />
          Use Submitted Custom Cards
          <span className="muted">
            {" "}
            (adds any cards submitted via the{" "}
            <button type="button" className="link-btn" onClick={() => navigate("/custom-cards")}>
              Custom Cards and Presets page
            </button>
            , on top of selected packs)
          </span>
        </label>
        {categoryGroups.map((g) => (
          <PackSection
            key={g.category}
            title={g.category}
            packs={g.packs}
            selected={selected}
            collapsed={!isActivelyFiltering && collapsedSections.has(g.category)}
            onToggleCollapsed={() => toggleSectionCollapsed(g.category)}
            canToggle={hasLobbyAuthority}
            onTogglePack={togglePack}
            onPreview={setPreviewPack}
          />
        ))}
        <PackSection
          title="Custom Sets"
          packs={customSetPacks}
          selected={selected}
          collapsed={!isActivelyFiltering && collapsedSections.has("customSets")}
          onToggleCollapsed={() => toggleSectionCollapsed("customSets")}
          canToggle={hasLobbyAuthority}
          onTogglePack={togglePack}
          onPreview={setPreviewPack}
        />

      {previewPack && (
        <PackPreviewModal
          pack={previewPack}
          selected={selected.has(previewPack.id)}
          canToggle={hasLobbyAuthority}
          onToggle={() => togglePack(previewPack.id)}
          onClose={() => setPreviewPack(null)}
        />
      )}

      </SettingsSection>

      {/* A last sanity check before starting, so the host doesn't have to
          reopen every section to confirm what they set. */}
      <div className="panel changes-summary">
        <p className="changes-summary-head">Not the defaults</p>
        {changesFromDefault(state).length === 0 ? (
          <p className="muted">Standard game — nothing changed.</p>
        ) : (
          <p>{changesFromDefault(state).join(" · ")}</p>
        )}
      </div>

      <div className="stack">
        {hasLobbyAuthority && blockers.length > 0 && (
          <ul className="blocker-list">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {isHost ? (
          <button className="primary" onClick={() => socket.emit("startGame")} disabled={blockers.length > 0}>
            Start Game
          </button>
        ) : (
          <p className="center-text muted">Waiting for the host to start the game…</p>
        )}
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
