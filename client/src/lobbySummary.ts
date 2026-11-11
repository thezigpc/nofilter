import type { RoomStateForClient } from "@tabletop-judge/shared";
import {
  DEFAULT_DECK_OPTIONS,
  DEFAULT_HAND_SIZE,
  DEFAULT_HOUSE_RULES,
  DEFAULT_WIN_CONDITION,
  TABLE_LAYOUT_LABELS,
  TABLE_THEME_ACCENTS,
  TABLE_THEME_LABELS,
} from "@tabletop-judge/shared";

/**
 * One-line summaries for the Lobby's collapsed sections, plus the
 * "not the defaults" list above Start Game.
 *
 * Kept together because they answer the same question at two levels of
 * detail, and because a collapsed section that doesn't say what's inside
 * just trades scrolling for guessing.
 */

const HOUSE_RULE_LABELS: Partial<Record<keyof typeof DEFAULT_HOUSE_RULES, string>> = {
  randoCardrissian: "Rando Cardrissian",
  randoCanScore: "Rando Can Win",
  doubleDown: "Double Down",
  tradeIn: "Trade-In",
  handRefresh: "Hand Refresh",
  noScorekeeping: "No Scorekeeping",
  customPrompts: "Custom Prompts",
  crowdFavorite: "Crowd Favorite",
  autoDraw: "Auto Draw",
  catchUpNewPlayers: "Catch Up New Players",
  personalCards: "Personal Cards",
  pickBonus: "Pick Bonus",
  singleAnswerOnly: "Single Answer Cards Only",
  actionCards: "Action Cards",
};

function winConditionText(state: RoomStateForClient): string {
  const { mode, target } = state.winCondition;
  return mode === "rounds"
    ? `${target} round${target === 1 ? "" : "s"}`
    : `win at ${target}`;
}

/** e.g. "2 on · win at 7" */
export function houseRulesSummary(state: RoomStateForClient): string {
  const onCount = (Object.keys(HOUSE_RULE_LABELS) as (keyof typeof DEFAULT_HOUSE_RULES)[]).filter(
    (key) => state.houseRules[key]
  ).length;
  return `${onCount} on · ${winConditionText(state)}`;
}

/** e.g. "Official · 19,604 cards" */
export function packsSummary(state: RoomStateForClient, whiteCount: number, blackCount: number): string {
  const selected = state.selectedPackIds.length;
  if (selected === 0 && !state.deckOptions.useCustomCards) return "none selected";
  const total = whiteCount + blackCount;
  return `${selected} pack${selected === 1 ? "" : "s"} · ${total.toLocaleString()} cards`;
}

/** e.g. "Bulletin · Cool Teal · Command Strip" */
export function sharedScreenSummary(state: RoomStateForClient): string {
  const theme = TABLE_THEME_LABELS[state.tableStyle.theme]?.name ?? state.tableStyle.theme;
  const accent = TABLE_THEME_ACCENTS[state.tableStyle.theme]?.[state.tableStyle.accentIndex]?.name ?? "";
  const layout = TABLE_LAYOUT_LABELS[state.tableStyle.layout]?.name ?? "";
  // Layout labels carry an "A · " / "B · " prefix that's only meaningful
  // next to the other option, not in a summary line.
  const shortLayout = layout.replace(/^[AB] · /, "");
  const background =
    state.tableStyle.backgroundStyle === "scene"
      ? "scene background"
      : state.tableStyle.backgroundStyle === "flat"
        ? "flat background"
        : "";
  return [theme, accent, shortLayout, state.tableStyle.cardMode ? "card-like sizing" : "", background]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Everything differing from a fresh room's defaults — the sanity check
 * before starting. Returns [] when nothing has been changed, which is
 * itself worth saying rather than rendering an empty box.
 */
export function changesFromDefault(state: RoomStateForClient): string[] {
  const out: string[] = [];

  for (const [key, label] of Object.entries(HOUSE_RULE_LABELS) as [
    keyof typeof DEFAULT_HOUSE_RULES,
    string
  ][]) {
    const now = state.houseRules[key];
    if (now === DEFAULT_HOUSE_RULES[key]) continue;
    out.push(now ? label : `${label} off`);
  }

  if (
    state.winCondition.mode !== DEFAULT_WIN_CONDITION.mode ||
    state.winCondition.target !== DEFAULT_WIN_CONDITION.target
  ) {
    out.push(
      state.winCondition.mode === "rounds"
        ? `${state.winCondition.target} rounds`
        : `win at ${state.winCondition.target}`
    );
  }
  if (state.handSize !== DEFAULT_HAND_SIZE) out.push(`hand size ${state.handSize}`);

  if (state.deckOptions.excludeVulgar !== DEFAULT_DECK_OPTIONS.excludeVulgar) out.push("vulgar excluded");
  if (state.deckOptions.vulgarOnly !== DEFAULT_DECK_OPTIONS.vulgarOnly) out.push("vulgar only");
  if (state.deckOptions.excludeDuplicates !== DEFAULT_DECK_OPTIONS.excludeDuplicates) out.push("duplicates excluded");
  if (state.deckOptions.useCustomCards !== DEFAULT_DECK_OPTIONS.useCustomCards) out.push("custom cards included");

  return out;
}
