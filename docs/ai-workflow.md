# AI issue workflow

Turn a GitHub issue into a reviewed pull request with Claude.

## Using it

1. **New issue → Task** for code changes (Goal + Done when — the checklist is
   what the reviewer holds the work to), or **Park content** for a new park,
   park updates, or photos.
2. **Add the `ai-ready` label.** Nothing happens until you do.
3. Claude comments "On it" with a link to the run log, then either:
   - **asks questions** — the issue gets `needs-info`. Reply in a comment; your
     reply restarts it automatically.
   - **builds** — branch `claude/issue-N`, a PR, and a Vercel preview.
4. An **independent reviewer** (a separate Claude run that never saw the
   builder's reasoning) comments on the PR. If it asks for changes, the builder
   fixes them and a final review runs. Max two rounds.
5. **Ready:** you're requested as
   reviewer — GitHub emails you. **Stuck:** no review request; instead Claude
   @-mentions you on the issue with what's left.
6. You check the preview and merge. `main` is protected: CI must pass and
   every change goes through a PR.

To ask for changes on any PR, comment `@claude <what to change>`.

To retry after an error, remove and re-add `ai-ready`.

## Content: staging → production

Content PRs carry a changeset (`content/changes/NNNN-<slug>.json`, format in
`content/README.md`) that the agent has already applied to **staging**, so the
Vercel preview shows the real page. After you merge:

1. The **Apply content to production** workflow starts and waits.
2. GitHub emails you that a deployment needs review. Open it →
   **Review deployments** → tick `content-production` → **Approve and deploy**.
3. It copies the photos from staging and writes the changes to production.
   The live pages refresh within seconds (Supabase webhooks).

Nothing reaches production without that approval. To see what's waiting
without applying: `pnpm content:apply --production --dry-run`.

**Edit content only through changesets from now on.** The agent edits
existing parks starting from staging's copy, and lists replace — a change made
directly in Supabase Studio on production would be overwritten the next time
that park is edited. If staging ever drifts, `pnpm db:clone-to-staging`
refreshes it from production.

## What the agent will not do

- Edit `.github/workflows/` (the Claude GitHub App has no permission to).
- Add or upgrade dependencies, or touch `.env*` files.
- Touch production. Its only data access is staging, through
  `content:photo` / `content:apply`. It may add a migration file; applying it
  is yours.

## Where things live

| What                                         | Where                                    |
| -------------------------------------------- | ---------------------------------------- |
| Pipeline                                     | `.github/workflows/claude-issue.yml`     |
| `@claude` on PRs                             | `.github/workflows/claude-mention.yml`   |
| Instructions for each step (edit to tune)    | `.github/claude/*.md`                    |
| Issue forms                                  | `.github/ISSUE_TEMPLATE/`                |
| Content changesets + format                  | `content/`                               |
| Production content apply                     | `.github/workflows/content-apply.yml`    |
| Claude login (Pro plan, expires ~Oct 2027)   | repo secret `CLAUDE_CODE_OAUTH_TOKEN`    |
| Staging credentials (agent)                  | repo secrets `STAGING_*`                 |
| Production credentials (approval-gated)      | `content-production` environment secrets |

Secrets are loaded from your local `.env.local` / `.env.production.local` with
`pnpm setup:github` — re-run it after rotating any Supabase key.

Renew the token with `claude setup-token`, then
`gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo mdixondesigns/paskateparks`.

## Cost

Runs use the Claude Pro subscription's usage limits, shared with your own
Claude use. Each run makes at most five Claude calls (triage, build, review,
fix, review), all on Sonnet with turn caps. If a run hits the limit it fails
and comments on the issue; retry later.
