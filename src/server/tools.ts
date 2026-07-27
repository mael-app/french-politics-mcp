import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PARTIES, PARTY_LIST, resolveParty } from "../domain/parties.js";
import { TOPIC_LIST, TOPICS, resolveTopic } from "../domain/topics.js";
import type { EvidenceLevel, PartyId } from "../domain/types.js";
import { topicKeywordMatches } from "../search/topic-match.js";
import {
  detectCoverageImbalance,
  getCorpusMeta,
  getPartyStats,
  getPassage,
  listDocuments,
  searchChunks,
  searchTopicByParty,
} from "../storage/corpus.js";
import {
  EVIDENCE_LEVEL_EXPLANATIONS,
  GROUNDING_NOTICE,
  evidenceLevelFromKeywords,
  toPassage,
} from "../utils/citations.js";

const PARTY_IDS_HINT = PARTY_LIST.map((party) => party.id).join(" | ");
const TOPIC_IDS_HINT = TOPIC_LIST.map((topic) => topic.id).join(" | ");

/** Every response is JSON so the client relays it without reinterpretation. */
function json(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function error(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}

function resolvePartyList(inputs: string[] | undefined): { parties: PartyId[]; unknown: string[] } {
  if (!inputs || inputs.length === 0) return { parties: PARTY_LIST.map((p) => p.id), unknown: [] };
  const parties: PartyId[] = [];
  const unknown: string[] = [];
  for (const input of inputs) {
    const resolved = resolveParty(input);
    if (resolved) parties.push(resolved);
    else unknown.push(input);
  }
  return { parties, unknown };
}

export function registerTools(server: McpServer, db: D1Database): void {
  server.registerTool(
    "search_documents",
    {
      title: "Rechercher dans les programmes",
      description:
        "Recherche des passages dans les programmes officiels de la présidentielle française " +
        "de 2022 (LFI, RN, Renaissance, PS, LR). Renvoie les extraits exacts avec leur source. " +
        "C'est le point d'entrée par défaut : toute affirmation sur une position de parti doit " +
        "s'appuyer sur un passage renvoyé ici. Une liste vide signifie que le corpus ne " +
        "documente pas le sujet — il faut alors le dire, et non inférer une position.",
      inputSchema: {
        query: z.string().min(2).describe("Requête en français, par exemple « âge de départ à la retraite »"),
        party: z.string().optional().describe(`Restreindre à un parti (${PARTY_IDS_HINT})`),
        topic: z.string().optional().describe(`Restreindre à un thème (${TOPIC_IDS_HINT})`),
        limit: z.number().int().min(1).max(25).optional().describe("Nombre de passages, 10 par défaut"),
      },
    },
    async ({ query, party, topic, limit }) => {
      const partyId = party ? resolveParty(party) : undefined;
      if (party && !partyId) return error(`Parti inconnu : « ${party} ». Attendu : ${PARTY_IDS_HINT}.`);
      const topicId = topic ? resolveTopic(topic) : undefined;
      if (topic && !topicId) return error(`Thème inconnu : « ${topic} ». Attendu : ${TOPIC_IDS_HINT}.`);

      const hits = await searchChunks(db, query, { party: partyId, topic: topicId, limit });
      return json({
        query,
        filters: { party: partyId ?? null, topic: topicId ?? null },
        resultCount: hits.length,
        results: hits.map((hit) => toPassage(hit.chunk, hit.document, hit.section, hit.score)),
        ...(hits.length === 0
          ? {
              notFound:
                "Aucun passage du corpus ne correspond à cette requête. Répondre que le corpus " +
                "ne documente pas ce point, sans inférer de position.",
            }
          : {}),
        notice: GROUNDING_NOTICE,
      });
    },
  );

  server.registerTool(
    "get_passage",
    {
      title: "Lire un passage et son contexte",
      description:
        "Renvoie le texte exact d'un passage identifié par son chunkId, avec les passages qui " +
        "l'entourent dans le document. À utiliser pour vérifier qu'un extrait n'est pas sorti " +
        "de son contexte avant de le citer.",
      inputSchema: {
        chunkId: z.string().describe("Identifiant renvoyé par search_documents ou compare_parties"),
        contextRadius: z
          .number()
          .int()
          .min(0)
          .max(3)
          .optional()
          .describe("Nombre de passages voisins de chaque côté, 1 par défaut"),
      },
    },
    async ({ chunkId, contextRadius }) => {
      const found = await getPassage(db, chunkId, contextRadius ?? 1);
      if (!found) return error(`Passage inconnu : « ${chunkId} ».`);

      const { chunk, document, section, context } = found;
      return json({
        passage: toPassage(chunk, document, section),
        charRange: { start: chunk.charStart, end: chunk.charEnd },
        context: context.map((neighbour) => ({
          chunkId: neighbour.id,
          position:
            neighbour.order === chunk.order
              ? "self"
              : neighbour.order < chunk.order
                ? "before"
                : "after",
          text: neighbour.text,
        })),
        notice: GROUNDING_NOTICE,
      });
    },
  );

  server.registerTool(
    "compare_parties",
    {
      title: "Comparer les partis sur un thème",
      description:
        "Pour un thème donné, renvoie les passages les plus pertinents de chaque parti, avec un " +
        "niveau de preuve. Le serveur ne rédige aucune synthèse et ne juge pas le fond : il " +
        "fournit les citations, la comparaison est à faire à partir d'elles. Un parti au niveau " +
        "`not_found` n'a pas de position documentée dans le corpus — ne rien lui prêter.",
      inputSchema: {
        topic: z.string().describe(`Thème à comparer (${TOPIC_IDS_HINT})`),
        parties: z.array(z.string()).optional().describe("Partis à comparer, les cinq par défaut"),
        passagesPerParty: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Passages par parti, 2 par défaut"),
      },
    },
    async ({ topic, parties, passagesPerParty }) => {
      const topicId = resolveTopic(topic);
      if (!topicId) return error(`Thème inconnu : « ${topic} ». Attendu : ${TOPIC_IDS_HINT}.`);

      const { parties: partyIds, unknown } = resolvePartyList(parties);
      if (unknown.length > 0) {
        return error(`Parti(s) inconnu(s) : ${unknown.join(", ")}. Attendu : ${PARTY_IDS_HINT}.`);
      }

      const [byParty, stats] = await Promise.all([
        searchTopicByParty(db, topicId, partyIds, passagesPerParty ?? 2),
        getPartyStats(db),
      ]);

      const comparison = partyIds.map((partyId) => {
        const profile = PARTIES[partyId];
        const hits = byParty.get(partyId) ?? [];
        const coverage = stats.get(partyId);
        // Coverage travels with each entry: it conditions how the evidence level
        // should be read.
        const corpusCoverage = {
          chunkCount: coverage?.chunkCount ?? 0,
          documentCount: coverage?.documentCount ?? 0,
        };
        if (hits.length === 0) {
          const level: EvidenceLevel = "not_found";
          return {
            partyId,
            party: profile.name,
            candidate: profile.candidate2022,
            evidenceLevel: level,
            evidenceExplanation: EVIDENCE_LEVEL_EXPLANATIONS[level],
            matchedKeywords: [],
            passages: [],
            corpusCoverage,
          };
        }

        // Evidence level is read off the best passage, the one a client will quote.
        const matchedKeywords = topicKeywordMatches(hits[0].chunk.text, topicId);
        const level = evidenceLevelFromKeywords(matchedKeywords);
        return {
          partyId,
          party: profile.name,
          candidate: profile.candidate2022,
          evidenceLevel: level,
          evidenceExplanation: EVIDENCE_LEVEL_EXPLANATIONS[level],
          matchedKeywords,
          passages: hits.map((hit) => toPassage(hit.chunk, hit.document, hit.section, hit.score)),
          corpusCoverage,
        };
      });

      const imbalance = detectCoverageImbalance(stats, partyIds);
      return json({
        topic: topicId,
        topicLabel: TOPICS[topicId].label,
        election: "presidentielle 2022",
        comparison,
        ...(imbalance
          ? {
              coverageWarning:
                `Le corpus est inégalement fourni selon les partis : ${PARTIES[imbalance.bestCovered].shortName} ` +
                `y est documenté ${imbalance.ratio} fois plus que ${PARTIES[imbalance.leastCovered].shortName}. ` +
                "Les partis n'ont pas publié le même volume en 2022. Un parti peu couvert peut donc paraître " +
                "plus vague ou ressortir en `not_found` sans que cela signifie qu'il n'avait pas de position : " +
                "le signaler dans la réponse plutôt que de conclure à un silence politique.",
            }
          : {}),
        notice: GROUNDING_NOTICE,
      });
    },
  );

  server.registerTool(
    "list_parties",
    {
      title: "Lister les partis du corpus",
      description:
        "Les cinq partis couverts par le corpus, avec leur candidat de 2022, le nombre de " +
        "passages disponibles et les thèmes qu'ils abordent. À consulter avant toute " +
        "comparaison, pour savoir ce que le corpus contient réellement.",
      inputSchema: {},
    },
    async () => {
      const [meta, stats] = await Promise.all([getCorpusMeta(db), getPartyStats(db)]);
      return json({
        election: "presidentielle",
        year: 2022,
        corpusVersion: meta.corpusVersion,
        parties: PARTY_LIST.map((profile) => ({
          id: profile.id,
          name: profile.name,
          shortName: profile.shortName,
          candidate2022: profile.candidate2022,
          bloc: profile.bloc,
          chunkCount: stats.get(profile.id)?.chunkCount ?? 0,
          topicsCovered: stats.get(profile.id)?.topics ?? [],
        })),
      });
    },
  );

  server.registerTool(
    "list_sources",
    {
      title: "Lister les documents sources",
      description:
        "Les documents primaires qui composent le corpus, avec leur URL, leur nature et leur " +
        "empreinte SHA-256. À utiliser pour indiquer précisément d'où vient une citation, ou " +
        "pour vérifier l'étendue exacte de ce que le corpus couvre.",
      inputSchema: {
        party: z.string().optional().describe(`Restreindre à un parti (${PARTY_IDS_HINT})`),
      },
    },
    async ({ party }) => {
      const partyId = party ? resolveParty(party) : undefined;
      if (party && !partyId) return error(`Parti inconnu : « ${party} ». Attendu : ${PARTY_IDS_HINT}.`);

      const [meta, documents] = await Promise.all([
        getCorpusMeta(db),
        listDocuments(db, partyId),
      ]);
      return json({
        corpusVersion: meta.corpusVersion,
        generatedAt: meta.generatedAt,
        scope:
          "Documents programmatiques de l'élection présidentielle française de 2022 : programmes " +
          "officiels, livrets et fiches thématiques, déclarations officielles à la Commission " +
          "nationale de contrôle de la campagne, réponses écrites à des questionnaires publics. " +
          "Le corpus exclut les discours, les communiqués de presse et tout autre scrutin.",
        sourceCount: documents.length,
        sources: documents.map((document) => ({
          documentId: document.id,
          partyId: document.party,
          party: PARTIES[document.party].name,
          candidate: PARTIES[document.party].candidate2022,
          title: document.title,
          sourceType: document.sourceType,
          sourceUrl: document.sourceUrl,
          ...(document.originalUrl
            ? {
                originalUrl: document.originalUrl,
                archiveNote:
                  "Le site de campagne d'origine n'est plus accessible : la source citée est " +
                  "l'archive Wayback du document.",
              }
            : {}),
          checksumSha256: document.checksum,
          chunkCount: document.chunkCount,
        })),
      });
    },
  );
}
