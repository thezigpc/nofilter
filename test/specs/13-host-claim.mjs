import { makeRoom, selectOfficialPacks, waitFor, waitForDeal, wait, assert } from "../harness.mjs";

export const name = "A disconnected host can be replaced, but only after the grace period";

// Overridden so the spec doesn't have to sit through the real two minutes.
export const serverEnv = { HOST_CLAIM_AFTER_SECONDS: "2" };

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl, ["Alice", "Bob", "Carol"]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateWinCondition", { target: 500 });
    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    const [host, bob] = room.clients;
    assert(host.me.isHost, "the first player should be host");
    assert(bob.state.hostClaimableAt === null, "host is present, so nothing should be claimable");

    // Claiming while the host is connected must be refused.
    const earlyErrors = bob.errors.length;
    bob.emit("claimHost");
    await waitFor(() => bob.errors.length > earlyErrors, { label: "the too-early rejection" });
    assert(
      bob.errors.slice(earlyErrors).some((e) => e.code === "HOST_PRESENT"),
      "claiming host while the host is connected should be refused"
    );

    // The host's phone dies mid-game.
    host.close();
    await waitFor(() => bob.state.players.find((p) => p.id === host.state.you.id)?.connected === false, {
      label: "the host to register as disconnected",
    });

    // Mid-game disconnects keep host status, so the room is now stuck until
    // the grace period elapses - that's the situation this feature exists for.
    assert(
      bob.state.players.find((p) => p.id === host.state.you.id)?.isHost,
      "a mid-game disconnect should keep host status rather than reassigning immediately"
    );
    assert(bob.state.hostClaimableAt !== null, "a claim deadline should now be published to clients");

    // Still too early.
    const tooSoonErrors = bob.errors.length;
    bob.emit("claimHost");
    await waitFor(() => bob.errors.length > tooSoonErrors, { label: "the not-yet rejection" });
    assert(
      bob.errors.slice(tooSoonErrors).some((e) => e.code === "HOST_NOT_GONE_YET"),
      `expected HOST_NOT_GONE_YET, got ${JSON.stringify(bob.errors.slice(tooSoonErrors))}`
    );
    assert(!bob.me.isHost, "host must not change before the grace period elapses");

    // Wait it out, then take over.
    await waitFor(() => Date.now() >= bob.state.hostClaimableAt, {
      timeout: 8000,
      label: "the grace period to elapse",
    });
    bob.emit("claimHost");
    await waitFor(() => bob.me.isHost, { label: "the claim to succeed" });

    // Exactly one host, and the new one can actually use host powers.
    const hosts = bob.state.players.filter((p) => p.isHost);
    assert(hosts.length === 1, `there should be exactly one host, found ${hosts.length}`);

    const endErrors = bob.errors.length;
    bob.emit("endGame");
    await waitFor(() => bob.state.phase === "gameEnd", { label: "the new host to be able to end the game" });
    assert(bob.errors.length === endErrors, "the new host's action should not have been rejected");
  } finally {
    room.closeAll();
  }
}
