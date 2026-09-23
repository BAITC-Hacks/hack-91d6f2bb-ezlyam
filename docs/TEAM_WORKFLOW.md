# Current workflow

One Codex checkout and the `feature/rebuild` branch contain the rebuild. Work was divided into four sequential, reviewable stages:

1. Create and publish `feature/rebuild` from the former integration branch.
2. Replace the data, types, score, simulation, and tests using the supplied district dataset.
3. Build the Next.js interface and add project dependencies.
4. Rebuild the AI endpoint, fallback, and documentation; run integration checks.

Commit each stage separately. Preserve previous branches and commits as history. Do not push directly to `main`; create a PR from `feature/rebuild` after the full build and user review. The current architecture and exact model rules are in `README.md` and `AGENTS.md`.

For local development use `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. The app works without `OPENAI_API_KEY` via the fallback.
