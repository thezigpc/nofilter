import type { RoomStateForClient } from "@tabletop-judge/shared";
import { formatBlackCardText } from "../blackCardText.js";

export default function RoundHistoryPanel({ state }: { state: RoomStateForClient }) {
  const history = state.roundHistory;

  return (
    <div className="panel round-history-panel">
      <h2>Round History</h2>
      {history.length === 0 ? (
        <p className="muted">No rounds decided yet this game.</p>
      ) : (
        <ol className="round-history-list">
          {history.map((r) => (
            <li key={r.winningSubmissionId}>
              <p className="round-history-black">{formatBlackCardText(r.blackCard.text)}</p>
              <p className="round-history-winner">
                <strong>{r.winningPlayerName}</strong>
                {" — "}
                {r.cards.map((c) => c.text).join(" / ")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
