import { useEffect, useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { CrownIcon } from "./Icons.js";

/**
 * Shown to everyone still in the room when the host has dropped.
 *
 * A mid-game disconnect deliberately keeps your seat and your host status,
 * which is right for a phone that locks for a minute - but a dead battery
 * would otherwise leave nobody able to end the game, kick anyone, or hit
 * Play Again at the finish. After a grace period anyone can take over.
 *
 * Deliberately a claim rather than an automatic handoff, so it can't fire
 * while the host is simply mid-reconnect, and whoever is actually still at
 * the table is the one who decides.
 */
export default function HostClaimNotice({ state }: { state: RoomStateForClient }) {
  const claimableAt = state.hostClaimableAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!claimableAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [claimableAt]);

  // Nothing to say while the host is present, or to the host themselves, or
  // on the Shared Screen (which can't hold host anyway).
  if (!claimableAt || state.you.isHost || state.you.role !== "player") return null;

  const host = state.players.find((p) => p.isHost);
  const secondsLeft = Math.max(0, Math.ceil((claimableAt - now) / 1000));
  const ready = secondsLeft === 0;

  return (
    <div className="panel host-claim-notice">
      <p>
        <CrownIcon className="icon" /> {host ? `${host.name} (the host)` : "The host"} has disconnected.
      </p>
      {ready ? (
        <>
          <p className="muted">
            Nobody can end the game, remove a player, or start a new one until someone takes over.
          </p>
          <button type="button" className="primary" onClick={() => socket.emit("claimHost")}>
            Take over as host
          </button>
        </>
      ) : (
        <p className="muted">
          If they don't come back, you'll be able to take over as host in {secondsLeft}s.
        </p>
      )}
    </div>
  );
}
