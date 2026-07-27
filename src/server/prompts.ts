import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PARTY_LIST } from "../domain/parties.js";
import { TOPIC_LIST } from "../domain/topics.js";

const PARTY_IDS_HINT = PARTY_LIST.map((party) => party.id).join(" | ");
const TOPIC_IDS_HINT = TOPIC_LIST.map((topic) => topic.id).join(" | ");

function userMessage(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

/** Rules shared by every workflow. This is where the server's rigour is stated. */
const RULES = [
  "Ne rien affirmer qui ne figure pas dans les passages renvoyés par les tools.",
  "Citer entre guillemets le champ `quote`, mot pour mot, et joindre le champ `citation`.",
  "Distinguer explicitement ce qui est une citation, ce qui est un résumé et ce qui est une inférence.",
  "Quand le niveau de preuve est `not_found`, écrire que le corpus ne documente pas cette position — ne jamais la déduire.",
  "Rappeler que les positions citées sont celles de la campagne présidentielle de 2022, pas nécessairement la ligne actuelle du parti.",
].map((rule) => `- ${rule}`).join("\n");

/** Registers the guided workflows exposed to clients. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "compare-topic",
    {
      title: "Comparer les partis sur un thème",
      description:
        "Produit une comparaison sourcée des positions des partis sur un thème donné, à partir " +
        "des programmes de 2022.",
      argsSchema: {
        topic: z.string().describe(`Thème à comparer (${TOPIC_IDS_HINT})`),
      },
    },
    ({ topic }) =>
      userMessage(
        `Compare les positions des partis français sur le thème « ${topic} », d'après les ` +
          `programmes de l'élection présidentielle de 2022.\n\n` +
          `Marche à suivre :\n` +
          `1. Appelle \`compare_parties\` avec ce thème.\n` +
          `2. Pour chaque parti, restitue la position telle qu'elle ressort des passages, en ` +
          `citant au moins un extrait mot pour mot.\n` +
          `3. Signale les partis dont le niveau de preuve est \`not_found\` ou ` +
          `\`weak_inference\`, sans combler le vide.\n` +
          `4. Termine par les points de convergence et de divergence qui ressortent des ` +
          `citations elles-mêmes.\n\n` +
          `Règles :\n${RULES}`,
      ),
  );

  server.registerPrompt(
    "summarize-party-position",
    {
      title: "Résumer la position d'un parti",
      description:
        "Restitue la position d'un parti sur un thème, appuyée sur des citations de son " +
        "programme de 2022.",
      argsSchema: {
        party: z.string().describe(`Parti concerné (${PARTY_IDS_HINT})`),
        topic: z.string().describe(`Thème (${TOPIC_IDS_HINT})`),
      },
    },
    ({ party, topic }) =>
      userMessage(
        `Résume la position de « ${party} » sur « ${topic} » d'après son programme de la ` +
          `présidentielle 2022.\n\n` +
          `Marche à suivre :\n` +
          `1. Appelle \`search_documents\` en filtrant sur ce parti et ce thème.\n` +
          `2. Si un passage semble ambigu ou tronqué, appelle \`get_passage\` pour lire son ` +
          `contexte avant de conclure.\n` +
          `3. Structure la réponse en mesures concrètes, chacune adossée à une citation.\n` +
          `4. Indique ce que le programme ne dit pas, si la question porte sur un point non ` +
          `couvert.\n\n` +
          `Règles :\n${RULES}`,
      ),
  );

  server.registerPrompt(
    "find-direct-quote",
    {
      title: "Vérifier une affirmation",
      description:
        "Vérifie si une affirmation prêtée à un parti correspond réellement à son programme " +
        "de 2022, ou si le corpus ne permet pas de l'établir.",
      argsSchema: {
        claim: z.string().describe("Affirmation à vérifier, telle qu'elle a été formulée"),
        party: z.string().optional().describe(`Parti auquel elle est prêtée (${PARTY_IDS_HINT})`),
      },
    },
    ({ claim, party }) =>
      userMessage(
        `Vérifie l'affirmation suivante contre les programmes de la présidentielle 2022 :\n` +
          `« ${claim} »${party ? `\nElle est prêtée à : ${party}.` : ""}\n\n` +
          `Marche à suivre :\n` +
          `1. Appelle \`search_documents\` avec les termes saillants de l'affirmation.\n` +
          `2. Appelle \`get_passage\` sur les passages les plus proches, pour vérifier qu'ils ` +
          `ne sont pas sortis de leur contexte.\n` +
          `3. Conclus par l'un de ces verdicts, et un seul : **confirmée par une citation ` +
          `directe**, **partiellement confirmée** (en précisant l'écart exact avec le texte), ` +
          `**non documentée par le corpus**, ou **contredite par le texte**.\n` +
          `4. Un verdict n'est recevable qu'accompagné du passage exact sur lequel il repose. ` +
          `L'absence de résultat n'est jamais une réfutation : c'est une absence de source.\n\n` +
          `Règles :\n${RULES}`,
      ),
  );
}
