import type { BlackCard, WhiteCard } from "@tabletop-judge/shared";
import type { ServerPlayer } from "../types.js";

// Wild Card: a virtual player who never wins or scores. Hooks into
// Dealing (draws a hand like anyone else) and Submission (auto-fills a
// lineup entry) only — see CLAUDE.md's house rules section.
export const WILD_CARD_PLAYER_ID = "wild-card";

export function createWildCardPlayer(name: string): ServerPlayer {
  return {
    id: WILD_CARD_PLAYER_ID,
    token: "",
    name,
    role: "player",
    socketId: null,
    connected: true,
    isHost: false,
    isWildCard: true,
    hand: [],
    score: 0,
    wonBlackCards: [],
    personalCards: [],
    personalDeck: [],
  };
}

export function dealToWildCard(wildCard: ServerPlayer, drawWhiteCard: () => WhiteCard | null, handSize: number): void {
  while (wildCard.hand.length < handSize) {
    const card = drawWhiteCard();
    if (!card) break;
    wildCard.hand.push(card);
  }
}

export function autoSubmitWildCard(wildCard: ServerPlayer, blackCard: BlackCard): WhiteCard[] {
  const cards: WhiteCard[] = [];
  for (let i = 0; i < blackCard.pick && wildCard.hand.length > 0; i++) {
    const index = Math.floor(Math.random() * wildCard.hand.length);
    cards.push(wildCard.hand.splice(index, 1)[0]);
  }
  return cards;
}
