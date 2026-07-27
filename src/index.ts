import { createMcpHandler } from "agents/mcp";
import { createServer } from "./server/createServer.js";

/**
 * Civis: stateless, unauthenticated remote MCP server.
 *
 * The corpus lives in D1, so the Worker bundles no data and builds no index at
 * startup. Waiting on D1 is I/O, which does not count against the free plan's
 * 10 ms CPU budget per request.
 *
 * No session state, hence no Durable Object. Transport is Streamable HTTP on
 * `/mcp`; SSE is deprecated and not exposed.
 */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Promise.resolve(
        Response.json({
          name: "civis-french-politics",
          status: "ok",
          endpoint: "/mcp",
          transport: "streamable-http",
          description:
            "Serveur MCP de citation et comparaison des programmes de la présidentielle " +
            "française de 2022.",
        }),
      );
    }

    // Fresh instance per request, see createServer().
    return createMcpHandler(createServer(env.DB))(request, env, ctx);
  },
};
