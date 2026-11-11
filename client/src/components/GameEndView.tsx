import type { RoomStateForClient } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { HandshakeIcon, MedalIcon, TrophyIcon } from "./Icons.js";

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

const RANK_MEDAL_CLASSES = ["medal-gold", "medal-silver", "medal-bronze"];

export default function GameEndView({ state }: { state: RoomStateForClient }) {
  const result = state.finalResult;
  if (!result) return null;
  const isTie = result.winnerNames.length > 1;

  return (
    <div className="stack game-end-summary">
      <h2 className="center-text">
        {isTie ? (
          <>
            <HandshakeIcon /> {joinNames(result.winnerNames)} tie!
          </>
        ) : (
          <>
            <TrophyIcon /> {result.winnerNames[0]} wins!
          </>
        )}
      </h2>
      <p className="center-text muted">Final Scores</p>
      <ol className="player-list final-scores">
        {result.finalScores.map((s) => {
          // Ties share a rank/medal - a shared 2nd place doesn't bump the next player to 3rd.
          const rank = result.finalScores.filter((other) => other.score > s.score).length;
          return (
            <li key={s.playerId} className="final-score-row">
              <span className="final-score-rank">
                {rank < 3 ? <MedalIcon className={RANK_MEDAL_CLASSES[rank]} /> : `${rank + 1}.`}
              </span>
              <span className="final-score-name">{s.name}</span>
              <span className="final-score-value">{s.score}</span>
            </li>
          );
        })}
      </ol>
      {state.you.isHost ? (
        <button className="primary" type="button" onClick={() => socket.emit("playAgain")}>
          Play Again
        </button>
      ) : (
        <p className="center-text muted">Waiting for the host to start a new game…</p>
      )}
    </div>
  );
}
