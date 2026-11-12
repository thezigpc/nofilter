# No Filter on Bar Games

How No Filter integrates with a Bar Games venue box: what it emits, what it accepts, how its TV view behaves, and how the image is built. Off a box (no `BG_*` environment variables) none of this changes how the game looks or behaves.

| | |
|---|---|
| Level | **3** (branded, events, commands and status, plus casting from the host screen) |
| SDK | `@bargames/sdk` 0.7.1, vendored at `vendor/bargames-sdk-0.7.1.tgz` (with `@bargames/gamekit` 0.4.0) |
| Manifest | [`bargames.json`](bargames.json): id `nofilter`, version `1.2.0`, port 3001 |
| Box wiring | [`server/src/bargames.ts`](server/src/bargames.ts) (the only file that talks to the SDK on the server) |
| Tests | `test/specs/33-bargames-standalone.mjs`, `test/specs/34-bargames-box.mjs` (the second runs a fake box core in-process) |

## `npx bargames check`

Run against the SDK's mock box (`npx bargames mock-box . --game http://127.0.0.1:3101`, game on port 3101 with `BG_GAME_ID=nofilter BG_CORE_URL=http://127.0.0.1:7199 BG_GAME_TOKEN=dev-token DATA_DIR=<tmp>`):

```
nofilter@1.2.0 · level 3 · http://127.0.0.1:3101
✓ health /health → 200
✓ /__bargames/venue.json returns the box's branding ("No Filter (mock)")
✓ /__bargames/theme.css served
✓ "room_closed" declared (the box takes a closed room off the TVs at once)
✓ status refuses requests without the game token
✓ status → 0 room(s)
✓ unknown commands are rejected
✓ command "start" is wired (and refuses a missing room)
✓ command "next_round" is wired (and refuses a missing room)
✓ command "end" is wired (and refuses a missing room)
✓ create_room → room T8GM5 (with hostUrl)
✓ status lists T8GM5 as a venue room
✓ table view /room/T8GM5?role=table&display=1 → 200
✓ end closes T8GM5
✓ T8GM5 left status after "end"

all checks passed
```

`npx bargames check --room NQZMU` (a live phone room) also passed: status entry `{"code":"NQZMU","kind":"patron","players":2,"phase":"lobby","hostConnected":true,"hostName":"Hostie","tables":0,"createdAt":…,"lastActivityAt":…}` and the table view returned 200. Its only note was the expected one: No Filter has no claims.

**Note for anyone repeating this on the dev PC:** port 3001 there is the live Windows beta. Run the game and the mock box on another port with `--game`.

## Events

Rooms report through a plain hook (`Room.onGameEvent`, set by `RoomManager`), so `Room` has no SDK import. `RoomManager` forwards events to `bg.emit` only when running on a box.

| Event | Where | `data` |
|---|---|---|
| `room_created` | `server/src/rooms/RoomManager.ts:144` (`register`, used by phone, Table and venue rooms) | `{ title? }` |
| `room_closed` | `RoomManager.ts:230` (`closeRoom`, the single close path) and `:206` (a room dropped after its idle check threw) | `{ reason: "host" \| "admin" \| "idle" \| "error" \| "shutdown" }` |
| `players_changed` | `Room.ts:385` (new player) and `:646` (leave or kick), debounced 2 s per room in `RoomManager.ts:152` | `{ players }`: real players only |
| `round_started` | `Room.ts:1483` (`dealPhase`; a redeal of the same round isn't re-sent) | `{ round }` |
| `round_ended` | `Room.ts:2309` (the round-end timer, when the game continues) | `{ round }` |
| `winner` | `Room.ts:2283` (the Judge's or the vote's pick) | `{ name, round }` |
| `game_over` | `Room.ts:2335` (`buildFinalResult`, reached by both ways a game ends) | `{ winners: string[] }`, with ties included |

Every close path goes through `RoomManager.closeRoom(code, reason, cause)`, which removes the room from the map (and so from status) before emitting:
- the host's **Close Room** button (`host`);
- `/admin`'s close and close-all (`admin`);
- the box's `end` command (`admin`);
- the idle sweep (`idle`);
- a room's own phase-timer crash (`error`, via `Room.onFatalError`);
- shutdown on SIGTERM, SIGINT, uncaughtException or unhandledRejection (`shutdown`).

Spec 34 checks the `admin`, `idle` and `host` causes. `shutdown` was checked in the container (`docker stop` logged `closed … cause=shutdown`, exit 0); a Windows test can't send a catchable SIGTERM.

`winner` can name the Wild Card bot when it wins a round. That name is set by the host or admin rather than typed by a player; no other non-typed names are sent.

## Commands

| Command | Room method | Refuses when |
|---|---|---|
| `create_room` | `RoomManager.createVenueRoom(title)` | never (the room count isn't capped) |
| `start` | `Room.startGame(VENUE_ACTOR_ID)`, the host's own Start | unknown room; not in the Lobby; no packs; too few players. Messages are the host's own (e.g. "Pick at least one pack…") |
| `next_round` | at GameEnd: `Room.playAgain` then `Room.startGame` (a new game, same players and settings) | unknown room; a game still in progress (rounds advance when the Judge picks, so there's nothing for staff to push) |
| `end` | `RoomManager.closeRoom(code, "The venue closed this room.", "admin")`, the same path as `/admin`'s close | unknown room |

No `pause`/`resume`: No Filter has no automatic progress worth pausing. No claims.

### Venue rooms (`create_room`)

No Filter's host is normally the first Player to join. In a venue room that would hand a random patron the power to close the room, kick people or end the game, so venue rooms work differently:

- **Nobody becomes host by joining.** Host claim and host transfer are refused ("run by the venue").
- **Host authority** comes from two places:
  - **The box's commands.** They act as a non-seat *venue actor* (`VENUE_ACTOR_ID`) that `requireHost` and `requireLobbyAuthority` accept. It is never in `players`: no hand, no Judge turn, no scoreboard line. No socket can claim its id, because socket player ids are assigned by the server.
  - **`hostUrl`**, which is `/room/{code}?role=table&display=1&key=<venueKey>`. A Table that joins with the room's key is a *venue controller*: the staff iPad gets the full Lobby (settings, Start) and the host header (Players, Close Room, TVs).
- **Settings:** a plain Table (a cast TV, or a patron who opened `?role=table`) can't change a venue room's settings.
- **Idle:** the room is not closed for inactivity while a Table is connected; `end` closes it.
- **Players** join by code exactly as in any room.

Standalone none of this exists: `venueKey` is null on every normal room, so a key passed to one is ignored. Spec 33 checks this.

### "Show on this TV" (`create_room` with `firstJoinerHosts: true`, SDK 0.7.0)

The box puts a new room on one TV with no host. The room is still kind `venue` (the box can `start` and `end` it, it gets a `hostUrl`, and it stays open while a TV shows it), but it is not venue-run:

- the first player to join (scanning the TV's QR code) becomes the host, exactly as in a room made on a phone: settings, Start, Players, Close Room, TVs;
- host hand-over works as usual (Make host, claim after a disconnect, the next player when the host leaves);
- a Shared Screen has the same settings and casting rights as in a room people started themselves.

Without the flag nothing changes: nobody becomes host by joining, and only the keyed controller has host authority. The switch is `Room.venueRun` (spec 34).

## Staff sign-in (SDK 0.7.0)

Staff signed in to the box's admin open No Filter's admin page (`routes.admin`: `/admin`) without the game's password.

- **Server** ([`index.ts`](server/src/index.ts)): `GET /api/admin/status` answers `{ trusted }` and `POST /api/admin/trusted` answers `{ ok, token }`, both from `bg.isStaff(req)`. These are the two routes the kit's `staffSignIn()` calls; the game doesn't use the kit's `adminRouter` because its admin session runs over the socket. The token is an ordinary admin session (`auth.trustedSession()`), so everything admin-gated accepts it.
- **Client** ([`adminSession.ts`](client/src/adminSession.ts)): `/admin` and Card Management try the stored session, then `staffSignIn()`, before showing a form. Staff also skip the first-run wizard, so a box install needs no game password at all. After an explicit Sign out, the tab doesn't sign back in through the box.
- **Off a box** `isStaff` is always false, even with forged gateway headers (spec 33), so the password stays the only way in.

Tested on the mock box: `/__bargames/staff?next=/admin` lands on the signed-in admin page with no form; `?off=1` brings the form back.

## Status

`Room.toOverview()` returns these fields, using the same names as `@bargames/gamekit`'s `RoomOverview`:

| Field | Value |
|---|---|
| `code`, `kind`, `phase` | the room's own values (`kind` is `venue` or `patron`) |
| `players` | real players only: no Tables, no Wild Card bot |
| `title` | venue rooms only |
| `hostConnected` | the host's connection; for venue rooms, any connected controller |
| `hostName` | phone rooms only |
| `tables` | connected Tables |
| `createdAt`, `lastActivityAt` | ISO times |
| `joinPath` | `/room/{code}`, the join screen (name and role). The venue's games list links its **Join** button here |

There's no `maxPlayers`: rooms have no player cap. Rooms are listed most recently active first.

## The venue around the game (SDK 0.4.0, 0.5.0)

Both come from the game kit and render nothing off a box.

- **"← All games"** (`<BackToGames />`): at the very bottom of the landing page ([`HomePage.tsx`](client/src/pages/HomePage.tsx)) and nowhere else, with "Also playing: …" under it.
- **Staff announcements** (`<VenueAnnouncement />`): one sticky strip at the app root ([`App.tsx`](client/src/App.tsx)), on every phone page. Shared Screens never show it (SDK 0.5.0): the strip hides itself on any page marked as a shared screen. `tableMode()` marks the cast TV. `useIsSharedScreen` ([`useVenue.ts`](client/src/useVenue.ts)) calls `markSharedScreen()` for every other Table (a `role=table` URL, or a Table made with "Set up the Shared Screen", which sits on a plain `/room/{code}`) and for the Template Editor's preview frame.
- The game has no wake-lock code of its own; `tableMode()` keeps the cast TV awake.
- The venue context is polled every 30 s ([`useVenue.ts`](client/src/useVenue.ts)).

## Table (TV) view: `/room/{code}?role=table&display=1`

`display=1` is a new flag, so the existing `?role=table` link still asks for a name exactly as before.

| Checklist item | Result |
|---|---|
| The URL alone joins as a display | ✓ Joins as "Shared Screen" with no prompt. |
| No audio dependency | ✓ No sound on the Table. |
| Fills 1920×1080, readable, safe margins, no scrolling | ✓ Checked in headless Chromium at 1920×1080: Lobby (big code, QR and rules summary), submission and judging, `scrollHeight` ≤ viewport. Safe margins come from `--bg-safe-x/y`, and the existing Table auto-fit scales content. |
| Recovers on its own | ✓ Rejoins with its saved token on every reconnect (No Filter's existing resume path). A room that's gone shows "This room has closed" (`tableMode`'s screen on a box, the game's own off a box) instead of navigating home. |
| Light on animation | ✓ Static, except an optional animated theme background that is off by default and respects reduced motion. |
| Nothing needs a pointer | ✓ Header buttons and the invite "Copy link" are hidden in display mode. Card reveals and spotlight on the Table are optional extras; the Judge's phone drives judging. |

`tableMode()` (pointer hidden, wake lock, banners) runs for the cast TV only, not for the keyed staff controller.

## Branding

- `/api/config` returns the venue's `displayName` on a box, and the game's own admin-set name otherwise.
- `--bg`, `--accent` and the base font fall back to `--venue-*`, with the old values as fallbacks. Standalone the venue variables are never set, so nothing changes.
- No Filter's room themes (nine of them, set per room or as an admin default) still override inside a room, so the venue look replaces only the defaults (home page, edges) and the theme picker keeps working.
- Meaning-carrying colours (black and white cards) are untouched.

## Casting from the host screen (step 6b)

A **TVs** button appears in the room header only when the box says casting is enabled, for whoever is running the room (`state.you.canCast`):

- the host (the first player to join a room made on a phone);
- the Shared Screen of a room people started themselves. A room made with "Set up the Shared Screen" has no host until a player joins, and its Table never becomes one, so until 1.1.1 that screen had no way to cast;
- in a venue room, only the keyed venue controller. A plain Table there is a cast TV or a patron.

The cast TV itself (`display=1`) never shows the button.

| Socket intent | SDK call |
|---|---|
| `listTvs` | `bg.displays()` |
| `castToTvs { ids, pin }` | `bg.cast()` |
| `stopTvs { ids, pin }` | `bg.stopCast()` |

All three check `Room.requireCastAuthority` on the server. Anyone else gets `enabled: false` or a refusal (spec 34).

Tested against the mock box:
- the host saw the three fake TVs, and so did a Shared Screen that created its own room;
- a non-host was refused;
- `fake-bar` cast (the mock printed the table URL);
- `fake-unpaired` returned `needsCode`, which the UI explains as "ask staff to pair it";
- stop worked.

Off a box: `enabled: false` and no network call (spec 33).

## Container

- Writes only to `DATA_DIR` (`/data`). Every persisted file defaults under it when it's set (`server/src/config.ts`), and each still honours its own `*_PATH` variable. The files are:
  - `admin-password.json`
  - `game-name.json`
  - `role-names.json`
  - `default-theme.json`
  - `core-set.json`
  - `custom-cards.json`
  - `custom-sets.json`
  - `table-style-presets.json`
  - `pack-selection-presets.json`
  - `game-setup-presets.json`

  Writes are atomic (temp file plus rename in the same directory).
- `USER node`, with `/data` owned by node.
- **Read-only test** (on the Docker VM, as a throwaway container on 127.0.0.1:3199, removed afterwards):
  - run with `--read-only --tmpfs /tmp --cap-drop ALL -v nftest-data:/data`;
  - `/health` and `/api/config` OK;
  - ran as uid 1000;
  - admin setup, a role-names save and room creation all worked, and the files landed in `/data` owned by node;
  - writing to `/app` failed with "Read-only file system";
  - `docker stop` closed rooms with `cause=shutdown`, exit 0.
- **Clean-checkout build:** `git archive HEAD` (tracked files only) built with `docker build --platform linux/amd64 .` on the VM. `.dockerignore` now also keeps runtime data, the private corpus, `.env` and private notes out of local builds.

**Existing self-hosted Docker deployments (not the box):** the image now runs as uid 1000. A deployment whose `./data` bind mount is owned by root needs `sudo chown -R 1000:1000 ./data` before its next `docker compose up --build`; otherwise saving anything fails.

## Standalone: what changed and how it was verified

- **Server:**
  - SDK middleware: it serves only `/__bargames/*`, and standalone that's `venue.json` with `"standalone": true`; status and commands return 401.
  - `/api/config` name: unchanged off a box.
  - `RoomManager` refactor: create and close now share helpers. Behaviour is unchanged apart from close causes appearing in log lines.
  - The `requireHost` and `requireLobbyAuthority` additions only apply to the venue actor and venue rooms.
  - `DATA_DIR` default: it only applies when `DATA_DIR` is set.
- **Client:**
  - `useVenueBranding` never fires standalone.
  - The CSS fallbacks equal the old values.
  - Display mode and the TVs control only appear with `display=1` or on a box.
- **Verification:**
  - the full suite passes (32 specs, including the two new ones);
  - spec 33 asserts the standalone surfaces;
  - the Lobby, header and TV views were screenshot-checked.

## The image

- **Name:** `ghcr.io/thezigpc/nofilter:1.2.0`, from the workflow `.github/workflows/publish-image.yml` (unchanged from the SDK snippet). A new repo's first publish needs a manual run of the workflow.
- **Not published yet:** this repository has **no GitHub remote**. Publishing needs the user to:
  1. create the repo;
  2. push `main` (the workflow runs when `bargames.json` changes);
  3. make the GHCR package **Public** on its first publish.
- The workflow has not run, and the package doesn't exist yet.

## SDK requests

Sent to the platform session with the Phase A report. The ones that affect the box:

1. **Venue-level renameable terms.** The manifest would declare `terms`, venue admins would edit them, and `VenueContext.game.terms` would carry the result. No Filter already layers room override > default, so venue terms would slot in as a layer.
2. **A venue content level** (`family` | `adult`) in `VenueContext`, so No Filter can default or lock "exclude vulgar" per venue.
3. **Staff sign-in for game admin pages:** a signed gateway header plus `bg.isStaff(req)`, so staff don't need each game's password.
4. **Provisioned admin passwords.** On a box, the first-run setup wizard is a land grab on the venue's Wi-Fi.
5. **`create_room` presets**, e.g. `{ preset: "Chaos" }`. No Filter's Quick Setups apply a whole configuration in one call.
6. **Custom commands with an args schema in the manifest**, so the iPad could render `x-end-game`, `x-skip-card`, `x-skip-turn`.
7. **SDK-side coalescing of `players_changed`.**
8. **Optional `round` and `phaseLabel` in status.**
9. **An optional display name on the table route.**
