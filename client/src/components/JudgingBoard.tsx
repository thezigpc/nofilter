import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { JudgingCardSlot, RoomStateForClient } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { blackCardLengthScale, formatBlackCardText } from "../blackCardText.js";
import { tapHaptic } from "../haptics.js";
import { useFillGrid } from "../useFillGrid.js";
import { BackArrowIcon, BoltCardIcon, CheckIcon, ShuffleIcon, SkipForwardIcon, TrophyIcon, VoteIcon } from "./Icons.js";

// The grid card's box is much smaller than the spotlight overlay's, so it
// needs its own, much smaller tier of sizes for the same total lineup
// length — reusing the spotlight's sizes here would overflow immediately.
function fitFontSize(cards: { text: string }[], mode: "grid" | "spotlight"): string {
  const totalLen = cards.map((c) => c.text).join(" ").length;
  if (mode === "spotlight") {
    if (totalLen < 25) return "2.4rem";
    if (totalLen < 50) return "1.9rem";
    if (totalLen < 90) return "1.5rem";
    if (totalLen < 140) return "1.15rem";
    return "0.95rem";
  }
  if (totalLen < 20) return "1.05rem";
  if (totalLen < 40) return "0.92rem";
  if (totalLen < 70) return "0.8rem";
  if (totalLen < 110) return "0.7rem";
  if (totalLen < 160) return "0.62rem";
  return "0.55rem";
}

interface JudgingBoardProps {
  state: RoomStateForClient;
  /** Rendered right after the black card, before the shuffle/status text —
   * used only by the Dense layout's persistent status pill. Omitted
   * everywhere else, where it's simply a no-op. */
  topSlot?: ReactNode;
  /** Overrides for the Template Editor's preview, which has no server to
   * round-trip through — when omitted (the real game), these fall back to
   * the normal socket emits unchanged. */
  onShuffle?: () => void;
  onReveal?: (submissionId: string) => void;
  onPick?: (submissionId: string) => void;
  onSpotlight?: (submissionId: string) => void;
  onCloseSpotlight?: () => void;
  onVote?: (submissionId: string) => void;
  /** For any player's "Table" tab: shows the same board (unrevealed slots
   * already come through as cards:null) but can't drive any of it — no
   * shuffle/reveal/pick, and a currently-open spotlight is just watched,
   * not controlled. Only the Czar or Table ever render this without
   * readOnly. */
  readOnly?: boolean;
  /** Crowd Favorite: no unilateral Pick — everyone (including a non-
   * readOnly round-host) votes instead, once per round, excluding their
   * own submission. */
  voteMode?: boolean;
  yourSubmissionId?: string | null;
  yourVote?: string | null;
}

export default function JudgingBoard({
  state,
  topSlot,
  onShuffle,
  onReveal,
  onPick,
  onSpotlight,
  onCloseSpotlight,
  onVote,
  readOnly = false,
  voteMode = false,
  yourSubmissionId = null,
  yourVote = null,
}: JudgingBoardProps) {
  const board = state.judgingBoard ?? [];
  const blackCard = state.blackCard;
  const shuffleLocked = state.shuffleLocked ?? false;
  const spotlightEnabled = state.tableStyle.spotlightEnabled;
  // Server-synced (see Room.spotlightId), not per-client local state — the
  // spotlight opens/closes together on the Table and the Czar's own phone,
  // whichever one triggered it.
  const spotlightId = state.spotlightSubmissionId ?? null;
  // The size adjustment is Shared-Screen-only — the spotlight already reads
  // fine at its default size on a phone screen, and blowing it up there
  // (or shrinking it) fights the phone's own natural proportions.
  const spotlightScale = state.you.role === "table" ? state.spotlightScale : 1;

  // Read-only viewers (a player's "Table" tab) can't drive the shared
  // spotlight, but they still need a way to back out of it locally without
  // affecting what the Czar/Table see - otherwise they're stuck staring at
  // whatever's spotlighted until the Czar closes it. Purely local/visual:
  // resets whenever the server spotlights something new, so a fresh
  // spotlight always shows up even if a previous one was dismissed.
  const [locallyDismissedId, setLocallyDismissedId] = useState<string | null>(null);
  useEffect(() => {
    setLocallyDismissedId(null);
  }, [spotlightId]);

  function shuffle() {
    if (onShuffle) onShuffle();
    else socket.emit("shuffleSubmissions");
  }
  function reveal(submissionId: string) {
    if (onReveal) onReveal(submissionId);
    else socket.emit("revealSubmission", { submissionId });
  }
  function pick(submissionId: string) {
    if (onPick) onPick(submissionId);
    else socket.emit("czarPick", { submissionId });
  }
  function spotlight(submissionId: string) {
    if (onSpotlight) onSpotlight(submissionId);
    else socket.emit("spotlightSubmission", { submissionId });
  }
  function closeSpotlight() {
    if (onCloseSpotlight) onCloseSpotlight();
    else socket.emit("clearSpotlight");
  }
  function vote(submissionId: string) {
    if (onVote) onVote(submissionId);
    else socket.emit("voteForSubmission", { submissionId });
  }

  function onSlotClick(slot: JudgingCardSlot) {
    if (readOnly) return;
    tapHaptic();
    if (!slot.revealed) {
      // Reveal implicitly opens the spotlight server-side when enabled
      // (see Room.revealSubmission) — no separate call needed here.
      reveal(slot.submissionId);
    } else if (spotlightEnabled) {
      spotlight(slot.submissionId);
    }
  }

  const spotlightSlot =
    spotlightEnabled && locallyDismissedId !== spotlightId ? board.find((s) => s.submissionId === spotlightId) : undefined;
  const pickCount = blackCard?.pick ?? 1;

  // Parlour's fanned/rotated cards (see .judging-grid.parlour-fan in
  // index.css) don't compose with the fill-sizing hook's rectangle-packing
  // math - it computes non-overlapping box dimensions, which a fan actively
  // contradicts. Always falls back to the plain grid (rendered with the
  // parlour-fan class instead) for this theme, same as spotlight-off does
  // for the "Pick winner" button below.
  const isParlourFan = state.tableStyle.theme === "parlour";

  // Dynamic space-filling grid sizing (see useFillGrid.ts) is exclusive to
  // the real Shared Screen device, and only when spotlight is on - with
  // spotlight off, a per-card "Pick winner" button renders inside the grid
  // slot itself, whose height the ported fillGrid math (like the mockup
  // it's from) doesn't account for. Falling back to today's plain grid in
  // that case avoids a real overflow bug rather than patching the height
  // math for a secondary option. Called unconditionally (Rules of Hooks);
  // only its return value is consumed conditionally below.
  const useFillSizing = state.you.role === "table" && spotlightEnabled && !isParlourFan;
  const { containerRef, wrapperClassName, gridStyle, cardHeightPx, fontSizePx } = useFillGrid(
    board.length,
    pickCount,
    state.tableStyle.maxCardSize,
    useFillSizing && state.tableStyle.cardMode
  );

  const slots = board.map((slot) => (
    <motion.div
      key={slot.submissionId}
      layout
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={`judging-slot pick-${pickCount}`}
    >
      <div
        className={`flip-card${slot.revealed ? " flipped" : ""}${readOnly ? " read-only" : ""}`}
        onClick={() => onSlotClick(slot)}
      >
        <div className="flip-card-inner">
          <div className="flip-card-face flip-card-back">
            <span className="card-back-mark">?</span>
          </div>
          <div className="flip-card-face flip-card-front card card-white">
            {slot.cards?.map((c, i) => (
              <p
                key={c.id + i}
                className="lineup-line"
                style={{ fontSize: useFillSizing ? `${fontSizePx}px` : fitFontSize(slot.cards!, "grid") }}
              >
                {slot.cards!.length > 1 && <span className="lineup-badge">{i + 1}</span>}
                <span>{c.text}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
      {slot.revealed &&
        // Spotlight hides the grid's own action button because a Czar-
        // driven round expects you to act from the big spotlight overlay
        // instead - but a voting round has no one driving cards into the
        // spotlight one at a time (every card auto-reveals at once, see
        // Room.moveToReveal), so gating Vote the same way would leave
        // voting unreachable whenever the room's table style has
        // Spotlight on (the default). Vote stays visible in the grid
        // regardless; Pick still defers to the spotlight overlay as before.
        (voteMode || !spotlightEnabled) &&
        (voteMode
          ? slot.submissionId !== yourSubmissionId && (
              <button
                className={yourVote === slot.submissionId ? "pick-winner-btn voted" : "pick-winner-btn"}
                onClick={() => vote(slot.submissionId)}
              >
                {yourVote === slot.submissionId ? (
                  <>
                    <CheckIcon /> Voted
                  </>
                ) : (
                  <>
                    <VoteIcon /> Vote
                  </>
                )}
              </button>
            )
          : !readOnly && (
              <button className="pick-winner-btn" onClick={() => pick(slot.submissionId)}>
                <TrophyIcon /> Pick winner
              </button>
            ))}
    </motion.div>
  ));

  return (
    <div className="stack">
      {blackCard && (
        <div
          className="card card-black"
          style={{ "--black-card-length-scale": blackCardLengthScale(formatBlackCardText(blackCard.text)) } as React.CSSProperties}
        >
          <p>{formatBlackCardText(blackCard.text)}</p>
        </div>
      )}
      {state.pendingJudgingMessage && (
        <p className="center-text action-card-judging-note">
          <BoltCardIcon /> {state.pendingJudgingMessage}
        </p>
      )}
      {topSlot}

      {!readOnly ? (
        <>
          {!shuffleLocked ? (
            <>
              <motion.button className="primary" whileTap={{ scale: 0.92, rotate: -6 }} onClick={shuffle}>
                <ShuffleIcon /> Shuffle
              </motion.button>
              <p className="center-text muted">Shuffle, then tap a card to flip it face up.</p>
            </>
          ) : (
            <p className="center-text muted">
              {spotlightEnabled ? "Tap a face-down card to bring it forward." : "Tap a face-down card to reveal it."}
            </p>
          )}
          {(state.you.isHost || state.you.isCzar) && (
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
          )}
        </>
      ) : voteMode ? (
        <p className="center-text muted">Vote for your favorite once it's revealed — you can change your mind until everyone's voted.</p>
      ) : (
        <p className="center-text muted">Watching the Czar judge…</p>
      )}

      {useFillSizing ? (
        <div className={wrapperClassName} ref={containerRef}>
          <motion.div
            className="judging-grid fill-sized"
            layout
            style={{ ...gridStyle, "--fill-card-h": `${cardHeightPx}px` } as React.CSSProperties}
          >
            <AnimatePresence>{slots}</AnimatePresence>
          </motion.div>
        </div>
      ) : (
        <motion.div className={isParlourFan ? "judging-grid parlour-fan" : "judging-grid"} layout>
          <AnimatePresence>{slots}</AnimatePresence>
        </motion.div>
      )}

      {spotlightSlot?.cards && (
        <div
          className="spotlight-backdrop open"
          onClick={(e) => {
            if (readOnly) {
              setLocallyDismissedId(spotlightId);
              return;
            }
            if (e.target === e.currentTarget) closeSpotlight();
          }}
        >
          <div className="spotlight-inner" style={{ "--spotlight-scale": spotlightScale } as React.CSSProperties}>
            {blackCard && <p className="spotlight-prompt">{formatBlackCardText(blackCard.text)}</p>}
            <div className="spotlight-card card card-white">
              {spotlightSlot.cards.map((c, i) => (
                <p key={c.id + i} className="lineup-line" style={{ fontSize: fitFontSize(spotlightSlot.cards!, "spotlight") }}>
                  {spotlightSlot.cards!.length > 1 && <span className="lineup-badge">{i + 1}</span>}
                  <span>{c.text}</span>
                </p>
              ))}
            </div>
            <div className="spotlight-actions">
              {voteMode
                ? spotlightSlot.submissionId !== yourSubmissionId && (
                    <button className="spotlight-pick" onClick={() => vote(spotlightSlot.submissionId)}>
                      {yourVote === spotlightSlot.submissionId ? (
                        <>
                          <CheckIcon /> Voted
                        </>
                      ) : (
                        <>
                          <VoteIcon /> Vote for this one
                        </>
                      )}
                    </button>
                  )
                : !readOnly && (
                    <button className="spotlight-pick" onClick={() => pick(spotlightSlot.submissionId)}>
                      <TrophyIcon /> Pick this one
                    </button>
                  )}
              <button
                className="spotlight-back"
                onClick={() => (readOnly ? setLocallyDismissedId(spotlightId) : closeSpotlight())}
              >
                <BackArrowIcon /> Back to board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
