import { makeRoom, makeClient, selectOfficialPacks, waitFor, waitForDeal, wait, assert } from "../harness.mjs";

export const name = "Catch Up New Players baselines off the lowest HUMAN player, never Rando";

/**
 * Rando never accumulates wonBlackCards (see finishRound in Room.ts -
 * gated purely on !isRando, independent of randoCanScore, since it has no
 * client to ever spend that currency). If the catch-up baseline calc ever
 * included Rando in its "lowest player" pool, a new joiner would always be
 * matched to 0 regardless of how far real players have actually gotten -
 * this locks in that it doesn't, even with real players holding won black
 * cards and Rando Can Win off (the default).
 */
export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl, ["Alice", "Bob", "Carol"]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", {
      houseRules: { randoCardrissian: true, catchUpNewPlayers: true, randoCanScore: false },
    });
    await waitFor(() => room.host.state.houseRules.randoCardrissian, { label: "Rando on" });

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    // Play rounds until every real human has won at least once, so the
    // human-only minimum is meaningfully above 0 (distinguishing it from
    // Rando's permanently-stuck-at-0 wonBlackCards count).
    for (let round = 0; round < 14; round++) {
      const humansStillAt0 = room.clients.filter((c) => c.me && !c.me.isRando && (c.me.wonBlackCardCount ?? 0) === 0);
      if (humansStillAt0.length === 0) break;
      const pick = room.host.state.blackCard?.pick ?? 1;
      for (const c of room.clients) {
        if (!c.me || c.me.isRando || c.state.yourSubmissionId) continue;
        if (c.state.you?.isCzar && !c.state.votingThisRound) continue;
        const jokes = (c.state.yourHand ?? []).filter((card) => !card.actionCardId);
        const ids = jokes.slice(0, pick).map((card) => card.id);
        if (ids.length === pick) c.emit("submitCards", { cardIds: ids });
      }
      await wait(300);
      const judge = await waitFor(
        () => room.clients.find((c) => c.me?.isCzar && ["reveal", "judging"].includes(c.state.phase)),
        { label: "judging board" }
      );
      for (const slot of judge.state.judgingBoard ?? []) {
        judge.emit("revealSubmission", { submissionId: slot.submissionId });
      }
      await wait(200);
      const board = judge.state.judgingBoard ?? [];
      // Prefer a slot owned by a real player who hasn't won yet; if that
      // player is the current round's Czar (can't have submitted), fall
      // back to any OTHER human's slot - never board[0] blindly, which
      // could just as easily be Rando's own submission.
      const preferred = room.clients.find(
        (c) => c.me && !c.me.isRando && (c.me.wonBlackCardCount ?? 0) === 0 && c.state.yourSubmissionId
      );
      const anyHuman = room.clients.find((c) => c.me && !c.me.isRando && c.state.yourSubmissionId);
      const chosen = preferred ?? anyHuman;
      const slot = board.find((s) => s.submissionId === chosen?.state.yourSubmissionId) ?? board[0];
      judge.emit("czarPick", { submissionId: slot.submissionId });
      await room.host.waitForPhase("submission");
      await waitForDeal(room);
    }

    const humanCounts = room.clients.filter((c) => c.me && !c.me.isRando).map((c) => c.me.wonBlackCardCount);
    assert(humanCounts.every((n) => n >= 1), `expected every human to have won at least once, got ${humanCounts}`);
    const lowestHuman = Math.min(...humanCounts);

    // A new player joins mid-game - their wonBlackCards must match the
    // lowest HUMAN, not Rando's permanent 0.
    const dave = makeClient(baseUrl, "Dave");
    await waitFor(() => dave.socket.connected, { label: "Dave socket connect" });
    const joinAck = await dave.ack("joinRoom", { roomCode: room.code, name: "Dave", role: "player" });
    if (!joinAck.ok) throw new Error(`Dave's join failed: ${JSON.stringify(joinAck)}`);
    dave.token = joinAck.token;
    room.clients.push(dave);
    await wait(500);
    assert(
      dave.me.wonBlackCardCount === lowestHuman,
      `expected Dave to catch up to ${lowestHuman} (lowest human), got ${dave.me.wonBlackCardCount}`
    );
  } finally {
    room.closeAll();
  }
}
