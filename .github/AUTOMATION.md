# Repository automation

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | push to `main`, every pull request | typecheck, stemmer check, offline corpus rebuild, corpus invariants, Worker bundle |
| `dependabot-auto-merge.yml` | pull requests opened by Dependabot | queues auto-merge for patch and minor updates, comments on major ones |

CI never contacts Cloudflare. `wrangler deploy --dry-run` bundles the Worker locally,
so no credentials are stored in the repository and nothing can be deployed from CI.

The corpus rebuild step matters: `corpus.json` and `seed.sql` are generated artefacts
and are not committed. CI reproduces them from the committed `data/text/`, which is
exactly the path a contributor follows on a fresh clone.

## Required repository settings

Auto-merge is only safe when CI actually gates it. **`gh pr merge --auto` merges
immediately if no status check is required.** Two settings must be enabled before the
auto-merge workflow is of any use:

1. **Settings → General → Pull Requests → Allow auto-merge.**
   Without it the workflow fails outright.

2. **Settings → Rules → Rulesets** (or branch protection) on `main`:
   - Require a pull request before merging
   - Require status checks to pass, selecting **`Typecheck, corpus and bundle`**
   - Require branches to be up to date before merging

Optional but recommended: **Settings → Code security → Dependabot alerts** and
**Dependabot security updates**, so vulnerability fixes are raised even outside the
weekly schedule.

## Security choices

**Actions are pinned by commit SHA**, not by tag. A tag can be moved to point at
different code; a SHA cannot. Dependabot's `github-actions` ecosystem keeps the pins
current, which is why that entry exists in `dependabot.yml`.

**`pull_request`, never `pull_request_target`.** The latter runs with a privileged
token in the base branch's context; combined with a checkout of incoming code it is
the standard repository takeover path. The auto-merge workflow checks out nothing and
executes no code from the pull request.

**Permissions are read-only by default** at the workflow level and elevated only in
the job that needs to merge. Dependabot's token is read-only unless a `permissions`
block grants more, so the elevation is explicit and scoped.

**The actor is verified.** The auto-merge job runs only when the pull request author
is `dependabot[bot]`, so no other contributor can reach the elevated permissions.

**Major updates never merge automatically.** They arrive as individual pull requests
and get a comment asking for a changelog review. Only patch and minor updates, grouped
into a single weekly pull request, are queued for auto-merge, and only after CI
passes.

## Review requests

`.github/CODEOWNERS` requests a maintainer review on every pull request, Dependabot's
included. The `reviewers` key of `dependabot.yml` used to do this but GitHub removed it
in 2025; CODEOWNERS is the documented replacement. `assignees` in `dependabot.yml` is
still supported and is set as well, so the pull requests also land in the maintainer's
assigned list.

This requests a review, it does not gate the merge. The ruleset does not enable
"Require review from Code Owners", so auto-merge on patch and minor updates still
proceeds once CI passes. Enabling that rule would stop auto-merge working, since the
sole maintainer would have to approve every weekly bump by hand.

## The agents / MCP SDK coupling

`agents` pins `@modelcontextprotocol/sdk` to an exact version. Bumping the SDK alone
installs two copies, and the `McpServer` type from one is not assignable to the handler
expecting the other, so the typecheck fails.

Grouping the two packages is not enough on its own: Dependabot opens a group pull
request even when a single member of the group has an update. The SDK is therefore in
`ignore`, and moves by hand together with `agents`. The `mcp-runtime` group is kept so
that the day `agents` accepts a version range, removing the ignore is all it takes for
the two to travel together.
