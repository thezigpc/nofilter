import { makeRoom, selectOfficialPacks, playRound, waitFor, waitForDeal, assert, assertEqual } from "../harness.mjs";

export const name = "Round flow: deal → submit → reveal → judge → score";

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    // Everyone gets a full hand, and exactly one player is Judge.
    for (const c of room.clients) {
      assertEqual(c.state.yourHand.length, c.state.handSize, `${c.name} should be dealt a full hand`);
    }
    assertEqual(
      room.clients.filter((c) => c.me.isJudge).length,
      1,
      "exactly one player should be Judge"
    );

    // The Judge must not be able to submit.
    const judge = room.clients.find((c) => c.me.isJudge);
    judge.emit("submitCards", { cardIds: [judge.state.yourHand[0].id] });
    await waitFor(() => judge.errors.some((e) => e.code === "YOU_ARE_JUDGE"), {
      label: "server to reject the Judge submitting",
    });

    await playRound(room);

    // Exactly one player scored, and the round is in history.
    const scored = room.host.state.players.filter((p) => p.score === 1);
    assertEqual(scored.length, 1, "exactly one player should have scored");
    assert(!scored[0].isJudge, "the Judge should not have won their own round");

    await waitFor(() => room.host.state.roundHistory?.length === 1, { label: "round history to record the round" });

    // Next round deals a new Judge and refills hands.
    await room.host.waitForPhase("submission");
    await waitForDeal(room);
    const newJudge = room.clients.find((c) => c.me.isJudge);
    assert(newJudge.name !== judge.name, "the Judge should rotate to a different player");
    for (const c of room.clients) {
      assertEqual(c.state.yourHand.length, c.state.handSize, `${c.name}'s hand should refill for the next round`);
    }
  } finally {
    room.closeAll();
  }
}
