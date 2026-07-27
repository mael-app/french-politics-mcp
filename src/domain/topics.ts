import { normalizeLabel } from "../utils/text.js";
import { TOPIC_IDS, type TopicId } from "./types.js";

export interface TopicDefinition {
  id: TopicId;
  label: string;
  description: string;
  /**
   * Topic keywords. They drive chunk tagging at ingestion, the `compare_parties`
   * query, and the evidence level of a passage.
   */
  keywords: string[];
}

export const TOPICS: Record<TopicId, TopicDefinition> = {
  retraites: {
    id: "retraites",
    label: "Retraites",
    description: "Âge de départ, durée de cotisation, pensions, régimes spéciaux, pénibilité.",
    keywords: [
      "retraite", "retraites", "pension", "pensions", "cotisation", "cotisations",
      "annuités", "trimestres", "âge de départ", "régimes spéciaux", "pénibilité",
      "capitalisation", "répartition", "minimum vieillesse",
    ],
  },
  immigration: {
    id: "immigration",
    label: "Immigration et asile",
    description: "Entrées et séjours, droit d'asile, naturalisation, regroupement familial, frontières.",
    keywords: [
      "immigration", "immigré", "immigrés", "migrant", "migrants", "asile", "réfugié",
      "réfugiés", "étranger", "étrangers", "naturalisation", "nationalité",
      "regroupement familial", "titre de séjour", "sans-papiers", "expulsion",
      "frontières", "schengen", "aide médicale d'état", "droit du sol",
    ],
  },
  securite: {
    id: "securite",
    label: "Sécurité et justice",
    description: "Police, gendarmerie, délinquance, peines, prisons, terrorisme.",
    keywords: [
      "sécurité", "police", "policier", "policiers", "gendarmerie", "délinquance",
      "criminalité", "justice", "peine", "peines", "prison", "prisons", "magistrat",
      "magistrats", "terrorisme", "violences", "récidive", "impunité", "tribunal",
    ],
  },
  ecologie: {
    id: "ecologie",
    label: "Écologie et énergie",
    description: "Climat, transition énergétique, nucléaire, renouvelables, biodiversité, pollution.",
    keywords: [
      "écologie", "écologique", "climat", "climatique", "carbone", "transition énergétique",
      "énergie", "nucléaire", "renouvelable", "renouvelables", "éolien", "éoliennes",
      "solaire", "biodiversité", "pollution", "environnement", "gaz à effet de serre",
      "rénovation thermique", "planification écologique",
    ],
  },
  sante: {
    id: "sante",
    label: "Santé",
    description: "Hôpital, sécurité sociale, accès aux soins, déserts médicaux, dépendance.",
    keywords: [
      "santé", "hôpital", "hôpitaux", "soignant", "soignants", "médecin", "médecins",
      "infirmier", "infirmiers", "sécurité sociale", "assurance maladie", "remboursement",
      "désert médical", "déserts médicaux", "ehpad", "dépendance", "grand âge", "soins",
    ],
  },
  education: {
    id: "education",
    label: "Éducation et recherche",
    description: "École, enseignants, université, formation, recherche publique.",
    keywords: [
      "école", "écoles", "éducation", "enseignant", "enseignants", "professeur",
      "professeurs", "élève", "élèves", "collège", "lycée", "université", "étudiant",
      "étudiants", "recherche", "formation", "apprentissage", "scolaire", "baccalauréat",
    ],
  },
  institutions: {
    id: "institutions",
    label: "Institutions et démocratie",
    description: "Constitution, République, référendum, proportionnelle, décentralisation, laïcité.",
    keywords: [
      "constitution", "constitutionnel", "république", "référendum", "ric",
      "proportionnelle", "assemblée nationale", "sénat", "démocratie", "élection",
      "élections", "vote", "décentralisation", "collectivités", "laïcité",
      "sixième république", "institutions", "séparation des pouvoirs",
    ],
  },
  travail: {
    id: "travail",
    label: "Travail et emploi",
    description: "Salaires, smic, chômage, temps de travail, droit du travail, syndicats.",
    keywords: [
      "travail", "emploi", "salaire", "salaires", "smic", "chômage", "chômeurs",
      "temps de travail", "35 heures", "code du travail", "syndicat", "syndicats",
      "précarité", "cdi", "cdd", "pouvoir d'achat", "revalorisation", "entreprise",
    ],
  },
  fiscalite: {
    id: "fiscalite",
    label: "Fiscalité et budget",
    description: "Impôts, TVA, ISF, dette publique, dépenses de l'État, fraude fiscale.",
    keywords: [
      "impôt", "impôts", "fiscalité", "fiscal", "tva", "isf", "csg", "taxe", "taxes",
      "dette", "déficit", "budget", "dépenses publiques", "fraude fiscale",
      "évasion fiscale", "héritage", "succession", "cotisations patronales", "niches fiscales",
    ],
  },
  europe: {
    id: "europe",
    label: "Europe et international",
    description: "Union européenne, traités, souveraineté, otan, défense, diplomatie.",
    keywords: [
      "europe", "européen", "européenne", "union européenne", "bruxelles", "traité",
      "traités", "euro", "souveraineté", "otan", "défense", "armée", "diplomatie",
      "international", "commission européenne", "frontex",
    ],
  },
};

export const TOPIC_LIST: TopicDefinition[] = TOPIC_IDS.map((id) => TOPICS[id]);

export function isTopicId(value: string): value is TopicId {
  return (TOPIC_IDS as readonly string[]).includes(value);
}

/** Resolves a topic id from a free-form label such as "Retraites". */
export function resolveTopic(input: string): TopicId | undefined {
  const normalized = normalizeLabel(input);
  if (isTopicId(normalized)) return normalized;
  for (const topic of TOPIC_LIST) {
    if (normalizeLabel(topic.label) === normalized) return topic.id;
  }
  return undefined;
}
