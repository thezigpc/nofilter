import { useEffect, useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import { socket } from "../socket.js";

/**
 * Shown only during the viewer's own Submission-phase wait
 * (PlayerHandView, after they've submitted) - once the round moves into
 * Reveal/Judging, wagering is already closed (server-enforced) and the
 * offer stops being actionable, so it's no longer shown there at all
 * rather than lingering with a "too late" message.
 */
export default function DoubleDownOffer({ state }: { state: RoomStateForClient }) {
  const offer = state.yourDoubleDownOffer;
  const endsAt = state.doubleDownWindowEndsAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!offer) return null;

  const secondsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;

  return (
    <div className="panel double-down-offer">
      <p className="muted">
        {offer.wagered ? "You doubled down with:" : "Double Down — you were dealt:"}
      </p>
      <div className="card card-white hand-card just-drawn double-down-card">
        <p>{offer.replacementCard.text}</p>
      </div>
      {offer.wagered ? null : offer.isActionCard ? (
        <p className="muted">It's an Action Card, not a joke — play it from your hand instead of wagering it.</p>
      ) : offer.eligible ? (
        <>
          <button onClick={() => socket.emit("wagerDoubleDown")}>Wager a won black card</button>
          {secondsLeft != null && secondsLeft > 0 && (
            <p className="muted double-down-countdown">Locking in in {secondsLeft}s…</p>
          )}
        </>
      ) : (
        <p className="muted">You need a previously-won black card to wager.</p>
      )}
    </div>
  );
}
