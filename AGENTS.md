# Team coordination for Qala Balance AI

Three Codex sessions work in separate Git worktrees and branches. Never let two sessions edit the same checkout or push the same branch.

Read `docs/TEAM_WORKFLOW.md` before changing files. The user's product brief takes precedence over this file.

## Branches and ownership

| Branch | Owner | Files |
| --- | --- | --- |
| `feature/simulation-core` | Codex 1 | `src/types/simulation.ts`, `src/data/**`, `src/lib/scoring.ts`, `src/lib/simulation.ts`, pure-function tests |
| `feature/interface` | Codex 2 | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/**`, Next/TypeScript/ESLint config and `package.json` |
| `feature/analysis-docs` | Codex 3 | `src/app/api/analyze/route.ts`, `src/lib/fallbackAnalysis.ts`, `README.md`, `.env.example` |
| `feature/full-solution` | Integrator only | Merge work, resolve conflicts, final checks, final PR to `main` |

Shared files (`package.json`, lockfile, `.gitignore`, `AGENTS.md`, this document) have one owner. Codex 2 owns package dependencies and lockfile. If another lane needs a dependency or a contract change, communicate it to the owner; do not edit that file from a second branch.

## Contract

- The category IDs are exactly `transport`, `greenery`, `social`, `safety`, `services`.
- `src/types/simulation.ts` is the shared, committed contract and exports `CATEGORIES`, `Category`, `Metrics`, `Selection`, `District`, `Initiative`, `SimulationResult`, `AIAnalysis`, and `AnalyzeResponse`.
- `Selection` is one initiative ID for each category.
- `src/data/districts.ts` exports `districts`; `src/data/initiatives.ts` exports `initiatives`.
- `src/lib/simulation.ts` exports `STARTING_BUDGET` (1000, million tenge) and `simulate(selection: Selection): SimulationResult`. It rejects incomplete, unknown, mismatched, or over-budget selections.
- `SimulationResult` contains `selection`, `selectedInitiatives`, `baselineDistricts`, `projectedDistricts`, `baselineScore`, `projectedScore`, `spent`, `remaining`, `categoryDeltas`, and `districtDeltas`. Score and budget come only from deterministic TypeScript.
- `POST /api/analyze` accepts `{ selection: Selection }`. The server recomputes the scenario with `simulate`, then returns `{ analysis: AIAnalysis, source: 'openai' | 'fallback' }`. The browser never sends a trusted score or API key.
- `AIAnalysis` has `summary`, `strengths`, `risks`, `tradeoffs`, and `recommendation`.

Codex 1 may refine TypeScript shapes, but must announce changes before the other lanes consume them. Codex 2 and 3 should use the exported types instead of duplicating domain definitions. If the contract is insufficient, ask Codex 1 to extend it and keep implementation within owned files.

## Integration

Each lane commits and pushes only its own branch. Open three PRs targeting `feature/full-solution`, or give the integrator the commit SHAs. The integrator merges sequentially, runs `npm install`, typecheck, lint, and `npm run build`, fixes integration issues in the integration branch, and opens one final PR from `feature/full-solution` to `main`. No force push and no direct commits to `main`.
