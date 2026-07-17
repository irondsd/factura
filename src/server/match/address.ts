/**
 * Scores a bill's text against a user's property addresses, so ingest can guess
 * which property a bill from a brand-new account belongs to.
 *
 * The rule is proximity, not presence: an address is a bag of tokens, and the
 * bill is the right one when ALL of those tokens turn up clustered together
 * somewhere in it. A bill that merely name-drops a street the user happens to
 * live on scores low, because the street number isn't next to it.
 *
 * Deliberately knows nothing about any country's addressing conventions — no
 * street types, no "altura", no piso/depto vocabulary, no notion of which token
 * is the street and which is the apartment. Every token is just a token, which
 * keeps this working outside Argentina. Token length is the only stand-in for
 * importance (see MISS_PENALTY_PER_CHAR); short of that, a missing token is a
 * missing token, whatever it meant.
 *
 * Pure — no DB, no I/O. Unit-tested in address.test.ts.
 */

/** Confidence at or above which we can skip the property picker and just ask
 * "is this the right one?". Reachable only by a full token match in a tight
 * cluster. */
export const CONFIRM_THRESHOLD = 0.9;

/** How far the top match must lead the runner-up before we're willing to ask a
 * yes/no question about it. Two units in the same building score close together,
 * and a confident question about the wrong one gets a reflexive "yes". */
export const LEAD_MARGIN = 0.3;

/**
 * Multiplier applied per *character* of address text we couldn't find near the
 * rest. Charging by character rather than by token is what keeps addresses of
 * different shapes comparable: "Larrea 110, 4A" is four tokens and
 * "Bartolome Mitre 2583" is three, so counting whole tokens would make a bill
 * that omits a two-character apartment look worse than one that omits a
 * four-digit street number — and rank a real Larrea bill below a passing
 * mention of Mitre.
 *
 * Longer tokens are rarer and less likely to coincide, so length stands in for
 * how much a token tells us. That recovers some of the asymmetry roles would
 * give us (missing "2583" hurts more than missing "A") while still leaving the
 * code ignorant of what any token means.
 *
 * At 0.75, even one missing character lands under CONFIRM_THRESHOLD — so the
 * fast path always requires the whole address, which is the intended rule.
 */
const MISS_PENALTY_PER_CHAR = 0.75;

/** Span slack (in tokens) forgiven before tightness starts to decay, per token
 * matched. Bills pad addresses with filler the address field omits ("Piso 4,
 * Dto. A" vs "4A"), and that padding is not evidence of anything. */
const FREE_SLACK_PER_TOKEN = 1;

/** How fast tightness decays once the slack allowance is used up. */
const SLACK_TOLERANCE = 6;

export type PropertyMatch = { propertyId: string; confidence: number };

/** Lowercase, strip diacritics, collapse whitespace. NFD splits "é" into "e" +
 * a combining accent, which the range then drops — so é→e, á→a, ñ→n, ü→u fall
 * out of one rule that knows no Spanish. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text into comparable tokens: runs of letters and runs of digits, with
 * everything else (spaces, commas, hyphens, "°") acting as a separator.
 *
 * Because letters and digits are separate runs, a letter↔digit boundary splits
 * too — which is what collapses every apartment spelling onto one token stream
 * without the code knowing what an apartment is:
 *
 *   "Larrea 110, 4A"   "LARREA 110 4° A"   "Larrea 110 04-A"
 *      all tokenize to:  larrea 110 4 a
 *
 * Leading zeros are stripped so "04" and "4" are the same token.
 */
export function tokenize(s: string): string[] {
  const runs = normalizeForMatch(s).match(/\p{L}+|\p{N}+/gu) ?? [];
  return runs.map((run) => run.replace(/^0+(?=.)/, ""));
}

/** Coverage × tightness for one candidate window. */
function scoreWindow(
  covered: number,
  missedChars: number,
  span: number,
): number {
  const coverage = MISS_PENALTY_PER_CHAR ** missedChars;
  // Tightest possible packing of `covered` tokens is `covered - 1` apart.
  const slack = span - (covered - 1);
  const free = covered * FREE_SLACK_PER_TOKEN;
  const tightness =
    slack <= free ? 1 : 1 / (1 + (slack - free) / SLACK_TOLERANCE);
  return coverage * tightness;
}

/**
 * Best score for one address against a pre-indexed bill.
 *
 * Walks every window that starts at an occurrence of an address token and stays
 * within the span limit, keeping the best score found. Bounded work: bill
 * positions are unique, so a span-limited window holds at most `spanLimit + 1`
 * occurrences however long the bill is.
 *
 * Within a window, coverage is the heaviest run of address tokens appearing in
 * *address order* — a weighted longest-increasing-subsequence over the window's
 * occurrences. Order matters because addresses read left to right, and without
 * it short tokens match ambient prose: "Larrea 110 total a pagar 4.310,55"
 * contains larrea, 110, "a" and "4" within a few words and would otherwise
 * score a fully confident 100%. Reading in order, that text offers
 * larrea→110→a→4 where the address wants larrea→110→4→a, so the run breaks and
 * only three of the four tokens count.
 */
function scoreAddress(
  addrTokens: string[],
  positions: Map<string, number[]>,
): number {
  // Every occurrence of any address token, in bill order, tagged with which
  // address token it satisfies.
  const occurrences: { pos: number; token: number }[] = [];
  addrTokens.forEach((token, i) => {
    for (const pos of positions.get(token) ?? []) {
      occurrences.push({ pos, token: i });
    }
  });
  if (occurrences.length === 0) return 0;
  occurrences.sort((a, b) => a.pos - b.pos);

  const totalChars = addrTokens.reduce((sum, t) => sum + t.length, 0);
  // Past this span even a full match has decayed to noise, so don't look.
  const spanLimit = addrTokens.length * 3 + 12;

  let best = 0;
  for (let l = 0; l < occurrences.length; l++) {
    // chars[i] / count[i]: the best in-order run ending exactly at occurrence i.
    const chars: number[] = [];
    const count: number[] = [];
    let bestChars = 0;
    let bestCount = 0;

    for (
      let r = l;
      r < occurrences.length &&
      occurrences[r].pos - occurrences[l].pos <= spanLimit;
      r++
    ) {
      // Extend the heaviest earlier run whose token comes before this one in
      // the address. Strictly-increasing token indices keep runs in address
      // order and stop a repeated token from being counted twice.
      let prevChars = 0;
      let prevCount = 0;
      for (let j = l; j < r; j++) {
        if (
          occurrences[j].token < occurrences[r].token &&
          chars[j] > prevChars
        ) {
          prevChars = chars[j];
          prevCount = count[j];
        }
      }
      chars[r] = prevChars + addrTokens[occurrences[r].token].length;
      count[r] = prevCount + 1;
      if (chars[r] > bestChars) {
        bestChars = chars[r];
        bestCount = count[r];
      }
      best = Math.max(
        best,
        scoreWindow(
          bestCount,
          totalChars - bestChars,
          occurrences[r].pos - occurrences[l].pos,
        ),
      );
    }
  }
  return best;
}

/**
 * Score every property against the bill text, best first. Properties that score
 * zero (or have no usable address) are dropped, so an empty array means "no
 * idea".
 */
export function matchProperties(
  text: string,
  props: { id: string; address: string }[],
): PropertyMatch[] {
  const billTokens = tokenize(text);
  if (billTokens.length === 0) return [];

  const positions = new Map<string, number[]>();
  billTokens.forEach((token, i) => {
    const at = positions.get(token);
    if (at) at.push(i);
    else positions.set(token, [i]);
  });

  return props
    .map((p) => {
      // Duplicate tokens ("San Martin 100, San Martin") shouldn't count twice.
      const addrTokens = [...new Set(tokenize(p.address))];
      return {
        propertyId: p.id,
        confidence: addrTokens.length ? scoreAddress(addrTokens, positions) : 0,
      };
    })
    .filter((m) => m.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * The property to suggest, if any. `confident` is the whole point: it's true
 * only when the top match is strong on its own AND clearly ahead of the
 * runner-up, which is what earns a one-click "is this correct?" instead of the
 * full picker.
 */
export function suggestProperty(
  text: string,
  props: { id: string; address: string }[],
): { propertyId: string; confidence: number; confident: boolean } | null {
  const [top, second] = matchProperties(text, props);
  if (!top) return null;
  const lead = top.confidence - (second?.confidence ?? 0);
  return {
    propertyId: top.propertyId,
    confidence: top.confidence,
    confident: top.confidence >= CONFIRM_THRESHOLD && lead >= LEAD_MARGIN,
  };
}
