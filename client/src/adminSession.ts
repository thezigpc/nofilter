// Shared between AdminBar (Card Management's inline login) and AdminPage
// (the /admin room-management hub) - both read/write the same token so
// logging in on either page carries over to the other, matching the single
// shared admin session on the server (server/src/admin/auth.ts).
import { staffSignIn } from "@bargames/gamekit/client";
import { serverUrl, socket } from "./socket.js";

export const ADMIN_TOKEN_KEY = "tj-admin-token";

// Bar Games staff sign-in: on a venue box, staff already signed in to the
// box's admin get a session without this game's password. Standalone the
// server never vouches for anyone, so this always falls through to the
// normal login form.
const NO_STAFF_KEY = "tj-admin-no-staff";

/** After an explicit sign-out, don't sign straight back in through the box
 * for the rest of this tab's life. */
export function declineStaffSignIn(): void {
  try {
    sessionStorage.setItem(NO_STAFF_KEY, "1");
  } catch {
    // no sessionStorage: the worst case is being signed back in
  }
}

function resume(token: string): Promise<boolean> {
  return new Promise((resolve) => socket.emit("adminResume", { token }, (res) => resolve(res.ok)));
}

/**
 * Binds this socket to an admin session if there is one to be had: the
 * stored token first, then the venue box's word for it. Resolves true when
 * signed in.
 */
export async function resumeAdminSession(): Promise<boolean> {
  const stored = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (stored) {
    if (await resume(stored)) return true;
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
  let declined = false;
  try {
    declined = sessionStorage.getItem(NO_STAFF_KEY) === "1";
  } catch {
    // ignore
  }
  if (declined) return false;
  const token = await staffSignIn(serverUrl);
  if (!token || !(await resume(token))) return false;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  return true;
}
