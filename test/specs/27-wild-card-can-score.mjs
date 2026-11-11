import { makeRoom, selectOfficialPacks, playRound, waitFor, wait, assert, assertEqual } from "../harness.mjs";

export const name = "Wild Card Can Win: off by default (no-op), on makes Wild Card a real competitor";

/**
 * Wild Card's own submission winning a round is a no-op for the *win
 * condition* by default - it never ends the game and never counts in
 * buildFinalResult's ranking - but its score still visibly climbs every
 * time it wins, so a host watching the Scoreboard can see how it's doing
 * even though it can't actually win. wildCardCanScore flips the win-condition
 * side too: Wild Card counts toward ending the game and appears in the final
 * ranking, on top of the score it was already accumulating regardless.
 *
 * playRound picks whichever submission is revealed first, which is random
 * (the board is server-shuffled) - so which round Wild Card wins isn't
 * controllable directly. Looping until it happens, with a generous cap, is
 * the same "churn until it turns up" approach ensureActionCard uses in
 * harness.mjs for the same reason. The round's actual winner has to be read
 * from state.lastRound.winningPlayerId (only present in the "roundEnd"
 * snapshot, right after playRound resolves) rather than inferred from a
 * wonBlackCards change - wonBlackCards is the one thing that stays at 0
 * regardless of wildCardCanScore, so it can't be used as the "did Wild Card win"
 * signal (score now climbs either way, so it can't be used for that either).
 */
export default async function ({ baseUrl }) {
  const room = await makeRoom(baseUrl, ["Host", "Bob", "Carol"]);
  try {
    await selectOfficialPacks(room.host);
    room.host.emit("updateHouseRules", { houseRules: { wildCard: true, wildCardCanScore: false } });
    room.host.emit("updateWinCondition", { target: 500 });
    await waitFor(() => room.host.state.houseRules.wildCard, { label: "Wild Card to be enabled" });

    room.host.emit("startGame");
    await room.host.waitForPhase("submission");

    const wildCard = () => room.host.state.players.find((p) => p.isWildCard);
    assert(wildCard(), "Wild Card should be in the room once the house rule is on");

    let wildCardWonARound = false;
    for (let round = 0; round < 30 && !wildCardWonARound; round++) {
      await playRound(room);
      if (room.host.state.lastRound?.winningPlayerId === wildCard().id) {
        wildCardWonARound = true;
        // The round just resolved with Wild Card as the winner - assert right
        // here, while state.lastRound is still fresh, before the next deal
        // moves things on. Score now climbs regardless of wildCardCanScore
        // (for Scoreboard visibility), but wonBlackCards never does.
        const scoreAfterWin = wildCard().score;
        assert(scoreAfterWin >= 1, "Wild Card's score should still increment for visibility, even with wildCardCanScore off");
        assertEqual(wildCard().wonBlackCards?.length ?? 0, 0, "Wild Card must never accumulate wonBlackCards by default");

        // Prove the win-condition gate specifically: lower the target to
        // right at Wild Card's current score while still inside the roundEnd
        // window, before the scheduled timer fires - updateWinCondition
        // works in any phase and the timer reads winCondition.target live
        // (not a value captured at pick-time), so this directly tests
        // whether Wild Card's now-visibly-climbing score can end the game on
        // its own. It must not, even once it reaches/exceeds the target.
        room.host.emit("updateWinCondition", { target: scoreAfterWin });
        await wait(400);
        assert(
          room.host.state.phase !== "gameEnd",
          "Wild Card alone reaching the win target must not end the game while wildCardCanScore is off"
        );
      }
      await room.host.waitForPhase("submission");
    }
    if (!wildCardWonARound) {
      throw new Error("Wild Card never won a round in 30 attempts - re-run, or check the round-play loop is working");
    }

    room.closeAll();
  } catch (e) {
    room.closeAll();
    throw e;
  }

  // --- Second room: wildCardCanScore on.
  const room2 = await makeRoom(baseUrl, ["Host", "Bob", "Carol"]);
  try {
    await selectOfficialPacks(room2.host);
    room2.host.emit("updateHouseRules", { houseRules: { wildCard: true, wildCardCanScore: true } });
    room2.host.emit("updateWinCondition", { target: 500 });
    await waitFor(() => room2.host.state.houseRules.wildCardCanScore, { label: "wildCardCanScore to apply" });

    room2.host.emit("startGame");
    await room2.host.waitForPhase("submission");

    const wildCard2 = () => room2.host.state.players.find((p) => p.isWildCard);

    let wildCardWonARound2 = false;
    for (let round = 0; round < 30 && !wildCardWonARound2; round++) {
      await playRound(room2);
      if (room2.host.state.lastRound?.winningPlayerId === wildCard2().id) {
        wildCardWonARound2 = true;
        assertEqual(wildCard2().score, 1, "Wild Card should score once wildCardCanScore is on");
        assertEqual(
          wildCard2().wonBlackCards?.length ?? 0,
          0,
          "Wild Card still shouldn't accumulate wonBlackCards - that's spendable currency it has no client to use"
        );
      }
      await room2.host.waitForPhase("submission");
    }
    if (!wildCardWonARound2) {
      throw new Error("Wild Card never won a round in 30 attempts with wildCardCanScore on - re-run, or check the round-play loop");
    }

    // --- buildFinalResult must include Wild Card in the ranking once this is on.
    room2.host.emit("endGame");
    await waitFor(() => room2.host.state.phase === "gameEnd", { label: "game to end" });
    const finalResult = room2.host.state.finalResult;
    assert(
      finalResult.finalScores.some((p) => p.playerId === wildCard2().id),
      "Wild Card must appear in the final ranking when wildCardCanScore is on"
    );

    room2.closeAll();
  } catch (e) {
    room2.closeAll();
    throw e;
  }
}
