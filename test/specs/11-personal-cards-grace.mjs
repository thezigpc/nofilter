import { makeRoom, selectOfficialPacks, waitFor, wait, assert } from "../harness.mjs";

export const name = "Personal Cards window collapses to a grace period once everyone is done";

const GRACE_SECONDS = 10;

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", { houseRules: { personalCards: true } });
    // Shortest allowed window (1 min) with a small allowance, so the drop to
    // the grace period is unmistakable.
    room.host.emit("updatePersonalCardsSettings", { windowMinutes: 1, maxCount: 2 });
    await waitFor(
      () => room.host.state.houseRules.personalCards && room.host.state.personalCardsMaxCount === 2,
      { label: "personal cards settings to apply" }
    );

    room.host.emit("startGame");
    await room.host.waitForPhase("personalCards");
    await waitFor(() => !!room.host.state.personalCardsWindowEndsAt, { label: "the window deadline" });

    const fullRemaining = room.host.state.personalCardsWindowEndsAt - Date.now();
    assert(
      fullRemaining > GRACE_SECONDS * 1000 * 2,
      `the full window should be much longer than the grace period, got ${Math.round(fullRemaining / 1000)}s`
    );

    // Everyone but the last player fills their allowance - the window must
    // NOT shorten while anyone is still writing.
    for (const c of room.clients.slice(0, -1)) {
      c.emit("addPersonalCard", { text: `${c.name} card one` });
      await wait(60);
      c.emit("addPersonalCard", { text: `${c.name} card two` });
      await wait(60);
    }
    await wait(300);
    const stillRemaining = room.host.state.personalCardsWindowEndsAt - Date.now();
    assert(
      stillRemaining > GRACE_SECONDS * 1000 * 2,
      `the window must not shorten while someone is still writing, got ${Math.round(stillRemaining / 1000)}s`
    );

    // The last player finishes, which should collapse the window.
    const last = room.clients[room.clients.length - 1];
    last.emit("addPersonalCard", { text: `${last.name} card one` });
    await wait(80);
    last.emit("addPersonalCard", { text: `${last.name} card two` });

    await waitFor(
      () => room.host.state.personalCardsWindowEndsAt - Date.now() <= GRACE_SECONDS * 1000 + 500,
      { label: "the window to collapse to the grace period" }
    );

    const graceRemaining = room.host.state.personalCardsWindowEndsAt - Date.now();
    assert(
      graceRemaining > 0,
      "the grace period should still leave time to make a change, not cut over immediately"
    );

    // Deleting a card must not win the time back - otherwise the window
    // could be yo-yoed indefinitely.
    const own = last.state.yourPersonalCards ?? [];
    assert(own.length > 0, "the last writer should have personal cards to remove");
    last.emit("removePersonalCard", { cardId: own[0].id });
    await wait(400);
    assert(
      room.host.state.personalCardsWindowEndsAt - Date.now() <= GRACE_SECONDS * 1000 + 500,
      "removing a card must not extend the window back to its full length"
    );

    // And the round still starts on its own once the grace period elapses.
    await room.host.waitForPhase("submission", GRACE_SECONDS * 1000 + 6000);
  } finally {
    room.closeAll();
  }
}
