import type { PartyId, SourceType } from "../src/domain/types.js";
import { LFI_PAGES } from "./lfi-pages.js";
import { RENAISSANCE_PAGES } from "./renaissance-pages.js";

export interface SourceSpec {
  id: string;
  party: PartyId;
  title: string;
  /** URL actually downloaded, and the one that gets cited. */
  sourceUrl: string;
  /** Original URL when `sourceUrl` points to a Wayback capture. */
  originalUrl?: string;
  sourceType: SourceType;
  format: "pdf" | "html";
  /**
   * Poppler output mode. The default suits laid-out manifestos; `raw` follows the
   * PDF content stream and is the only correct choice for the official
   * declarations, whose columns would otherwise interleave.
   */
  pdfMode?: "default" | "raw";
  fileName: string;
  /**
   * Groups pages belonging to one work. An online manifesto is split into dozens
   * of chapters, each a document in its own right so citations point at the exact
   * page, but `list_sources` presents them together.
   */
  collection?: string;
}

/**
 * RN thematic booklets, the detailed project the manifesto only summarises.
 *
 * They are served by `mlafrance.fr`, whose `robots.txt` forbids any automated
 * crawl (`Disallow: /`), so we use `rassemblementnational.fr`, which serves them
 * identically under `Allow: /`. What remains exclusive to mlafrance.fr is press
 * material and speeches, outside the programmatic scope anyway.
 */
const RN_BOOKLETS: Array<[slug: string, theme: string]> = [
  ["projet-controle-de-limmigration", "le contrôle de l'immigration"],
  ["projet-la-defense", "la défense"],
  ["projet-la-securite", "la sécurité"],
  ["projet-outre-mer", "l'outre-mer"],
  ["projet-lecologie", "l'écologie"],
  ["projet-la-protection-de-lenfance", "la protection de l'enfance"],
  ["projet-le-tourisme", "le tourisme"],
  ["projet-la-sante", "la santé"],
  ["projet-le-patrimoine", "le patrimoine"],
  ["projet-la-lutte-contre-la-fraude", "la lutte contre la fraude"],
  ["projet-l-agriculture", "l'agriculture"],
  ["projet-la-famille", "la famille"],
  ["projet-l-ecole", "l'école"],
  ["projet-la-protection-des-animaux", "la protection des animaux"],
  ["projet-le-numerique", "le numérique"],
  ["projet-la-jeunesse", "la jeunesse"],
  ["projet-les-porteurs-de-handicap", "les porteurs de handicap"],
];

const RN_BOOKLET_SOURCES: SourceSpec[] = RN_BOOKLETS.map(([slug, theme]) => ({
  id: `rn-${slug}-2022`,
  party: "rn",
  title: `Le projet de Marine Le Pen — ${theme}`,
  sourceUrl: `https://rassemblementnational.fr/documents/projet/${slug}.pdf`,
  sourceType: "thematic_booklet",
  format: "pdf",
  fileName: `rn-${slug}-2022.pdf`,
  collection: "Le projet de Marine Le Pen — livrets thématiques",
}));

/**
 * Thematic pages of Valérie Pécresse's project, still served by her campaign site
 * (`robots.txt` has an empty `Disallow:`, so everything is allowed). They detail
 * what the 16-page brochure only outlines. Slugs read from `/wp-json/wp/v2/projet`.
 */
const LR_TOPIC_PAGES = [
  "pouvoir-dachat", "securite-justice", "immigration", "proteger-nos-aines",
  "pour-une-societe-du-travail-du-pouvoir-dachat-et-de-la-promotion-professionnelle",
  "energie", "environnement", "competitivite", "education", "handicap",
  "egalite-femmes-hommes", "defense", "decentralisation", "europe", "transports",
  "fiscalite", "culture", "reforme-de-letat", "les-francais-de-letranger",
  "pauvrete", "proteger-les-francais-et-defendre-nos-interets-dans-le-monde",
  "ruralite", "numerique", "finances-publiques", "enseignement-superieur-et-recherche",
  "sport", "jeunesse", "famille", "sante", "logement", "agriculture",
];

const LR_TOPIC_SOURCES: SourceSpec[] = LR_TOPIC_PAGES.map((slug) => ({
  id: `lr-projet-${slug}-2022`,
  party: "lr",
  title: `Le projet de Valérie Pécresse — ${slug.replace(/-/g, " ")}`,
  sourceUrl: `https://valeriepecresse.fr/projet/${slug}/`,
  sourceType: "thematic_booklet",
  format: "html",
  fileName: `lr-projet-${slug}-2022.html`,
  collection: "Le projet de Valérie Pécresse — fiches thématiques",
}));

/**
 * LFI thematic booklets and plans, the detailed form of a manifesto whose campaign
 * PDF is only a summary. See `lfi-pages.ts` for provenance and the robots.txt
 * question.
 */
const LFI_SOURCES: SourceSpec[] = LFI_PAGES.map(([kind, path, id, title]) => ({
  id: `lfi-${id}`,
  party: "lfi",
  title:
    kind === "plans-2022"
      ? `L'Avenir en commun, plan — ${title}`
      : `L'Avenir en commun, livret — ${title}`,
  sourceUrl: `https://melenchon2027.fr/${path}/`,
  sourceType: "thematic_booklet",
  format: "html",
  fileName: `lfi-${id}.html`,
  collection:
    kind === "plans-2022"
      ? "L'Avenir en commun — plans détaillés"
      : "L'Avenir en commun — livrets thématiques",
}));

/**
 * Thematic pages of Emmanuel Macron's project. See `renaissance-pages.ts`: they
 * survive only in the Wayback archive.
 */
const RENAISSANCE_SOURCES: SourceSpec[] = RENAISSANCE_PAGES.map(([slug, timestamp, title]) => ({
  id: `renaissance-notre-action-${slug}-2022`,
  party: "renaissance",
  title: `Emmanuel Macron avec vous — ${title}`,
  sourceUrl: `https://web.archive.org/web/${timestamp}id_/https://avecvous.fr/notre-action/${slug}`,
  originalUrl: `https://avecvous.fr/notre-action/${slug}`,
  sourceType: "thematic_booklet",
  format: "html",
  fileName: `renaissance-notre-action-${slug}-2022.html`,
  collection: "Emmanuel Macron avec vous — fiches thématiques",
}));

/**
 * Official declarations filed with the national campaign control commission. This
 * is the only document all five candidates produced in the same format and under
 * the same constraints, giving a comparison point independent of how much each
 * published elsewhere.
 *
 * Set in columns, so `pdfMode: "raw"` is mandatory: the default mode interleaves
 * the columns and fabricates sentences.
 */
const CNCCEP_DECLARATIONS: Array<[party: PartyId, file: string, candidate: string]> = [
  ["lfi", "Candidat-08-Jean-Luc-Melenchon-Declaration-accessible", "Jean-Luc Mélenchon"],
  ["rn", "Candidat-06-Marine-Le-Pen-Declaration-accessible", "Marine Le Pen"],
  ["renaissance", "Candidat-07-Emmanuel-Macron-Declaration", "Emmanuel Macron"],
  ["ps", "Candidat-03-Anne-Hidalgo-Declaration", "Anne Hidalgo"],
  ["lr", "Candidat-09-Valerie-Pecresse-Declaration-accessible", "Valérie Pécresse"],
];

const CNCCEP_SOURCES: SourceSpec[] = CNCCEP_DECLARATIONS.map(([party, file, candidate]) => ({
  id: `${party}-cnccep-declaration-2022`,
  party,
  title: `Déclaration officielle de ${candidate} (profession de foi)`,
  sourceUrl: `https://www.cnccep.fr/pdfs/${file}.pdf`,
  sourceType: "campaign_leaflet",
  format: "pdf",
  pdfMode: "raw",
  fileName: `${party}-cnccep-declaration-2022.pdf`,
  collection: "Déclarations officielles CNCCEP",
}));

/**
 * Candidates' written answers to the TDIE questionnaire on transport and mobility.
 *
 * These are reasoned policy answers to a public questionnaire, not campaign
 * communication. They are included by a uniform rule, everyone who answered,
 * rather than picked to pad the thinner parties. Emmanuel Macron did not answer,
 * which is itself a fact about corpus coverage.
 */
const TDIE_RESPONSES: Array<[party: PartyId, file: string, candidate: string]> = [
  ["lfi", "Reponse-J.-L.-Melenchon-questionnaire-TDIE-2022", "Jean-Luc Mélenchon"],
  ["rn", "Reponse-M.-Le-Pen-questionnaire-TDIE-2022", "Marine Le Pen"],
  ["ps", "Reponse-A.-Hidalgo-questionnaire-TDIE-2022", "Anne Hidalgo"],
  ["lr", "Reponse-V.-Pecresse-questionnaire-TDIE-2022", "Valérie Pécresse"],
];

const TDIE_SOURCES: SourceSpec[] = TDIE_RESPONSES.map(([party, file, candidate]) => ({
  id: `${party}-tdie-transports-2022`,
  party,
  title: `${candidate} — réponses au questionnaire TDIE sur les transports et les mobilités`,
  sourceUrl: `https://tdie.eu/storage/2022/07/${file}.pdf`,
  sourceType: "thematic_booklet",
  format: "pdf",
  fileName: `${party}-tdie-transports-2022.pdf`,
  collection: "Questionnaire TDIE — transports et mobilités",
}));

/**
 * Overseas territories booklet. The site's `projet/outre-mer/` page renders no
 * text because its content sits in a JavaScript accordion; this PDF covers the
 * same ground.
 */
const LR_OUTRE_MER: SourceSpec = {
  id: "lr-projet-outre-mer-2022",
  party: "lr",
  title: "Le projet de Valérie Pécresse — outre-mer",
  sourceUrl: "https://valeriepecresse.fr/wp-content/uploads/2022/03/OUTREMER-VP2022-HD1.pdf",
  sourceType: "thematic_booklet",
  format: "pdf",
  fileName: "lr-projet-outre-mer-2022.pdf",
  collection: "Le projet de Valérie Pécresse — fiches thématiques",
};

export const SOURCES: SourceSpec[] = [
  ...TDIE_SOURCES,
  LR_OUTRE_MER,
  ...CNCCEP_SOURCES,
  ...LFI_SOURCES,
  ...RENAISSANCE_SOURCES,
  ...RN_BOOKLET_SOURCES,
  ...LR_TOPIC_SOURCES,
  {
    id: "lfi-avenir-en-commun-2022",
    party: "lfi",
    title: "L'Avenir en commun — le programme de l'Union populaire (version abrégée)",
    sourceUrl:
      "https://web.archive.org/web/20220404215937if_/https://melenchon2022.fr/wp-content/uploads/2022/04/LAvenir-en-commun-le-programme-en-version-abregee.pdf",
    originalUrl:
      "https://melenchon2022.fr/wp-content/uploads/2022/04/LAvenir-en-commun-le-programme-en-version-abregee.pdf",
    sourceType: "official_program",
    format: "pdf",
    fileName: "lfi-avenir-en-commun-2022.pdf",
  },
  {
    id: "rn-m-la-france-2022",
    party: "rn",
    title: "M la France — manifeste et programme présidentiel de Marine Le Pen",
    sourceUrl: "https://mlafrance.fr/pdfs/manifeste-m-la-france-programme-presidentiel.pdf",
    sourceType: "official_program",
    format: "pdf",
    fileName: "rn-m-la-france-2022.pdf",
  },
  {
    id: "renaissance-avec-vous-2022",
    party: "renaissance",
    title: "Emmanuel Macron avec vous — projet pour l'élection présidentielle 2022",
    sourceUrl:
      "https://web.archive.org/web/20220327113043if_/https://avecvous.fr/wp-content/uploads/2022/03/Emmanuel-Macron-Avec-Vous-24-pages.pdf",
    originalUrl:
      "https://avecvous.fr/wp-content/uploads/2022/03/Emmanuel-Macron-Avec-Vous-24-pages.pdf",
    sourceType: "official_program",
    format: "pdf",
    fileName: "renaissance-avec-vous-2022.pdf",
  },
  {
    id: "ps-hidalgo-programme-2022",
    party: "ps",
    title: "Anne Hidalgo — programme officiel, mes propositions pour la France",
    sourceUrl:
      "https://web.archive.org/web/20260308164648if_/https://www.2022avechidalgo.fr/2022avechidalgo/pages/208/attachments/original/1645795527/Anne_Hidalgo_Programme_officiel_en_A4_l%C3%A9ger_1645795527.pdf",
    originalUrl:
      "https://www.2022avechidalgo.fr/2022avechidalgo/pages/208/attachments/original/1645795527/Anne_Hidalgo_Programme_officiel_en_A4_leger_1645795527.pdf",
    sourceType: "official_program",
    format: "pdf",
    fileName: "ps-hidalgo-programme-2022.pdf",
  },
  {
    id: "lr-le-courage-de-faire-2022",
    party: "lr",
    title: "Le courage de faire — projet présidentiel de Valérie Pécresse",
    sourceUrl: "https://valeriepecresse.fr/wp-content/uploads/2022/03/Programme-Valerie-Pecresse.pdf",
    sourceType: "official_program",
    format: "pdf",
    fileName: "lr-le-courage-de-faire-2022.pdf",
  },
];
