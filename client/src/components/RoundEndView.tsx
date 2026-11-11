import type { RoomStateForClient } from "@tabletop-judge/shared";
import { blackCardLengthScale, formatBlackCardText } from "../blackCardText.js";
import { TrophyIcon } from "./Icons.js";

export default function RoundEndView({ state }: { state: RoomStateForClient }) {
  const result = state.lastRound;
  if (!result) return null;
  // Wild Card's own win is a no-op for score unless wildCardCanScore is on
  // (CLAUDE.md) - don't claim a point was earned when one wasn't.
  const winnerIsWildCard = state.players.find((p) => p.id === result.winningPlayerId)?.isWildCard ?? false;
  const winnerScored = !winnerIsWildCard || state.houseRules.wildCardCanScore;

  return (
    <div className="stack">
      <div
        className="card card-black"
        style={{ "--black-card-length-scale": blackCardLengthScale(formatBlackCardText(result.blackCard.text)) } as React.CSSProperties}
      >
        <p>{formatBlackCardText(result.blackCard.text)}</p>
      </div>
      <p className="center-text roundend-winner-line">
        <TrophyIcon /> <strong className="roundend-winner-name">{result.winningPlayerName}</strong> wins the round!
        {winnerScored && <span className="muted"> (+1)</span>}
      </p>
      <div className="roundend-winning-hand">
        <div className="card card-white roundend-winner-card">
          {result.cards.map((c, i) => (
            <p key={c.id + i}>{c.text}</p>
          ))}
        </div>
      </div>
      {result.doubleDownResults.length > 0 && (
        <div className="panel">
          <h3>Double Down</h3>
          <ul>
            {result.doubleDownResults.map((d) => (
              <li key={d.playerId}>
                {d.playerName}: {d.won ? "won it back! (kept the point)" : "lost the wagered card (-1 point)."}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
