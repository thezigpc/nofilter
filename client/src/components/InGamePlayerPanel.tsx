import { useEffect, useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { CrownIcon } from "./Icons.js";

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

/** Host-only, in-game equivalent of the Lobby's player list - Kick and a
 * "skip their turn" (excuse from this round's required submitters, without
 * removing them) for a specific slow/AFK player. Kick already worked in
 * any phase server-side, but had no client UI outside the Lobby until now.
 * Also the "detailed" half of the submission-progress idea - WaitingPanel/
 * PlayerHandView show an ambient "X of Y submitted" count for everyone
 * waiting; this shows who specifically and for how long, since the host is
 * the one who'd actually act on it (Skip Their Turn / Kick). */
export default function InGamePlayerPanel({ state }: { state: RoomStateForClient }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.phase !== "submission") return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [state.phase]);

  if (!state.you.isHost) return null;
  const realPlayers = state.players.filter((p) => p.role === "player" && !p.isWildCard);

  function makeHost(playerId: string, name: string) {
    if (window.confirm(`Hand host over to ${name}? You will not be able to take it back yourself.`)) {
      socket.emit("transferHost", { playerId });
    }
  }

  function kick(playerId: string, name: string) {
    if (window.confirm(`Kick ${name} from the room?`)) {
      socket.emit("kickPlayer", { playerId });
    }
  }

  function excuse(playerId: string, name: string) {
    if (window.confirm(`Skip ${name}'s turn this round? They keep their seat and hand for next round.`)) {
      socket.emit("excusePlayerThisRound", { playerId });
    }
  }

  return (
    <div className="panel">
      <h2>Players</h2>
      <ul className="player-list">
        {realPlayers.map((p) => {
          const isRequired = state.votingThisRound || !p.isJudge;
          const canExcuse = state.phase === "submission" && !p.hasSubmitted && isRequired;
          return (
            <li key={p.id} className="player-row">
              <span>
                {p.isJudge && <CrownIcon className="icon" />} {p.name}
                {!p.connected && <span className="tag muted">disconnected</span>}
                {p.hasSubmitted && <span className="tag">submitted</span>}
                {canExcuse && <span className="tag muted">waiting {formatElapsed(now - state.dealtAt)}</span>}
              </span>
              <span className="row">
                {canExcuse && (
                  <button type="button" onClick={() => excuse(p.id, p.name)}>
                    Skip their turn
                  </button>
                )}
                {/* transferHost has never had a phase restriction server-side;
                    until now the only button for it lived in the Lobby, so a
                    host who needed to hand over mid-game simply could not. */}
                {!p.isHost && !p.isWildCard && p.role === "player" && (
                  <button type="button" onClick={() => makeHost(p.id, p.name)}>
                    Make host
                  </button>
                )}
                {!p.isHost && (
                  <button type="button" onClick={() => kick(p.id, p.name)}>
                    Kick
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
