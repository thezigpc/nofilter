import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket.js";
import { ADMIN_TOKEN_KEY as TOKEN_KEY } from "../adminSession.js";

/**
 * Sign-in for managing the shared card library.
 *
 * Those stores are global to the server rather than per-room, so writes to
 * them are gated (see server/src/admin/auth.ts). Reads stay open, which is
 * why the page below this still renders everything for anyone.
 *
 * Only the issued token is persisted - never the password. The token is
 * re-sent on every connect, matching how a room session resumes, so a
 * dropped connection doesn't silently downgrade an admin back to a viewer
 * mid-edit.
 */
export default function AdminBar({ onChange }: { onChange: (isAdmin: boolean) => void }) {
  const navigate = useNavigate();
  const [configured, setConfigured] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function apply(next: boolean) {
    setIsAdmin(next);
    onChange(next);
  }

  useEffect(() => {
    function refresh() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        socket.emit("adminResume", { token }, (res) => {
          if (!res.ok) localStorage.removeItem(TOKEN_KEY);
          apply(res.ok);
        });
      }
      socket.emit("adminStatus", (res) => {
        setConfigured(res.configured);
        if (!res.isAdmin && !token) apply(false);
      });
    }

    socket.on("connect", refresh);
    if (socket.connected) refresh();
    return () => {
      socket.off("connect", refresh);
    };
    // apply/onChange are stable enough for this one-time wiring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    socket.emit("adminLogin", { password }, (res) => {
      setBusy(false);
      if (!res.ok || !res.token) {
        setError("That password wasn't right.");
        return;
      }
      localStorage.setItem(TOKEN_KEY, res.token);
      setPassword("");
      apply(true);
    });
  }

  function signOut() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) socket.emit("adminLogout", { token });
    localStorage.removeItem(TOKEN_KEY);
    apply(false);
  }

  if (!configured) {
    return (
      <div className="panel admin-bar locked">
        <p>
          <strong>The shared card library is locked.</strong>
        </p>
        <p className="muted">
          No admin password is set on this server yet, so nothing here can be changed — by anyone. Whoever sets one
          up first becomes admin, so do it now before sharing this server's address with anyone.
        </p>
        <button type="button" onClick={() => navigate("/admin")}>
          Set up the admin password
        </button>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="panel admin-bar signed-in">
        <span>
          <strong>Signed in as admin</strong> — you can add, edit and delete shared cards.
        </span>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form className="panel admin-bar" onSubmit={signIn}>
      <p className="muted">
        Browsing as a guest. Everything here is visible to anyone, but only an admin can change it — these cards and
        presets are shared by every game on this server.
      </p>
      <div className="row">
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
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
