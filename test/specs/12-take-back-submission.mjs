import { makeRoom, selectOfficialPacks, waitFor, waitForDeal, wait, assert, assertEqual } from "../harness.mjs";

export const name = "Take-back returns a submission without printing cards, and locks once everyone's in";

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl, ["Alice", "Bob", "Carol", "Dave"]);
  try {
    await selectOfficialPacks(room.host);
    // Double Down on with a real window, so the round lingers in the
    // submission phase after the last player is in. Without it the phase
    // advances instantly and a take-back is refused as WRONG_PHASE - still
    // correct, but it would never exercise the ROUND_LOCKED guard, which
    // exists precisely for this "everyone in, round not yet moved on" gap.
    // It also means every submission deals a Double Down replacement, which
    // is the other half of the card-printing risk below.
    room.host.emit("updateHouseRules", { houseRules: { singleAnswerOnly: true, doubleDown: true } });
    room.host.emit("updateDoubleDownWindow", { value: 4 });
    room.host.emit("updateWinCondition", { target: 500 });
    await waitFor(
      () => room.host.state.houseRules.doubleDown && room.host.state.doubleDownWindowSeconds === 4,
      { label: "settings" }
    );

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    const submitters = room.clients.filter((c) => !c.me.isJudge);
    assert(submitters.length >= 3, "need at least three submitters for this spec");
    const [first, second, third] = submitters;
    const handSize = room.host.state.handSize;

    // --- A take-back returns the exact card and leaves the hand size intact.
    const chosen = first.state.yourHand.find((c) => !c.actionCardId);
    first.emit("submitCards", { cardIds: [chosen.id] });
    await waitFor(() => first.me.hasSubmitted, { label: "the first submission to register" });

    first.emit("unsubmitCards");
    await waitFor(() => !first.me.hasSubmitted, { label: "the take-back to register" });
    assert(
      first.state.yourHand.some((c) => c.id === chosen.id),
      "the submitted card should be back in hand after a take-back"
    );
    assertEqual(first.state.yourHand.length, handSize, "hand size should be unchanged after a take-back");

    // --- Repeated cycles must not print cards. Auto Draw tops the hand up
    // on submit, so a naive take-back would hand out a free card each time.
    for (let i = 0; i < 5; i++) {
      const card = first.state.yourHand.find((c) => !c.actionCardId);
      first.emit("submitCards", { cardIds: [card.id] });
      await waitFor(() => first.me.hasSubmitted, { label: `submit ${i + 1}` });
      first.emit("unsubmitCards");
      await waitFor(() => !first.me.hasSubmitted, { label: `take-back ${i + 1}` });
    }
    assertEqual(
      first.state.yourHand.length,
      handSize,
      "repeated submit/take-back cycles must not change the hand size"
    );

    // --- Once the last required player submits, the round locks.
    for (const c of submitters) {
      if (c.me.hasSubmitted) continue;
      const card = c.state.yourHand.find((x) => !x.actionCardId);
      c.emit("submitCards", { cardIds: [card.id] });
      await wait(80);
    }
    await waitFor(() => submitters.every((c) => c.me.hasSubmitted), { label: "everyone to submit" });

    const errorsBefore = second.errors.length;
    second.emit("unsubmitCards");
    await waitFor(() => second.errors.length > errorsBefore, { label: "the locked-round rejection" });
    assert(
      second.errors.slice(errorsBefore).some((e) => e.code === "ROUND_LOCKED"),
      `expected ROUND_LOCKED once everyone is in, got ${JSON.stringify(second.errors.slice(errorsBefore))}`
    );
    assert(second.me.hasSubmitted, "the submission should survive a rejected take-back");

    // Sanity: the round still resolves normally afterwards.
    assert(third, "third submitter should exist");
    await waitFor(() => ["reveal", "judging"].includes(room.host.state.phase), {
      label: "the round to advance once locked",
    });
  } finally {
    room.closeAll();
  }
}
