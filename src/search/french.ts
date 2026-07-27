import { stripAccents } from "../utils/text.js";

/**
 * French stopwords. Deliberately conservative: "contre", "sans" and "non" carry
 * meaning in a manifesto and are kept.
 */
const STOPWORDS = new Set([
  "a", "afin", "ai", "ainsi", "alors", "apres", "as", "au", "aussi", "autre", "autres",
  "aux", "avant", "avez", "avoir", "avons", "bien", "car", "ce", "cela", "ces",
  "cet", "cette", "ceux", "chaque", "comme", "d", "dans", "de", "des", "dont", "donc",
  "du", "elle", "elles", "en", "entre", "est", "et", "etaient", "etait", "ete", "etre",
  "eux", "il", "ils", "j", "je", "l", "la", "le", "les", "leur", "leurs", "lui", "m",
  "ma", "mais", "me", "meme", "mes", "moins", "mon", "n", "ne", "ni", "nos", "notre",
  "nous", "on", "ont", "or", "ou", "par", "plus", "pour", "puis", "qu", "quand", "que",
  "qui", "quoi", "s", "sa", "se", "sera", "seront", "ses", "si", "soit", "son", "sont",
  "sur", "t", "ta", "te", "tel", "telle", "tes", "toi", "ton", "tous", "tout", "toute",
  "toutes", "tres", "tu", "un", "une", "vos", "votre", "vous", "y",
]);

/**
 * Suffix stripping rules, first match wins. They run on an already lowercased and
 * accent-free word, hence suffixes are written without accents.
 *
 * Stemming stays deliberately shallow because search enables FTS5 prefix matching,
 * which catches the remaining morphological variants. Over-stemming would create
 * more collisions than the recall it buys.
 */
const SUFFIX_RULES: Array<[RegExp, string]> = [
  [/issements?$/, ""],
  [/(?:atrice|ateur)s?$/, ""],
  [/ations?$/, ""],
  [/(alit|ilit|ivit|osit)es?$/, "$1"],
  [/ements?$/, ""],
  [/(?:ance|ence)s?$/, ""],
  [/(?:able|ible)s?$/, ""],
  [/(?:iste|isme)s?$/, ""],
  [/(?:euse|eur)s?$/, ""],
  [/(?:iere|ier)s?$/, ""],
  [/aux$/, "al"],
  [/(?:ees|ee|es|s|x)$/, ""],
];

/**
 * Shorter stems collide too often once combined with prefix search: "logement"
 * reduced to "log" would match "logiciel". A rule producing a shorter result is
 * skipped.
 */
const MIN_STEM_LENGTH = 4;

/**
 * Light stemmer for French, in the spirit of Savoy's French light stemmer: plural,
 * feminine and common derivational suffixes, with no dependency.
 *
 * Must stay identical between indexing and querying. Any change here requires
 * regenerating the seed.
 */
export function stemFrench(word: string): string {
  if (word.length < 5) return word;
  let stem = word;

  for (const [pattern, replacement] of SUFFIX_RULES) {
    const candidate = stem.replace(pattern, replacement);
    if (candidate !== stem && candidate.length >= MIN_STEM_LENGTH) {
      stem = candidate;
      break;
    }
  }

  if (stem.length > 4 && stem.endsWith("e")) stem = stem.slice(0, -1);
  if (stem.length > 4 && stem.at(-1) === stem.at(-2)) stem = stem.slice(0, -1);

  return stem;
}

/** Splits text into raw tokens: lowercase, accent-free, punctuation removed. */
export function tokenizeFrench(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Normalizes one term for indexing. Returns null for terms to ignore. */
export function processTermFrench(term: string): string | null {
  const clean = stripAccents(term.toLowerCase()).replace(/[^a-z0-9]/g, "");
  if (clean.length < 2) return null;
  if (STOPWORDS.has(clean)) return null;
  // Short numbers carry meaning ("60 ans", "35 heures"), long ones are reference codes.
  if (/^\d+$/.test(clean) && clean.length > 4) return null;
  return stemFrench(clean);
}

/**
 * Rewrites text as a space-separated sequence of stems. This form, not the original
 * text, is what gets indexed in FTS5, which has no French analyzer of its own.
 */
export function stemText(text: string): string {
  const stems: string[] = [];
  for (const token of tokenizeFrench(text)) {
    const stem = processTermFrench(token);
    if (stem) stems.push(stem);
  }
  return stems.join(" ");
}

/** Set of stems present in a text, used to measure topic coverage. */
export function stemSet(text: string): Set<string> {
  const stems = new Set<string>();
  for (const token of tokenizeFrench(text)) {
    const stem = processTermFrench(token);
    if (stem) stems.add(stem);
  }
  return stems;
}

/**
 * Significant stems of a keyword phrase. A phrase counts as present in a text only
 * when all of its stems are.
 */
export function keywordStems(keyword: string): string[] {
  const stems: string[] = [];
  for (const token of tokenizeFrench(keyword)) {
    const stem = processTermFrench(token);
    if (stem) stems.push(stem);
  }
  return stems;
}
