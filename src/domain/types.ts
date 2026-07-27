export const PARTY_IDS = ["lfi", "rn", "renaissance", "ps", "lr"] as const;
export type PartyId = (typeof PARTY_IDS)[number];

export const TOPIC_IDS = [
  "retraites",
  "immigration",
  "securite",
  "ecologie",
  "sante",
  "education",
  "institutions",
  "travail",
  "fiscalite",
  "europe",
] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

/**
 * Nature of a source document. The distinction matters: an official manifesto does
 * not commit a candidate in the same way a thematic booklet or a leaflet does.
 */
export type SourceType =
  | "official_program"
  | "thematic_booklet"
  | "campaign_leaflet"
  | "official_webpage";

/**
 * How strongly the corpus supports a claim. Levels derive from measurable signals
 * (topic keyword presence, lexical score), never from a judgement on content.
 */
export type EvidenceLevel = "direct_quote" | "clear_paraphrase" | "weak_inference" | "not_found";

export interface SourceDocument {
  id: string;
  party: PartyId;
  election: "presidentielle";
  year: 2022;
  title: string;
  sourceUrl: string;
  sourceType: SourceType;
  /** Original URL when `sourceUrl` points to an archived copy. */
  originalUrl?: string;
  /** Work this document is a chapter of, when applicable. */
  collection?: string;
  importedAt: string;
  /** SHA-256 of the downloaded file, proving source integrity. */
  checksum: string;
  charCount: number;
}

export interface DocumentSection {
  id: string;
  documentId: string;
  heading: string;
  order: number;
}

export interface TextChunk {
  id: string;
  documentId: string;
  sectionId: string;
  party: PartyId;
  topicTags: TopicId[];
  /** Original text, kept verbatim so it can be quoted exactly. */
  text: string;
  /** Offsets into the extracted source text. */
  charStart: number;
  charEnd: number;
  /** Rank within its document, used to fetch neighbouring passages. */
  order: number;
  /**
   * Navigation passage: a table of contents or a list of headings. Keyword-dense
   * but not quotable, so it is demoted in ranking. Never excluded, because the
   * heuristic is not reliable enough to make text unreachable.
   */
  isNavigation?: boolean;
}

export interface Corpus {
  corpusVersion: string;
  generatedAt: string;
  election: "presidentielle";
  year: 2022;
  documents: SourceDocument[];
  sections: DocumentSection[];
  chunks: TextChunk[];
}
