import type { ComponentType, SVGProps } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import { ACTION_CARD_DEFS } from "@tabletop-judge/shared";
import {
  BoltCardIcon,
  CardsStackIcon,
  CoinIcon,
  DiceIcon,
  DoorExitIcon,
  FlagIcon,
  InboxIcon,
  LayersIcon,
  NoScoreIcon,
  OneIcon,
  PauseIcon,
  PencilIcon,
  PepperIcon,
  PlusCardIcon,
  QuoteIcon,
  RefreshIcon,
  ShieldCheckIcon,
  ShuffleIcon,
  SwapIcon,
  VoteIcon,
} from "./Icons.js";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface SummaryItem {
  Icon: IconType;
  name: string;
  detail?: string;
}

/** Joins names for reading aloud at a glance, capping the list so one
 * heavily-customised setting can't push everything else out of the panel. */
function nameList(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

/**
 * The Action Cards summary line for a shared screen read from across a
 * room. The density percentage is the least useful thing here - what
 * actually changes how people play is knowing *which* cards are in the
 * deck - so the wording leads with the exceptions.
 *
 * Phrasing flips on the majority so it never degenerates into an
 * eight-item "without" list: mostly-on reads "without Tax, Reverse",
 * mostly-off reads "only Tax, Peek".
 */
function describeActionCards(state: RoomStateForClient): string {
  const realPlayerCount = state.players.filter((p) => p.role === "player" && !p.isWildCard).length;
  const available = ACTION_CARD_DEFS.filter(
    (d) => !(d.requiresJudgeMode && state.houseRules.crowdFavorite) && (!d.minRealPlayers || realPlayerCount >= d.minRealPlayers)
  );
  const tiers = state.actionCardTiers ?? {};
  const tierOf = (id: string) => tiers[id] ?? "normal";

  const parts: string[] = [`${state.actionCardDensity}%`];

  const off = available.filter((d) => tierOf(d.id) === "off");
  const on = available.filter((d) => tierOf(d.id) !== "off");
  if (on.length === 0) {
    return `${state.actionCardDensity}% · none enabled`;
  }
  if (off.length > 0) {
    parts.push(
      on.length >= off.length ? `without ${nameList(off.map((d) => d.name))}` : `only ${nameList(on.map((d) => d.name))}`
    );
  }

  // Tier deviations are worth naming; "normal" is the default and says nothing.
  const rare = on.filter((d) => tierOf(d.id) === "rare").map((d) => d.name);
  const common = on.filter((d) => tierOf(d.id) === "common").map((d) => d.name);
  if (rare.length > 0) parts.push(`${nameList(rare, 2)} rare`);
  if (common.length > 0) parts.push(`${nameList(common, 2)} common`);

  return parts.join(" · ");
}

/** Every House Rule that's off by default is listed when it's on; the two
 * that are ON by default (Auto Draw, Catch Up New Players) are listed only
 * when turned off, since that's the deviation worth a glance-at-a-distance
 * table actually knowing about. */
function getActiveHouseRules(state: RoomStateForClient): SummaryItem[] {
  const r = state.houseRules;
  const items: SummaryItem[] = [];
  if (r.wildCard) {
    items.push({ Icon: DiceIcon, name: state.roleNames.wildCard, detail: r.wildCardCanScore ? "can win" : undefined });
  }
  if (r.doubleDown) items.push({ Icon: CoinIcon, name: "Double Down", detail: `${state.doubleDownWindowSeconds}s window` });
  if (r.tradeIn) items.push({ Icon: SwapIcon, name: "Trade-In" });
  if (r.handRefresh) items.push({ Icon: RefreshIcon, name: "Hand Refresh" });
  if (r.customPrompts) items.push({ Icon: QuoteIcon, name: "Custom Prompts" });
  if (r.crowdFavorite) items.push({ Icon: VoteIcon, name: "Crowd Favorite" });
  if (r.noScorekeeping) items.push({ Icon: NoScoreIcon, name: "No Scorekeeping" });
  if (r.personalCards) {
    items.push({
      Icon: PencilIcon,
      name: "Personal Cards",
      detail: `${state.personalCardsWindowMinutes} min, up to ${state.personalCardsMaxCount}`,
    });
  }
  if (r.pickBonus) items.push({ Icon: PlusCardIcon, name: "Pick Bonus" });
  if (r.singleAnswerOnly) items.push({ Icon: OneIcon, name: "Single Answer Only" });
  if (r.actionCards) items.push({ Icon: BoltCardIcon, name: "Action Cards", detail: describeActionCards(state) });
  if (!r.autoDraw) items.push({ Icon: PauseIcon, name: "Auto Draw off" });
  if (!r.catchUpNewPlayers) items.push({ Icon: DoorExitIcon, name: "Catch Up off" });
  return items;
}

/** Deck/game settings worth surfacing alongside House Rules - vulgar
 * filtering specifically since it directly sets expectations for the
 * table, plus the core values (win target, hand size) that always apply
 * regardless of which house rules are on. These are shown unconditionally,
 * standard value included, rather than only on deviation from default -
 * unlike House Rules (genuinely optional features, worth hiding when off),
 * "what's the hand size right now" is a fact the table should always be
 * able to read at a glance, not something that goes quiet exactly when
 * it's at the value most people assume. */
function getSettingsSummary(state: RoomStateForClient): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (state.deckOptions.vulgarOnly) items.push({ Icon: PepperIcon, name: "Vulgar Only" });
  else if (state.deckOptions.excludeVulgar) items.push({ Icon: ShieldCheckIcon, name: "Vulgar Excluded" });
  else items.push({ Icon: ShuffleIcon, name: "Mixed", detail: "vulgar + clean" });
  if (state.deckOptions.useCustomCards) items.push({ Icon: InboxIcon, name: "Custom Cards included" });
  if (state.packs.some((p) => p.isCustomSet && state.selectedPackIds.includes(p.id))) {
    items.push({ Icon: LayersIcon, name: "Custom Sets", detail: "selected" });
  }
  const { mode, target } = state.winCondition;
  items.push({
    Icon: FlagIcon,
    name: mode === "rounds" ? "Playing" : "Win at",
    detail:
      mode === "rounds"
        ? `${target} round${target === 1 ? "" : "s"}`
        : `${target} black card${target === 1 ? "" : "s"}`,
  });
  items.push({ Icon: CardsStackIcon, name: "Hand size", detail: `${state.handSize} cards` });
  return items;
}

function Row({ item, muted = false }: { item: SummaryItem; muted?: boolean }) {
  const { Icon } = item;
  return (
    <div className={`rules-panel-row${muted ? " setting-row" : ""}`}>
      <Icon className="icon" />
      <div className="text">
        <span className="name">{item.name}</span>
        {item.detail && <span className="detail">{item.detail}</span>}
      </div>
    </div>
  );
}

/** Shown beside the Table's Invite QR during Lobby - a glanceable summary
 * of what's actually configured for this game, since that's otherwise only
 * visible by opening the full Settings panel. Uses native CSS multi-column
 * flow (see .rules-columns in index.css) rather than a fixed two-column
 * grid: with few active rules, House Rules fills column 1 and Settings
 * starts at the top of column 2; with enough rules to overflow the
 * column's height, they spill into column 2 and push Settings down -
 * exactly the behavior of a real newspaper-style column flow, no manual
 * column-splitting logic needed. */
export default function RulesSummaryPanel({ state }: { state: RoomStateForClient }) {
  const houseRules = getActiveHouseRules(state);
  const settings = getSettingsSummary(state);
  if (houseRules.length === 0 && settings.length === 0) return null;

  return (
    <div className="rules-col">
      <div className="rules-columns">
        {houseRules.length > 0 && (
          <>
            <p className="rules-panel-subhead">House Rules</p>
            {houseRules.map((item) => (
              <Row key={item.name} item={item} />
            ))}
          </>
        )}
        {settings.length > 0 && (
          <>
            <p className="rules-panel-subhead">Settings</p>
            {settings.map((item) => (
              <Row key={item.name} item={item} muted />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
