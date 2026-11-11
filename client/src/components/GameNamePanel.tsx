import { useEffect, useState } from "react";
import { DEFAULT_GAME_NAME, fetchGameName, setGameName as setGameNameRequest } from "../publicConfig.js";

/**
 * Lets an admin override the game's display name (browser tab title,
 * HomePage heading) - kept out of the client's hardcoded strings entirely
 * so a self-hosted deployment isn't stuck with this project's own branding.
 * See server/src/gameName/store.ts.
 */
export default function GameNamePanel() {
  const [current, setCurrent] = useState(DEFAULT_GAME_NAME);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchGameName().then((name) => {
      setCurrent(name);
      setDraft(name);
    });
  }, []);

  function save() {
    const clean = draft.trim();
    if (!clean || clean === current) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    setGameNameRequest(clean).then((res) => {
      setBusy(false);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save that name.");
        return;
      }
      setCurrent(res.name ?? clean);
      setSaved(true);
    });
  }

  return (
    <div className="panel">
      <h2>Game name</h2>
      <p className="muted">
        Shown as the browser tab title and the homepage heading. Currently <strong>{current}</strong> — takes effect
        for anyone loading the page fresh (open tabs keep their current title until reloaded).
      </p>
      <div className="row">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          maxLength={60}
          placeholder="Game name…"
          style={{ flex: 1 }}
        />
        <button type="button" className="primary" onClick={save} disabled={busy || !draft.trim() || draft.trim() === current}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && !error && <p className="muted">Saved.</p>}
    </div>
  );
}
