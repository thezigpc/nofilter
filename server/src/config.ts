import { HOST_CLAIM_AFTER_SECONDS as DEFAULT_HOST_CLAIM_AFTER_SECONDS } from "@tabletop-judge/shared";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src -> server -> project root
const projectRoot = path.resolve(__dirname, "../..");

export const PORT = Number(process.env.PORT ?? 3001);

// Room management (list/close rooms) used to be its own Express app on a
// separate, non-tunneled port - the network binding itself was the only
// access control, since there was no login yet. Now that there's a real
// admin password (server/src/admin/auth.ts) shared with the card library,
// room management lives at the client's /admin route instead, gated by
// that same login over Socket.io - see socket/index.ts's "admin*" events.
// No separate port/bind-host setting needed any more.

// Explicit override only - unset (not defaulted to a file) so the boot
// resolution in server/src/cards/coreSet.ts can tell "an operator pinned
// this deployment to a specific file" apart from "nothing configured, fall
// through to an uploaded Core Set or the bundled sample." Existing
// deployments that already set this (e.g. pointing at a full third-party
// card corpus that isn't checked into git) keep working unchanged.
export const CARD_DATA_PATH_OVERRIDE = process.env.CARD_DATA_PATH
  ? path.resolve(process.env.CARD_DATA_PATH)
  : undefined;

// The small, original card pack shipped in the repo so a fresh deploy has
// something playable before an admin uploads a real set - see
// server/src/cards/coreSet.ts. Always the same file, never env-overridable
// (BUNDLED_SAMPLE means exactly this file).
export const BUNDLED_SAMPLE_CARD_DATA_PATH = path.join(projectRoot, "sample-cards.json");

// Where an admin-uploaded Core Set is persisted once someone uploads one
// through the admin panel (add-to or replace) - see server/src/cards/coreSet.ts.
// Not shipped in the repo, purely runtime data, same pattern as
// ADMIN_PASSWORD_HASH_PATH below.
export const CORE_SET_PATH = process.env.CORE_SET_PATH
  ? path.resolve(process.env.CORE_SET_PATH)
  : path.join(projectRoot, "core-set.json");

// Table style presets are a shared design library, not per-room game
// state - one file, readable/writable from any device that connects,
// so a preset built in the Template Editor shows up on the host's phone
// and the Table without needing to be the same browser.
export const TABLE_STYLE_PRESETS_PATH = process.env.TABLE_STYLE_PRESETS_PATH
  ? path.resolve(process.env.TABLE_STYLE_PRESETS_PATH)
  : path.join(projectRoot, "table-style-presets.json");

// Host-submitted card content, same sharing model as table style presets -
// one file, available to every room via deckOptions.useCustomCards.
export const CUSTOM_CARDS_PATH = process.env.CUSTOM_CARDS_PATH
  ? path.resolve(process.env.CUSTOM_CARDS_PATH)
  : path.join(projectRoot, "custom-cards.json");

// Named, individually-selectable Custom Sets - a separate pool from the
// loose custom cards above, each set chosen per-room the same way a real
// pack is (see Room.buildDecks()).
export const CUSTOM_SETS_PATH = process.env.CUSTOM_SETS_PATH
  ? path.resolve(process.env.CUSTOM_SETS_PATH)
  : path.join(projectRoot, "custom-sets.json");

// Saved pack selections (e.g. "Muggles and Childhood only"), same sharing
// model as Table Style presets.
export const PACK_SELECTION_PRESETS_PATH = process.env.PACK_SELECTION_PRESETS_PATH
  ? path.resolve(process.env.PACK_SELECTION_PRESETS_PATH)
  : path.join(projectRoot, "pack-selection-presets.json");

// Saved whole-game setups (house rules + win condition + hand size + deck
// options). Packs deliberately stay with PACK_SELECTION_PRESETS_PATH -
// a setup answers "how do we play?", a pack preset "with which cards?".
export const GAME_SETUP_PRESETS_PATH = process.env.GAME_SETUP_PRESETS_PATH
  ? path.resolve(process.env.GAME_SETUP_PRESETS_PATH)
  : path.join(projectRoot, "game-setup-presets.json");

// In production the server also serves the built client (one process, one
// origin) so the Cloudflare Tunnel deployment only needs one hostname/port.
// Defaults to the sibling client/dist build; override for a deploy layout
// where the client build was copied elsewhere.
export const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.join(projectRoot, "client", "dist");

export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Static design mockups (docs/mockups/*.html) served read-only for external
// critique - not part of the built client, just plain files checked into git
// and copied over by the same `git archive` deploy step.
export const MOCKUPS_DIR_PATH = process.env.MOCKUPS_DIR_PATH
  ? path.resolve(process.env.MOCKUPS_DIR_PATH)
  : path.join(projectRoot, "docs", "mockups");

export const HAND_SIZE = Number(process.env.HAND_SIZE ?? 10);

// Presentational pacing for the RoundEnd -> next round transition. Reveal ->
// Judging is Judge-driven now (shuffle/flip), not timer-driven.
export const ROUND_END_DELAY_MS = Number(process.env.ROUND_END_DELAY_MS ?? 7000);

// A room with no activity at all for this long gets closed outright,
// connected players or not (env-overridable for testing without an
// hour-long wait).
export const ROOM_INACTIVITY_TTL_MS = Number(process.env.ROOM_INACTIVITY_TTL_MS ?? 60 * 60 * 1000);
export const ROOM_SWEEP_INTERVAL_MS = Number(process.env.ROOM_SWEEP_INTERVAL_MS ?? 5 * 60 * 1000);

// Logging verbosity for the structured logger (server/src/util/logger.ts):
// debug | info | warn | error. Defaults to info - room/game lifecycle plus
// rejected actions, without per-draw noise.
export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

// What the Action Card tier names are worth relative to each other (see
// shared/src/actionCards.ts). These are multipliers on each card's share of
// the room's overall Action Card density - the host's density slider still
// decides how many Action Cards get seeded in total, tiers only shift the
// mix between them. Rooms can override these per game (Lobby > Advanced);
// these are just the starting defaults.
export const ACTION_CARD_TIER_WEIGHTS = {
  rare: Number(process.env.ACTION_CARD_WEIGHT_RARE ?? 0.4),
  normal: Number(process.env.ACTION_CARD_WEIGHT_NORMAL ?? 1),
  common: Number(process.env.ACTION_CARD_WEIGHT_COMMON ?? 2.2),
};

// How long a host must be disconnected before another player can take over
// (see Room.claimHost). Env-overridable so tests don't have to sit through
// the real wait.
export const HOST_CLAIM_AFTER_SECONDS = Number(
  process.env.HOST_CLAIM_AFTER_SECONDS ?? DEFAULT_HOST_CLAIM_AFTER_SECONDS
);

// Password for managing the shared content library (custom cards, sets and
// presets). Those stores are global - one library shared by every room - so
// without this anyone who found the public URL could add cards to everyone's
// games or delete the lot.
//
// Unset means unset: writes are refused entirely rather than left open, so a
// missing env var fails closed instead of silently reopening the hole.
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

// Where the admin-chosen default theme (Felt & Ink / Bulletin + accent) is
// persisted - see server/src/tableStyle/store.ts. Not shipped in the repo,
// purely runtime data, same pattern as ADMIN_PASSWORD_HASH_PATH below.
export const DEFAULT_THEME_PATH = process.env.DEFAULT_THEME_PATH
  ? path.resolve(process.env.DEFAULT_THEME_PATH)
  : path.join(projectRoot, "default-theme.json");

// Where an admin-chosen game display name is persisted - shown as the
// browser tab title and the HomePage heading in place of a hardcoded name
// (see server/src/gameName/store.ts). Not shipped in the repo, purely
// runtime data, same pattern as ADMIN_PASSWORD_HASH_PATH below.
export const GAME_NAME_PATH = process.env.GAME_NAME_PATH
  ? path.resolve(process.env.GAME_NAME_PATH)
  : path.join(projectRoot, "game-name.json");

// Where a setup-wizard-chosen admin password is persisted (hashed, never
// plaintext) when ADMIN_PASSWORD isn't set via env. Lets a fresh deploy
// prompt for a password through the UI instead of requiring an operator to
// already know which env var to set - see server/src/admin/auth.ts.
export const ADMIN_PASSWORD_HASH_PATH = process.env.ADMIN_PASSWORD_HASH_PATH
  ? path.resolve(process.env.ADMIN_PASSWORD_HASH_PATH)
  : path.join(projectRoot, "admin-password.json");

// Where the admin-chosen default names for the Judge and the Wild Card bot
// are persisted (see server/src/roleNames/store.ts). Runtime data, same
// pattern as GAME_NAME_PATH above.
export const ROLE_NAMES_PATH = process.env.ROLE_NAMES_PATH
  ? path.resolve(process.env.ROLE_NAMES_PATH)
  : path.join(projectRoot, "role-names.json");
