import type { PublicPlayer, RoomStateForClient } from "@tabletop-judge/shared";

/** Who's required to submit this round, and how many already have - shared
 * by WaitingPanel's ambient text and the Shared Screen's Dense/Command
 * Strip status chrome, so there's exactly one definition of "required". */
export function getSubmissionProgress(state: RoomStateForClient): {
  requiredPlayers: PublicPlayer[];
  submittedCount: number;
} {
  const requiredPlayers = state.players.filter(
    (p) => p.role === "player" && !p.isRando && (state.votingThisRound || !p.isCzar)
  );
  const submittedCount = requiredPlayers.filter((p) => p.hasSubmitted).length;
  return { requiredPlayers, submittedCount };
}
