import { makeRoom, selectOfficialPacks, waitFor, waitForDeal, assert } from "../harness.mjs";

export const name = "Crowd Favorite: every voter sees the lineup revealed immediately, with no Judge reveal step";

/**
 * Regression test for a real bug: moveToReveal() always landed in the
 * face-down "reveal" phase and left flipping cards face-up gated behind
 * requireJudgeAuthority (Judge/Table only) - even in a voting round, where
 * the design intent is explicitly "No Judge in this mode" (see
 * Room.ts's isVotingRound doc comment). That left whichever player the
 * judge rotation still happened to point at as the sole person able to
 * reveal cards for everyone else to vote on, and everyone else stuck
 * staring at face-down cards until that one player acted - reported
 * directly as "the card judge still has control over what cards get
 * displayed" in a Crowd Favorite/Democracy round.
 */
export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl, ["Alice", "Bob", "Carol", "Dave"]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", { houseRules: { crowdFavorite: true } });
    await waitFor(() => room.host.state.houseRules.crowdFavorite, { label: "Crowd Favorite to be on" });

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    assert(room.host.state.votingThisRound, "a Crowd Favorite round should be a voting round");

    const pick = room.host.state.blackCard?.pick ?? 1;
    for (const c of room.clients) {
      if (!c.me || c.state.yourSubmissionId) continue;
      const jokes = (c.state.yourHand ?? []).filter((card) => !card.actionCardId);
      const ids = jokes.slice(0, pick).map((card) => card.id);
      if (ids.length === pick) c.emit("submitCards", { cardIds: ids });
    }

    // The round should reach judging on its own - critically, without
    // anyone ever calling revealSubmission.
    await waitFor(() => room.host.state.phase === "judging", { label: "phase to reach judging on its own" });

    const nonJudgeVoter = room.clients.find((c) => c.me && !c.me.isJudge);
    const board = nonJudgeVoter.state.judgingBoard ?? [];
    assert(board.length > 0, "judging board should be populated");
    assert(
      board.every((s) => s.revealed === true && Array.isArray(s.cards)),
      "every slot should already be revealed and visible to a non-Judge voter, with zero manual reveals"
    );

    // A non-judge player can vote immediately - no prior reveal action from
    // the judge was needed.
    const myChoice = board.find((s) => s.submissionId !== nonJudgeVoter.state.yourSubmissionId);
    const errorsBefore = nonJudgeVoter.errors.length;
    nonJudgeVoter.emit("voteForSubmission", { submissionId: myChoice.submissionId });
    await waitFor(() => nonJudgeVoter.state.yourVote === myChoice.submissionId, { label: "the vote to register" });
    assert(nonJudgeVoter.errors.length === errorsBefore, "voting should not be refused");
  } finally {
    room.closeAll();
  }
}
