import { useState } from "react";
import type { CastResultLike, CastTargetsLike } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { useOnBox } from "../useVenue.js";

/**
 * Bar Games casting: the host puts this room's Shared Screen on the venue's
 * TVs. Renders nothing standalone, nothing for non-hosts, and nothing when
 * the venue hasn't allowed casting from games (targets.enabled false). TV
 * pairing and the PIN itself are set up by staff in the box admin, never
 * here. The list is fetched when opened, never polled.
 */
export default function CastTvsControl({ isHost }: { isHost: boolean }) {
  const onBox = useOnBox();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<CastTargetsLike | null>(null);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!onBox || !isHost) return null;

  function refresh() {
    socket.emit("listTvs", (t) => setTargets(t));
  }

  function toggle() {
    if (!open) refresh();
    setOpen(!open);
    setMessage(null);
  }

  function describe(res: CastResultLike): string {
    if (res.ok) return "Done.";
    const failed = Object.values(res.results ?? {}).find((r) => !r.ok);
    if (failed?.needsCode) return "That TV hasn't been paired yet - ask staff to pair it in the venue admin.";
    return failed?.message ?? res.message ?? "That didn't work.";
  }

  function run(event: "castToTvs" | "stopTvs", id: string) {
    setBusy(true);
    setMessage(null);
    socket.emit(event, { ids: [id], pin: pin || undefined }, (res) => {
      setBusy(false);
      setMessage(describe(res));
      refresh();
    });
  }

  // The venue turned casting from games off: hide the control entirely.
  if (targets && !targets.enabled) return null;

  return (
    <>
      <button type="button" onClick={toggle} aria-expanded={open}>
        TVs
      </button>
      {open && targets && (
        <div className="panel cast-tvs-panel">
          <h3>Put this room on a TV</h3>
          {targets.pinRequired && (
            <label className="role-name-field">
              <span>TV PIN</span>
              <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" autoComplete="off" />
            </label>
          )}
          {targets.displays.length === 0 && <p className="muted">No TVs are set up at this venue yet.</p>}
          {targets.displays.map((d) => (
            <div key={d.id} className="player-row">
              <span>
                {d.name}
                {d.showingThisGame ? (
                  <span className="tag">{d.roomCode ? `showing ${d.roomCode}` : "showing this game"}</span>
                ) : d.busy ? (
                  <span className="tag">busy</span>
                ) : null}
              </span>
              <span className="row">
                <button type="button" disabled={busy} onClick={() => run("castToTvs", d.id)}>
                  Show here
                </button>
                {d.showingThisGame && (
                  <button type="button" disabled={busy} onClick={() => run("stopTvs", d.id)}>
                    Stop
                  </button>
                )}
              </span>
            </div>
          ))}
          {message && <p className="muted">{message}</p>}
        </div>
      )}
    </>
  );
}
