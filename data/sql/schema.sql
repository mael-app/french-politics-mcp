-- Civis corpus schema.
--
-- Recreated in full on every ingestion: the corpus is a generated artefact, never
-- edited in place. data/corpus/corpus.json remains its source.
--
-- Apply with `npm run db:reset:local` or `npm run db:reset:remote`.

DROP TABLE IF EXISTS chunks_fts;
DROP TABLE IF EXISTS chunk_topics;
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS sections;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS corpus_meta;

CREATE TABLE corpus_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE documents (
  id           TEXT PRIMARY KEY,
  party        TEXT NOT NULL,
  election     TEXT NOT NULL,
  year         INTEGER NOT NULL,
  title        TEXT NOT NULL,
  source_type  TEXT NOT NULL,
  source_url   TEXT NOT NULL,
  -- Set when source_url points to a Wayback capture.
  original_url TEXT,
  -- Work this document is a chapter of, for manifestos published online.
  collection   TEXT,
  imported_at  TEXT NOT NULL,
  checksum     TEXT NOT NULL,
  char_count   INTEGER NOT NULL
);
CREATE INDEX idx_documents_party ON documents (party);

CREATE TABLE sections (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents (id),
  heading     TEXT NOT NULL,
  ord         INTEGER NOT NULL
);
CREATE INDEX idx_sections_document ON sections (document_id, ord);

CREATE TABLE chunks (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents (id),
  section_id    TEXT NOT NULL REFERENCES sections (id),
  party         TEXT NOT NULL,
  -- Verbatim source text, the only quotable field.
  text          TEXT NOT NULL,
  char_start    INTEGER NOT NULL,
  char_end      INTEGER NOT NULL,
  ord           INTEGER NOT NULL,
  -- Table of contents or heading list: demoted in ranking, never excluded.
  is_navigation INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_chunks_party ON chunks (party);
CREATE INDEX idx_chunks_document_ord ON chunks (document_id, ord);

CREATE TABLE chunk_topics (
  chunk_id TEXT NOT NULL REFERENCES chunks (id),
  topic    TEXT NOT NULL,
  PRIMARY KEY (chunk_id, topic)
);
CREATE INDEX idx_chunk_topics_topic ON chunk_topics (topic, chunk_id);

-- Full-text index.
--
-- The indexed content is pre-stemmed by src/search/french.ts, not the original
-- text: FTS5 ships no French analyzer, its tokenizer only strips diacritics.
-- Without that step "retraites" would not find "retraite". Queries run through the
-- exact same code in the Worker, so any change to the stemmer requires
-- regenerating the seed.
CREATE VIRTUAL TABLE chunks_fts USING fts5 (
  chunk_id UNINDEXED,
  stemmed_text,
  stemmed_heading,
  tokenize = "unicode61 remove_diacritics 2"
);
