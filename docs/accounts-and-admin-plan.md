# Admin gating now, accounts later

Planning notes from 2026-08-18. Two separate pieces of work, deliberately
kept apart: a small lockdown in **this** codebase, and a **fork** that adds
real accounts on a database.

---

## Part 1 — This project: admin password (doing now)

### The problem

The global content stores had **no authorization at all**:

```js
socket.on("deleteCustomCard", async ({ id }, cb) => { cb(await deleteCard(id)); });
socket.on("deleteCustomSet",  async ({ setId }, cb) => { cb(await deleteSet(setId)); });
```

No auth check, no room membership required, and `addWhiteCard(text)` takes
no owner. The site is public with no Cloudflare Access, so anyone who found
the URL could add cards that appear in everyone's games, or delete every
custom card, set and preset on the server.

### What gets gated

Everything that **writes** to a store shared across all rooms:

| Store | Read | Write |
| --- | --- | --- |
| Custom cards (loose pool) | public | admin |
| Custom sets | public | admin |
| Pack selection presets | public | **public** |
| Table style presets | public | **public** |
| Game setup presets | public | **public** |
| Backup upload / restore | — | admin |

Reads stay public because a host has to be able to *see* packs and presets
to build a deck.

**Presets are deliberately left open.** They are configuration a host saves
in-flow while setting a game up - not authored content - and a lost one
takes seconds to recreate. Gating them would mean typing an admin password
at a party to save a table style. The authored card library is the real
abuse target and the thing that hurts to lose, so that is what is locked.
Tighten later if presets actually get vandalised.

**In-game Personal Cards are untouched.** Those are per-player, per-game,
and never enter the shared library — locking them would break a house rule
every player uses. Only the persistent global library is gated.

### How it works

- `ADMIN_PASSWORD` in `server/src/config.ts`. **Unset means unset**: every
  write is refused rather than silently left open, so a missing env var
  fails closed.
- `adminLogin(password)` → server compares, and on success issues a random
  token held in server memory and marks that socket admin.
- The client stores the **token**, never the password, and re-authenticates
  on reconnect (the same pattern as the room session token). Tokens die on
  restart, which is fine — log in again.
- Authorization is per-socket, matching how `withRoom` already carries
  `roomCode`/`playerId` in the connection's closure.

### Deliberately not doing

- Per-user ownership. That needs accounts, which needs the fork.
- Rate limiting on login. Worth adding if this ever faces real traffic.

---

## Part 2 — The fork: accounts on a database

Agreed this becomes a **separate project**. Notes so it can start from a
decision record rather than a blank page.

### What an account is for

1. **Identity across games** — name and history that follow you.
2. **Own your cards** — custom cards, sets and presets belong to a person,
   including personal cards they choose to keep.
3. **Groups / recurring tables** — a saved set of people to spin a room up for.
4. **Moderation** — admin accounts that can modify and delete any set, and
   ban a person rather than kick a transient seat.

Open question: **user submissions**. Letting players upload sets is the
obvious feature and the obvious abuse vector; it needs a moderation queue
and an admin review step, not a straight write.

### Sign-in: Discord / Google OAuth

Chosen over phone/SMS: no per-message cost, no provider account, no
personal data to protect, and players already have one. Schema should still
be method-agnostic:

```
account(id, display_name, created_at, is_admin)
auth_identity(account_id, kind, external_id, UNIQUE(kind, external_id))
```

`kind` is `discord` | `google` | later `passkey` | `phone`. One account can
hold several, so adding a method later is a row, not a migration.

### Database: SQLite, and why it isn't a compromise

`Room.ts` contains **zero `async`/`await`** — that is exactly why concurrent
draws and submissions cannot interleave: Node runs each socket handler to
completion. Putting room state behind an **async** database makes every
`Room` method async and destroys that guarantee, reintroducing interleaving
into the code most carefully written to avoid it.

`better-sqlite3` is synchronous, so it preserves the current model. Single
file, no daemon, trivial backup. For a handful of concurrent rooms it is
the better fit, not a downgrade. Postgres would mean redesigning the game
loop's concurrency, and should only be on the table if this ever needs
multiple server processes.

### Migration path: the device token is already a proto-account

The app issues a persistent per-device token today for reconnect. That is
an anonymous identity. So:

1. Device token becomes an **anonymous account** row.
2. Signing in with Discord/Google **claims** that existing row.
3. Cards and presets made while anonymous come along automatically.

Nobody is ever forced to sign up to play, which keeps join-by-QR intact —
the thing that makes the game work at a party.

### Why fork rather than evolve (recorded, not re-argued)

The recommendation here was one codebase with optional accounts, on the
grounds that a fork means every gameplay fix gets done twice and the two
will drift. Decision was to fork anyway. Worth planning for the drift:
keep `shared/` and the game-logic modules as close to identical as possible
so fixes can be cherry-picked between the two.

---

## Part 3 — Hosting move: Proxmox + Linux VM

The current deployment is Windows-specific and **will not survive the move**:

| Now | On the VM |
| --- | --- |
| NSSM services (`TabletopJudgeServer`, `TabletopJudgeTunnel`) | systemd units |
| `scripts/deploy.ps1` | shell equivalent |
| `c:\Production\DigitalCAD`, Windows paths | Linux paths |
| Host-machine admin on `127.0.0.1` | unchanged, but "the host machine" is now the VM |

Worth deciding at the same time whether to containerise. Docker Compose
would make the eventual database version considerably easier to stand up,
and makes the fork and this project able to run side by side on one VM
without fighting over ports or files.

---

## Roadmap ideas (2026-08-18, unprioritized — brainstorm later, not designed yet)

- **Beta/production split.** Keep the Windows host as a "beta" instance on its own hostname, promote the Docker/Ubuntu instance to "production" once trusted. Lets new builds get tested against real play without touching the box people actually rely on. Natural fit for the "different URL for the new host" idea already floated.
- **No bundled card data.** Ship the app without a full card corpus baked in; require the operator to upload their own JSON on first run, with post-processing validation (catch malformed cards, pick/blank mismatches, the class of data-quality issues already found and fixed by hand in this file once before).
- **Multi-tenant.** Multiple independent instances, each with its own admin login, behind their own subdomain. Either one deployment gains real tenant-scoping (accounts, isolated data per tenant) or it stays one-instance-per-tenant with a per-tenant Cloudflare Tunnel - meaningfully different amounts of work, worth a real design pass rather than assuming either up front.
- **First-run setup wizard.** Guide a new deployment through the one-time setup (admin password, etc.) instead of requiring an operator to know which env vars to set by hand - directly extends the random-password-generation approach already used for the VM's `.env`. **Done (2026-08-18)**: `server/src/admin/auth.ts` + the room-admin panel's `/setup` route.
- **No bundled card data.** **Done (2026-08-19)**: `sample-cards.json` (tracked in git, ~60 original cards) replaces the full card corpus as the default; the full corpus is gitignored and only loads via an explicit `CARD_DATA_PATH` override, unchanged for existing deployments. An admin can upload a real set as a "Core Set" (add or replace) from the Custom Cards page - `server/src/cards/coreSet.ts`, `RoomManager.setCardData()`. Every upload path (Core Set, Custom Cards, Custom Sets) now runs through one shared validate/repair pass (`server/src/cards/validate.ts`) that corrects a black card's `pick` to match its actual blank count - the exact "hercules" bug class. Still open: the client-side JSON parsing (`parseCoreSetFile` etc.) is permissive by design, deeper structural validation happens server-side.
