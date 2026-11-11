import {
  makeRoom,
  selectOfficialPacks,
  playRound,
  ensureActionCard,
  waitFor,
  waitForDeal,
  assert,
  assertEqual,
} from "../harness.mjs";

export const name = "Tax moves a black card and its point; Reverse sets a judging instruction";

export default async function ({ baseUrl }) {
  // Enough players at max hand size that a specific Action Card type is
  // very likely in the opening deal; ensureActionCard redeals once if not.
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

    // ---- Reverse: pure flavour, just a judging-time instruction.
    {
      const found = await ensureActionCard(room, "reverse_judging");
      found.owner.emit("playActionCard", { cardId: found.cardId });
      await waitFor(() => (room.host.state.pendingJudgingMessage ?? "").includes("WORST"), {
        label: "Reverse to set its judging instruction",
      });
    }

    // ---- Tax needs a target holding a won black card, so play a round first.
    await playRound(room);
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    const holder = await waitFor(
      () => room.host.state.players.find((p) => !p.isWildCard && p.wonBlackCardCount > 0),
      { label: "someone to hold a won black card" }
    );
    const scoreBefore = holder.score;
    const cardsBefore = holder.wonBlackCardCount;
    assert(cardsBefore > 0, "the round winner should hold a won black card");

    // You can't tax yourself, so the actor must be someone else.
    const tax = await ensureActionCard(room, "tax", { excludePlayerId: holder.id });

    const actorId = tax.owner.state.you.id;
    const actorBefore = room.host.state.players.find((p) => p.id === actorId);
    const actorCardsBefore = actorBefore.wonBlackCardCount;
    const actorScoreBefore = actorBefore.score;

    tax.owner.emit("playActionCard", { cardId: tax.cardId, targetPlayerId: holder.id });

    await waitFor(
      () => room.host.state.players.find((p) => p.id === holder.id)?.wonBlackCardCount === cardsBefore - 1,
      { label: "the taxed player to lose a black card" }
    );

    const holderAfter = room.host.state.players.find((p) => p.id === holder.id);
    const actorAfter = room.host.state.players.find((p) => p.id === actorId);

    // A won black card carries a point, so losing one costs the point too -
    // the same rule Trade-In and a lost Double Down wager already follow.
    assertEqual(holderAfter.score, Math.max(0, scoreBefore - 1), "the taxed player should lose the point too");
    // The actor gains spendable currency but not score: score only ever
    // rises by winning a round.
    assertEqual(
      actorAfter.wonBlackCardCount,
      actorCardsBefore + 1,
      "the actor should gain the black card as currency"
    );
    assertEqual(actorAfter.score, actorScoreBefore, "taxing must not raise the actor's score");
  } finally {
    room.closeAll();
  }
}
