import { makeRoom, selectOfficialPacks, ensureActionCard, waitFor, waitForDeal, wait, assert } from "../harness.mjs";

export const name = "Democracy makes the Judge a contestant and puts the round to a vote";

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl, [
    "Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi", "Ivan", "Judy",
  ]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", {
      houseRules: { actionCards: true, singleAnswerOnly: true, handRefresh: true },
    });
    room.host.emit("setActionCardDensity", { value: 15 });
    room.host.emit("updateHandSize", { value: 20 });
    room.host.emit("updateWinCondition", { target: 500 });
    await waitFor(() => room.host.state.actionCardDensity === 15 && room.host.state.handSize === 20, {
      label: "settings to apply",
    });

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    assert(!room.host.state.votingThisRound, "a normal Judge round should not be a voting round");

    // The Judge can't submit on a normal round.
    const judgeBefore = room.clients.find((c) => c.me?.isJudge);
    const judgeErrorsBefore = judgeBefore.errors.length;
    judgeBefore.emit("submitCards", { cardIds: [judgeBefore.state.yourHand[0].id] });
    await waitFor(() => judgeBefore.errors.length > judgeErrorsBefore, { label: "the Judge's submission to be refused" });
    assert(
      judgeBefore.errors.slice(judgeErrorsBefore).some((e) => e.code === "YOU_ARE_JUDGE"),
      "the Judge should not be able to submit on a normal round"
    );

    // Democracy must be played before the actor has committed their own
    // card, since it pulls the Judge in as a contestant.
    const found = await ensureActionCard(room, "democracy");
    found.owner.emit("playActionCard", { cardId: found.cardId });
    await waitFor(() => room.host.state.votingThisRound, { label: "the round to become a voting round" });

    // Now the Judge is a full contestant: they submit like everyone else.
    const contestant = room.clients.find((c) => c.me?.isJudge);
    const pick = room.host.state.blackCard?.pick ?? 1;
    for (const c of room.clients) {
      if (!c.me || c.state.yourSubmissionId) continue;
      const jokes = (c.state.yourHand ?? []).filter((card) => !card.actionCardId);
      const ids = jokes.slice(0, pick).map((card) => card.id);
      if (ids.length === pick) c.emit("submitCards", { cardIds: ids });
    }
    await waitFor(() => contestant.state.yourSubmissionId, { label: "the Judge's own submission to be accepted" });

    const judge = await waitFor(
      () => room.clients.find((c) => c.me?.isJudge && ["reveal", "judging"].includes(c.state.phase)),
      { label: "the judging board" }
    );
    for (const slot of judge.state.judgingBoard ?? []) {
      judge.emit("revealSubmission", { submissionId: slot.submissionId });
      await wait(50);
    }
    const board = await waitFor(
      () => {
        const b = judge.state.judgingBoard ?? [];
        return b.length && b.every((s) => s.revealed) ? b : null;
      },
      { label: "every submission revealed" }
    );

    // The Judge must not be able to unilaterally pick a winner this round.
    const errorsBefore = judge.errors.length;
    judge.emit("judgePick", { submissionId: board[0].submissionId });
    await waitFor(() => judge.errors.length > errorsBefore, { label: "judgePick to be rejected" });
    assert(
      judge.errors.slice(errorsBefore).some((e) => e.code === "RULE_DISABLED"),
      `judgePick should be refused during Democracy, got ${JSON.stringify(judge.errors.slice(errorsBefore))}`
    );

    // Everyone who submitted votes - the Judge included, since they now have
    // a card in the lineup like anyone else.
    const voters = room.clients.filter((c) => c.state.yourSubmissionId);
    assert(voters.some((c) => c.me?.isJudge), "the Judge should be one of the voters");

    for (let i = 0; i < voters.length; i++) {
      const voter = voters[i];
      const choice = board.find((s) => s.submissionId !== voter.state.yourSubmissionId);
      if (i < voters.length - 1) {
        voter.emit("voteForSubmission", { submissionId: choice.submissionId });
        await wait(50);
      } else {
        // Before the final vote the round must still be open.
        assert(
          room.host.state.phase === "judging",
          "the round must not resolve while a vote is still outstanding"
        );
        voter.emit("voteForSubmission", { submissionId: choice.submissionId });
      }
    }

    await waitFor(() => ["roundEnd", "gameEnd"].includes(room.host.state.phase), {
      label: "the round to resolve once every voter has voted",
    });

    // The flag is per-round: the next round goes back to the Judge deciding.
    await room.host.waitForPhase("submission");
    assert(!room.host.state.votingThisRound, "Democracy must not carry over into the next round");
  } finally {
    room.closeAll();
  }
}
