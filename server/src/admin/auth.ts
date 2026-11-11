import { createAdminAuth } from "@bargames/gamekit/server";
import { ADMIN_PASSWORD, ADMIN_PASSWORD_HASH_PATH } from "../config.js";
import { log } from "../util/logger.js";
import { store } from "../util/store.js";

/**
 * Admin sessions for the shared content library and the /admin page, on
 * @bargames/gamekit's createAdminAuth. Two ways the password gets set,
 * checked in this order:
 *
 * 1. ADMIN_PASSWORD env var - always wins; the setup wizard never engages.
 *    Also the way to close the first-run window on a deployment that will be
 *    internet-facing before anyone can reach it in person.
 * 2. A hashed password chosen through the first-run wizard, persisted to
 *    ADMIN_PASSWORD_HASH_PATH (default admin-password.json).
 *
 * Existing deployments keep their passwords: this game's files derive the
 * scrypt key from the salt's hex *string* (saltFormat "string"), and the
 * kit reads them that way. A damaged file fails closed - no setup wizard
 * (that would be a land grab), no login - and is left untouched to fix.
 *
 * Brute force and CPU exhaustion: the kit caps scrypt work globally (2 at a
 * time, 8 queued, then "busy") and adds an escalating delay capped at 2 s.
 * Its per-IP lockout is turned OFF here on purpose: behind Cloudflare every
 * guest on one venue's Wi-Fi shares a public IP, so a lockout would let any
 * of them lock the real admin out. The global limits slow an attacker
 * without ever refusing the right password (test 23).
 */
const auth = createAdminAuth({
  store,
  file: ADMIN_PASSWORD_HASH_PATH,
  envPassword: ADMIN_PASSWORD,
  saltFormat: "string",
  failsAllowed: Number.POSITIVE_INFINITY,
  log,
});

let ready: Promise<void> | null = null;
const init = () => (ready ??= auth.init());

/** True once some admin password exists - env or a valid file. */
export async function adminConfigured(): Promise<boolean> {
  await init();
  return auth.adminConfigured();
}

/** The first-run wizard is offered only when nothing is configured and the
 * password file is absent (not merely damaged). It closes for good once
 * used. Reachable wherever the app is, tunnel included - set ADMIN_PASSWORD
 * first on a deployment that's public before anyone can sit at it. */
export async function setupNeeded(): Promise<boolean> {
  await init();
  return auth.setupNeeded();
}

/** The password file exists but can't be used (unreadable or wrong shape). */
export async function adminFileBroken(): Promise<boolean> {
  await init();
  return auth.broken();
}

export type SetupResult = { ok: true; token: string } | { ok: false; error: string };

/** Completes first-run setup and signs in. Refused if anything is already
 * configured - the wizard can't overwrite an operator's setup - and safe
 * against two setups racing (the kit re-checks after hashing). */
export async function completeSetup(password: string): Promise<SetupResult> {
  await init();
  try {
    return { ok: true, token: await auth.setupPassword(password) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Setup failed." };
  }
}

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "bad_password" | "not_configured" | "throttled" | "broken" };

export async function login(password: string, ip: string): Promise<LoginResult> {
  await init();
  const r = await auth.login(password, ip);
  if (r.ok) return r;
  switch (r.reason) {
    case "wrong":
      return { ok: false, reason: "bad_password" };
    case "busy":
    case "blocked":
      return { ok: false, reason: "throttled" };
    default:
      return { ok: false, reason: r.reason };
  }
}

export function isValidToken(token: string | undefined): boolean {
  return auth.isValidSession(token);
}

export function logout(token: string | undefined): void {
  auth.logout(token);
}
