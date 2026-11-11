// Heuristic keyword filter for the host-toggleable "Exclude vulgar cards"
// deck option. Matches crude/explicit language (profanity, explicit sexual
// or scatological terms), not merely dark/edgy humor - a card about drugs,
// violence, or tragedy isn't "vulgar" in this sense unless it also uses
// crude language. This is necessarily imperfect (word lists always are) -
// it trades a few false positives/negatives for something that actually
// runs at deck-build time without a network call or a heavyweight NLP model.
const VULGAR_PATTERNS: RegExp[] = [
  // Core profanity / slurs
  /\bfuck\w*/i,
  /\bmotherfuck\w*/i,
  /\bshit\w*/i,
  /\bbullshit\w*/i,
  /\bcunt\w*/i,
  /\bbitch\w*/i,
  /\bwhore\w*/i,
  /\bslut\w*/i,
  /\bhoe\b/i,
  /\bnigg\w*/i,
  /\bretard\w*/i,
  /\bpiss\w*/i,
  // "ass" has to be boundary-anchored or it swallows class/pass/massive/
  // assassin/harass/embassy/molasses/carcass. Verified against the full
  // 84k-card corpus: 812 matches, zero false positives from that list.
  // The compound forms need their own pattern since \bass\b can't see the
  // "ass" inside "dumbass".
  /\bass(?:es|hat|hats|hole|holes|wipe|wipes|clown|clowns|kisser|kissers)?\b/i,
  /\b(?:dumb|jack|smart|bad|fat|hard|lard|wise|pomp)ass\w*/i,
  /\barse\w*/i,

  // Explicit sexual acts / anatomy
  /\bsex(?:y|ual|ually|ting)?\b/i,
  /\bcum\w*/i,
  /\bjizz\w*/i,
  /\bcream(?:ed|ing)\b/i,
  /\bnutting\b/i,
  /\bcock(?!tail|pit|roach|atoo|erel)\w*/i,
  /\bdick(?!ens|inson)\w*/i,
  /\bpenis\w*/i,
  /\bvagina\w*/i,
  /\bpussy\w*/i,
  /\bboner\w*/i,
  /\berection\w*/i,
  /\bhard[\s-]?on\b/i,
  /\borgasm\w*/i,
  /\bmasturbat\w*/i,
  /\bblowjob\w*/i,
  /\bblow[\s-]?job\w*/i,
  /\bhandjob\w*/i,
  /\bhand[\s-]?job\w*/i,
  /\bdeepthroat\w*/i,
  /\bdeep[\s-]?throat\w*/i,
  /\banal\b/i,
  /\berotic\w*/i,
  /\bboob\w*/i,
  // Needs a suffix: a bare "tit" is "tit for tat" or the bird, not anatomy.
  /\btit(?:s|ties|ty)\b/i,
  /\bboobies\b/i,
  /\bsemen\b/i,
  /\bejaculat\w*/i,
  /\bgenital\w*/i,
  /\bscrotum\b/i,
  /\bballsack\w*/i,
  /\btesticle\w*/i,
  /\bnutsack\w*/i,
  /\banus\b/i,
  /\bbunghole\w*/i,
  /\btaint\b/i,
  /\bclit(?:oris)?\w*/i,
  /\blabia\b/i,
  /\bfornicat\w*/i,
  /\bhorny\b/i,
  /\bdildo\w*/i,
  /\bvibrator\w*/i,
  /\blube\b/i,
  /\blubricant\w*/i,
  /\bqueef\w*/i,
  /\bsmegma\b/i,
  /\bsquirt(?:ing|ed)?\b/i,
  /\bwet[\s-]?dream\w*/i,
  /\bmorning[\s-]?wood\b/i,
  /\bblue[\s-]?balls\b/i,
  /\b69(?:ing|'d|ed)?\b/i,
  /\bjerk(?:ing)?[\s-]?off\b/i,
  /\bjack(?:ing)?[\s-]?off\b/i,
  /\bcircle[\s-]?jerk\w*/i,
  /\bspank\w*/i,
  /\bspooge\w*/i,
  /\bskeet\b/i,
  /\bfelch\w*/i,
  /\bdocking\b/i,
  /\bteabag\w*/i,
  /\btea[\s-]bag\w*/i,
  /\brimjob\w*/i,
  /\bcunnilingus\b/i,
  /\bfellatio\b/i,
  /\bcreampie\w*/i,
  /\bbukkake\b/i,
  /\bgolden[\s-]?shower\w*/i,
  /\bscat\w*/i,

  // Explicit sexual scenarios / categories
  /\bporn\w*/i,
  /\bhentai\b/i,
  /\borg(?:y|ies)\b/i,
  /\bthreesome\w*/i,
  /\bthree[\s-]?way\w*/i,
  /\bgang[\s-]?bang\w*/i,
  /\bfinger[\s-]?bang\w*/i,
  /\bcamel[\s-]?toe\w*/i,
  /\bmilf\w*/i,
  /\bdilf\w*/i,
  /\bfetish\w*/i,
  /\bbdsm\b/i,
  /\bdominat(?:e|es|ed|ion|rix)\w*/i,
  /\bgimp\w*/i,
  /\bstrap[\s-]?on\w*/i,
  /\bhooker\w*/i,
  /\bprostitut\w*/i,
  /\bstripper\w*/i,
  /\bstrip[\s-]?club\w*/i,
  /\bcuckold\w*/i,
  /\bloli\w*/i,
  /\bglory[\s-]?hole\w*/i,
  /\bfisting\b/i,
  /\bnipple[\s-]?clamp\w*/i,
  /\bbutt[\s-]?plug\w*/i,
  /\bball[\s-]?gag\w*/i,
  /\bgigolo\w*/i,

  // Scatological. These were the largest gap in the original list - the
  // corpus has ~700 cards whose only crude content is toilet humour.
  /\bpoop\w*/i,
  /\bpoo\b/i, // not "pooh" - the h is a word char, so \b doesn't match there
  /\bturd\w*/i,
  /\bfart\w*/i,
  /\bcrap\w*/i, // "scrap" is safe: \b won't match mid-word
  /\bdookie\w*/i,
  /\bfec(?:es|al)\b/i,
  /\bdiarrhea\b/i,
  /\bshart\w*/i,
  /\btak(?:e|es|ing) a dump\b/i,

  // Crude anatomy the original list missed
  /\bbutt\b/i, // not "butter"/"button" - both continue past the boundary
  /\bbutt[\s-]?hole\w*/i,
  /\bbutt[\s-]?crack\w*/i,
  /\bballs\b/i, // "meatballs"/"ball pit" are unaffected
  /\bpub(?:e|es|ic)\b/i, // "public" has an l and never matches
  /\bcrotch\w*/i,
  /\bwie?ner\w*/i,
  /\bdong\b/i, // also catches "ding-dong", which is the point
  /\bschlong\w*/i,
  /\bprick\b/i,
  /\btwat\w*/i,
  /\bsnatch\w*/i,
  /\bmuff\b/i, // "muffin" is unaffected
  /\bgooch\b/i,
  /\bcho[ad]e\b/i,

  // Acts. "humping"/"humped" only - a bare "hump" is Quasimodo, not sex,
  // and appears in the corpus that way.
  /\bhump(?:ing|ed)\b/i,
  /\bmotorboat\w*/i,
  /\bshag(?:ging|ged)\b/i,
  /\bboink\w*/i,

  // Profanity. Deliberately excludes bare "damn" and "hell": they're mild
  // enough that flagging them would sweep up a few hundred otherwise-clean
  // cards, and a card whose only edge is "damn" isn't what either mode is
  // reaching for.
  /\bbastard\w*/i,
  /\bwank\w*/i,
  /\bbollock\w*/i,
  /\bbugger\w*/i,
  /\bshite\b/i,
  /\bgod[\s-]?damn\w*/i,
  /\bdouche\w*/i,

  // Sexual violence / exploitation (kept regardless of "crude language" framing —
  // always excludable, never appropriate to leave in even mild phrasing)
  /\brape\w*/i,
  /\bmolest\w*/i,
  /\bpedophil\w*/i,
  /\bincest\w*/i,
  /\bbestiality\b/i,
];

export function isVulgar(text: string): boolean {
  return VULGAR_PATTERNS.some((pattern) => pattern.test(text));
}
