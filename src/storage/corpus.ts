import { TOPIC_LIST } from "../domain/topics.js";
import type {
  DocumentSection,
  PartyId,
  SourceDocument,
  TextChunk,
  TopicId,
} from "../domain/types.js";
import { stemSet } from "../search/french.js";
import {
  buildMatchExpression,
  coverageOf,
  queryStems,
  requiredCoverage,
} from "../search/query.js";
import { topicKeywordMatches } from "../search/topic-match.js";

/**
 * Score multiplier for navigation passages. Tables of contents pack keywords into
 * little text and would take the top spots without holding any quotable stance.
 * They are demoted rather than excluded: the heuristic is not reliable enough to
 * make text unreachable.
 */
const NAVIGATION_PENALTY = 0.3;

/** Fraction of the best score below which a result is noise. */
const RELATIVE_SCORE_FLOOR = 0.25;

/** Extra candidates fetched before the relative floor is applied. */
const CANDIDATE_MULTIPLIER = 4;

/** Minimum candidates per party on a topic search, so re-ranking has material. */
const TOPIC_CANDIDATE_FLOOR = 15;

export interface SearchHit {
  chunk: TextChunk;
  document: SourceDocument;
  section: DocumentSection | undefined;
  score: number;
}

interface HitRow {
  id: string;
  document_id: string;
  section_id: string;
  party: string;
  text: string;
  char_start: number;
  char_end: number;
  ord: number;
  is_navigation: number;
  topic_tags: string | null;
  heading: string | null;
  section_ord: number | null;
  score: number;
  doc_title: string;
  doc_source_type: string;
  doc_source_url: string;
  doc_original_url: string | null;
  doc_imported_at: string;
  doc_checksum: string;
  doc_char_count: number;
  doc_year: number;
}

/**
 * Columns shared by every search. SQLite returns negative bm25 scores (lower is
 * better), so they are inverted. The weights map to the `chunks_fts` columns:
 * chunk_id (unindexed), text, section heading, the last counting double.
 */
const HIT_COLUMNS = `
  c.id, c.document_id, c.section_id, c.party, c.text,
  c.char_start, c.char_end, c.ord, c.is_navigation,
  s.heading, s.ord AS section_ord,
  d.title AS doc_title, d.source_type AS doc_source_type, d.source_url AS doc_source_url,
  d.original_url AS doc_original_url, d.imported_at AS doc_imported_at,
  d.checksum AS doc_checksum, d.char_count AS doc_char_count, d.year AS doc_year,
  (SELECT group_concat(t.topic) FROM chunk_topics t WHERE t.chunk_id = c.id) AS topic_tags,
  (-bm25(chunks_fts, 0.0, 1.0, 2.0)) *
    (CASE WHEN c.is_navigation = 1 THEN ${NAVIGATION_PENALTY} ELSE 1.0 END) AS score`;

const HIT_FROM = `
  FROM chunks_fts
  JOIN chunks c ON c.id = chunks_fts.chunk_id
  JOIN documents d ON d.id = c.document_id
  LEFT JOIN sections s ON s.id = c.section_id`;

function toChunk(row: HitRow): TextChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    sectionId: row.section_id,
    party: row.party as PartyId,
    topicTags: row.topic_tags ? (row.topic_tags.split(",") as TopicId[]) : [],
    text: row.text,
    charStart: row.char_start,
    charEnd: row.char_end,
    order: row.ord,
    ...(row.is_navigation === 1 ? { isNavigation: true } : {}),
  };
}

function toDocument(row: HitRow): SourceDocument {
  return {
    id: row.document_id,
    party: row.party as PartyId,
    election: "presidentielle",
    year: row.doc_year as 2022,
    title: row.doc_title,
    sourceUrl: row.doc_source_url,
    sourceType: row.doc_source_type as SourceDocument["sourceType"],
    ...(row.doc_original_url ? { originalUrl: row.doc_original_url } : {}),
    importedAt: row.doc_imported_at,
    checksum: row.doc_checksum,
    charCount: row.doc_char_count,
  };
}

function toHit(row: HitRow): SearchHit {
  return {
    chunk: toChunk(row),
    document: toDocument(row),
    section: row.heading === null
      ? undefined
      : {
          id: row.section_id,
          documentId: row.document_id,
          heading: row.heading,
          order: row.section_ord ?? 0,
        },
    score: row.score,
  };
}

/**
 * Drops the tail of weakly related results while preserving the given order. The
 * floor uses the highest score in the list rather than its first element, because
 * topic re-ranking can move a lower-scoring hit to the front.
 */
function applyFloor(hits: SearchHit[], limit: number): SearchHit[] {
  if (hits.length === 0) return [];
  const floor = Math.max(...hits.map((hit) => hit.score)) * RELATIVE_SCORE_FLOOR;
  return hits.filter((hit) => hit.score >= floor).slice(0, limit);
}

export interface SearchFilters {
  party?: PartyId;
  topic?: TopicId;
  limit?: number;
}

export async function searchChunks(
  db: D1Database,
  query: string,
  filters: SearchFilters = {},
): Promise<SearchHit[]> {
  const match = buildMatchExpression(query);
  if (!match) return [];

  const limit = filters.limit ?? 10;
  const conditions: string[] = ["chunks_fts MATCH ?"];
  const bindings: unknown[] = [match];

  if (filters.party) {
    conditions.push("c.party = ?");
    bindings.push(filters.party);
  }
  if (filters.topic) {
    conditions.push("EXISTS (SELECT 1 FROM chunk_topics t WHERE t.chunk_id = c.id AND t.topic = ?)");
    bindings.push(filters.topic);
  }
  bindings.push(limit * CANDIDATE_MULTIPLIER);

  const { results } = await db
    .prepare(
      `SELECT ${HIT_COLUMNS} ${HIT_FROM} WHERE ${conditions.join(" AND ")} ORDER BY score DESC LIMIT ?`,
    )
    .bind(...bindings)
    .all<HitRow>();

  const covered = withCoverage((results ?? []).map(toHit), query);
  const floored = applyFloor(covered, filters.party ? limit : covered.length);

  return filters.party ? floored : capPerParty(floored, limit);
}

/**
 * Stops one party from monopolising an unfiltered search.
 *
 * Parties published unequal volumes, so the largest corpus would otherwise take
 * most of the top results on relevance-neutral queries. Score order is preserved;
 * only the surplus hits of an already well represented party are dropped. An
 * explicit party filter disables the rule.
 */
function capPerParty(hits: SearchHit[], limit: number): SearchHit[] {
  const cap = Math.max(2, Math.ceil(limit / 3));
  const used = new Map<PartyId, number>();
  const kept: SearchHit[] = [];

  for (const hit of hits) {
    const count = used.get(hit.chunk.party) ?? 0;
    if (count >= cap) continue;
    used.set(hit.chunk.party, count + 1);
    kept.push(hit);
    if (kept.length >= limit) break;
  }
  return kept;
}

/**
 * Keeps only passages answering enough of the query. This filter, not a score
 * threshold, is what removes noise: measurements show bm25 does not separate
 * relevant from off-topic here, whereas term coverage does.
 */
function withCoverage(hits: SearchHit[], query: string): SearchHit[] {
  const stems = queryStems(query);
  if (stems.length === 0) return [];
  const required = requiredCoverage(stems.length);
  return hits.filter((hit) => coverageOf(stems, stemSet(hit.chunk.text)) >= required);
}

/** Synthetic query for a topic, built from its keywords. */
export function topicQuery(topic: TopicId): string {
  return TOPIC_LIST.find((candidate) => candidate.id === topic)!.keywords.join(" ");
}

/**
 * Best passages per party on a topic, in a single round trip. `batch` groups the
 * per-party queries instead of paying network latency five times.
 */
export async function searchTopicByParty(
  db: D1Database,
  topic: TopicId,
  parties: PartyId[],
  perParty: number,
): Promise<Map<PartyId, SearchHit[]>> {
  const match = buildMatchExpression(topicQuery(topic));
  const byParty = new Map<PartyId, SearchHit[]>();
  if (!match) {
    for (const party of parties) byParty.set(party, []);
    return byParty;
  }

  const sql = `SELECT ${HIT_COLUMNS} ${HIT_FROM} WHERE chunks_fts MATCH ? AND c.party = ? ORDER BY score DESC LIMIT ?`;
  const candidateCount = Math.max(TOPIC_CANDIDATE_FLOOR, perParty * CANDIDATE_MULTIPLIER);
  const responses = await db.batch<HitRow>(
    parties.map((party) => db.prepare(sql).bind(match, party, candidateCount)),
  );

  parties.forEach((party, index) => {
    const hits = (responses[index]?.results ?? []).map(toHit);
    byParty.set(party, applyFloor(rankByTopicCoverage(hits, topic), perParty));
  });
  return byParty;
}

/** Each distinct topic keyword found in a passage raises its score by 15%. */
const COVERAGE_WEIGHT = 0.15;

/**
 * Boosts candidates that genuinely cover the topic, without letting that criterion
 * decide alone.
 *
 * bm25 rewards term rarity, which is not the same as being about the subject.
 * Coverage alone fails symmetrically, since topic vocabulary is ambiguous: a
 * passage about alimony matches as many "retraites" keywords as one about pension
 * reform. Multiplying both signals lets lexical relevance break ties.
 */
function rankByTopicCoverage(hits: SearchHit[], topic: TopicId): SearchHit[] {
  return hits
    .map((hit) => ({
      ...hit,
      score: hit.score * (1 + COVERAGE_WEIGHT * topicKeywordMatches(hit.chunk.text, topic).length),
    }))
    .sort((a, b) => b.score - a.score);
}

interface ChunkRow extends Omit<HitRow, "score"> {}

const CHUNK_SELECT = `
  SELECT c.id, c.document_id, c.section_id, c.party, c.text,
         c.char_start, c.char_end, c.ord, c.is_navigation,
         s.heading, s.ord AS section_ord,
         d.title AS doc_title, d.source_type AS doc_source_type, d.source_url AS doc_source_url,
         d.original_url AS doc_original_url, d.imported_at AS doc_imported_at,
         d.checksum AS doc_checksum, d.char_count AS doc_char_count, d.year AS doc_year,
         (SELECT group_concat(t.topic) FROM chunk_topics t WHERE t.chunk_id = c.id) AS topic_tags
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  LEFT JOIN sections s ON s.id = c.section_id`;

export interface PassageWithContext {
  chunk: TextChunk;
  document: SourceDocument;
  section: DocumentSection | undefined;
  context: TextChunk[];
}

/** A passage with its metadata and immediate neighbours in the document. */
export async function getPassage(
  db: D1Database,
  chunkId: string,
  radius: number,
): Promise<PassageWithContext | null> {
  const row = await db
    .prepare(`${CHUNK_SELECT} WHERE c.id = ?`)
    .bind(chunkId)
    .first<ChunkRow>();
  if (!row) return null;

  const hit = toHit({ ...row, score: 0 });
  const { results } = await db
    .prepare(
      `SELECT id, document_id, section_id, party, text, char_start, char_end, ord, is_navigation,
              (SELECT group_concat(t.topic) FROM chunk_topics t WHERE t.chunk_id = chunks.id) AS topic_tags
       FROM chunks WHERE document_id = ? AND ord BETWEEN ? AND ? ORDER BY ord`,
    )
    .bind(row.document_id, row.ord - radius, row.ord + radius)
    .all<HitRow>();

  return {
    chunk: hit.chunk,
    document: hit.document,
    section: hit.section,
    context: (results ?? []).map(toChunk),
  };
}

export interface CorpusMeta {
  corpusVersion: string;
  generatedAt: string;
  documentCount: number;
  chunkCount: number;
}

export async function getCorpusMeta(db: D1Database): Promise<CorpusMeta> {
  const [meta, counts] = await db.batch<Record<string, string | number>>([
    db.prepare("SELECT key, value FROM corpus_meta"),
    db.prepare(
      "SELECT (SELECT COUNT(*) FROM documents) AS documents, (SELECT COUNT(*) FROM chunks) AS chunks",
    ),
  ]);
  const values = new Map(
    (meta.results ?? []).map((row) => [String(row.key), String(row.value)]),
  );
  const totals = counts.results?.[0] ?? {};
  return {
    corpusVersion: values.get("corpus_version") ?? "inconnue",
    generatedAt: values.get("generated_at") ?? "",
    documentCount: Number(totals.documents ?? 0),
    chunkCount: Number(totals.chunks ?? 0),
  };
}

export interface DocumentSummary extends SourceDocument {
  chunkCount: number;
}

export async function listDocuments(
  db: D1Database,
  party?: PartyId,
): Promise<DocumentSummary[]> {
  const where = party ? "WHERE d.party = ?" : "";
  const statement = db.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count
     FROM documents d ${where} ORDER BY d.party`,
  );
  const { results } = await (party ? statement.bind(party) : statement).all<
    Record<string, string | number | null>
  >();

  return (results ?? []).map((row) => ({
    id: String(row.id),
    party: String(row.party) as PartyId,
    election: "presidentielle" as const,
    year: 2022 as const,
    title: String(row.title),
    sourceUrl: String(row.source_url),
    sourceType: String(row.source_type) as SourceDocument["sourceType"],
    ...(row.original_url ? { originalUrl: String(row.original_url) } : {}),
    ...(row.collection ? { collection: String(row.collection) } : {}),
    importedAt: String(row.imported_at),
    checksum: String(row.checksum),
    charCount: Number(row.char_count),
    chunkCount: Number(row.chunk_count),
  }));
}

export interface PartyStats {
  party: PartyId;
  chunkCount: number;
  documentCount: number;
  topics: TopicId[];
}

/** Chunk volume and covered topics per party, in one aggregate query. */
export async function getPartyStats(db: D1Database): Promise<Map<PartyId, PartyStats>> {
  const { results } = await db
    .prepare(
      `SELECT c.party,
              COUNT(DISTINCT c.id) AS chunk_count,
              COUNT(DISTINCT c.document_id) AS document_count,
              (SELECT group_concat(DISTINCT t.topic)
                 FROM chunk_topics t JOIN chunks c2 ON c2.id = t.chunk_id
                WHERE c2.party = c.party) AS topics
       FROM chunks c GROUP BY c.party`,
    )
    .all<{ party: string; chunk_count: number; document_count: number; topics: string | null }>();

  const stats = new Map<PartyId, PartyStats>();
  for (const row of results ?? []) {
    stats.set(row.party as PartyId, {
      party: row.party as PartyId,
      chunkCount: row.chunk_count,
      documentCount: row.document_count,
      topics: row.topics ? (row.topics.split(",").sort() as TopicId[]) : [],
    });
  }
  return stats;
}

/** Above this ratio between best and least covered party, the gap must be reported. */
const COVERAGE_IMBALANCE_THRESHOLD = 3;

export interface CoverageWarning {
  ratio: number;
  bestCovered: PartyId;
  leastCovered: PartyId;
}

/**
 * Reports a marked coverage gap between parties.
 *
 * Without it, a `not_found` reads as "this party had no stance" where it should
 * read "the corpus barely documents this party".
 */
export function detectCoverageImbalance(
  stats: Map<PartyId, PartyStats>,
  parties: PartyId[],
): CoverageWarning | null {
  const counted = parties
    .map((party) => ({ party, count: stats.get(party)?.chunkCount ?? 0 }))
    .filter((entry) => entry.count > 0);
  if (counted.length < 2) return null;

  const best = counted.reduce((a, b) => (b.count > a.count ? b : a));
  const least = counted.reduce((a, b) => (b.count < a.count ? b : a));
  const ratio = best.count / least.count;
  if (ratio < COVERAGE_IMBALANCE_THRESHOLD) return null;

  return {
    ratio: Number(ratio.toFixed(1)),
    bestCovered: best.party,
    leastCovered: least.party,
  };
}

/** Passage count per topic, across all parties. */
export async function getTopicCounts(db: D1Database): Promise<Map<TopicId, number>> {
  const { results } = await db
    .prepare("SELECT topic, COUNT(*) AS n FROM chunk_topics GROUP BY topic")
    .all<{ topic: string; n: number }>();
  return new Map((results ?? []).map((row) => [row.topic as TopicId, row.n]));
}

/** Passage count per topic for one party. */
export async function getTopicCountsForParty(
  db: D1Database,
  party: PartyId,
): Promise<Map<TopicId, number>> {
  const { results } = await db
    .prepare(
      `SELECT t.topic, COUNT(*) AS n
       FROM chunk_topics t JOIN chunks c ON c.id = t.chunk_id
       WHERE c.party = ? GROUP BY t.topic`,
    )
    .bind(party)
    .all<{ topic: string; n: number }>();
  return new Map((results ?? []).map((row) => [row.topic as TopicId, row.n]));
}
