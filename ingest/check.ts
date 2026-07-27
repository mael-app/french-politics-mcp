/**
 * Corpus checks. Verifies the invariants the server's promise rests on: quoting
 * word for word, losing nothing of the source document.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PARTY_LIST } from "../src/domain/parties.js";
import { TOPIC_LIST } from "../src/domain/topics.js";
import type { Corpus, TopicId } from "../src/domain/types.js";
import { CORPUS_FILE, TEXT_DIR } from "./paths.js";

const corpus = JSON.parse(await readFile(CORPUS_FILE, "utf8")) as Corpus;
const failures: string[] = [];

const sectionIds = new Set(corpus.sections.map((section) => section.id));
const documentIds = new Set(corpus.documents.map((document) => document.id));

for (const document of corpus.documents) {
  if (!document.checksum) failures.push(`${document.id}: missing SHA-256 checksum`);
  if (!document.sourceUrl.startsWith("https://")) {
    failures.push(`${document.id}: insecure source URL`);
  }
}

// Central invariant: a chunk's text is exactly the slice it claims of the source.
for (const document of corpus.documents) {
  const fullText = await readFile(path.join(TEXT_DIR, `${document.id}.txt`), "utf8");
  const chunks = corpus.chunks.filter((chunk) => chunk.documentId === document.id);
  let covered = 0;

  for (const chunk of chunks) {
    if (fullText.slice(chunk.charStart, chunk.charEnd) !== chunk.text) {
      failures.push(`${chunk.id}: text does not match [${chunk.charStart}, ${chunk.charEnd}]`);
    }
    if (!sectionIds.has(chunk.sectionId)) failures.push(`${chunk.id}: unknown section`);
    if (!documentIds.has(chunk.documentId)) failures.push(`${chunk.id}: unknown document`);
    if (!chunk.text.trim()) failures.push(`${chunk.id}: empty text`);
    covered += chunk.text.length;
  }

  const ratio = covered / fullText.length;
  const flag = ratio < 0.95 ? " ⚠️" : "";
  console.log(
    `${document.id}: ${chunks.length} chunks, ${(ratio * 100).toFixed(1)}% covered${flag}`,
  );
  if (ratio < 0.95) {
    failures.push(`${document.id}: ${((1 - ratio) * 100).toFixed(1)}% of the text is in no chunk`);
  }
}

console.log("\nChunks per party:");
for (const party of PARTY_LIST) {
  const chunks = corpus.chunks.filter((chunk) => chunk.party === party.id);
  if (chunks.length === 0) failures.push(`${party.id}: no chunks`);
  console.log(`  ${party.shortName.padEnd(12)} ${String(chunks.length).padStart(4)} chunks`);
}

console.log("\nChunks per topic:");
const untagged = corpus.chunks.filter((chunk) => chunk.topicTags.length === 0).length;
for (const topic of TOPIC_LIST) {
  const counts = PARTY_LIST.map(
    (party) =>
      corpus.chunks.filter(
        (chunk) => chunk.party === party.id && chunk.topicTags.includes(topic.id as TopicId),
      ).length,
  );
  const total = counts.reduce((sum, n) => sum + n, 0);
  const gaps = PARTY_LIST.filter((_, i) => counts[i] === 0).map((p) => p.shortName);
  console.log(
    `  ${topic.label.padEnd(26)} ${String(total).padStart(4)}  ` +
      `[${counts.join(" / ")}]${gaps.length ? `  none: ${gaps.join(", ")}` : ""}`,
  );
}
console.log(
  `\n(party order: ${PARTY_LIST.map((p) => p.shortName).join(" / ")})\n` +
    `${untagged} chunks without a topic out of ${corpus.chunks.length}`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures.slice(0, 20)) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("\nAll corpus invariants hold.");
