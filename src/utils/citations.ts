import { PARTIES } from "../domain/parties.js";
import type {
  DocumentSection,
  EvidenceLevel,
  SourceDocument,
  TextChunk,
  TopicId,
} from "../domain/types.js";
import { collapseWhitespace } from "./text.js";

/**
 * Display-ready reference for a passage. Every server response carries one, so no
 * excerpt travels without its primary source.
 */
export function formatCitation(
  document: SourceDocument,
  section: DocumentSection | undefined,
): string {
  const party = PARTIES[document.party];
  const parts = [
    `${party.shortName} (${party.candidate2022})`,
    document.title,
    section?.heading ? `« ${collapseWhitespace(section.heading)} »` : undefined,
    `présidentielle ${document.year}`,
    document.sourceUrl,
  ].filter(Boolean);
  return parts.join(" — ");
}

/** Single passage shape returned by every tool. */
export interface PassagePayload {
  chunkId: string;
  party: string;
  partyId: string;
  candidate: string;
  /** Verbatim source text. This field, and only this one, may be quoted. */
  quote: string;
  heading: string | null;
  topicTags: TopicId[];
  documentTitle: string;
  sourceUrl: string;
  sourceType: string;
  citation: string;
  score?: number;
}

export function toPassage(
  chunk: TextChunk,
  document: SourceDocument,
  section: DocumentSection | undefined,
  score?: number,
): PassagePayload {
  const party = PARTIES[chunk.party];
  return {
    chunkId: chunk.id,
    party: party.name,
    partyId: party.id,
    candidate: party.candidate2022,
    quote: chunk.text,
    heading: section?.heading ?? null,
    topicTags: chunk.topicTags,
    documentTitle: document.title,
    sourceUrl: document.sourceUrl,
    sourceType: document.sourceType,
    citation: formatCitation(document, section),
    ...(score === undefined ? {} : { score: Number(score.toFixed(3)) }),
  };
}

/**
 * Derives the evidence level from how many topic keywords the passage actually
 * contains. Two or more means it addresses the topic explicitly, one that it
 * touches on it, none that the link rests on lexical proximity alone.
 */
export function evidenceLevelFromKeywords(matchedKeywords: string[]): EvidenceLevel {
  if (matchedKeywords.length >= 2) return "direct_quote";
  if (matchedKeywords.length === 1) return "clear_paraphrase";
  return "weak_inference";
}

export const EVIDENCE_LEVEL_EXPLANATIONS: Record<EvidenceLevel, string> = {
  direct_quote:
    "Le passage cité traite explicitement le thème (plusieurs termes du thème y figurent).",
  clear_paraphrase: "Le passage aborde le thème sans lui être entièrement consacré.",
  weak_inference:
    "Le lien avec le thème repose seulement sur une proximité lexicale : à interpréter avec prudence.",
  not_found:
    "Aucun passage du corpus ne traite ce thème pour ce parti. Ne pas inférer de position.",
};

/** Notice attached to every response, framing how excerpts may be used. */
export const GROUNDING_NOTICE =
  "Ces extraits proviennent des programmes officiels de la présidentielle française de 2022. " +
  "Ne citer que le champ `quote`, mot à mot, en joignant `citation`. " +
  "Ne rien affirmer qui ne figure pas dans les extraits : en l'absence de passage, répondre " +
  "que le corpus ne le documente pas.";
