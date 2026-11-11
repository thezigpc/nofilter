import { useEffect, useRef, useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";

const STORAGE_KEY = "ttj_turn_notifications";

/** Per-device preference (not room state) - whether it's your own personal
 * phone that should buzz/chime, nothing to do with how anyone else plays. */
export function useTurnNotificationsEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) !== "off");
  function set(v: boolean) {
    localStorage.setItem(STORAGE_KEY, v ? "on" : "off");
    setEnabled(v);
  }
  return [enabled, set];
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Web Audio unavailable or blocked (e.g. no user gesture yet this page
    // load) - silently skip, vibration below still fires independently.
  }
}

/** Fires a short chime + vibration the instant it becomes this viewer's turn
 * to act (submit a card, or judge as Judge/Table) - easy to miss otherwise if
 * the phone isn't being actively watched between rounds. */
export function useTurnNotification(state: RoomStateForClient | null, enabled: boolean) {
  const you = state?.players.find((p) => p.id === state.you.id);
  const needsAction = !state
    ? false
    : (state.phase === "personalCards" && state.you.role === "player") ||
      (state.phase === "submission" &&
        state.you.role === "player" &&
        (!state.you.isJudge || state.votingThisRound) &&
        !you?.hasSubmitted) ||
      ((state.phase === "reveal" || state.phase === "judging") && (state.you.role === "table" || state.you.isJudge));

  // null (not false) means "haven't observed a state yet" - skip firing on
  // the very first render so loading straight into "it's your turn" (e.g.
  // reconnecting mid-game) doesn't buzz immediately on page load.
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    if (prev.current !== null && needsAction && !prev.current && enabled) {
      playChime();
      if (navigator.vibrate) navigator.vibrate(200);
    }
    prev.current = needsAction;
  }, [needsAction, enabled]);
}
