// Action Cards: special-effect cards mixed into the white-card draw pool
// (see Room.actionCardPool). Every card is classified by *interaction
// shape*, not by what it individually does - the client only ever needs to
// render one of four generic flows (ActionCardPlayPanel), never bespoke UI
// per card. Adding a new card is a new entry here, not new UI, as long as
// it fits an existing shape.
export type ActionCardShape = "target" | "targetAndGive" | "self" | "flavor";
export type ActionCardTiming = "immediate" | "nextRound" | "laterThisRound";

export interface ActionCardDef {
  id: string;
  /** Shown as the card's "text" in hand. */
  name: string;
  /** Shown when playing it / in the play-confirmation UI. */
  description: string;
  shape: ActionCardShape;
  timing: ActionCardTiming;
  /** Spends one won black card to play - default false (free). */
  costsWonBlackCard?: boolean;
  /** Only meaningful in a Judge-judged game, so it's left out of the deck
   * entirely when Crowd Favorite is on rather than being drawable and then
   * refused (see Room.buildDecks / playActionCard). */
  requiresJudgeMode?: boolean;
  /** Needs at least this many real (non-Wild Card) players to be meaningful -
   * left out of the deck entirely below that floor, same "filter at
   * deck-build, guard again at play-time" pattern as requiresJudgeMode (see
   * Room.buildDecks / playActionCard). */
  minRealPlayers?: number;
}

export const ACTION_CARD_DEFS: ActionCardDef[] = [
  {
    id: "steal",
    name: "Steal",
    description: "Take a random card from a player, give them one of yours.",
    shape: "targetAndGive",
    timing: "immediate",
  },
  {
    id: "peek",
    name: "Peek",
    description: "See whether a player is currently holding an Action Card.",
    shape: "target",
    timing: "immediate",
  },
  {
    id: "discard_bomb",
    name: "Discard Bomb",
    description: "A player discards their whole hand and draws a fresh one.",
    shape: "target",
    timing: "immediate",
  },
  {
    id: "card_block",
    name: "Card Block",
    description: "A player can't draw any cards next round.",
    shape: "target",
    timing: "nextRound",
  },
  {
    id: "triple_boost",
    name: "Triple Boost",
    description: "Draw 3 bonus cards right now.",
    shape: "self",
    timing: "immediate",
  },
  {
    id: "judge_accent",
    name: "Do the Voice",
    description: "The {judge} must read every submission in an accent this round.",
    shape: "flavor",
    timing: "laterThisRound",
  },
  {
    id: "tax",
    name: "Tax",
    description: "Take a won black card from another player.",
    shape: "target",
    timing: "immediate",
  },
  {
    id: "reverse_judging",
    name: "Reverse",
    description: "Pick the WORST card this round, not the best.",
    shape: "flavor",
    timing: "laterThisRound",
  },
  {
    id: "democracy",
    name: "Democracy",
    description: "Everyone votes for the winner this round instead of the {judge}.",
    shape: "self",
    timing: "laterThisRound",
    // Crowd Favorite already puts every round to a vote, so this would be a
    // dead card in that mode.
    requiresJudgeMode: true,
    // A vote needs an actual electorate - with only 2 real players, playing
    // it just turns the Judge into a second contestant with nobody left to
    // judge between them.
    minRealPlayers: 3,
  },
];

export function getActionCardDef(id: string): ActionCardDef | undefined {
  return ACTION_CARD_DEFS.find((d) => d.id === id);
}

// Action Card instances are generated and shuffled directly into the real
// white deck at buildDecks() time (not a separate shadow pool) - the count
// is a percentage of the deck's actual white-card total, host-adjustable,
// so the rarity stays consistent regardless of how many packs are
// selected. Expressed as a whole-number percent (3 = 3%) for a simple
// slider UI.
export const DEFAULT_ACTION_CARD_DENSITY = 3;
export const MIN_ACTION_CARD_DENSITY = 1;
export const MAX_ACTION_CARD_DENSITY = 15;

/** Per-card frequency, chosen instead of a per-card percentage: nine
 * sliders is unusable on a phone and impossible to summarise on the shared
 * screen, whereas tiers are nameable ("Tax rare, Steal common"). The room's
 * single density still decides *how many* Action Cards get seeded; tiers
 * only shift the mix between them. */
export type ActionCardTier = "off" | "rare" | "normal" | "common";

export const ACTION_CARD_TIERS: ActionCardTier[] = ["off", "rare", "normal", "common"];
export const DEFAULT_ACTION_CARD_TIER: ActionCardTier = "normal";

export const ACTION_CARD_TIER_LABELS: Record<ActionCardTier, string> = {
  off: "Off",
  rare: "Rare",
  normal: "Normal",
  common: "Common",
};

/** Relative weights behind the tier names. Deliberately not surfaced on the
 * shared screen - the table wants "Tax is rare", not "Tax is 0.4". Defaults
 * live in server config and are overridable per room (Lobby > Advanced). */
export interface ActionCardTierWeights {
  rare: number;
  normal: number;
  common: number;
}

export const MIN_ACTION_CARD_TIER_WEIGHT = 0.1;
export const MAX_ACTION_CARD_TIER_WEIGHT = 10;

/** A tier map covering every card, filling in the default for anything the
 * room hasn't explicitly set (including cards added in a later release). */
export function resolveTiers(tiers: Record<string, ActionCardTier> | undefined): Record<string, ActionCardTier> {
  const out: Record<string, ActionCardTier> = {};
  for (const def of ACTION_CARD_DEFS) {
    out[def.id] = tiers?.[def.id] ?? DEFAULT_ACTION_CARD_TIER;
  }
  return out;
}
