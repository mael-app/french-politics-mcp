import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

/**
 * Builds a server instance. A fresh one is required per request since MCP SDK
 * 1.26: sharing an `McpServer` across concurrent requests can leak one client's
 * response to another.
 */
export function createServer(db: D1Database): McpServer {
  const server = new McpServer(
    { name: "civis-french-politics", version: "0.1.0" },
    {
      instructions:
        "Civis donne accès aux programmes officiels de l'élection présidentielle française de " +
        "2022 pour cinq partis : LFI (Mélenchon), RN (Le Pen), Renaissance (Macron), " +
        "PS (Hidalgo) et LR (Pécresse).\n\n" +
        "Ce serveur ne raisonne pas et ne résume pas : il renvoie des passages exacts avec " +
        "leur source. Toute affirmation sur la position d'un parti doit s'appuyer sur un " +
        "passage obtenu ici et être accompagnée de sa citation. Quand le corpus ne documente " +
        "pas un point, le dire — ne jamais inférer une position à partir du positionnement " +
        "général d'un parti.\n\n" +
        "Le corpus est limité à ce scrutin : une position citée engage la campagne de 2022, " +
        "pas nécessairement la ligne actuelle du parti.",
    },
  );

  registerTools(server, db);
  registerResources(server, db);
  registerPrompts(server);

  return server;
}
