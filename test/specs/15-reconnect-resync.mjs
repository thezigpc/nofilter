import { makeRoom, selectOfficialPacks, waitFor, waitForDeal, wait, assert, assertEqual } from "../harness.mjs";

export const name = "A reconnecting client rebinds its seat and gets fresh state";

/**
 * Reproduces the desync reported from a real game.
 *
 * socket.io reconnects on its own after a network blip, but the
 * reconnected socket is brand new server-side: its handler closure has no
 * roomCode or playerId, so the server has no idea who it is and never
 * sends it another roomState. The client used to send joinRoom only once
 * on mount, so after any dropped connection a phone would sit on stale
 * state indefinitely while the rest of the table played on.
 *
 * This drives the socket layer directly rather than a browser, so it tests
 * the actual contract: re-sending the token on connect is what rebinds the
 * seat and pulls current state.
 */
export default async function ({ baseUrl }) {
  // Four players on purpose: a disconnected player is excluded from
  // "required to submit" (maybeAdvanceToReveal filters on connected), so
  // with only three the round would advance past submission the moment one
  // of the others played, and there would be no open round to rejoin into.
  const room = await makeRoom(baseUrl, ["Alice", "Bob", "Carol", "Dave"]);
  const [alice, bob, carol] = room.clients;
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateWinCondition", { target: 500 });
    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    const token = bob.token;
    assert(token, "the harness should have captured Bob's session token");
    const seatId = bob.state.you.id;
    const handBefore = (bob.state.yourHand ?? []).map((c) => c.id).sort();
    const blackBefore = room.host.state.blackCard.id;

    // --- Bob's phone drops off the network.
    bob.socket.disconnect();
    await waitFor(() => alice.state.players.find((p) => p.id === seatId)?.connected === false, {
      label: "the server to notice Bob dropped",
    });

    // --- One other player submits, so Bob's view is now genuinely stale
    // while the round is still open for him to rejoin into.
    const mover = [alice, carol].find((c) => c.me && !c.me.isJudge);
    // Must match the prompt: roughly one black card in ten is pick-2 or
    // pick-3, and submitting a single card for those is rejected outright
    // as WRONG_CARD_COUNT - which made this spec fail about that often.
    const pick = room.host.state.blackCard?.pick ?? 1;
    const moverCards = (mover.state.yourHand ?? []).filter((x) => !x.actionCardId).slice(0, pick);
    assertEqual(moverCards.length, pick, "the mover needs enough cards for this prompt");
    mover.emit("submitCards", { cardIds: moverCards.map((c) => c.id) });
    await waitFor(() => alice.state.players.find((p) => p.id === mover.state.you.id)?.hasSubmitted, {
      label: "the other player's submission to land",
    });

    // --- Bob's socket comes back. This is the moment that used to fail:
    // reconnecting alone leaves the new socket anonymous to the server.
    bob.socket.connect();
    await waitFor(() => bob.socket.connected, { label: "Bob's transport to reconnect" });

    const stateBeforeRejoin = bob.state;
    // Re-sending the token is what actually rebinds the seat.
    const ack = await bob.ack("joinRoom", { roomCode: room.code, name: bob.name, role: "player", token });
    assert(ack.ok, `re-join should succeed, got ${JSON.stringify(ack)}`);

    await waitFor(() => bob.state !== stateBeforeRejoin, { label: "fresh state to arrive after re-joining" });

    // --- Same seat, same hand, and now in step with everyone else.
    assertEqual(bob.state.you.id, seatId, "re-joining must restore the same seat, not create a new player");
    assertEqual(
      (bob.state.yourHand ?? []).map((c) => c.id).sort().join(","),
      handBefore.join(","),
      "the hand must survive the reconnect"
    );
    await waitFor(() => alice.state.players.find((p) => p.id === seatId)?.connected === true, {
      label: "the server to mark Bob connected again",
    });

    // The decisive check: Bob's view now matches the table's, including
    // everything that happened while he was away.
    assertEqual(bob.state.phase, alice.state.phase, "phase must match the rest of the table after re-syncing");
    const bobSubmitted = bob.state.players.filter((p) => p.hasSubmitted).length;
    const aliceSubmitted = alice.state.players.filter((p) => p.hasSubmitted).length;
    assertEqual(bobSubmitted, aliceSubmitted, "Bob must see the submissions made while he was disconnected");
    assertEqual(bob.state.blackCard?.id, blackBefore, "same round should still be in play");

    // --- And he can still act, proving the seat is genuinely rebound
    // rather than just receiving read-only updates.
    if (!bob.me.isJudge && bob.state.phase === "submission" && !bob.me.hasSubmitted) {
      const bobPick = bob.state.blackCard?.pick ?? 1;
      const bobCards = (bob.state.yourHand ?? []).filter((x) => !x.actionCardId).slice(0, bobPick);
      const errorsBefore = bob.errors.length;
      bob.emit("submitCards", { cardIds: bobCards.map((c) => c.id) });
      await waitFor(() => bob.me.hasSubmitted, { label: "Bob to be able to submit after reconnecting" });
      assertEqual(bob.errors.length, errorsBefore, "submitting after a reconnect should not be rejected");
    }
  } finally {
    room.closeAll();
  }
}
