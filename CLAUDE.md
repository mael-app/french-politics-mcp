# Civis — french-politics-mcp

Remote MCP server exposing the official manifestos of the 2022 French presidential
election for five parties (LFI, RN, Renaissance, PS, LR). It retrieves exact passages
with their source and never paraphrases: the client LLM writes the synthesis, the
server only supplies verifiable quotes.

## Core rule

**The server must prefer saying nothing over implying a source it does not have.**
Every behaviour follows from this: a query with no match returns zero results and an
explicit `notFound`, `compare_parties` reports `not_found` per party rather than
inferring a stance, and quotes are byte-identical to the source document.

## Stack

Cloudflare Workers, TypeScript, D1 (SQLite) with FTS5. Stateless: no Durable Object,
Streamable HTTP on `/mcp` only. The Worker bundles no data; the corpus lives in D1.

A fresh `McpServer` instance is created per request (required since SDK 1.26).

## Layout

```
src/index.ts        fetch handler, health check, createMcpHandler
src/server/         MCP surface: tools, resources, prompts
src/domain/         types, party metadata, topic taxonomy
src/search/         French language pipeline, FTS5 query builder
src/storage/        D1 access: search, passages, aggregates
ingest/             local pipeline: fetch, extract, normalize, build-sql
data/corpus/        corpus.json, the normalized artefact (generated, gitignored)
data/sql/           schema.sql (handwritten), seed.sql (generated, gitignored)
data/text/          extracted text, committed as consultable evidence
data/raw/           downloaded sources, gitignored except checksums.json
```

## Commands

```bash
npm install              # also installs the git hooks
npm run dev              # wrangler dev on :8787
npm run typecheck
npm run ingest           # fetch, extract, normalize, build-sql
npm run corpus:check     # verify corpus invariants
npm run stem:check       # verify stemmer convergence
npm run db:reset:local   # apply schema + seed to local SQLite
```

Ingestion requires poppler (`pdftotext`). It runs locally only; the Worker never
depends on it.

On a fresh clone, `corpus.json` and `seed.sql` are absent. Rebuild them offline from
the committed `data/text/` with `npm run ingest:normalize && npm run ingest:sql`.
Only `ingest:fetch` touches the network.

**Never run `wrangler deploy` or `db:reset:remote`.** The Cloudflare account on this
machine is not the project's. Deployment is the maintainer's job.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:
typecheck, stemmer check, offline corpus rebuild, corpus invariants, Worker bundle.
It never contacts Cloudflare. Any change to the ingestion pipeline or the stemmer must
keep `corpus:check` green, since CI rebuilds the corpus from the committed
`data/text/`.

Actions are pinned by commit SHA. Dependabot keeps them current and auto-merges patch
and minor updates once CI passes; major updates need review. See `.github/README.md`
for the branch protection settings this relies on.

## Invariants

1. `chunk.text` equals `sourceText.slice(charStart, charEnd)` exactly. `corpus:check`
   enforces it. This is what makes a citation verifiable.
2. Indexed text is pre-stemmed by `src/search/french.ts`; queries go through the same
   code. Changing the stemmer requires regenerating the seed.
3. The corpus covers one election only. Positions are those of the 2022 campaign, not
   a party's current line.
4. Scope is programmatic documents: manifestos, thematic booklets, official
   declarations, written answers to public questionnaires. No speeches, no press
   releases, no other elections.
5. Party coverage is uneven because parties published unequally. Never rebalance by
   truncating; surface the imbalance instead (`coverageWarning`, per-party
   `corpusCoverage`, and a per-party cap on unfiltered search).
6. Respect `robots.txt` when adding sources. Two hosts refuse crawling; use the
   permissive mirrors documented in `ingest/manifest.ts`.

## Commits

Conventional Commits, enforced locally by a `commit-msg` hook (husky + commitlint).
A `pre-commit` hook runs the typecheck. Format:
`<type>(<scope>): <description>`, lowercase, no trailing period.

## Code style

Comments in **English**, even though user-facing strings are in French. Tool
descriptions, notices and prompt templates are product content and stay French.

- Document **exported functions only**, with a short JSDoc. Private helpers stay bare
  unless their behaviour is genuinely surprising.
- Explain *why*, never *what*. If a comment restates the code, delete it.
- No em dashes, no decorative separators, no section banners.
- Keep it short. One or two sentences beats a paragraph.
- Follow SOLID and DRY: one responsibility per module, no duplicated logic. The
  language pipeline is shared between ingestion and runtime for exactly this reason.

## Open source hygiene

The repository is public. Before committing, check that no credential, account
identifier or personal data is added. `database_id` in `wrangler.jsonc` is a
placeholder and must stay one.

Code is Apache-2.0. The manifesto text under `data/text/` is third-party copyrighted
content, reproduced for documentary and citation purposes and explicitly outside the
license. See NOTICE. When adding a source, record its URL, checksum and rights
holder, and keep the scope programmatic.
