import { useEffect, useRef } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import { CrownIcon } from "./Icons.js";

export default function Scoreboard({ state }: { state: RoomStateForClient }) {
  const ref = useRef<HTMLElement>(null);
  const hidden = state.phase === "lobby" || state.phase === "personalCards" || state.houseRules.noScorekeeping;
  const players = state.players.filter((p) => p.role === "player");

  // Fixed, not sticky - a Table's content is often shorter than the
  // viewport (the whole point of its own auto-fit zoom), so a sticky bar
  // never gets to "stick" there at all. --scoreboard-height (measured live,
  // since a big table can wrap this into several rows) is what lets
  // .submit-bar (PlayerHandView's floating Submit button) sit flush above
  // it without any shared DOM ancestor between the two.
  useEffect(() => {
    const el = ref.current;
    if (hidden || !el) {
      document.documentElement.style.setProperty("--scoreboard-height", "0px");
      return;
    }
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--scoreboard-height", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--scoreboard-height", "0px");
    };
  }, [hidden, players.length]);

  if (hidden) return null;

  return (
    <footer className="scoreboard" ref={ref}>
      {players.map((p) => (
        <span key={p.id} className={`score-chip${p.isCzar ? " czar" : ""}${!p.connected ? " muted" : ""}`}>
          {p.isCzar && <CrownIcon className="icon" />} {p.name}: {p.score}
        </span>
      ))}
    </footer>
  );
}
