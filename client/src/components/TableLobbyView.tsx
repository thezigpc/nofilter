import { useState } from "react";
import type { RoomStateForClient } from "@tabletop-judge/shared";
import InvitePanel from "./InvitePanel.js";
import Lobby from "./Lobby.js";
import { GearIcon } from "./Icons.js";

/**
 * What the Table shows during Lobby: a big, distance-readable invite (in the
 * same visual slot the black card normally occupies) instead of the full
 * phone-sized settings panels. Settings are one tap away via the toggle
 * below, which reuses <Lobby> wholesale — Table already has lobby authority
 * (see Room.requireLobbyAuthority) so those controls are live once opened.
 */
export default function TableLobbyView({ state }: { state: RoomStateForClient }) {
  const [showSettings, setShowSettings] = useState(false);
  const joinedPlayers = state.players.filter((p) => p.role === "player");

  const playersList = (
    <>
      <p className="rules-panel-subhead">Players</p>
      {joinedPlayers.length === 0 ? (
        <p className="muted">Waiting for players to scan in…</p>
      ) : (
        <ul className="player-list">
          {joinedPlayers.map((p) => (
            <li key={p.id} className="player-row">
              <span>
                {p.name} {p.isHost && <span className="tag">Host</span>}
                {!p.connected && <span className="tag muted">Disconnected</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className="stack">
      <div className="panel table-invite-hero">
        <h1 className="table-room-code">{state.code}</h1>
        <InvitePanel roomCode={state.code} size="large" state={state} leftContent={playersList} />
      </div>

      <button type="button" className="primary" onClick={() => setShowSettings((s) => !s)}>
        {showSettings ? (
          "Hide Settings"
        ) : (
          <>
            <GearIcon /> Settings — Shared Screen look, packs, house rules
          </>
        )}
      </button>

      {showSettings && <Lobby state={state} />}
    </div>
  );
}
