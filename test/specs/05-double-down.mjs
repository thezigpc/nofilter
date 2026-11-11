import { makeRoom, selectOfficialPacks, waitFor, waitForDeal, wait, assert } from "../harness.mjs";

export const name = "Double Down: an Action Card replacement can't be wagered";

/**
 * Regression test for a real bug: the Double Down replacement draw could
 * land on an Action Card, which was then offered as something to wager -
 * but submitting an Action Card as a joke makes no sense, so wagering it
 * had to be rejected. Also covers the related fix where the Double Down
 * window would stall out its full countdown waiting on an offer that could
 * never be wagered.
 */
export default async function ({ baseUrl }) {
  // Every submission triggers one replacement draw, so submitter count is
  // the real lever on how fast an Action Card replacement turns up. Eight
  // players means ~7 replacement draws per round instead of ~2, which at
  // 15% density lands one most rounds rather than one every few - the
  // difference between a reliable test and a coin flip.
  const room = await makeRoom(baseUrl, ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi"]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", {
      houseRules: { doubleDown: true, actionCards: true, singleAnswerOnly: true },
    });
    // Max density so a replacement draw hits an Action Card quickly.
    room.host.emit("setActionCardDensity", { value: 15 });
    room.host.emit("updateWinCondition", { target: 500 });
    // Short but non-zero on purpose. The window is what holds the round in
    // "submission" after the last submission so a player can decide whether
    // to wager - at 0 the round advances the instant everyone submits and
    // any wager attempt is correctly rejected as "too late", which is the
    // server behaving properly, not the case this spec is trying to reach.
    // 3s is long enough to act inside, short enough not to stall the loop.
    room.host.emit("updateDoubleDownWindow", { value: 3 });
    // Double Down is only offered on pick-1 rounds, and every submission
    // triggers a replacement draw - so with a 15% action-card deck this
    // usually lands within the first couple of rounds.
    await waitFor(
      () =>
        room.host.state.houseRules.doubleDown &&
        room.host.state.houseRules.singleAnswerOnly &&
        room.host.state.doubleDownWindowSeconds === 3,
      { label: "house rules and the Double Down window to apply" }
    );

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");

    // Hunt for a live offer whose replacement card is an Action Card.
    let found = null;
    for (let round = 0; round < 25 && !found; round++) {
      await waitFor(() => room.host.state.phase === "submission", {
        timeout: 8000,
        label: `round ${round + 1} submission phase`,
      });
      await waitForDeal(room);
      const pick = room.host.state.blackCard?.pick ?? 1;
      for (const c of room.clients) {
        if (!c.me || c.me.isCzar || c.state.yourSubmissionId) continue;
        const jokes = (c.state.yourHand ?? []).filter((card) => !card.actionCardId);
        const ids = jokes.slice(0, pick).map((card) => card.id);
        if (ids.length === pick) c.emit("submitCards", { cardIds: ids });
      }
      await wait(200);

      found = room.clients.find((c) => {
        const o = c.state.yourDoubleDownOffer;
        return o && !o.wagered && o.isActionCard;
      });
      if (found) break;

      // No Action Card offer this round, so let the Double Down window
      // elapse and the round advance to reveal before playing it out. This
      // wait has to outlast the window itself, or the loop would spin in a
      // submission phase the server is deliberately still holding.
      const czar = await waitFor(
        () =>
          room.clients.find(
            (c) => c.me?.isCzar && (c.state.phase === "reveal" || c.state.phase === "judging")
          ),
        { timeout: 8000, label: "the round to advance past the Double Down window" }
      ).catch(() => null);
      if (czar) {
        for (const slot of czar.state.judgingBoard ?? []) {
          czar.emit("revealSubmission", { submissionId: slot.submissionId });
          await wait(50);
        }
        const revealed = czar.state.judgingBoard?.find((s) => s.revealed);
        if (revealed) czar.emit("czarPick", { submissionId: revealed.submissionId });
        await waitFor(() => room.host.state.phase === "submission", { timeout: 6000, label: "next round" }).catch(
          () => {}
        );
      }
    }

    assert(found, "should have been dealt an Action Card as a Double Down replacement within 25 rounds");

    const offer = found.state.yourDoubleDownOffer;
    assert(offer.isActionCard, "the offer should be flagged as an Action Card for the client to render");

    const errorsBefore = found.errors.length;
    found.emit("wagerDoubleDown");
    await waitFor(() => found.errors.length > errorsBefore, { label: "the server to reject the wager" });

    const rejection = found.errors.slice(errorsBefore).find((e) => e.code === "CANNOT_WAGER_ACTION_CARD");
    assert(rejection, `expected CANNOT_WAGER_ACTION_CARD, got ${JSON.stringify(found.errors.slice(errorsBefore))}`);

    // The rejection must be a true no-op, not a partial state change.
    assert(
      found.state.yourDoubleDownOffer?.wagered === false,
      "the offer should still be unwagered after a rejected attempt"
    );
    assert(
      found.state.yourHand.some((c) => c.id === offer.replacementCard.id),
      "the replacement card should still be in hand after a rejected wager"
    );
  } finally {
    room.closeAll();
  }
}
