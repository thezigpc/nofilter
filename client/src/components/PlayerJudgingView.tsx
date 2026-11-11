import { useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import JudgingBoard from "./JudgingBoard.js";

/**
 * What a regular (non-Czar, non-Table) player sees during Reveal/Judging:
 * a Hand tab to browse their own cards (already locked in for the round,
 * so read-only), and a Table tab mirroring the same read-only judging
 * board the Czar/Table see - only ever-revealed cards, never anything
 * still face-down. No Double Down offer here - that's a Submission-phase
 * decision, and once judging's underway it's already locked in one way or
 * the other, so there's nothing left to show or act on.
 */
export default function PlayerJudgingView({ state }: { state: RoomStateForClient }) {
  const [tab, setTab] = useState<"hand" | "table">("table");
  const hand = state.yourHand ?? [];

  return (
    <div className="stack">
      <div className="tab-row">
        <button
          type="button"
          className={tab === "table" ? "tab-btn selected" : "tab-btn"}
          onClick={() => setTab("table")}
        >
          Shared Screen
        </button>
        <button type="button" className={tab === "hand" ? "tab-btn selected" : "tab-btn"} onClick={() => setTab("hand")}>
          Hand
        </button>
      </div>

      {tab === "table" ? (
        <JudgingBoard
          state={state}
          readOnly
          voteMode={state.votingThisRound}
          yourSubmissionId={state.yourSubmissionId}
          yourVote={state.yourVote}
        />
      ) : (
        <div className="hand">
          {hand.map((card) => (
            <div key={card.id} className="card card-white hand-card">
              <p>{card.text}</p>
            </div>
          ))}
          {hand.length === 0 && <p className="center-text muted">Your hand is empty.</p>}
        </div>
      )}
    </div>
  );
}
