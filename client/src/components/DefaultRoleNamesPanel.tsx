import { useEffect, useState } from "react";
import { DEFAULT_ROLE_NAMES, type RoleNames } from "@tabletop-judge/shared";
import { fetchPublicConfig, setDefaultRoleNames } from "../publicConfig.js";
import RoleNamesFields from "./RoleNamesFields.js";

/**
 * The deployment-wide default names for the Judge and the Wild Card bot -
 * every new room starts with these, and a host can still rename either from
 * the Lobby. See server/src/roleNames/store.ts.
 */
export default function DefaultRoleNamesPanel() {
  const [current, setCurrent] = useState<RoleNames>(DEFAULT_ROLE_NAMES);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicConfig().then((c) => setCurrent(c.defaultRoleNames));
  }, []);

  function commit(change: Partial<RoleNames>) {
    setStatus("Saving…");
    setDefaultRoleNames({ ...current, ...change }).then((res) => {
      if (!res.ok || !res.roleNames) {
        setStatus(res.error ?? "Couldn't save.");
        return;
      }
      setCurrent(res.roleNames);
      setStatus("Saved — applies to rooms created from now on.");
    });
  }

  return (
    <div className="panel">
      <h2>Role names</h2>
      <p className="muted">
        What new rooms call the player who picks each round's winner, and the house-rule bot. Hosts can still rename
        both for their own room from the Lobby.
      </p>
      <RoleNamesFields value={current} onCommit={commit} />
      {status && <p className="muted">{status}</p>}
    </div>
  );
}
