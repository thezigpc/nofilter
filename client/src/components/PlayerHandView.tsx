import { useEffect, useRef, useState } from "react";
import type { ActionCardDef, RoomStateForClient, WhiteCard } from "@tabletop-judge/shared";
import { getActionCardDef } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import DoubleDownOffer from "./DoubleDownOffer.js";
import JudgeBlackCardControls from "./JudgeBlackCardControls.js";
import ActionCardPlayPanel from "./ActionCardPlayPanel.js";
import { blackCardLengthScale, formatBlackCardText } from "../blackCardText.js";
import { tapHaptic } from "../haptics.js";
import { BackArrowIcon, CardsStackIcon, RefreshIcon } from "./Icons.js";

export default function PlayerHandView({ state }: { state: RoomStateForClient }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [playingActionCard, setPlayingActionCard] = useState<{ card: WhiteCard; def: ActionCardDef } | null>(null);
  const [tradeInMode, setTradeInMode] = useState(false);
  const [tradeInSelected, setTradeInSelected] = useState<string[]>([]);
  const [justDrawnIds, setJustDrawnIds] = useState<Set<string>>(new Set());
  const prevHandIds = useRef<Set<string> | null>(null);
  const submitBarRef = useRef<HTMLDivElement>(null);

  const blackCard = state.blackCard;
  const you = state.players.find((p) => p.id === state.you.id);
  const hasSubmitted = you?.hasSubmitted ?? false;
  const hand = state.yourHand ?? [];
  const canDraw = !hasSubmitted && hand.length < state.handSize;
  const canTradeIn = state.houseRules.tradeIn && !hasSubmitted && (you?.wonBlackCardCount ?? 0) > 0;
  const canRefreshHand = state.houseRules.handRefresh && !hasSubmitted && !state.youUsedHandRefresh;
  const requiredPlayers = state.players.filter(
    (p) => p.role === "player" && !p.isWildCard && (state.votingThisRound || !p.isJudge)
  );
  const submittedCount = requiredPlayers.filter((p) => p.hasSubmitted).length;
  // Mirrors the server rule: a take-back is only possible while someone
  // else has yet to submit. A wagered Double Down also locks you in, since
  // a black card has already been staked on this round.
  const someoneElseOutstanding = requiredPlayers.some((p) => p.id !== state.you.id && !p.hasSubmitted);
  const canTakeBack = hasSubmitted && someoneElseOutstanding && !state.yourDoubleDownOffer?.wagered;

  useEffect(() => {
    setSelected([]);
    setTradeInMode(false);
    setTradeInSelected([]);
  }, [blackCard?.id]);

  // Flags any card that's newly in the hand since the last render (a manual
  // Draw click, an Auto Draw fill, Trade-In, or Hand Refresh) so it can get
  // a brief "just drawn" highlight — skipped on the very first mount so
  // reconnecting mid-game doesn't relabel your whole existing hand as new.
  useEffect(() => {
    const currentIds = new Set(hand.map((c) => c.id));
    if (prevHandIds.current) {
      const newlyAdded = hand.filter((c) => !prevHandIds.current!.has(c.id)).map((c) => c.id);
      if (newlyAdded.length > 0) setJustDrawnIds(new Set(newlyAdded));
    }
    prevHandIds.current = currentIds;
  }, [hand]);

  useEffect(() => {
    if (justDrawnIds.size === 0) return;
    const t = setTimeout(() => setJustDrawnIds(new Set()), 1200);
    return () => clearTimeout(t);
  }, [justDrawnIds]);

  // .submit-bar is fixed above the fixed .scoreboard (see index.css) - its
  // own live height feeds --submit-bar-height so .page's bottom padding can
  // reserve enough room for both bars without content hiding underneath,
  // same idea as Scoreboard.tsx's --scoreboard-height.
  const showSubmitBar = !hasSubmitted && !tradeInMode;
  useEffect(() => {
    const el = submitBarRef.current;
    if (!showSubmitBar || !el) {
      document.documentElement.style.setProperty("--submit-bar-height", "0px");
      return;
    }
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--submit-bar-height", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--submit-bar-height", "0px");
    };
  }, [showSubmitBar, canDraw, canTradeIn, canRefreshHand]);

  if (!blackCard) return null;

  function toggleCard(cardId: string) {
    if (hasSubmitted) return;
    tapHaptic();
    setSelected((prev) => {
      if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
      if (prev.length >= blackCard!.pick) return prev;
      return [...prev, cardId];
    });
  }

  function toggleTradeInCard(cardId: string) {
    tapHaptic();
    setTradeInSelected((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]));
  }

  function submit() {
    if (selected.length !== blackCard!.pick) return;
    socket.emit("submitCards", { cardIds: selected });
  }

  function draw() {
    socket.emit("drawCards");
  }

  function confirmTradeIn() {
    if (tradeInSelected.length === 0) return;
    socket.emit("tradeInCards", { cardIds: tradeInSelected });
    setTradeInSelected([]);
    setTradeInMode(false);
  }

  return (
    <div className="stack">
      <div
        className="card card-black"
        style={{ "--black-card-length-scale": blackCardLengthScale(formatBlackCardText(blackCard.text)) } as React.CSSProperties}
      >
        <p>{formatBlackCardText(blackCard.text)}</p>
        {blackCard.pick > 1 && <p className="pick-hint">Pick {blackCard.pick}, in order</p>}
      </div>

      <JudgeBlackCardControls state={state} />

      {hasSubmitted ? (
        <div className="panel center-text">
          <p>Submitted — waiting for the rest of the table…</p>
          <p className="muted">
            {submittedCount} of {requiredPlayers.length} submitted
          </p>
          {/* Only offered while someone else is still choosing. Once the
              last player is in, the round is locked and the server refuses
              anyway - so the button disappears rather than erroring. */}
          {canTakeBack && (
            <button type="button" onClick={() => socket.emit("unsubmitCards")}>
              <BackArrowIcon /> Take it back
            </button>
          )}
          {state.yourDoubleDownOffer && <DoubleDownOffer state={state} />}
        </div>
      ) : tradeInMode ? (
        <>
          <p className="muted">
            Select any cards to discard, then trade in for replacements (costs 1 won black card — and the point that
            came with it).
          </p>
          <div className="row">
            <button className="primary" onClick={confirmTradeIn} disabled={tradeInSelected.length === 0}>
              Trade in {tradeInSelected.length} card{tradeInSelected.length === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTradeInMode(false);
                setTradeInSelected([]);
              }}
            >
              Cancel
            </button>
          </div>
          <div className="hand">
            {hand.map((card) => (
              <button
                key={card.id}
                className={`card card-white hand-card${tradeInSelected.includes(card.id) ? " selected" : ""}`}
                onClick={() => toggleTradeInCard(card.id)}
              >
                <p>{card.text}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="submit-bar" ref={submitBarRef}>
            <p className="muted">
              Selected {selected.length}/{blackCard.pick}
            </p>
            <div className="row">
              <button className="primary" onClick={submit} disabled={selected.length !== blackCard.pick}>
                Submit
              </button>
              {canDraw && (
                <button type="button" onClick={draw}>
                  <CardsStackIcon /> Draw a card
                  {state.handSize - hand.length > 1 && (
                    <span className="muted"> ({state.handSize - hand.length} to fill your hand)</span>
                  )}
                </button>
              )}
              {canTradeIn && (
                <button type="button" onClick={() => setTradeInMode(true)}>
                  Trade in (spend 1 black card, -1 point)
                </button>
              )}
              {canRefreshHand && (
                <button type="button" onClick={() => socket.emit("refreshHand")}>
                  <RefreshIcon /> Refresh my hand (once per game)
                </button>
              )}
            </div>
          </div>
          <div className="hand">
            {hand.map((card) => {
              const orderIndex = selected.indexOf(card.id);
              const actionDef = card.actionCardId ? getActionCardDef(card.actionCardId) : undefined;
              return (
                <button
                  key={card.id}
                  className={`card card-white hand-card${orderIndex !== -1 ? " selected" : ""}${
                    justDrawnIds.has(card.id) ? " just-drawn" : ""
                  }${actionDef ? " action-card" : ""}`}
                  onClick={() => (actionDef ? setPlayingActionCard({ card, def: actionDef }) : toggleCard(card.id))}
                >
                  {actionDef && <span className="action-card-badge">Action</span>}
                  {orderIndex !== -1 && blackCard.pick > 1 && <span className="order-badge">{orderIndex + 1}</span>}
                  <p>{actionDef ? actionDef.name : card.text}</p>
                </button>
              );
            })}
          </div>
          {hand.length === 0 && <p className="center-text muted">Your hand is empty — draw some cards above.</p>}
        </>
      )}
      {playingActionCard && (
        <ActionCardPlayPanel
          card={playingActionCard.card}
          def={playingActionCard.def}
          state={state}
          onClose={() => setPlayingActionCard(null)}
        />
      )}
    </div>
  );
}
