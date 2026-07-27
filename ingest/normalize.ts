/**
 * Step 3: turn extracted text into a structured corpus of documents, sections and
 * quotable chunks.
 *
 * Central invariant: `chunk.text` equals `sourceText.slice(charStart, charEnd)`
 * exactly. That is what guarantees a citation is word for word the source
 * document's. `ingest/check.ts` re-verifies it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tagTopics } from "../src/search/topic-match.js";
import { normalizeLabel } from "../src/utils/text.js";
import type { Corpus, DocumentSection, SourceDocument, TextChunk } from "../src/domain/types.js";
import { SOURCES } from "./manifest.js";
import { CHECKSUMS_FILE, CORPUS_DIR, CORPUS_FILE, TEXT_DIR } from "./paths.js";

/** Target chunk size: enough to carry one complete measure and its context. */
const TARGET_CHARS = 600;
/** Above this, split on a sentence boundary. */
const MAX_CHARS = 1100;
/** Below this, a block is not quotable alone and joins the next chunk. */
const MIN_CHARS = 120;

interface Block {
  text: string;
  start: number;
  end: number;
}

/** Splits text into blocks; after reflow one line is one paragraph. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) blocks.push({ text: trimmed, start: offset, end: offset + line.length });
    offset += line.length + 1;
  }
  return blocks;
}

const NUMBERED_HEADING = /^\d{1,3}\s*[_.)\]–-]\s+\S/;
const NAMED_HEADING = /^(chapitre|partie|axe|thème|theme|pacte|priorité|proposition|mesure)\b/i;

/**
 * Short, well-typeset lines that are nonetheless not section headings. Letting
 * them through polluted citations directly, with excerpts referenced under a
 * stock-photo credit.
 */
const NOT_A_HEADING: RegExp[] = [
  // Photo credits and legal notices.
  /^©/,
  /^cr[ée]dits?\s+(photos?|images?|iconographi)/i,
  /^(photos?|illustrations?)\s*[:—-]/i,
  /\b(adobe stock|istock|shutterstock|getty|unsplash|flickr|wikimedia)\b/i,
  // Document navigation, no contextual value.
  /^(sommaire|table des matières|introduction|édito|editorial|remerciements)\b/i,
  // Photo captions and attributions.
  /^\p{Lu}[\p{L}'’-]+ \p{Lu}[\p{L}'’-]+, [a-zà-ÿ]/u,
  // Candidate identity banners.
  /^\p{Lu}[\p{L}'’-]+ \p{Lu}[\p{L}'’-]+,? ?(20\d\d)$/u,
];

/** A numbered heading encountered mid-line. */
const INLINE_NUMBERED_ITEM = /\d{1,3}\s*_\s*[A-ZÀ-Ý]/g;

/**
 * A passage chaining several numbered headings is a table of contents: dense in
 * keywords but holding no quotable sentence.
 */
function isNavigationText(text: string): boolean {
  return (text.match(INLINE_NUMBERED_ITEM) ?? []).length >= 2;
}

/**
 * Detects section headings. Manifestos carry no typed structure, so this relies on
 * the typographic regularities that survive extraction: capitals, proposal
 * numbering, absence of terminal punctuation.
 */
function isHeading(text: string, documentTitle: string): boolean {
  if (text.length < 4 || text.length > 110) return false;
  if (text.split(" ").length > 16) return false;
  if (/[.!?;]$/.test(text)) return false;
  if (/^[•▪●–—-]\s/.test(text)) return false;
  if (/^[a-zà-ÿ]/.test(text)) return false;
  if (NOT_A_HEADING.some((pattern) => pattern.test(text))) return false;
  // The document title recurs as a page banner; that is not a section.
  if (normalizeLabel(text).length > 6 && normalizeLabel(documentTitle).includes(normalizeLabel(text))) {
    return false;
  }

  if (NUMBERED_HEADING.test(text) || NAMED_HEADING.test(text)) return true;

  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4) return false;
  const uppercase = text.replace(/[^A-ZÀ-Ý]/g, "").length;
  if (uppercase / letters.length > 0.7) return true;

  // Sentence-case headings: a short block isolated between blank lines and with
  // no terminal punctuation is not a paragraph. Without this rule, manifestos set
  // in lower case come out as one undifferentiated section.
  return text.length <= 70 && text.split(" ").length <= 9;
}

/** Splits an overlong block on sentence boundaries, preserving offsets. */
function splitLongBlock(block: Block): Block[] {
  if (block.text.length <= MAX_CHARS) return [block];

  const pieces: Block[] = [];
  const sentences = block.text.split(/(?<=[.!?])\s+/);
  let buffer = "";
  let bufferStart = 0;
  let cursor = 0;

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) {
      pieces.push({
        text: trimmed,
        start: block.start + bufferStart,
        end: block.start + bufferStart + buffer.length,
      });
    }
    buffer = "";
  };

  for (const sentence of sentences) {
    if (!buffer) bufferStart = cursor;
    buffer += (buffer ? " " : "") + sentence;
    cursor += sentence.length + 1;
    if (buffer.length >= TARGET_CHARS) flush();
  }
  flush();

  return pieces.length > 0 ? pieces : [block];
}

function main(): Promise<void> {
  return run();
}

async function run(): Promise<void> {
  await mkdir(CORPUS_DIR, { recursive: true });
  const checksums = JSON.parse(await readFile(CHECKSUMS_FILE, "utf8")) as Record<
    string,
    { sha256: string; bytes: number }
  >;

  const documents: SourceDocument[] = [];
  const sections: DocumentSection[] = [];
  const chunks: TextChunk[] = [];
  const importedAt = new Date().toISOString();

  for (const source of SOURCES) {
    const fullText = await readFile(path.join(TEXT_DIR, `${source.id}.txt`), "utf8");
    const blocks = toBlocks(fullText);

    documents.push({
      id: source.id,
      party: source.party,
      election: "presidentielle",
      year: 2022,
      title: source.title,
      sourceUrl: source.sourceUrl,
      sourceType: source.sourceType,
      ...(source.originalUrl ? { originalUrl: source.originalUrl } : {}),
      ...(source.collection ? { collection: source.collection } : {}),
      importedAt,
      checksum: checksums[source.id]?.sha256 ?? "",
      charCount: fullText.length,
    });

    // Opening section: everything before the first heading.
    let sectionIndex = 0;
    let sectionId = `${source.id}#s0`;
    sections.push({ id: sectionId, documentId: source.id, heading: source.title, order: 0 });

    let pending: Block[] = [];
    let pendingSectionId = sectionId;
    let chunkIndex = 0;

    const pendingLength = () =>
      pending.length === 0 ? 0 : pending.at(-1)!.end - pending[0].start;

    const flushChunk = () => {
      if (pending.length === 0) return;
      const text = fullText.slice(pending[0].start, pending.at(-1)!.end);
      if (text.trim()) {
        chunks.push({
          id: `${source.id}#c${chunkIndex}`,
          documentId: source.id,
          sectionId: pendingSectionId,
          party: source.party,
          topicTags: tagTopics(text),
          text,
          charStart: pending[0].start,
          charEnd: pending.at(-1)!.end,
          order: chunkIndex,
          ...(isNavigationText(text) ? { isNavigation: true } : {}),
        });
        chunkIndex += 1;
      }
      pending = [];
    };

    const append = (piece: Block) => {
      if (pending.length === 0) pendingSectionId = sectionId;
      pending.push(piece);
    };

    for (const block of blocks) {
      if (isHeading(block.text, source.title)) {
        // Only cut when the current chunk is already quotable on its own,
        // otherwise bullet-list manifestos shatter into one-line chunks.
        if (pendingLength() >= MIN_CHARS) flushChunk();
        sectionIndex += 1;
        sectionId = `${source.id}#s${sectionIndex}`;
        sections.push({
          id: sectionId,
          documentId: source.id,
          heading: block.text,
          order: sectionIndex,
        });
        // The heading stays in the stream and opens the chunk it introduces, so
        // no character of the document becomes unquotable.
        append(block);
        continue;
      }

      for (const piece of splitLongBlock(block)) {
        append(piece);
        if (pendingLength() >= TARGET_CHARS) flushChunk();
      }
    }
    flushChunk();

    const documentChunks = chunks.filter((chunk) => chunk.documentId === source.id);
    console.log(
      `ok ${source.id}: ${sectionIndex + 1} sections, ${documentChunks.length} chunks, ` +
        `${Math.round(documentChunks.reduce((sum, c) => sum + c.text.length, 0) / Math.max(1, documentChunks.length))} chars/chunk`,
    );
  }

  // Chunks too short to stand alone as a quote skew search.
  const tooShort = chunks.filter((chunk) => chunk.text.length < MIN_CHARS).length;

  const corpus: Corpus = {
    corpusVersion: "1.0.0",
    generatedAt: importedAt,
    election: "presidentielle",
    year: 2022,
    documents,
    sections,
    chunks,
  };
  await writeFile(CORPUS_FILE, `${JSON.stringify(corpus)}\n`);

  console.log(
    `\n${documents.length} documents, ${sections.length} sections, ${chunks.length} chunks ` +
      `(${tooShort} very short) -> ${CORPUS_FILE}`,
  );
}

await main();
