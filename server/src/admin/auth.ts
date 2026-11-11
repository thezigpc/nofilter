import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ADMIN_PASSWORD, ADMIN_PASSWORD_HASH_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";
import { log } from "../util/logger.js";

/**
 * Admin sessions for managing the shared content library and the /admin
 * page. Two ways the password gets configured, checked in this order:
 *
 * 1. ADMIN_PASSWORD env var - the existing behavior, unchanged. An
 *    operator who already manages this via env/`.env` keeps doing exactly
 *    that; the setup wizard below never engages for them. This is also the
 *    right way to close the first-run window entirely on a deployment
 *    that will be internet-facing before anyone can reach it in person.
 * 2. A hashed password chosen through the setup wizard on first run,
 *    persisted to ADMIN_PASSWORD_HASH_PATH - for a fresh deploy where
 *    nobody has set an env var yet, so getting a working admin login
 *    doesn't require already knowing which variable to set.
 *
 * Whichever is configured, "unset means unset" still holds: with neither
 * present, every write stays refused rather than silently open.
 *
 * Tokens live in memory only: a server restart logs everyone out, which is
 * an acceptable trade for having no session store. The client only ever
 * holds a token, never the password.
 */
const validTokens = new Set<string>();

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

interface StoredHash {
  /** scrypt output, hex-encoded. */
  hash: string;
  /** Random per-install salt, hex-encoded - never reused across installs. */
  salt: string;
}

function isStoredHash(parsed: unknown): parsed is StoredHash {
  return (
    !!parsed &&
    typeof parsed === "object" &&
    typeof (parsed as StoredHash).hash === "string" &&
    typeof (parsed as StoredHash).salt === "string"
  );
}

let cachedHash: StoredHash | null | undefined; // undefined = not loaded yet

async function loadStoredHash(): Promise<StoredHash | null> {
  if (cachedHash !== undefined) return cachedHash;
  cachedHash = (await loadJsonFile(ADMIN_PASSWORD_HASH_PATH, isStoredHash)) ?? null;
  return cachedHash;
}

/**
 * scrypt over bcrypt/argon2: built into Node's crypto module, so this adds
 * no new dependency for what's otherwise the app's only password hash.
 *
 * Deliberately the *async* scrypt, not scryptSync. This runs on the same
 * single thread as every active game, and one hash costs ~30ms - so a
 * synchronous version let one unauthenticated client spamming adminLogin
 * saturate the event loop and freeze every room in the process (measured:
 * ~65x round-trip degradation from a single sequential attacker). The
 * async form hands the work to libuv's threadpool instead, so the loop
 * stays free; the concurrency cap below is what bounds the CPU cost.
 */
function hashPassword(password: string, salt: string): Promise<Buffer> {
  return scryptAsync(password, salt, 64);
}

// ---------------------------------------------------------------------------
// Brute-force / CPU-exhaustion throttle
//
// Rate limiting per source IP is not an option here: cloudflared proxies
// all tunnel traffic to the app as if it came from localhost, so every
// internet client shares one apparent address (the same reason the old
// admin port couldn't use an IP check - see config.ts). Per-socket limits
// are just as weak, since opening another socket is free.
//
// So the limits below are deliberately *global*. That's tolerable because
// this is a single-admin app where real logins are rare - a legitimate
// admin never notices a queue two deep or a delay after five wrong
// guesses, while an attacker is capped at a couple of guesses per second
// with no way to buy more by adding connections.
// ---------------------------------------------------------------------------

/** Concurrent password verifications allowed at once. Bounds total CPU
 * spent hashing regardless of how many clients are attacking. */
const MAX_CONCURRENT_VERIFICATIONS = 2;
/** Attempts allowed to wait for a slot before being refused outright -
 * prevents an unbounded backlog of queued work. */
const MAX_QUEUED_VERIFICATIONS = 8;
/** Failures within the window before responses start being delayed. */
const FAILURES_BEFORE_DELAY = 5;
const FAILURE_WINDOW_MS = 60_000;
/** Cap on the added delay, so a sustained attack can't lock a real admin
 * out - it only ever slows them down by at most this much. */
const MAX_THROTTLE_DELAY_MS = 2_000;

let inFlight = 0;
let queued = 0;
const waiters: (() => void)[] = [];
let recentFailures = 0;
let failureWindowStart = Date.now();

function acquireSlot(): Promise<boolean> {
  if (inFlight < MAX_CONCURRENT_VERIFICATIONS) {
    inFlight++;
    return Promise.resolve(true);
  }
  if (queued >= MAX_QUEUED_VERIFICATIONS) return Promise.resolve(false);
  queued++;
  return new Promise((resolve) => {
    waiters.push(() => {
      queued--;
      inFlight++;
      resolve(true);
    });
  });
}

function releaseSlot(): void {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

function currentThrottleDelayMs(): number {
  if (Date.now() - failureWindowStart > FAILURE_WINDOW_MS) {
    failureWindowStart = Date.now();
    recentFailures = 0;
  }
  if (recentFailures < FAILURES_BEFORE_DELAY) return 0;
  const over = recentFailures - FAILURES_BEFORE_DELAY + 1;
  return Math.min(MAX_THROTTLE_DELAY_MS, over * 250);
}

function recordFailure(): void {
  if (Date.now() - failureWindowStart > FAILURE_WINDOW_MS) {
    failureWindowStart = Date.now();
    recentFailures = 0;
  }
  recentFailures++;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True once *some* admin password exists, by either path - env or the
 * persisted hash. Doesn't distinguish which; callers that need to know
 * whether the setup wizard should run use setupNeeded() instead. */
export async function adminConfigured(): Promise<boolean> {
  if (ADMIN_PASSWORD.length > 0) return true;
  return (await loadStoredHash()) !== null;
}

/** The setup wizard is only offered when there's truly nothing configured
 * yet - never when an operator has already set ADMIN_PASSWORD via env
 * (that always wins and the wizard would just be confusing/redundant
 * there) or once a password has already been chosen through the wizard
 * once (no way to re-trigger it short of deleting the hash file by hand -
 * the same "whoever completes it first" bootstrap trust every self-hosted
 * app's first-run setup relies on, so it should close permanently once
 * used, not stay re-openable).
 *
 * Note this window is reachable from wherever the app itself is reachable,
 * including through a Cloudflare Tunnel - it is not restricted to
 * localhost. On a deployment that will be public before anyone can sit at
 * it, set ADMIN_PASSWORD in the environment first; that closes the window
 * before the server ever accepts a connection. */
export async function setupNeeded(): Promise<boolean> {
  if (ADMIN_PASSWORD.length > 0) return false;
  return (await loadStoredHash()) === null;
}

/** Completes first-run setup by persisting a hashed password. Refuses if
 * setup isn't actually needed (env var already controls this, or a
 * password was already chosen) - the wizard can't be used to silently
 * overwrite an operator's existing configuration. */
export async function completeSetup(password: string): Promise<boolean> {
  if (!(await setupNeeded())) return false;
  if (password.length < 8) return false;
  const salt = randomBytes(16).toString("hex");
  const hash: StoredHash = { hash: (await hashPassword(password, salt)).toString("hex"), salt };
  await saveJsonFileAtomic(ADMIN_PASSWORD_HASH_PATH, hash);
  cachedHash = hash;
  log.info("admin", "first-run setup completed - admin password set");
  return true;
}

/** Constant-time compare of two buffers of possibly-different length.
 * timingSafeEqual throws on a length mismatch, which would itself leak the
 * length - so compare equal-size padded copies and check length separately. */
function buffersMatch(a: Buffer, b: Buffer): boolean {
  const len = Math.max(a.length, b.length);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  a.copy(padA);
  b.copy(padB);
  return timingSafeEqual(padA, padB) && a.length === b.length;
}

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "bad_password" | "not_configured" | "throttled" };

export async function login(password: string): Promise<LoginResult> {
  const delay = currentThrottleDelayMs();
  if (delay > 0) await wait(delay);

  const gotSlot = await acquireSlot();
  if (!gotSlot) {
    log.warn("admin", "login refused - too many attempts in flight");
    return { ok: false, reason: "throttled" };
  }

  try {
    let ok: boolean;
    if (ADMIN_PASSWORD.length > 0) {
      ok = buffersMatch(Buffer.from(password), Buffer.from(ADMIN_PASSWORD));
    } else {
      const stored = await loadStoredHash();
      if (!stored) return { ok: false, reason: "not_configured" }; // nothing configured at all - fails closed
      const attempt = await hashPassword(password, stored.salt);
      ok = buffersMatch(attempt, Buffer.from(stored.hash, "hex"));
    }

    if (!ok) {
      recordFailure();
      return { ok: false, reason: "bad_password" };
    }
    const token = randomBytes(32).toString("hex");
    validTokens.add(token);
    return { ok: true, token };
  } finally {
    releaseSlot();
  }
}

export function isValidToken(token: string | undefined): boolean {
  return !!token && validTokens.has(token);
}

export function logout(token: string | undefined): void {
  if (token) validTokens.delete(token);
}
