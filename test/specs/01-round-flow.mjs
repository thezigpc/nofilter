import { makeRoom, selectOfficialPacks, playRound, waitFor, waitForDeal, assert, assertEqual } from "../harness.mjs";

export const name = "Round flow: deal → submit → reveal → judge → score";

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    // Everyone gets a full hand, and exactly one player is Czar.
    for (const c of room.clients) {
      assertEqual(c.state.yourHand.length, c.state.handSize, `${c.name} should be dealt a full hand`);
    }
    assertEqual(
      room.clients.filter((c) => c.me.isCzar).length,
      1,
      "exactly one player should be Czar"
    );

    // The Czar must not be able to submit.
    const czar = room.clients.find((c) => c.me.isCzar);
    czar.emit("submitCards", { cardIds: [czar.state.yourHand[0].id] });
    await waitFor(() => czar.errors.some((e) => e.code === "YOU_ARE_CZAR"), {
      label: "server to reject the Czar submitting",
    });

    await playRound(room);

    // Exactly one player scored, and the round is in history.
    const scored = room.host.state.players.filter((p) => p.score === 1);
    assertEqual(scored.length, 1, "exactly one player should have scored");
    assert(!scored[0].isCzar, "the Czar should not have won their own round");

    await waitFor(() => room.host.state.roundHistory?.length === 1, { label: "round history to record the round" });

    // Next round deals a new Czar and refills hands.
    await room.host.waitForPhase("submission");
    await waitForDeal(room);
    const newCzar = room.clients.find((c) => c.me.isCzar);
    assert(newCzar.name !== czar.name, "the Czar should rotate to a different player");
    for (const c of room.clients) {
      assertEqual(c.state.yourHand.length, c.state.handSize, `${c.name}'s hand should refill for the next round`);
    }
  } finally {
    room.closeAll();
  }
}
