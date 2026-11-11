import type { BlackCard, WhiteCard } from "@tabletop-judge/shared";
import type { ServerPlayer } from "../types.js";

// Rando Cardrissian: a virtual player who never wins or scores. Hooks into
// Dealing (draws a hand like anyone else) and Submission (auto-fills a
// lineup entry) only — see CLAUDE.md's house rules section.
export const RANDO_PLAYER_ID = "rando";

export function createRandoPlayer(): ServerPlayer {
  return {
    id: RANDO_PLAYER_ID,
    token: "",
    name: "Rando Cardrissian",
    role: "player",
    socketId: null,
    connected: true,
    isHost: false,
    isRando: true,
    hand: [],
    score: 0,
    wonBlackCards: [],
    personalCards: [],
    personalDeck: [],
  };
}

export function dealToRando(rando: ServerPlayer, drawWhiteCard: () => WhiteCard | null, handSize: number): void {
  while (rando.hand.length < handSize) {
    const card = drawWhiteCard();
    if (!card) break;
    rando.hand.push(card);
  }
}

export function autoSubmitRando(rando: ServerPlayer, blackCard: BlackCard): WhiteCard[] {
  const cards: WhiteCard[] = [];
  for (let i = 0; i < blackCard.pick && rando.hand.length > 0; i++) {
    const index = Math.floor(Math.random() * rando.hand.length);
    cards.push(rando.hand.splice(index, 1)[0]);
  }
  return cards;
}
