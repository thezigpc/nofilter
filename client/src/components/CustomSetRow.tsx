import { useState } from "react";
import type { CustomSet } from "@tabletop-judge/shared";
import { addCustomSetBlackCard, addCustomSetWhiteCard, deleteCustomSet, deleteCustomSetCard } from "../customSets.js";
import { CloseCircleIcon, EyeIcon } from "./Icons.js";

type CardType = "white" | "black";

interface Props {
  set: CustomSet;
  onUpdate: (sets: CustomSet[]) => void;
  onPreview: (set: CustomSet) => void;
}

/** One row in "Your Custom Sets" (CustomCardsPage.tsx) - collapsed shows
 * just name/counts/actions; expanded reveals the same add-a-card form and
 * delete-per-card list already established for the loose custom-cards
 * pool, scoped to this one set. Preview (read-only, matches the room's own
 * pack-preview experience) bubbles up to the page so it shares one modal
 * instance rather than each row managing its own. */
export default function CustomSetRow({ set, onUpdate, onPreview }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<CardType>("white");
  const [text, setText] = useState("");
  const [pick, setPick] = useState<1 | 2 | 3>(1);

  function addCard() {
    const clean = text.trim();
    if (!clean) return;
    if (type === "white") {
      addCustomSetWhiteCard(set.id, clean).then(onUpdate);
    } else {
      addCustomSetBlackCard(set.id, clean, pick).then(onUpdate);
    }
    setText("");
  }

  function removeCard(cardId: string) {
    deleteCustomSetCard(set.id, cardId).then(onUpdate);
  }

  function removeSet() {
    if (!window.confirm(`Delete the "${set.name}" set? This can't be undone.`)) return;
    deleteCustomSet(set.id).then(onUpdate);
  }

  return (
    <div className="panel">
      <div className="player-row">
        <span>
          <strong>{set.name}</strong>{" "}
          <span className="muted">
            ({set.white.length} white · {set.black.length} black)
          </span>
        </span>
        <span className="row">
          <button type="button" onClick={() => onPreview(set)}>
            <EyeIcon /> Preview
          </button>
          <button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide" : "Manage"}
          </button>
          <button type="button" onClick={removeSet} aria-label={`Delete set ${set.name}`}>
            <CloseCircleIcon />
          </button>
        </span>
      </div>

      {expanded && (
        <div className="stack">
          <div className="role-picker">
            <label>
              <input type="radio" checked={type === "white"} onChange={() => setType("white")} />
              White
            </label>
            <label>
              <input type="radio" checked={type === "black"} onChange={() => setType("black")} />
              Black
            </label>
          </div>
          <div className="row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={type === "white" ? "Card text…" : "Prompt text (one _ per blank)…"}
              maxLength={300}
              style={{ flex: 1 }}
            />
          </div>
          {type === "black" && (
            <div className="row">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={pick === n ? "theme-btn selected" : "theme-btn"}
                  onClick={() => setPick(n)}
                >
                  Pick {n}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <button className="primary" type="button" onClick={addCard} disabled={!text.trim()}>
              Add card
            </button>
          </div>

          <div>
            <h4>White cards ({set.white.length})</h4>
            {set.white.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul className="player-list">
                {set.white.map((c) => (
                  <li key={c.id} className="player-row">
                    <span>{c.text}</span>
                    <button type="button" onClick={() => removeCard(c.id)} aria-label={`Delete ${c.text}`}>
                      <CloseCircleIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4>Black cards ({set.black.length})</h4>
            {set.black.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul className="player-list">
                {set.black.map((c) => (
                  <li key={c.id} className="player-row">
                    <span>
                      {c.text} <span className="tag">Pick {c.pick}</span>
                    </span>
                    <button type="button" onClick={() => removeCard(c.id)} aria-label={`Delete ${c.text}`}>
                      <CloseCircleIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
