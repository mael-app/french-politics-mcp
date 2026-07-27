/**
 * Step 2: extract text from the PDFs in `data/raw/` into `data/text/`.
 *
 * Extraction goes through `pdftotext` (poppler) rather than a JS library. These
 * manifestos mix full-width paragraphs and two-column zones, sometimes on the same
 * page, and extractors that follow the PDF content stream splice a left-hand line
 * onto a right-hand one. For a server promising exact quotes that is
 * disqualifying: it fabricates sentences the candidate never wrote. Poppler
 * resolves reading order correctly and rejoins hyphenated words.
 *
 * Poppler is needed for this step only, which runs locally. The extracted text is
 * committed and the Worker never depends on it.
 * Install with `brew install poppler` or `apt install poppler-utils`.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { htmlToText } from "./html.js";
import { SOURCES } from "./manifest.js";
import { RAW_DIR, TEXT_DIR } from "./paths.js";

const run = promisify(execFile);

/** A word sequence appearing on at least this share of pages is page furniture. */
const BOILERPLATE_PAGE_RATIO = 0.4;
/**
 * N-gram lengths examined when detecting running headers. The floor is three words
 * because running headers are often that short; a higher floor left the largest
 * document in the corpus with no detection at all.
 */
const NGRAM_MIN = 3;
const NGRAM_MAX = 14;

async function pdfToPages(file: string, mode: "default" | "raw"): Promise<string[]> {
  try {
    // Form feeds are kept: they delimit pages, which header detection needs.
    const args = mode === "raw" ? ["-enc", "UTF-8", "-raw", file, "-"] : ["-enc", "UTF-8", file, "-"];
    const { stdout } = await run("pdftotext", args, {
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.split("\f");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "pdftotext not found. Install poppler: `brew install poppler` (macOS) " +
          "or `apt install poppler-utils` (Debian/Ubuntu).",
      );
    }
    throw error;
  }
}

function normalizeLine(line: string): string {
  return (
    line
      // Unmappable glyphs such as dot leaders and decorative bullets.
      .replace(/�+/g, " ")
      // Control characters poppler emits for some bullets. Invisible, but they
      // would end up inside quotes.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
      .replace(/[     ​]/g, " ")
      .replace(/ﬁ/g, "fi")
      .replace(/ﬂ/g, "fl")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "–")
      // Ligature split during extraction: "f rontieres" becomes "frontieres".
      .replace(/\bf ([ilr][a-zà-ÿ]+)/g, "f$1")
      // Dot leaders from tables of contents.
      .replace(/(?:\s*\.){4,}\s*/g, " ")
      // Page markers, including ones glued to the text.
      .replace(/p\.\s?\d{1,3}\b/g, " ")
      .replace(/\bPAGE\s+\d{1,3}\b/g, " ")
      // Page number glued to a running header at line start.
      .replace(/^\d{1,3}(?=[A-ZÀ-Ý]{2})/, "")
      // Stray space before a period or comma.
      .replace(/\s+([.,])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Short French words that can legitimately stand alone in an all-caps line.
 * Elision consonants are excluded on purpose: an apostrophe keeps them attached
 * ("L'AVENIR"), so an isolated consonant is always a broken word fragment.
 */
const SHORT_CAPS_WORDS = new Set([
  "A", "AU", "AUX", "CE", "DE", "DES", "DU", "EN", "EST", "ET", "IL", "ILS",
  "LA", "LE", "LES", "MA", "MES", "MON", "NE", "NI", "NON", "NOS",
  "NOTRE", "ON", "ONT", "OR", "OU", "OÙ", "PAR", "PAS", "PLUS", "POUR", "QUE",
  "QUI", "SA", "SANS", "SE", "SES", "SI", "SON", "SUR", "TOUS", "TOUT", "UN",
  "UNE", "VOS", "VOTRE", "Y", "À",
]);

/**
 * Rejoins words broken apart by letter-spacing in all-caps headings, which would
 * otherwise index no useful term even though they name the actual measures.
 *
 * An orphan fragment is merged with whichever neighbour is not already a word,
 * which is what distinguishes a forward merge from a backward one.
 */
function joinSpacedCaps(line: string): string {
  const tokens = line.split(" ").filter(Boolean);
  if (tokens.length < 3) return line;

  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4) return line;
  const uppercase = line.replace(/[^A-ZÀ-Ý]/g, "").length;
  if (uppercase / letters.length < 0.8) return line;

  const isOrphan = (token: string) =>
    token.length <= 2 && /^[A-ZÀ-Ý]+$/.test(token) && !SHORT_CAPS_WORDS.has(token);

  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!isOrphan(token)) {
      out.push(token);
      continue;
    }
    const next = tokens[i + 1];
    if (next && !SHORT_CAPS_WORDS.has(next)) {
      out.push(token + next);
      i += 1;
    } else if (out.length > 0) {
      out[out.length - 1] += token;
    } else {
      out.push(token);
    }
  }
  return out.join(" ");
}

/**
 * Undoes headings the PDF draws twice for an embossed effect, which poppler
 * returns interleaved.
 *
 * Restricted to predominantly uppercase lines, because repeated words are normal
 * in French prose ("nous nous engageons"). Once straightened out, header detection
 * recognises the line and removes it for good.
 */
function collapseDoubledCaps(line: string): string {
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 6) return line;
  if (line.replace(/[^A-ZÀ-Ý]/g, "").length / letters.length < 0.6) return line;

  const out: string[] = [];
  for (const token of line.split(" ").filter(Boolean)) {
    // Word glued to itself with no space.
    const half = token.length / 2;
    const undoubled =
      token.length >= 6 && token.length % 2 === 0 && token.slice(0, half) === token.slice(half)
        ? token.slice(0, half)
        : token;
    if (out.at(-1)?.toLowerCase() !== undoubled.toLowerCase()) out.push(undoubled);
  }
  return out.join(" ");
}

/**
 * Detects headings set in letter-spaced type. Typographic spacing replaces the
 * gaps between words, so word boundaries are lost for good. Such lines are neither
 * quotable nor indexable and are dropped rather than injected as noise.
 */
function isLetterSpaced(line: string): boolean {
  const tokens = line.split(" ").filter(Boolean);
  if (tokens.length < 6) return false;
  const singles = tokens.filter((token) => token.length === 1).length;
  return singles / tokens.length > 0.5;
}

/**
 * Finds word sequences recurring across pages. Working on n-grams rather than
 * whole lines catches running headers even when extraction welded them onto the
 * page content.
 */
function findBoilerplate(pages: string[][]): string[] {
  if (pages.length < 4) return [];
  const threshold = Math.max(3, Math.ceil(pages.length * BOILERPLATE_PAGE_RATIO));
  const pageCounts = new Map<string, number>();

  for (const lines of pages) {
    const seen = new Set<string>();
    for (const line of lines) {
      const words = line.split(" ").filter(Boolean);
      for (let size = NGRAM_MIN; size <= NGRAM_MAX; size += 1) {
        for (let start = 0; start + size <= words.length; start += 1) {
          seen.add(words.slice(start, start + size).join(" "));
        }
      }
    }
    for (const ngram of seen) pageCounts.set(ngram, (pageCounts.get(ngram) ?? 0) + 1);
  }

  const candidates = [...pageCounts.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([ngram]) => ngram)
    .sort((a, b) => b.length - a.length);

  // Keep only maximal n-grams, dropping those contained in a longer one.
  const kept: string[] = [];
  for (const candidate of candidates) {
    if (!kept.some((longer) => longer.includes(candidate))) kept.push(candidate);
  }
  return kept;
}

function stripBoilerplate(line: string, boilerplate: string[]): string {
  let out = line;
  for (const ngram of boilerplate) out = out.split(ngram).join(" ");
  return out.replace(/\s+/g, " ").trim();
}

function isPageNumber(line: string): boolean {
  return /^[-–—\s]*\d{1,3}[-–—\s]*$/.test(line);
}

/**
 * Rebuilds paragraphs. Poppler keeps the layout's line breaks, so a blank line
 * reliably separates two blocks; inside a block a split happens only after a
 * finished sentence followed by a heading or bullet.
 */
function reflow(lines: string[]): string {
  const out: string[] = [];
  let buffer = "";

  const flush = () => {
    const text = buffer.trim();
    if (text) out.push(text);
    buffer = "";
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    if (!buffer) {
      buffer = line;
      continue;
    }
    if (buffer.endsWith("-")) {
      buffer =
        /[a-zà-ÿ]$/.test(buffer.slice(0, -1)) && /^[a-zà-ÿ]/.test(line)
          ? buffer.slice(0, -1) + line
          : `${buffer} ${line}`;
      continue;
    }
    if (/[.!?:»]$/.test(buffer) && /^[•▪●–—-]\s|^[A-ZÀ-Ý0-9]/.test(line)) {
      flush();
      buffer = line;
      continue;
    }
    buffer = `${buffer} ${line}`;
  }
  flush();

  return out.join("\n");
}

async function main(): Promise<void> {
  await mkdir(TEXT_DIR, { recursive: true });

  for (const source of SOURCES) {
    const file = path.join(RAW_DIR, source.fileName);
    await readFile(file); // Fail early and clearly if ingest:fetch has not run.

    // An HTML page has no pagination, so it forms a single page. Header detection
    // is moot here since htmlToText already stripped the template.
    const rawPages =
      source.format === "html"
        ? [htmlToText(await readFile(file, "utf8")).text]
        : await pdfToPages(file, source.pdfMode ?? "default");
    // Blank lines are kept: they are the most reliable signal for isolating a
    // section heading.
    const pages = rawPages.map((page) =>
      page
        .split("\n")
        .map((line) => collapseDoubledCaps(normalizeLine(line)))
        .filter((line) => !isLetterSpaced(line)),
    );
    const boilerplate = findBoilerplate(pages);

    const kept: string[] = [];
    for (const lines of pages) {
      for (const line of lines) {
        if (!line) {
          kept.push("");
          continue;
        }
        // Run again after header removal, which creates new adjacencies.
        const cleaned = collapseDoubledCaps(joinSpacedCaps(stripBoilerplate(line, boilerplate)));
        if (!cleaned || isPageNumber(cleaned)) continue;
        kept.push(cleaned);
      }
      // Page boundary, acts as a block separator for reflow.
      kept.push("");
    }

    // Final pass: reflow joins already-cleaned lines and can recreate a
    // duplication at their junction.
    const text = reflow(kept).split("\n").map(collapseDoubledCaps).join("\n");
    await writeFile(path.join(TEXT_DIR, `${source.id}.txt`), `${text}\n`);
    console.log(
      `ok ${source.id}: ${pages.length} pages, ${boilerplate.length} furniture removed, ${text.length} chars`,
    );
    for (const ngram of boilerplate) console.log(`    furniture: "${ngram}"`);
  }
}

await main();
