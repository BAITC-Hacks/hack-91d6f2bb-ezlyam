# Current workflow

The original rebuild used feature/rebuild and four sequential implementation stages. That history is background; current source-of-truth rules are the supplied district dataset and README.md.

Work in one checkout. Keep data, validator, UI and API consistent with Selection = Decision[]. The earlier one-per-category restriction is removed. All three dataset synergies must remain reachable.

Use Node.js 22+ and pnpm 11.25.0. Install with pnpm install --frozen-lockfile. Run pnpm test, pnpm typecheck, pnpm lint, pnpm check:example and pnpm build. Start the built app with pnpm start and exercise the documented demo.

For Git delivery, use a feature branch from the team's current integration state and review a PR. Preserve history. Do not merge or submit the hackathon entry automatically. A downloaded archive is not itself a Git checkout; do not report commits or pushes that were not performed.
