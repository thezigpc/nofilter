import { makeRoom, selectOfficialPacks, playRound, waitFor, assert } from "../harness.mjs";

export const name = "Rando never submits an Action Card, even at high density";

/**
 * Rando's hand is private server state, so this asserts the observable
 * consequence instead: Rando auto-submits every round, and the real players
 * here deliberately never submit an Action Card. So if one ever turns up on
 * a revealed judging board, it can only have come from Rando - which is
 * exactly the bug `Room.drawNonActionCardForRando()` exists to prevent.
 *
 * Density is pushed to the maximum so an unfixed version would fail fast:
 * at 15% roughly one card in seven is an Action Card.
 */
export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", {
      houseRules: { actionCards: true, randoCardrissian: true, singleAnswerOnly: true },
    });
    room.host.emit("setActionCardDensity", { value: 15 });
    room.host.emit("updateWinCondition", { target: 500 });
    await waitFor(() => room.host.state.actionCardDensity === 15, { label: "density to apply" });

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");

    let boardsChecked = 0;
    for (let round = 0; round < 12; round++) {
      // playRound reveals every submission before picking and hands back a
      // snapshot of that fully face-up board.
      const { board } = await playRound(room);
      for (const slot of board) {
        for (const card of slot.cards ?? []) {
          assert(
            !card.actionCardId,
            `an Action Card ("${card.text}") reached the judging board in round ${round + 1} - Rando drew one`
          );
        }
      }
      boardsChecked += board.length;
      await room.host.waitForPhase("submission");
    }

    assert(boardsChecked > 0, "should have inspected at least one judging board");
  } finally {
    room.closeAll();
  }
}
