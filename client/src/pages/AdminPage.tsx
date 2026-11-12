import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_TABLE_STYLE } from "@tabletop-judge/shared";
import type { RoomAdminSummary } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { ADMIN_TOKEN_KEY, declineStaffSignIn, resumeAdminSession } from "../adminSession.js";
import { fetchPublicConfig } from "../publicConfig.js";
import { themeAttrs } from "../useThemeAttrs.js";
import { BackArrowIcon } from "../components/Icons.js";
import GameNamePanel from "../components/GameNamePanel.js";
import DefaultRoleNamesPanel from "../components/DefaultRoleNamesPanel.js";
import DefaultThemePanel from "../components/DefaultThemePanel.js";

function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function SetupWizard({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    socket.emit("adminCompleteSetup", { password, confirm }, (res) => {
      setBusy(false);
      if (!res.ok || !res.token) {
        setError(res.error ?? "Couldn't complete setup.");
        return;
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      onDone();
    });
  }

  return (
    <div className="panel">
      <h2>Set up the admin password</h2>
      <p className="muted">
        This server doesn't have an admin password yet. Whoever completes this form first becomes admin — do this
        now, before sharing this server's address with anyone.
      </p>
      <form onSubmit={submit} className="stack">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New admin password (8+ characters)"
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          autoComplete="new-password"
        />
        <button type="submit" className="primary" disabled={busy || !password || !confirm}>
          {busy ? "Setting up…" : "Set admin password"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    socket.emit("adminLogin", { password }, (res) => {
      setBusy(false);
      if (!res.ok || !res.token) {
        setError("That password wasn't right.");
        return;
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      onDone();
    });
  }

  return (
    <div className="panel">
      <h2>Sign in</h2>
      <form onSubmit={submit} className="row">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoComplete="current-password"
          style={{ flex: 1 }}
        />
        <button type="submit" className="primary" disabled={!password || busy}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function RoomManagementPanel() {
  const [rooms, setRooms] = useState<RoomAdminSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    socket.emit("adminListRooms", (res) => {
      if (!res.ok) {
        setError(res.error ?? "Couldn't load rooms.");
        return;
      }
      setError(null);
      setRooms(res.rooms ?? []);
    });
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeRoom(code: string) {
    if (!window.confirm(`Close room ${code}? Everyone still connected gets sent back to the main menu.`)) return;
    socket.emit("adminCloseRoom", { code }, () => refresh());
  }

  function closeAll() {
    if (!window.confirm("Close every active room? Everyone still connected, in every room, gets sent home.")) return;
    socket.emit("adminCloseAllRooms", () => refresh());
  }

  return (
    <div className="panel">
      <h2>Rooms</h2>
      {error && <p className="error">{error}</p>}
      {rooms === null ? (
        <p className="muted">Loading…</p>
      ) : rooms.length === 0 ? (
        <p className="muted">No active rooms right now.</p>
      ) : (
        <>
          <ul className="player-list">
            {rooms.map((r) => (
              <li key={r.code} className="player-row">
                <span>
                  <strong>{r.code}</strong> <span className="tag muted">{r.phase}</span>{" "}
                  <span className="tag muted">
                    {r.connectedCount}/{r.playerCount} connected
                  </span>{" "}
                  <span className="tag muted">active {formatAge(r.lastActivityAt)}</span>
                </span>
                <button type="button" onClick={() => closeRoom(r.code)}>
                  Close
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" onClick={closeAll}>
              Close all rooms
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The admin hub - room management today, and wherever future admin-only
 * features that aren't specifically about card content land (see
 * CLAUDE.md's accounts-and-admin-plan.md roadmap). Card content itself
 * (Custom Cards, Custom Sets, Core Set) lives on /custom-cards ("Card
 * Management") instead, which stays read-public/write-gated rather than
 * needing a login just to look - room management has no equivalent
 * legitimate anonymous-read case, so this whole page is login-gated.
 *
 * First-run setup also lives here: a fresh deploy with no admin password
 * configured shows the wizard the moment this page loads, since it's the
 * natural "go set this up" destination linked from the homepage.
 */
export default function AdminPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ isAdmin: boolean; setupNeeded: boolean } | null>(null);
  const [theme, setTheme] = useState(DEFAULT_TABLE_STYLE.theme);
  const [accentIndex, setAccentIndex] = useState(DEFAULT_TABLE_STYLE.accentIndex);

  useEffect(() => {
    fetchPublicConfig().then((config) => {
      setTheme(config.defaultTheme);
      setAccentIndex(config.defaultAccentIndex);
    });
  }, []);

  function refreshStatus() {
    // Stored token first, then the venue box vouching for staff (never
    // standalone) - see resumeAdminSession.
    void resumeAdminSession().then(() =>
      socket.emit("adminStatus", (res) => setStatus({ isAdmin: res.isAdmin, setupNeeded: res.setupNeeded }))
    );
  }

  useEffect(() => {
    socket.on("connect", refreshStatus);
    if (socket.connected) refreshStatus();
    else socket.connect();
    return () => {
      socket.off("connect", refreshStatus);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOut() {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) socket.emit("adminLogout", { token });
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    declineStaffSignIn();
    refreshStatus();
  }

  const theming = themeAttrs(theme, accentIndex);

  return (
    <div className="page dashboard" data-table-theme={theming["data-table-theme"]} style={theming.style}>
      <header className="room-header">
        <button type="button" onClick={() => navigate("/")}>
          <BackArrowIcon /> Back
        </button>
        <span>Admin</span>
      </header>

      {!status ? (
        <p className="muted">Loading…</p>
      ) : status.setupNeeded && !status.isAdmin ? (
        // Venue staff signed in through the box skip this: they're admin
        // already, with or without a game password.
        <SetupWizard onDone={refreshStatus} />
      ) : !status.isAdmin ? (
        <LoginForm onDone={refreshStatus} />
      ) : (
        <>
          <div className="panel admin-bar signed-in">
            <span>
              <strong>Signed in as admin</strong>
            </span>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
          <RoomManagementPanel />
          <DefaultThemePanel onChange={(t, i) => { setTheme(t); setAccentIndex(i); }} />
          <GameNamePanel />
          <DefaultRoleNamesPanel />
        </>
      )}
    </div>
  );
}
