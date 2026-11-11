import type { DeckOptions, HouseRules, WinCondition } from "./protocol.js";
import { DEFAULT_DECK_OPTIONS, DEFAULT_HAND_SIZE, DEFAULT_HOUSE_RULES, DEFAULT_WIN_CONDITION } from "./protocol.js";
import type { ActionCardTier } from "./actionCards.js";
import { DEFAULT_ACTION_CARD_DENSITY } from "./actionCards.js";

/**
 * A whole game configuration in one tap.
 *
 * Deliberately excludes pack selection: that already has its own preset
 * system (PackSelectionPreset), and two mechanisms fighting over the same
 * setting is worse than one doing less. A setup answers "how do we play?",
 * a pack preset answers "with which cards?".
 */
export interface GameSetup {
  houseRules: Partial<HouseRules>;
  winCondition?: WinCondition;
  handSize?: number;
  deckOptions?: Partial<DeckOptions>;
  actionCardDensity?: number;
  actionCardTiers?: Record<string, ActionCardTier>;
}

export interface GameSetupPreset extends GameSetup {
  name: string;
}

export interface BuiltInGameSetup extends GameSetup {
  id: string;
  name: string;
  /** One line explaining what you're getting, shown under the name. */
  description: string;
}

/**
 * Shipped setups. These exist because the real failure mode isn't "the
 * settings are hard to find" - it's that at 11pm nobody wants to configure
 * anything at all, so every game ends up on the defaults whether or not
 * they suit the group.
 */
export const BUILT_IN_GAME_SETUPS: BuiltInGameSetup[] = [
  {
    id: "classic",
    name: "Classic",
    description: "The standard game. No extras.",
    houseRules: { ...DEFAULT_HOUSE_RULES },
    winCondition: { ...DEFAULT_WIN_CONDITION },
    handSize: DEFAULT_HAND_SIZE,
    deckOptions: { ...DEFAULT_DECK_OPTIONS },
  },
  {
    id: "quick",
    name: "Quick",
    description: "Five rounds, single-answer prompts. Done in about fifteen minutes.",
    houseRules: { ...DEFAULT_HOUSE_RULES, singleAnswerOnly: true },
    winCondition: { mode: "rounds", target: 5 },
    handSize: DEFAULT_HAND_SIZE,
  },
  {
    id: "chaos",
    name: "Chaos",
    description: "Action Cards, Rando, Double Down and Trade-In all in play.",
    houseRules: {
      ...DEFAULT_HOUSE_RULES,
      randoCardrissian: true,
      doubleDown: true,
      tradeIn: true,
      actionCards: true,
      pickBonus: true,
    },
    winCondition: { mode: "blackCards", target: 7 },
    actionCardDensity: 6,
  },
  {
    id: "everyone-writes",
    name: "Everyone writes",
    description: "Write your own cards first, then vote instead of having a Czar.",
    houseRules: {
      ...DEFAULT_HOUSE_RULES,
      personalCards: true,
      crowdFavorite: true,
      handRefresh: true,
    },
    winCondition: { mode: "rounds", target: 8 },
  },
];

export function getBuiltInGameSetup(id: string): BuiltInGameSetup | undefined {
  return BUILT_IN_GAME_SETUPS.find((s) => s.id === id);
}
