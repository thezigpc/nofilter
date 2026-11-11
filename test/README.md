# Tests

```bash
npm run build && npm test     # or: npm run test:build
npm test -- double-down       # run one spec (substring match on filename)
TEST_VERBOSE=1 npm test       # include server output for failures
```

Tests run against the **built** server (`server/dist`), so a stale build tests
stale code — `npm run test:build` avoids that.

## Why these exist

These started life as throwaway scripts in a scratch directory and were lost
between sessions, which meant re-deriving the same setup and re-hitting the
same harness bugs every time. They live here now so that stops happening.

## Layout

- `harness.mjs` — server lifecycle, socket clients, assertions, round helpers
- `run.mjs` — discovers and runs `specs/*.mjs`, one server per spec
- `specs/` — one file per behaviour

Each spec exports:

```js
export const name = "human readable name";
export const serverEnv = { FOO: "1" };   // optional extra server env
export const needsPlaywright = true;     // optional, default false
export function prepare() {}             // optional, runs before server boot
export function cleanup() {}             // optional, always runs after
export default async function ({ baseUrl, server }) { /* throw to fail */ }
```

Every spec gets its **own server on its own port and its own throwaway data
directory**, so one spec can't leak room/preset state into the next — a real
source of confusing failures when these were ad-hoc scripts.

## Writing specs: the traps that actually bit

These are the mistakes that produced flaky, misleading failures. All of them
looked like app bugs and none of them were.

1. **Wait for the deal before reading hands.** A client reaching phase
   `submission` only proves *that* client's state arrived; everyone else's
   hand is still in flight. Use `waitForDeal(room)` — reading too early sees
   half-dealt hands and randomly "loses" cards.

2. **Never hold a card id across an action that mutates hands.** Steal moves
   cards, Discard Bomb replaces a whole hand, Hand Refresh redeals everything.
   A card id captured earlier may no longer exist, and playing it fails
   silently as `CARD_NOT_IN_HAND`. Re-scan for a currently-held card
   immediately before using it.

3. **The Double Down window deliberately holds `submission`.** When Double
   Down is on and a live unwagered offer exists, the server pauses for
   `doubleDownWindowSeconds` before advancing. A loop that only waits for
   `reveal` will spin. Either wait longer than the window, or set the window
   short — but **not 0**, or the round advances instantly and any wager is
   correctly rejected as "too late".

4. **`judgingBoard` is cleared by the next deal.** To inspect a round's
   cards, use the snapshot `playRound()` returns, not client state afterwards.

5. **Clients always record `errorMessage`.** `makeClient` subscribes by
   default. Without it a server rejection looks identical to a no-op, which
   is exactly how a passing app once looked broken.

6. **Prefer `waitFor(...)` over `wait(ms)`.** Fixed sleeps are either slow or
   flaky depending on the machine; `waitFor` fails loudly with a labelled
   timeout instead.

Randomised behaviour (which Action Card you draw) needs enough samples to be
reliable — deal more cards up front (more players, bigger hands) rather than
grinding rounds. Collecting all six Action Card types from ~24 draws fails
~8% of the time; ~48 draws makes it negligible.

## Playwright / UI specs

Playwright is **not** a `package.json` dependency on purpose: the production
deploy runs a plain `npm install`, and pulling a browser stack into it for
tests that never run there isn't worth it. Specs marked `needsPlaywright` are
skipped unless it's installed locally:

```bash
npm i -D playwright && npx playwright install chromium
```

## Fault injection

`04-crash-containment` proves a broken room closes alone instead of taking
the server down. Since that path only runs when something genuinely throws,
the spec patches a throw into the **built** output in `prepare()` and reverts
it in `cleanup()` (which always runs). This is deliberate — a fault-injection
switch in production source would be a liability, and patching the build
means the logic under test is the real shipped code.
