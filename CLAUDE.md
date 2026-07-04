
## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health

## Design System

Always read [VISUAL-DESIGN.md](VISUAL-DESIGN.md) before making any visual or UI
decision in this repo. All font choices (Cabinet Grotesk), colors (the warm
cream / ink + bright paint palette), spacing scale, the two-divider system
(pinstripe-wood at dark/light boundaries, color-rule between cream sections),
wordmark treatment, photography treatment, and component-level specs are
defined there. Do not deviate without explicit user approval.

[VISUAL-DESIGN.md](VISUAL-DESIGN.md) is the visual source of truth.
[DESIGN.md](DESIGN.md) is the product/architecture source of truth (locked
D1–D30) and is NOT a visual system doc. [STACK-PIVOT.md](STACK-PIVOT.md) is
the data + hosting layer (Supabase + Drizzle + Vercel + Sharp).

In QA mode (/qa, /design-review), flag any code that doesn't match
[VISUAL-DESIGN.md](VISUAL-DESIGN.md).

## Storybook

`pnpm storybook` (port 6006) isolates components for visual tuning against
VISUAL-DESIGN.md without needing the full app/database running. Stories live
next to their component as `<Component>.stories.tsx`; shared park fixtures
(`richPark`, `stubPark`, `closedPark`, `buildPark(overrides)`) are in
[src/lib/park-fixtures.ts](src/lib/park-fixtures.ts). Most `park/*` section
components are covered; `ParkProfile.stories.tsx` renders the full 16-section
composition. The a11y addon panel checks each story against WCAG per
VISUAL-DESIGN.md §17 as you go.
