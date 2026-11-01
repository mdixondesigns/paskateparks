# Fix review findings

An independent reviewer found problems with the change on this branch. Address
them, then push. A second (final) review follows.

## Read

- `.agent/issue.md` — the original issue.
- The findings file named in the prompt.
- `git diff origin/main...HEAD` to see the current change.
- `CLAUDE.md`, and `VISUAL-DESIGN.md` for anything visual.

## Do

1. Fix every **Blocking** finding. If you're confident one is wrong, don't
   change code for it — explain why in your final commit message body.
2. Non-blocking items: fix if trivial and clearly right; otherwise leave them.
3. Run until all pass: `pnpm lint`, `pnpm format`, `pnpm format:check`,
   `pnpm typecheck`, `pnpm test`.
4. Commit (conventional-commit message; never stage `.agent/`) and
   `git push`.

The same "Never" rules as the build step apply: no workflow, `.env*`,
dependency changes; data only via `pnpm content:apply` to staging (re-apply
the changeset after editing it, before pushing); never weaken tests.
