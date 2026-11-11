import type { ServerPlayer } from "../types.js";

// Double Down mechanic (CLAUDE.md):
//  1. Player submits a white card normally.
//  2. They're dealt a replacement immediately.
//  3. If they hold a black card won from a previous round, they may wager it
//     to also play that replacement as a second, separate lineup entry.
//  4. Win (either entry wins): keep the round's black card AND get the
//     wagered one back. Lose: the wagered black card is lost to the box.
//
// Scope limit for this pass: only offered on pick-1 rounds. The "second
// lineup entry" model maps cleanly onto a single extra card; a multi-card
// wager for pick-2/3 rounds was never specified, so it's left for later
// rather than guessed at.
export function canOfferDoubleDown(player: ServerPlayer, blackCardPick: number): boolean {
  return blackCardPick === 1 && player.role === "player" && !player.isRando;
}

export function isEligibleToWager(player: ServerPlayer): boolean {
  return player.wonBlackCards.length > 0;
}
