import { useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { RefreshIcon, SkipForwardIcon } from "./Icons.js";

/**
 * Shared between WaitingPanel (the Czar's Submission-phase wait, normal
 * games) and PlayerHandView (the round-host in Crowd Favorite mode, who
 * submits a card too and so never sees WaitingPanel at all) - same
 * host-or-Czar Skip authority and Czar-only Custom Prompts form either way.
 */
export default function CzarBlackCardControls({ state }: { state: RoomStateForClient }) {
  const [customText, setCustomText] = useState("");
  const [customPick, setCustomPick] = useState<1 | 2 | 3>(1);

  const canSkip = state.you.isHost || state.you.isCzar;
  const canCustomPrompt = state.houseRules.customPrompts && state.you.isCzar;
  if (!canSkip && !canCustomPrompt) return null;

  function submitCustomPrompt() {
    if (!customText.trim()) return;
    socket.emit("submitCustomBlackCard", { text: customText.trim(), pick: customPick });
    setCustomText("");
    setCustomPick(1);
  }

  return (
    <div className="stack">
      {canSkip && (
        <div className="row">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Skip this black card and draw a new one?")) {
                socket.emit("skipBlackCard");
              }
            }}
          >
            <RefreshIcon /> Skip this card
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Skip your turn? The round redeals and passes to the next player.")) {
                socket.emit("skipCzarTurn");
              }
            }}
          >
            <SkipForwardIcon /> Skip my turn
          </button>
        </div>
      )}
      {canCustomPrompt && (
        <div className="panel">
          <p className="muted">Or write your own prompt instead:</p>
          <div className="row">
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Your custom black card text…"
              maxLength={300}
            />
          </div>
          <div className="row">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={customPick === n ? "theme-btn selected" : "theme-btn"}
                onClick={() => setCustomPick(n)}
              >
                Pick {n}
              </button>
            ))}
            <button type="button" className="primary" onClick={submitCustomPrompt} disabled={!customText.trim()}>
              Use this prompt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
