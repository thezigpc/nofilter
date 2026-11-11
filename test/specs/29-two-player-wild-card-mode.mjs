import { makeRoom, selectOfficialPacks, ensureActionCard, waitFor, wait, assert, assertEqual } from "../harness.mjs";

export const name = "Wild Card lowers the floor to 2 real players, for starting and for staying alive";

/**
 * minPlayersToStart() already returned 2 with Wild Card on before this change -
 * what was missing was the *continuing* side: minPlayersToContinue() (née
 * the flat MIN_PLAYERS_TO_CONTINUE=3 constant) didn't know about Wild Card at
 * all, so a 3-real-player Wild Card game that lost one player to a leave was
 * force-ended even though a brand new room could have started fresh at 2
 * with the same rules on. Also covers Democracy's new minRealPlayers floor
 * (a vote needs an actual electorate) - it's filtered out of the deck at
 * game start below 3 real players, and rejected at play time (defense in
 * depth) if a leave drops below 3 after it was already dealt.
 */
export default async function ({ baseUrl }) {
  // --- Part 1: 2 real players + Wild Card can start at all.
  const room1 = await makeRoom(baseUrl, ["Alice", "Bob"]);
  try {
    await selectOfficialPacks(room1.host);
    room1.host.emit("updateHouseRules", { houseRules: { wildCard: true } });
    await waitFor(() => room1.host.state.houseRules.wildCard, { label: "Wild Card to be enabled" });

    room1.host.emit("startGame");
    await room1.host.waitForPhase("submission");
    assert(
      room1.host.state.players.some((p) => p.isWildCard),
      "Wild Card should have joined the rotation once the game started"
    );
  } finally {
    room1.closeAll();
  }

  // --- Part 2: without Wild Card, 2 real players are still refused.
  const room2 = await makeRoom(baseUrl, ["Alice", "Bob"]);
  try {
    await selectOfficialPacks(room2.host);
    const errorsBefore = room2.host.errors.length;
    room2.host.emit("startGame");
    await waitFor(() => room2.host.errors.length > errorsBefore, { label: "startGame to be refused" });
    assert(
      room2.host.errors.slice(errorsBefore).some((e) => e.code === "NOT_ENOUGH_PLAYERS"),
      "2 real players with no Wild Card should still be refused"
    );
  } finally {
    room2.closeAll();
  }

  // --- Part 3: a 3-to-2 leave with Wild Card on keeps the game alive, and
  // Democracy (already dealt while there were 3 real players) is rejected
  // at play time once the leave drops below its 3-real-player floor.
  const room3 = await makeRoom(baseUrl, ["Alice", "Bob", "Carol"]);
  try {
    await selectOfficialPacks(room3.host);
    room3.host.emit("updateHouseRules", {
      houseRules: { wildCard: true, actionCards: true, handRefresh: true },
    });
    room3.host.emit("setActionCardDensity", { value: 15 });
    room3.host.emit("updateHandSize", { value: 20 });
    // Bias hard toward Democracy specifically - at the default even mix
    // across ~9 card types, ensureActionCard's churn (a hand refresh plus
    // several rounds) can occasionally run out before Democracy happens to
    // turn up, which is test flakiness in the odds, not a bug in the
    // feature. "Common" makes it by far the likeliest draw.
    room3.host.emit("setActionCardTier", { cardId: "democracy", tier: "common" });
    await waitFor(
      () =>
        room3.host.state.houseRules.wildCard &&
        room3.host.state.actionCardDensity === 15 &&
        room3.host.state.actionCardTiers?.democracy === "common",
      { label: "settings to apply" }
    );

    room3.host.emit("startGame");
    await room3.host.waitForPhase("submission");

    const found = await ensureActionCard(room3, "democracy");
    assert(found, "Democracy should be reachable with 3 real players");

    // Someone other than the Democracy holder or the host leaves, dropping
    // to 2 real players (+ Wild Card, which doesn't count as real). Excluding
    // the host matters: this reads room3.host.state afterward as the
    // observer, and a socket that has itself left the room stops receiving
    // state broadcasts - if the host were the one to leave, this would
    // flakily time out waiting on state that will never arrive.
    const leaver =
      room3.clients.find((c) => c !== found.owner && c !== room3.host && !c.me?.isJudge) ??
      room3.clients.find((c) => c !== room3.host);
    leaver.emit("leaveRoom");
    await waitFor(
      () => room3.host.state.players.filter((p) => p.role === "player" && !p.isWildCard).length === 2,
      { label: "the room to reflect the departure" }
    );
    assert(room3.host.state.phase !== "gameEnd", "the game must not end - Wild Card covers the floor down to 2");

    // Democracy, already in a real player's hand from before the leave, is
    // now refused at play time - the electorate is too small for a vote.
    const stillOwner = room3.clients.find(
      (c) => c.state?.yourHand?.some((card) => card.actionCardId === "democracy")
    );
    if (stillOwner) {
      const card = stillOwner.state.yourHand.find((c) => c.actionCardId === "democracy");
      const errorsBefore = stillOwner.errors.length;
      stillOwner.emit("playActionCard", { cardId: card.id });
      await waitFor(() => stillOwner.errors.length > errorsBefore, { label: "playActionCard to be refused" });
      assert(
        stillOwner.errors.slice(errorsBefore).some((e) => e.code === "NOT_ENOUGH_PLAYERS"),
        "Democracy should be refused once the real player count drops below its floor"
      );
    }
  } finally {
    room3.closeAll();
  }

  // --- Part 4: the same 3-to-2 leave WITHOUT Wild Card still ends the game -
  // the pre-existing floor is unchanged when Wild Card isn't covering it.
  const room4 = await makeRoom(baseUrl, ["Alice", "Bob", "Carol"]);
  try {
    await selectOfficialPacks(room4.host);
    room4.host.emit("startGame");
    await room4.host.waitForPhase("submission");

    room4.clients[1].emit("leaveRoom");
    await waitFor(() => room4.host.state.phase === "gameEnd", {
      label: "the game to end once real players drop below 3 with no Wild Card",
    });
    assertEqual(
      room4.host.state.players.filter((p) => p.role === "player" && !p.isWildCard).length,
      2,
      "sanity check: exactly 2 real players should remain"
    );
  } finally {
    room4.closeAll();
  }
}
