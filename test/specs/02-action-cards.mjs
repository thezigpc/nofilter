import {
  makeRoom,
  selectOfficialPacks,
  ensureActionCard,
  waitFor,
  waitForDeal,
  assert,
} from "../harness.mjs";

export const name = "Action Cards: each effect does what it says";

export default async function ({ baseUrl }) {
  // Lots of players at max hand size means a big opening deal, so most
  // types are out immediately; ensureActionCard churns for any that aren't.
  const room = await makeRoom(baseUrl, [
    "Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi", "Ivan", "Judy",
  ]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", {
      houseRules: { actionCards: true, randoCardrissian: true, singleAnswerOnly: true, handRefresh: true },
    });
    room.host.emit("setActionCardDensity", { value: 15 });
    room.host.emit("updateHandSize", { value: 20 });
    room.host.emit("updateWinCondition", { target: 500 });
    await waitFor(() => room.host.state.actionCardDensity === 15 && room.host.state.handSize === 20, {
      label: "density and hand size to apply",
    });

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    // The host reaching "submission" only proves the host's state arrived;
    // other clients' hands are still in flight.
    await waitForDeal(room);

    assert(
      room.host.state.players.some((p) => p.isRando),
      "Rando should be in the room when the rule is on"
    );

    // ---- Triple Boost: -1 played, +3 drawn = net +2.
    {
      const { owner, cardId } = await ensureActionCard(room, "triple_boost");
      const before = owner.state.yourHand.length;
      owner.emit("playActionCard", { cardId });
      await waitFor(() => owner.state.yourHand.length === before + 2, {
        label: `Triple Boost to net +2 cards for ${owner.name}`,
      });
    }

    // ---- Peek: a private result, delivered only to the player who played it.
    {
      const { owner, cardId } = await ensureActionCard(room, "peek");
      const target = room.clients.find((c) => c !== owner);
      const before = owner.actionResults.length;
      const othersBefore = room.clients.filter((c) => c !== owner).map((c) => c.actionResults.length);
      owner.emit("playActionCard", { cardId, targetPlayerId: target.state.you.id });
      await waitFor(() => owner.actionResults.length > before, { label: "Peek result to reach the actor" });
      assert(
        room.clients.filter((c) => c !== owner).every((c, i) => c.actionResults.length === othersBefore[i]),
        "Peek's result must go only to the player who played it"
      );
    }

    // ---- Steal: the target receives the actor's chosen card.
    {
      const { owner, cardId } = await ensureActionCard(room, "steal");
      const target = room.clients.find((c) => c !== owner);
      const giveCard = owner.state.yourHand.find((c) => c.id !== cardId && !c.actionCardId);
      owner.emit("playActionCard", { cardId, targetPlayerId: target.state.you.id, giveCardId: giveCard.id });
      await waitFor(() => target.state.yourHand.some((c) => c.id === giveCard.id), {
        label: "the target to receive the given card",
      });
      assert(
        !owner.state.yourHand.some((c) => c.id === giveCard.id),
        "the actor should no longer hold the card they gave away"
      );
    }

    // ---- Flavor card: sets a judging-time instruction.
    {
      const { owner, cardId } = await ensureActionCard(room, "czar_accent");
      owner.emit("playActionCard", { cardId });
      await waitFor(() => !!room.host.state.pendingJudgingMessage, { label: "a pending judging message to be set" });
    }

    // ---- Discard Bomb last: it replaces a whole hand, so running it earlier
    // would invalidate cards the tests above still need.
    {
      const { owner, cardId } = await ensureActionCard(room, "discard_bomb");
      const target = room.clients.find((c) => c !== owner);
      const before = new Set((target.state.yourHand ?? []).map((c) => c.id));
      owner.emit("playActionCard", { cardId, targetPlayerId: target.state.you.id });
      await waitFor(
        () => {
          const hand = target.state.yourHand ?? [];
          return hand.length > 0 && hand.every((c) => !before.has(c.id));
        },
        { label: "the target's hand to be fully replaced" }
      );
    }
  } finally {
    room.closeAll();
  }
}
