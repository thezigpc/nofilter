import { makeRoom, selectOfficialPacks, playRound, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Round-limit win condition ends the game after exactly N rounds";

export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl);
  const ROUNDS = 3;
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateWinCondition", { target: ROUNDS, mode: "rounds" });
    await waitFor(
      () => room.host.state.winCondition.mode === "rounds" && room.host.state.winCondition.target === ROUNDS,
      { label: "the round-limit win condition to apply" }
    );

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");

    for (let i = 1; i <= ROUNDS; i++) {
      await playRound(room);
      if (i < ROUNDS) {
        // Must NOT have ended yet - a premature end here would mean the
        // limit is off by one.
        await room.host.waitForPhase("submission");
        assert(
          room.host.state.phase !== "gameEnd",
          `the game ended after ${i} rounds but the limit was ${ROUNDS}`
        );
      }
    }

    await waitFor(() => room.host.state.phase === "gameEnd", {
      label: `the game to end after exactly ${ROUNDS} rounds`,
    });

    const result = room.host.state.finalResult;
    assert(result, "a final result should be present at game end");
    assert(result.winnerNames.length >= 1, "there should be at least one winner");

    // Nobody needed to reach a black-card target - the winner is just
    // whoever was ahead when the rounds ran out.
    const topScore = Math.max(...result.finalScores.map((s) => s.score));
    assert(topScore < 100, "scores should be ordinary round wins, not a black-card target");
    assertEqual(
      result.winnerNames.length,
      result.finalScores.filter((s) => s.score === topScore).length,
      "everyone sharing the top score should be listed as a winner"
    );
  } finally {
    room.closeAll();
  }
}
