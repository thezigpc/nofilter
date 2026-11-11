import { makeRoom, selectOfficialPacks, waitFor, waitForDeal, assert, assertEqual } from "../harness.mjs";

export const name = "Action Card tiers: Off removes a card, Common outnumbers Rare";

/**
 * Tiers only shift the *mix* of Action Cards; the room's density still
 * decides how many there are in total. Counting is done by drawing a large
 * sample of real hands rather than by inspecting the deck, since the deck
 * isn't exposed to clients - so the assertions are about clear proportions,
 * not exact counts.
 */
export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl, [
    "Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi", "Ivan", "Judy",
  ]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", {
      houseRules: { actionCards: true, singleAnswerOnly: true, handRefresh: true },
    });
    room.host.emit("setActionCardDensity", { value: 15 });
    room.host.emit("updateHandSize", { value: 20 });
    room.host.emit("updateWinCondition", { target: 500 });

    // Everything off except a Rare one and a Common one, so the seeded mix
    // is unambiguous: only these two types should ever appear, in roughly
    // the ratio of their tier weights.
    const OFF = ["peek", "discard_bomb", "card_block", "triple_boost", "czar_accent", "tax", "democracy"];
    for (const cardId of OFF) room.host.emit("setActionCardTier", { cardId, tier: "off" });
    room.host.emit("setActionCardTier", { cardId: "steal", tier: "rare" });
    room.host.emit("setActionCardTier", { cardId: "reverse_judging", tier: "common" });
    room.host.emit("setActionCardTierWeights", { rare: 0.5, normal: 1, common: 4 });

    await waitFor(
      () =>
        room.host.state.actionCardTiers.steal === "rare" &&
        room.host.state.actionCardTiers.reverse_judging === "common" &&
        room.host.state.actionCardTiers.peek === "off" &&
        room.host.state.actionCardTierWeights.common === 4,
      { label: "tiers and weights to apply" }
    );

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");
    await waitForDeal(room);

    // Sample the opening deal, then churn every hand once for a second
    // sample - ~400 cards total across ten 20-card hands.
    const counts = new Map();
    const tally = () => {
      for (const c of room.clients) {
        for (const card of c.state.yourHand ?? []) {
          if (card.actionCardId) counts.set(card.actionCardId, (counts.get(card.actionCardId) ?? 0) + 1);
        }
      }
    };
    tally();

    const before = room.clients.map((c) => (c.state.yourHand ?? []).map((x) => x.id).join(","));
    for (const c of room.clients) c.emit("refreshHand");
    await waitFor(
      () => room.clients.every((c, i) => (c.state.yourHand ?? []).map((x) => x.id).join(",") !== before[i]),
      { label: "refreshed hands" }
    );
    tally();

    const offSeen = OFF.filter((id) => counts.has(id));
    assertEqual(offSeen.length, 0, `cards set to Off must never be dealt, but saw: ${offSeen.join(",")}`);

    const rare = counts.get("steal") ?? 0;
    const common = counts.get("reverse_judging") ?? 0;
    assert(rare + common > 0, "at least some Action Cards should have been dealt");
    assert(common > rare, `Common should outnumber Rare, but saw common=${common} rare=${rare}`);
  } finally {
    room.closeAll();
  }
}
