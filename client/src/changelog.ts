// Player-facing release notes, shown at the bottom of the home page.
//
// Deliberately hand-written rather than generated from git: commit messages
// are written for whoever maintains this, and say things like "fix Czar
// rotation off-by-one" - which means nothing to someone about to play a
// card game. Every line here answers "what changed for me?" instead.
//
// Keep newest first, and add to the top entry as you go. Skip anything with
// no visible effect (tests, tooling, refactors) unless it changes what a
// player would actually notice.
//
// Keep it to the game itself. This is shipped to every deployment, so it
// must not carry anything specific to how one instance is hosted or how
// this project got here: no infrastructure (hosting, tunnels, domains,
// services), no deployment or admin-operations detail, and no
// project-history trivia like renames or where a feature came from.
// Someone reading it should learn what changed about the game, nothing
// about the machine it happens to be running on.

export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  /** ISO date, used as the heading. */
  date: string;
  items: { kind: ChangeKind; text: string }[];
}

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-09-07",
    items: [
      {
        kind: "fixed",
        text: "Rando's score now shows on the Scoreboard and climbs when it wins a round, even with Rando Can Win off — it just never ends the game on its own, so it can visibly sail past the win target with no effect on anyone else's game.",
      },
    ],
  },
  {
    date: "2026-08-28",
    items: [
      {
        kind: "fixed",
        text: "Crowd Favorite and Democracy: the whole lineup now reveals for everyone the moment voting starts, instead of waiting on whoever the Card Czar rotation still happened to point at to flip each card first. Voting also no longer gets hidden by the room's Spotlight setting.",
      },
    ],
  },
  {
    date: "2026-08-25",
    items: [
      {
        kind: "fixed",
        text: "Shared Screen Style editor: fixed a big empty gap that pushed the live preview below the fold, and gave the page a normal Back/title header instead of a small button buried in the settings panel.",
      },
      {
        kind: "improved",
        text: "Card Management reorganized into five sections (Core Set, Custom Cards, Custom Sets, Pack Presets, Backup & Restore) behind a sidebar on desktop and a tab bar on phone, instead of one long scrolling page.",
      },
      {
        kind: "new",
        text: "Core Set's pack list now has a Preview button, matching Custom Sets and Pack Presets.",
      },
    ],
  },
  {
    date: "2026-08-24",
    items: [
      {
        kind: "new",
        text: "New shared-screen theme: Windward — brass and rope on a moonlit sea, with a ship's-log black card, a lighthouse sweeping its beam, and a slowly turning ship's wheel.",
      },
      {
        kind: "improved",
        text: "\"Set up the Shared Screen\" now takes you straight into the room instead of stopping at an extra confirmation screen with nothing to fill in.",
      },
    ],
  },
  {
    date: "2026-08-22",
    items: [
      {
        kind: "new",
        text: "Two players can now play a full game with Rando Cardrissian on — Rando covers the third seat, both for starting a game and for staying in one if a player leaves mid-game. Crowd Favorite and the Democracy Action Card still need a real crowd (3+ players), and just don't come up as options until there's one.",
      },
      {
        kind: "improved",
        text: "Submit (and Draw/Trade-in) now floats at the bottom of your phone screen, right above the scoreboard, instead of sitting above your hand — no more scrolling back up to submit once you've picked your cards.",
      },
      {
        kind: "fixed",
        text: "The Card Czar's own \"sit tight\" screen could run long black-card text past the edge of the card on a phone — same fix as the hand view, applied here too.",
      },
      {
        kind: "improved",
        text: "The scoreboard along the bottom of the screen now wraps a full table's worth of names onto extra rows instead of scrolling sideways.",
      },
      {
        kind: "fixed",
        text: "Applying a saved Shared Screen preset from a room's Lobby now also restores its black-card, spotlight, and scoreboard text sizes — previously only the theme/background came along, and the rest silently stayed put.",
      },
      {
        kind: "fixed",
        text: "The round and game winner's name is now readable against any Shared Screen background instead of sometimes blending in.",
      },
      {
        kind: "improved",
        text: "The Shared Screen's joined-players list and settings summary, beside the invite QR code, are bigger and easier to read from across the room — same for the \"waiting for players\" message during a round.",
      },
      {
        kind: "new",
        text: "New shared-screen theme: Synthwave — an 80s sunset gradient card back, chrome accent colors, and an optional glowing horizon backdrop.",
      },
      {
        kind: "new",
        text: "Every shared-screen theme now has a fully drawn, optionally animated background scene (a real illustration matching that theme, not just a color glow) — Synthwave even gets the classic \"driving down an infinite grid road\" effect. Pick Flat, Glow, or Scene per room, with an Animate toggle for Scene, in the Shared Screen settings.",
      },
      {
        kind: "new",
        text: "Backgrounds can now show on phones too, not just the shared screen — off by default, since a phone's hand view is more crowded than the big screen.",
      },
      {
        kind: "new",
        text: "Face-down (not yet revealed) cards can be made partially see-through, so a shared-screen background shows through them — adjustable in Shared Screen settings.",
      },
      {
        kind: "new",
        text: "New Techno theme: a minimal digital club look — laser-bright accent colors, an angular display face, and a real laser-rig scene with an animated audio-equalizer bar row.",
      },
      {
        kind: "improved",
        text: "The old hazard-stripe/warehouse \"Techno\" theme is now called Construction Zone — its look is unchanged, just renamed now that the Techno name is used for something that actually reads as electronic music.",
      },
      {
        kind: "fixed",
        text: "A shared-screen look set as the deployment's default (background style, animation, phone display, face-down opacity) now actually reaches every new game — previously only the theme and accent color carried over, and the rest silently reset.",
      },
      {
        kind: "fixed",
        text: "A black card with multiple blanks (a Pick 2/3/4 prompt) could sometimes run past the edges of the card on a phone — the auto-shrink now accounts for how the blanks are actually displayed, not just the raw prompt length.",
      },
      {
        kind: "improved",
        text: "The joined-players list beside the invite QR code, on the shared screen's lobby, is a bit bigger and easier to read from across the room.",
      },
    ],
  },
  {
    date: "2026-08-21",
    items: [
      {
        kind: "fixed",
        text: "The shared screen's submission tiling could come out wrong (too few or too many cards per row) whenever its zoom level moved away from 1x — fixed at the source, so the Template Editor's preview now matches what a real game actually looks like.",
      },
      {
        kind: "fixed",
        text: "The shared screen's submission grid sometimes packed cards into a narrower block than it needed to, leaving empty space down the side even though spreading them wider would've looked identical otherwise.",
      },
    ],
  },
  {
    date: "2026-08-19",
    items: [
      {
        kind: "new",
        text: "Beach's sunny background glow is now a toggle (Shared Screen settings) instead of always-on, for whoever prefers the plain flat color.",
      },
      {
        kind: "fixed",
        text: "Beach is a genuinely bright, sun-bleached shared-screen theme now, not a dark reinterpretation of one — turns out the fix was making the app's own colors properly theme-aware, not the theme itself.",
      },
      {
        kind: "improved",
        text: "The game's name on the home page is a real title now instead of a small heading.",
      },
      {
        kind: "improved",
        text: "The shared screen fills more of the actual TV/monitor instead of shrinking everything (including the width) whenever a round's content runs a little tall.",
      },
      {
        kind: "improved",
        text: "The joined-players list on the shared screen's lobby now sits beside the invite QR code instead of below it, so a full table doesn't run off the bottom of the screen.",
      },
      {
        kind: "new",
        text: "New sub-option under Rando Cardrissian: \"Rando can win\" makes it a real competitor that scores like anyone else, instead of its wins always being a freebie for the table.",
      },
      {
        kind: "fixed",
        text: "A long black card now shrinks to fit instead of pushing the rest of your hand off the bottom of the screen.",
      },
      {
        kind: "fixed",
        text: "The \"X of Y submitted\" status text was easy to miss on the shared screen — it's bigger there now.",
      },
      {
        kind: "new",
        text: "Four new shared-screen themes: Neon (black-light glow), Techno (industrial hazard stripes), Beach (tropical night) and Parlour (a real fanned hand of cards, lamp-lit and warm).",
      },
      {
        kind: "new",
        text: "Card-like sizing for the shared screen: taller, portrait-shaped cards instead of wide tiles, closer to the real thing. Turns off on its own once a round has too many submissions to show them that way.",
      },
      {
        kind: "improved",
        text: "Packs in the lobby are grouped into whatever sections the card set defines, and you can narrow the list to one section at a time.",
      },
      {
        kind: "fixed",
        text: "Previewing a pack could show a different pack's cards if the server's card library had been updated since your room was made.",
      },
    ],
  },
  {
    date: "2026-08-18",
    items: [
      {
        kind: "improved",
        text: "The shared card library is protected: adding, editing and deleting shared cards and sets needs an admin password. Browsing stays open to everyone, and the personal cards you write during a game are unaffected.",
      },
    ],
  },
  {
    date: "2026-08-17",
    items: [
      { kind: "new", text: "Quick setup: one tap for Classic, Quick, Chaos or Everyone Writes — and you can save your own." },
      { kind: "improved", text: "The lobby settings now collapse into sections that show what is inside them, so Start Game is no longer five screens down." },
      { kind: "new", text: "If the host drops out and doesn't come back, anyone still in the room can take over as host after a couple of minutes — a dead phone no longer strands the game." },
      { kind: "new", text: "Hosts can hand the host role to someone else mid-game, not just in the lobby." },
      { kind: "new", text: "Take back a submission if you misread the black card — right up until the last player submits." },
      { kind: "new", text: "Three new Action Cards: Tax (take a won black card from someone), Reverse (pick the worst card this round) and Democracy (the whole table votes instead of the Czar)." },
      { kind: "new", text: "Choose exactly which Action Cards are in play, and how often each one turns up — Off, Rare, Normal or Common." },
      { kind: "new", text: "New win condition: play a fixed number of rounds instead of racing to a score." },
      { kind: "improved", text: "The shared screen now lists the house rules and settings in play, right next to the join QR code." },
      { kind: "improved", text: "Writing personal cards wraps up ten seconds after everyone's finished, instead of waiting out the whole timer." },
      { kind: "improved", text: "The vulgar-card filter recognises a lot more crude language (including plain \"ass\"), while no longer catching innocent words like \"class\" or \"tit for tat\"." },
      { kind: "improved", text: "Every icon in the app redrawn in one consistent flat style." },
      { kind: "fixed", text: "An Action Card dealt as a Double Down replacement can no longer be wagered — it isn't a joke card." },
      { kind: "fixed", text: "Applying a saved shared-screen style no longer resets the zoom you'd already set." },
      { kind: "fixed", text: "The host can now resize the shared screen from their phone at any point, not just while a round is being judged." },
      { kind: "fixed", text: "Hand size and the vulgar-card setting always show on the shared screen, even when left at their defaults." },
      { kind: "fixed", text: "A fault in one room can no longer end everyone else's game — and if a game does have to stop, players are told why." },
    ],
  },
  {
    date: "2026-08-16",
    items: [
      { kind: "new", text: "Action Cards: a house rule that mixes special-effect cards into the deck — steal, peek, discard bombs and more." },
      { kind: "new", text: "Personal Cards: a timed window before the first round where everyone writes their own white cards." },
      { kind: "new", text: "Custom Sets and saved pack selections — build your own packs, browse what's in them, and reuse a selection in any room." },
      { kind: "new", text: "Two more house rules: Single Answer Cards Only and Pick Bonus." },
      { kind: "new", text: "Round history, plus a chime and vibration when it's your turn." },
      { kind: "new", text: "Hosts can skip a slow player's turn, skip their own turn as Czar, kick someone mid-game, or close the room outright." },
      { kind: "new", text: "Leave a game whenever you like — and if you're removed, you're now told why instead of just landing back on the home screen." },
      { kind: "new", text: "Two shared-screen layouts (Dense Grid and Command Strip), and phones now pick up the room's colours too." },
      { kind: "fixed", text: "Rando Cardrissian no longer takes a turn as Card Czar." },
      { kind: "fixed", text: "Auto Draw no longer skips the very first hand of the game." },
      { kind: "fixed", text: "The Card Czar rotation no longer skips a player after someone leaves." },
      { kind: "fixed", text: "Two tabs in the same browser no longer knock each other out of their seats." },
      { kind: "fixed", text: "The header no longer forces the whole page sideways on a narrow phone." },
      { kind: "fixed", text: "Rooms nobody is using close themselves after an hour." },
    ],
  },
  {
    date: "2026-08-15",
    items: [
      { kind: "new", text: "First playable version: create a room, everyone joins from their phone, and an optional shared screen shows the black card and submissions." },
      { kind: "new", text: "House rules: Rando Cardrissian, Double Down, Trade-In, Hand Refresh, No Scorekeeping, Custom Prompts and Crowd Favorite." },
      { kind: "new", text: "Shared-screen styling with saved presets, a spotlight on revealed cards, and adjustable sizing for reading across a room." },
      { kind: "new", text: "Face-down judging, a QR code for joining, adjustable hand size and win target, and your own custom cards." },
      { kind: "new", text: "Play Again at the end of a game, and joining mid-game with a catch-up so you aren't hopelessly behind." },
      { kind: "new", text: "An optional filter for excluding crude cards — or keeping only those." },
      { kind: "fixed", text: "A tied game now shows everyone who tied, rather than picking a winner at random." },
    ],
  },
];
