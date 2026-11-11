import type { Role } from "@tabletop-judge/shared";

const STORAGE_KEY_PREFIX = "ttj_session";
const TAB_ID_KEY = "ttj_tab_id";

export interface StoredSession {
  roomCode: string;
  token: string;
  name: string;
  role: Role;
}

// Was a single flat localStorage key, shared by every tab in the browser -
// hosting in one tab and joining as the Shared Screen in a second tab (same
// browser, e.g. testing without a spare device, or genuinely running the
// screen off the same laptop) would silently overwrite the host's saved
// session with the Screen's. If the host's tab then reloaded or
// auto-reconnected, it would resume using the Screen's token instead of
// its own, looking exactly like "the host lost the ability to change
// settings". Scoping the key per tab (via a random id cached in
// sessionStorage, which is itself already tab-private) fixes that without
// giving up localStorage's persistence across reloads/backgrounding, which
// the reconnect story depends on - sessionStorage alone would lose the
// session if a backgrounded mobile browser fully evicts the tab.
function getTabId(): string {
  let id = sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

function storageKey(): string {
  return `${STORAGE_KEY_PREFIX}:${getTabId()}`;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(storageKey(), JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(storageKey());
}
