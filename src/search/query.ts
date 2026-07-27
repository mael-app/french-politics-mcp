import { processTermFrench, tokenizeFrench } from "./french.js";

/** Below this length a stem is matched exactly: short prefixes catch too much. */
const MIN_PREFIX_LENGTH = 5;

/** FTS5 caps the number of expressions in a query. */
const MAX_TERMS = 60;

/** Distinct significant stems of a query, in order. */
export function queryStems(query: string): string[] {
  const seen = new Set<string>();
  for (const token of tokenizeFrench(query)) {
    const stem = processTermFrench(token);
    if (stem) seen.add(stem);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

/**
 * Translates a French query into an FTS5 MATCH expression. Returns null when no
 * significant term remains, in which case the caller must report no result rather
 * than query the index.
 *
 * Terms are quoted so that FTS5 reserved words a user may legitimately type (AND,
 * OR, NEAR) are treated as literals.
 */
export function buildMatchExpression(query: string): string | null {
  const stems = queryStems(query);
  if (stems.length === 0) return null;
  return stems
    .map((stem) => (stem.length >= MIN_PREFIX_LENGTH ? `"${stem}"*` : `"${stem}"`))
    .join(" OR ");
}

/**
 * Cap on the required coverage. Beyond this, long questions phrased loosely would
 * stop matching passages that do answer them.
 */
const MAX_REQUIRED_COVERAGE = 3;

/**
 * How many query stems a passage must contain to be kept.
 *
 * FTS5 combines terms with OR, so without this a passage sharing a single generic
 * word with the query comes back as if it answered it.
 *
 * A one or two word query must match in full: someone typing "intelligence
 * artificielle" means the pair, not either half, and accepting either returned
 * passages about economic intelligence. Beyond that the threshold scales as half
 * the query length, since a long question phrased loosely should not have to match
 * every word.
 */
export function requiredCoverage(stemCount: number): number {
  if (stemCount <= 2) return stemCount;
  return Math.min(MAX_REQUIRED_COVERAGE, Math.ceil(stemCount / 2));
}

/**
 * Counts query stems present in a passage. Matching is prefix-based to stay
 * consistent with the MATCH expression.
 */
export function coverageOf(stems: string[], textStems: Set<string>): number {
  let matched = 0;
  for (const stem of stems) {
    if (textStems.has(stem)) {
      matched += 1;
      continue;
    }
    if (stem.length < MIN_PREFIX_LENGTH) continue;
    for (const candidate of textStems) {
      if (candidate.startsWith(stem)) {
        matched += 1;
        break;
      }
    }
  }
  return matched;
}
