# Security Policy

## Reporting a vulnerability

**Open an issue** on this repository: https://github.com/mael-app/french-politics-mcp/issues

Public reporting is a deliberate choice here. Civis holds no credentials, no user
accounts and no personal data: it is a read-only server over a corpus of political
manifestos that are themselves public documents. There is no user base to protect
during an embargo, so an open report gets fixed faster than a private one.

Please include:

- what you found and where, ideally with a file or endpoint
- how to reproduce it
- what an attacker could actually achieve

You can expect an acknowledgement within a few days. This is a personal project with
no on-call rotation, so please be patient.

If you genuinely believe a finding should not be public before a fix ships, say so in
a short issue without the details and a private channel will be arranged.

## Supported versions

Only the current `main` branch is supported. There are no maintained release
branches.

## Scope

In scope:

- the Worker and the MCP surface under `src/`
- the ingestion pipeline under `ingest/`
- the CI and automation under `.github/`
- dependency vulnerabilities affecting the above

Out of scope:

- the content of the manifestos themselves, which is third-party material reproduced
  as-is (see [NOTICE](NOTICE))
- findings on a deployment you host yourself, unless the cause is in this code
- the security posture of the source websites listed in `ingest/manifest.ts`

## What this server does and does not do

Worth knowing before reporting, because it rules out whole classes of finding:

- **No authentication, by design.** The MCP endpoint is public and read-only. Anyone
  can query it. That is not a vulnerability.
- **No writes at runtime.** The corpus is loaded from a generated SQL seed. The Worker
  only reads from D1; no tool mutates anything.
- **No secrets in the repository.** The `database_id` in `wrangler.jsonc` is a
  placeholder. There are no API tokens, and CI never contacts Cloudflare: it bundles
  the Worker with `wrangler deploy --dry-run`.
- **No user input reaches SQL directly.** Queries use bound parameters, and the FTS5
  match expression is built from stemmed terms restricted to `[a-z0-9]` and quoted as
  literals.

Findings that are genuinely interesting: a way to make the server return a quote that
does not match its source document, a way to make it fabricate or misattribute a
citation, an injection through the FTS5 query builder, or a supply-chain issue in the
ingestion pipeline.

## Corpus integrity

Misquotation is the failure mode this project cares about most. Every source document
carries a SHA-256 checksum in `data/raw/checksums.json`, and `npm run corpus:check`
verifies that each stored passage is exactly the slice of source text it claims to be.

If you find a passage whose text does not match its source, report it as a security
issue rather than a bug. Trustworthy quoting is the entire point of the server.
