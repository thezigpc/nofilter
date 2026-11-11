import { useState } from "react";
import type { ActionCardDef, RoomStateForClient, WhiteCard } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { tapHaptic } from "../haptics.js";

interface Props {
  card: WhiteCard;
  def: ActionCardDef;
  state: RoomStateForClient;
  onClose: () => void;
}

/**
 * The one generic UI for playing any Action Card - branches on the card's
 * `shape` (see shared/src/actionCards.ts) rather than rendering per-card
 * bespoke flows. A new card that fits an existing shape needs zero changes
 * here, only a new entry in ACTION_CARD_DEFS.
 */
export default function ActionCardPlayPanel({ card, def, state, onClose }: Props) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [giveCardId, setGiveCardId] = useState<string | null>(null);

  const targets = state.players.filter((p) => p.role === "player" && !p.isRando && p.id !== state.you.id);
  const hand = (state.yourHand ?? []).filter((c) => c.id !== card.id);

  function play(targetPlayerId?: string, giveId?: string) {
    tapHaptic();
    socket.emit("playActionCard", { cardId: card.id, targetPlayerId, giveCardId: giveId });
    onClose();
  }

  return (
    <div className="spotlight-backdrop open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="spotlight-inner">
        <div className="panel action-card-panel">
          <h3>{def.name}</h3>
          <p className="muted">{def.description}</p>

          {def.shape === "self" || def.shape === "flavor" ? (
            <div className="row">
              <button className="primary" type="button" onClick={() => play()}>
                Play
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          ) : targetId === null ? (
            <>
              <p className="muted">Choose a player:</p>
              {targets.length === 0 ? (
                <p className="muted">No valid targets right now.</p>
              ) : (
                <ul className="player-list">
                  {targets.map((p) => (
                    <li key={p.id} className="player-row">
                      <span>{p.name}</span>
                      {def.shape === "target" ? (
                        <button type="button" onClick={() => play(p.id)}>
                          Choose
                        </button>
                      ) : (
                        <button type="button" onClick={() => setTargetId(p.id)}>
                          Choose
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <p className="muted">Choose one of your own cards to give away:</p>
              <div className="hand">
                {hand.map((c) => (
                  <button
                    key={c.id}
                    className={`card card-white hand-card${giveCardId === c.id ? " selected" : ""}`}
                    onClick={() => setGiveCardId(c.id)}
                  >
                    <p>{c.text}</p>
                  </button>
                ))}
              </div>
              <div className="row">
                <button
                  className="primary"
                  type="button"
                  disabled={!giveCardId}
                  onClick={() => giveCardId && play(targetId, giveCardId)}
                >
                  Confirm
                </button>
                <button type="button" onClick={() => setTargetId(null)}>
                  Back
                </button>
                <button type="button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
