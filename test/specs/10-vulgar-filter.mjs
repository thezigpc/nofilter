import { pathToFileURL } from "node:url";
import path from "node:path";
import { PROJECT_ROOT, assert, assertEqual } from "../harness.mjs";

export const name = "Vulgar filter: catches crude terms without eating innocent words";

/**
 * A pure-function test - no server needed - but it lives here because the
 * filter is easy to break by accident. Every entry below is a real trap:
 * "ass" inside class/pass/assassin, "public" vs "pubic", "butter" vs
 * "butt", "tit for tat", Quasimodo's "hump". A naive substring list fails
 * most of these, which is why the patterns are boundary-anchored.
 */
export default async function () {
  const mod = await import(
    pathToFileURL(path.join(PROJECT_ROOT, "server", "dist", "cards", "vulgarFilter.js")).href
  );
  const { isVulgar } = mod;

  const mustFlag = [
    // The one that prompted this: bare "ass" was missing entirely.
    "ass", "Ass.", "my ass", "asshole", "dumbass", "jackass", "arse",
    // Scatological - the largest gap in the original list.
    "poop", "pooper", "poo", "turd", "fart", "crappy", "diarrhea", "shart",
    "feces", "taking a dump",
    // Crude anatomy.
    "butt stuff", "up the butt", "butthole", "butt crack", "balls", "pubes",
    "pubic", "crotch", "wiener", "ding-dong", "schlong", "prick", "twat",
    "snatch", "muff diving", "gooch", "chode", "titty", "tits",
    // Acts.
    "dry humping", "motorboating", "shagging",
    // Profanity.
    "bastard", "wank", "bollocks", "bugger", "shite", "god damn", "douchebag",
    // Pre-existing entries, guarded against regression.
    "fuck", "shit", "cunt", "bitch", "cock", "dick", "porn", "orgy",
  ];

  const mustNotFlag = [
    // "ass" traps.
    "class", "classic", "pass", "passed", "grass", "massive", "assassin",
    "harass", "embassy", "molasses", "carcass", "compass", "potassium",
    // "butt" / "ball" traps.
    "butter", "button", "rebuttal", "meatballs", "ball pit", "basketball",
    // "pubic" vs "public".
    "public", "publication", "republic",
    // Assorted near-misses.
    "muffin", "scrap", "scrapbook", "Winnie the Pooh", "shaggy", "shag carpet",
    "cocktail", "cockpit", "cockroach", "Dickens", "Dickinson", "dongle",
    "tit for tat", "peanuts", "doughnut", "title",
    // A bare "hump" is Quasimodo, not sex.
    "a hump", "camel hump", "hump day",
    // Deliberately NOT treated as vulgar - mild enough that flagging them
    // would sweep up hundreds of otherwise-clean cards.
    "damn", "what the hell",
    // Ordinary cards must survive.
    "A tiny horse in a big hat.", "The heat death of the universe.",
  ];

  const wrongly = mustNotFlag.filter((t) => isVulgar(t));
  assertEqual(wrongly.length, 0, `these must NOT be flagged as vulgar: ${wrongly.join(", ")}`);

  const missed = mustFlag.filter((t) => !isVulgar(t));
  assertEqual(missed.length, 0, `these must be flagged as vulgar: ${missed.join(", ")}`);

  assert(isVulgar("Ass") && isVulgar("ASS"), "matching must be case-insensitive");
}
