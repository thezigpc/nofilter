import { makeRoom, waitFor, wait, assert, assertEqual } from "../harness.mjs";

export const name = "Quick setups apply a whole configuration, save and reload";

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl);
  const host = room.host;
  try {
    // Baseline: a fresh room is on the defaults.
    assert(!host.state.houseRules.wildCard, "a fresh room should not have Wild Card on");
    assertEqual(host.state.winCondition.mode, "blackCards", "default win mode");

    // --- "Chaos" turns several rules on at once.
    host.emit("applyGameSetup", {
      setup: {
        houseRules: { ...host.state.houseRules, wildCard: true, doubleDown: true, actionCards: true },
        winCondition: { mode: "blackCards", target: 9 },
        handSize: 12,
        actionCardDensity: 6,
      },
    });
    await waitFor(
      () =>
        host.state.houseRules.wildCard &&
        host.state.houseRules.doubleDown &&
        host.state.houseRules.actionCards,
      { label: "the setup's house rules to apply" }
    );
    assertEqual(host.state.winCondition.target, 9, "win target should come from the setup");
    assertEqual(host.state.handSize, 12, "hand size should come from the setup");
    assertEqual(host.state.actionCardDensity, 6, "action card density should come from the setup");

    // --- A setup that omits a field leaves it alone, rather than resetting it.
    host.emit("applyGameSetup", { setup: { houseRules: { ...host.state.houseRules, tradeIn: true } } });
    await waitFor(() => host.state.houseRules.tradeIn, { label: "the partial setup to apply" });
    assertEqual(host.state.handSize, 12, "an omitted field must be left untouched");
    assertEqual(host.state.winCondition.target, 9, "an omitted win condition must be left untouched");

    // --- Round-limit setups carry their mode across.
    host.emit("applyGameSetup", {
      setup: { houseRules: { ...host.state.houseRules }, winCondition: { mode: "rounds", target: 5 } },
    });
    await waitFor(() => host.state.winCondition.mode === "rounds", { label: "the round-limit mode" });
    assertEqual(host.state.winCondition.target, 5, "round limit should be 5");

    // --- Saving captures the room as it stands right now.
    const saved = await new Promise((resolve) => host.socket.emit("saveGameSetupPreset", { name: "Spec Setup" }, resolve));
    assert(
      saved.some((p) => p.name === "Spec Setup"),
      "the saved setup should come back in the list"
    );
    const preset = saved.find((p) => p.name === "Spec Setup");
    assertEqual(preset.winCondition.mode, "rounds", "the preset should capture the live win mode");
    assertEqual(preset.handSize, 12, "the preset should capture the live hand size");
    assert(preset.houseRules.tradeIn, "the preset should capture the live house rules");
    assert(!("selectedPackIds" in preset), "a setup must not capture pack selection - packs have their own presets");

    // --- Change everything, then reapply the saved setup to get it back.
    host.emit("applyGameSetup", {
      setup: {
        houseRules: { ...host.state.houseRules, tradeIn: false },
        winCondition: { mode: "blackCards", target: 3 },
        handSize: 7,
      },
    });
    await waitFor(() => !host.state.houseRules.tradeIn && host.state.handSize === 7, { label: "settings to change" });

    const { name: _n, ...rest } = preset;
    host.emit("applyGameSetup", { setup: rest });
    await waitFor(
      () => host.state.houseRules.tradeIn && host.state.handSize === 12 && host.state.winCondition.mode === "rounds",
      { label: "the saved setup to restore everything" }
    );

    // --- A non-host can't apply setups.
    const bob = room.clients[1];
    const errorsBefore = bob.errors.length;
    bob.emit("applyGameSetup", { setup: { houseRules: { ...bob.state.houseRules, noScorekeeping: true } } });
    await waitFor(() => bob.errors.length > errorsBefore, { label: "the non-host rejection" });
    assert(!host.state.houseRules.noScorekeeping, "a non-host must not be able to change the setup");

    // --- Cleanup so the shared store doesn't leak between runs.
    const after = await new Promise((resolve) =>
      host.socket.emit("deleteGameSetupPreset", { name: "Spec Setup" }, resolve)
    );
    assert(!after.some((p) => p.name === "Spec Setup"), "the deleted setup should be gone");
    await wait(100);
  } finally {
    room.closeAll();
  }
}
