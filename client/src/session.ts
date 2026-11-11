import { createSessionStore } from "@bargames/gamekit/client";
import type { Role } from "@tabletop-judge/shared";

export interface StoredSession {
  roomCode: string;
  token: string;
  name: string;
  role: Role;
}

// Seat sessions, scoped per tab (hosting in one tab and opening the Shared
// Screen in another must not overwrite the host's seat) but kept in
// localStorage so a backgrounded mobile tab that gets evicted can still
// resume. The kit's store is this game's original design; the "ttj" prefix
// keeps the exact same storage keys (ttj_tab_id, ttj_session:<tab>), so
// seats saved before the switch still resume. Storage failures (Safari
// private mode, a full quota) now mean "no resume after reload", not a crash.
const sessions = createSessionStore<StoredSession>("ttj");

export const loadSession = (): StoredSession | null => sessions.load();
export const saveSession = (session: StoredSession): void => sessions.save(session);
export const clearSession = (): void => sessions.clear();
