import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { normalizeRoomCode, DEFAULT_TABLE_STYLE } from "@tabletop-judge/shared";
import Changelog from "../components/Changelog.js";
import { DEFAULT_GAME_NAME, fetchPublicConfig } from "../publicConfig.js";
import { themeAttrs } from "../useThemeAttrs.js";

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [codeInput, setCodeInput] = useState("");
  const [gameName, setGameNameState] = useState(DEFAULT_GAME_NAME);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [theme, setTheme] = useState(DEFAULT_TABLE_STYLE.theme);
  const [accentIndex, setAccentIndex] = useState(DEFAULT_TABLE_STYLE.accentIndex);
  useEffect(() => {
    fetchPublicConfig().then((config) => {
      setGameNameState(config.gameName);
      setSetupNeeded(config.setupNeeded);
      setTheme(config.defaultTheme);
      setAccentIndex(config.defaultAccentIndex);
    });
  }, []);
  // Set by RoomPage's onKicked handler (room closed, kicked, etc.) so
  // landing back here isn't a silent, unexplained bounce. Cleared from
  // history state once shown, so a later reload doesn't re-show it.
  const [notice] = useState<string | null>(() => (location.state as { noticeMessage?: string } | null)?.noticeMessage ?? null);
  useEffect(() => {
    if (notice) window.history.replaceState({}, "");
  }, [notice]);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeRoomCode(codeInput);
    if (code) navigate(`/room/${code}`);
  }

  const theming = themeAttrs(theme, accentIndex);

  return (
    <div className="page home" data-table-theme={theming["data-table-theme"]} style={theming.style}>
      <div className="home-hero">
        <h1>{gameName}</h1>
        <p className="subtitle">Bring your phones. No physical cards needed.</p>
        {notice && <p className="error toast">{notice}</p>}

        {setupNeeded && (
          <div className="panel setup-warning">
            <p>
              <strong>This server has no admin password yet.</strong>
            </p>
            <p className="muted">
              Until one is set, the first person to open the admin page becomes this server's admin — so set it now,
              before sharing the address with anyone.
            </p>
            <button type="button" className="primary" onClick={() => navigate("/admin")}>
              Set the admin password
            </button>
          </div>
        )}

        <div className="panel home-join">
          <h2>Join a game</h2>
          <form onSubmit={handleJoin} className="stack">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="ROOM CODE"
              maxLength={6}
              autoCapitalize="characters"
            />
            <button type="submit" className="primary" disabled={!codeInput.trim()}>
              Join
            </button>
          </form>
        </div>
      </div>

      <div className="home-actions">
        <div className="panel">
          <h2>Host a new game</h2>
          <button onClick={() => navigate("/room/new")}>Create Room</button>
          <p className="muted">Joining from your own phone? Start here — you'll become the host.</p>
          <hr className="panel-divider" />
          <button type="button" onClick={() => navigate("/room/new?role=table")}>
            Set up the Shared Screen
          </button>
          <p className="muted">Got a shared screen (tablet/TV)? Start here instead — it'll show a QR code for everyone else to join.</p>
        </div>

        <div className="panel">
          <h2>Shared Screen style</h2>
          <p className="muted">Design and save a Shared Screen look ahead of time, no room required.</p>
          <button type="button" onClick={() => navigate("/editor")}>
            Open the Template Editor
          </button>
        </div>

        <div className="panel">
          <h2>Card Management</h2>
          <p className="muted">
            Add your own white/black cards, upload named Custom Sets (CSV or JSON), replace or add to the Core Set
            this server plays with, browse what's in any of it, and build saved pack-selection presets to reuse in
            any room.
          </p>
          <button type="button" onClick={() => navigate("/custom-cards")}>
            Open Card Management
          </button>
        </div>

        <div className="panel">
          <h2>Admin</h2>
          <p className="muted">List or close active rooms, and set the admin password for the first time if nobody has yet.</p>
          <button type="button" onClick={() => navigate("/admin")}>
            Open the admin panel
          </button>
        </div>
      </div>

      <Changelog />
    </div>
  );
}
