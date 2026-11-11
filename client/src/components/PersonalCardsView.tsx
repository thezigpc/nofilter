import { useEffect, useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { CloseCircleIcon } from "./Icons.js";

/** The writing player's own screen during the Personal Cards window - write
 * up to the room's cap, styled and added like normal hand cards. The
 * window always runs its full configured duration (no early-advance), so
 * this is purely about writing, not waiting on anyone else. */
export default function PersonalCardsView({ state }: { state: RoomStateForClient }) {
  const cards = state.yourPersonalCards ?? [];
  const maxCount = state.personalCardsMaxCount;
  const endsAt = state.personalCardsWindowEndsAt;
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const secondsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const atCap = cards.length >= maxCount;

  // The server collapses the window to a short grace period once everyone
  // has written their allowance (Room.maybeShortenPersonalCardsWindow), so
  // say why the countdown suddenly dropped rather than letting it look like
  // a glitch.
  const writers = state.players.filter((p) => p.role === "player" && !p.isWildCard && p.connected);
  const everyoneDone = writers.length > 0 && writers.every((p) => (p.personalCardsCount ?? 0) >= maxCount);

  function addCard() {
    const clean = text.trim();
    if (!clean || atCap) return;
    socket.emit("addPersonalCard", { text: clean });
    setText("");
  }

  function removeCard(cardId: string) {
    socket.emit("removePersonalCard", { cardId });
  }

  return (
    <div className="stack">
      <div className="panel center-text">
        <h2>Write your personal cards</h2>
        <p className="muted">
          These get drawn into your hand first, all game long, before the shared deck. Write up to {maxCount} — any
          you don't get to are just skipped, no penalty.
        </p>
        {secondsLeft != null && (
          <p className={everyoneDone && secondsLeft > 0 ? "center-text everyone-done-note" : "muted"}>
            {secondsLeft <= 0
              ? "Wrapping up…"
              : everyoneDone
                ? `Everyone's finished — ${secondsLeft}s to make any last changes`
                : `${secondsLeft}s left in this window…`}
          </p>
        )}
        <p className="muted">
          {cards.length} of {maxCount} written
        </p>
      </div>

      {!atCap && (
        <div className="panel">
          <div className="row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCard();
              }}
              placeholder="Your card text…"
              maxLength={200}
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="button" className="primary" onClick={addCard} disabled={!text.trim()}>
              + Add
            </button>
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <div className="hand">
          {cards.map((c) => (
            <div key={c.id} className="personal-card-item">
              <div className="card card-white hand-card">
                <p>{c.text}</p>
              </div>
              <button type="button" className="link-btn" onClick={() => removeCard(c.id)}>
                <CloseCircleIcon /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
