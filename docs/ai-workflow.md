# AI issue workflow

Turn a GitHub issue into a reviewed pull request with Claude.

## Using it

1. **New issue → Task.** Fill in Goal and Done when (the checklist is what the
   reviewer holds the work to). Attach any photos or copy.
2. **Add the `ai-ready` label.** Nothing happens until you do.
3. Claude comments "On it" with a link to the run log, then either:
   - **asks questions** — the issue gets `needs-info`. Reply in a comment; your
     reply restarts it automatically.
   - **builds** — branch `claude/issue-N`, a draft PR, and a Vercel preview.
4. An **independent reviewer** (a separate Claude run that never saw the
   builder's reasoning) comments on the PR. If it asks for changes, the builder
   fixes them and a final review runs. Max two rounds.
5. **Ready:** the PR is marked ready for review and you're requested as
   reviewer — GitHub emails you. **Stuck:** it stays a draft and Claude
   @-mentions you on the issue with what's left.
6. You check the preview and merge. `main` is protected: CI must pass and
   every change goes through a PR.

To ask for changes on any PR, comment `@claude <what to change>`.

To retry after an error, remove and re-add `ai-ready`.

## What the agent will not do

- Edit `.github/workflows/` (the Claude GitHub App has no permission to).
- Add or upgrade dependencies, or touch `.env*` files.
- Write to any database. It may add a migration file; applying it is yours.

## Where things live

| What                                         | Where                                    |
| -------------------------------------------- | ---------------------------------------- |
| Pipeline                                     | `.github/workflows/claude-issue.yml`     |
| `@claude` on PRs                             | `.github/workflows/claude-mention.yml`   |
| Instructions for each step (edit to tune)    | `.github/claude/*.md`                    |
| Issue form                                   | `.github/ISSUE_TEMPLATE/task.yml`        |
| Claude login (Pro plan, expires ~Oct 2027)   | repo secret `CLAUDE_CODE_OAUTH_TOKEN`    |

Renew the token with `claude setup-token`, then
`gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo mdixondesigns/paskateparks`.

## Cost

Runs use the Claude Pro subscription's usage limits, shared with your own
Claude use. Each run makes at most five Claude calls (triage, build, review,
fix, review), all on Sonnet with turn caps. If a run hits the limit it fails
and comments on the issue; retry later.
