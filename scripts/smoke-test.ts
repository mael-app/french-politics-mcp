/**
 * End-to-end check against a running server.
 *
 * Typecheck and bundle prove the code compiles; they say nothing about whether the
 * MCP surface answers. This drives a real client session over Streamable HTTP and
 * asserts the guarantees the server exists for: quoting every party, and returning
 * nothing at all when the corpus documents nothing.
 *
 * Usage: npm run smoke [base-url]
 */
import { PARTY_LIST } from "../src/domain/parties.js";

const BASE_URL = process.argv[2] ?? "http://localhost:8787";
const ENDPOINT = `${BASE_URL}/mcp`;

let sessionId: string | null = null;
let nextId = 1;

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) base["mcp-session-id"] = sessionId;
  return base;
}

async function rpc(method: string, params: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const captured = response.headers.get("mcp-session-id");
  if (captured) sessionId = captured;

  const raw = await response.text();
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${raw.slice(0, 200)}`);

  // Streamable HTTP may answer as a server-sent event.
  const payload = raw.includes("data:")
    ? (raw.split("\n").find((line) => line.startsWith("data:")) ?? "").slice(5).trim()
    : raw;
  const parsed = JSON.parse(payload);
  if (parsed.error) throw new Error(`${method}: ${JSON.stringify(parsed.error)}`);
  return parsed.result;
}

/** Tool results are JSON encoded inside a text content block. */
async function callTool(name: string, args: Record<string, unknown>) {
  const result = (await rpc("tools/call", { name, arguments: args })) as {
    content: Array<{ text: string }>;
  };
  return JSON.parse(result.content[0].text);
}

const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  console.log(`  FAIL ${label}${detail ? ` (${detail})` : ""}`);
  failures.push(label);
}

const health = await fetch(`${BASE_URL}/health`);
check("health endpoint answers", health.ok, `HTTP ${health.status}`);

const init = (await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "civis-smoke", version: "1.0.0" },
})) as { capabilities: Record<string, unknown> };
check(
  "initialize advertises tools, resources and prompts",
  ["tools", "resources", "prompts"].every((key) => key in init.capabilities),
  Object.keys(init.capabilities).join(", "),
);
await fetch(ENDPOINT, {
  method: "POST",
  headers: headers(),
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
});

const EXPECTED_TOOLS = [
  "search_documents",
  "get_passage",
  "compare_parties",
  "list_parties",
  "list_sources",
];
const tools = (await rpc("tools/list", {})) as { tools: Array<{ name: string }> };
const toolNames = tools.tools.map((tool) => tool.name);
check(
  "every tool is registered",
  EXPECTED_TOOLS.every((name) => toolNames.includes(name)),
  toolNames.join(", "),
);

const prompts = (await rpc("prompts/list", {})) as { prompts: unknown[] };
check("prompts are registered", prompts.prompts.length === 3, `${prompts.prompts.length}`);

const resources = (await rpc("resources/list", {})) as { resources: unknown[] };
check("resources are registered", resources.resources.length >= 7, `${resources.resources.length}`);

// The core guarantee: a comparison quotes every party from a real source.
const comparison = await callTool("compare_parties", { topic: "retraites", passagesPerParty: 1 });
check(
  "comparison covers every party",
  comparison.comparison.length === PARTY_LIST.length,
  `${comparison.comparison.length}`,
);
for (const entry of comparison.comparison) {
  const passage = entry.passages[0];
  check(
    `  ${entry.partyId} is quoted with its source`,
    Boolean(passage?.quote?.length > 40 && passage?.sourceUrl?.startsWith("https://")),
    entry.evidenceLevel,
  );
}

const search = await callTool("search_documents", { query: "âge de départ à la retraite" });
check("search returns sourced passages", search.resultCount > 0, `${search.resultCount}`);

// The other core guarantee: silence rather than a plausible-looking non-answer.
const absent = await callTool("search_documents", {
  query: "réglementation des cryptomonnaies et de la blockchain",
});
check(
  "a query outside the corpus returns nothing",
  absent.resultCount === 0 && typeof absent.notFound === "string",
  `${absent.resultCount} results`,
);

const passage = await callTool("get_passage", { chunkId: search.results[0].chunkId });
check(
  "a passage can be re-read with its context",
  passage.passage.quote === search.results[0].quote && passage.context.length > 0,
  `${passage.context.length} neighbours`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
