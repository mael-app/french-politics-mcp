import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PARTIES, PARTY_LIST, isPartyId } from "../domain/parties.js";
import { TOPIC_LIST } from "../domain/topics.js";
import {
  getCorpusMeta,
  getPartyStats,
  getTopicCounts,
  getTopicCountsForParty,
  listDocuments,
} from "../storage/corpus.js";

function jsonResource(uri: string, payload: unknown) {
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * Registers read-only structured context. Where tools answer a question, resources
 * describe what the corpus holds.
 */
export function registerResources(server: McpServer, db: D1Database): void {
  server.registerResource(
    "party-profile",
    new ResourceTemplate("party://{partyId}", {
      list: async () => ({
        resources: PARTY_LIST.map((profile) => ({
          uri: `party://${profile.id}`,
          name: `${profile.shortName} — ${profile.candidate2022}`,
          description: `Profil de corpus : ${profile.name}, présidentielle 2022`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Profil d'un parti",
      description:
        "Ce que le corpus contient pour un parti : candidat, documents sources, thèmes " +
        "couverts, volume de passages.",
    },
    async (uri, { partyId }) => {
      const id = String(partyId);
      if (!isPartyId(id)) {
        return jsonResource(uri.href, {
          error: `Parti inconnu : « ${id} ».`,
          available: PARTY_LIST.map((profile) => profile.id),
        });
      }

      const profile = PARTIES[id];
      const [meta, stats, topics, documents] = await Promise.all([
        getCorpusMeta(db),
        getPartyStats(db),
        getTopicCountsForParty(db, id),
        listDocuments(db, id),
      ]);

      return jsonResource(uri.href, {
        id: profile.id,
        name: profile.name,
        shortName: profile.shortName,
        candidate2022: profile.candidate2022,
        bloc: profile.bloc,
        election: "presidentielle 2022",
        chunkCount: stats.get(id)?.chunkCount ?? 0,
        topicCoverage: Object.fromEntries(topics),
        sources: documents.map((document) => ({
          title: document.title,
          sourceType: document.sourceType,
          sourceUrl: document.sourceUrl,
          checksumSha256: document.checksum,
        })),
        lastUpdated: meta.generatedAt,
      });
    },
  );

  server.registerResource(
    "election",
    "election://presidentielle-2022",
    {
      title: "Présidentielle 2022",
      description: "Portée et limites du corpus couvert par ce serveur.",
      mimeType: "application/json",
    },
    async (uri) => {
      const meta = await getCorpusMeta(db);
      return jsonResource(uri.href, {
        election: "presidentielle",
        year: 2022,
        rounds: "10 et 24 avril 2022",
        corpusVersion: meta.corpusVersion,
        generatedAt: meta.generatedAt,
        documentCount: meta.documentCount,
        chunkCount: meta.chunkCount,
        parties: PARTY_LIST.map((profile) => ({
          id: profile.id,
          name: profile.name,
          candidate: profile.candidate2022,
        })),
        scope:
          "Un document programmatique officiel par parti, pour ce seul scrutin. Le corpus " +
          "exclut les déclarations médiatiques, les programmes législatifs et tout autre " +
          "scrutin : une position trouvée ici engage la campagne présidentielle de 2022, " +
          "pas nécessairement la ligne actuelle du parti.",
      });
    },
  );

  server.registerResource(
    "topics",
    "topics://catalog",
    {
      title: "Catalogue des thèmes",
      description: "Les thèmes comparables et les mots-clés qui les définissent.",
      mimeType: "application/json",
    },
    async (uri) => {
      const counts = await getTopicCounts(db);
      return jsonResource(uri.href, {
        topics: TOPIC_LIST.map((topic) => ({
          id: topic.id,
          label: topic.label,
          description: topic.description,
          keywords: topic.keywords,
          chunkCount: counts.get(topic.id) ?? 0,
        })),
        note:
          "Un passage est rattaché à un thème quand au moins deux mots-clés distincts du thème " +
          "y figurent. Ce rattachement est un signal lexical, pas une analyse du contenu.",
      });
    },
  );
}
