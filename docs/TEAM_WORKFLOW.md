# Three-Codex workflow

The product brief is the source of truth. This document prevents parallel sessions from overwriting each other's work.

## Start each session

Use a separate clone or Git worktree. Fetch `feature/full-solution` and create exactly one of the three branches listed in `AGENTS.md`. Check `git status --short --branch` before editing. Do not work in another session's checkout. If a branch already exists remotely, track it rather than recreating it.

Example from a fresh clone:

```bash
git fetch origin
git switch -c feature/simulation-core origin/feature/full-solution
```

Replace the branch name for the other two sessions. On one machine, use `git worktree add ../qala-interface -b feature/interface feature/full-solution` and a different path for every other lane.

## Independent assignments

**Codex 1 — model and data.** Implement the five categories, 4–6 synthetic districts, at least three initiatives per category, clamped metric effects, budget validation, transparent weighted score with an inequality penalty, before/after result, and useful pure-function tests. Publish the exact exports in `src/types/simulation.ts` first so the other lanes can compile against them. Stay inside the owned paths.

**Codex 2 — product interface and project scaffold.** Create Next.js App Router setup, dependencies (including `openai`), config, responsive Russian UI, five choices, visible budget, disabled/blocked simulation, result dashboard, API request states, and reset flow. Own `package.json` and lockfile. Use the model exports; do not copy calculation logic into React.

**Codex 3 — AI endpoint and documentation.** Implement `POST /api/analyze` with server-side OpenAI SDK, strict input/output validation, deterministic fallback when the key is missing or the API fails, and a complete Russian README and `.env.example`. Recompute the scenario on the server. Never expose `OPENAI_API_KEY` to the client. Stay inside the owned paths.

## Handoff and merging

1. Codex 1 publishes the TypeScript contract early. Codex 2 and 3 can scaffold independently while waiting for it.
2. Each session commits focused changes and pushes its own branch. Send the integrator the branch name, commit SHA, checks run, and any unresolved issue.
3. The integrator merges into `feature/full-solution` one branch at a time: model, interface, then AI/docs. If a dependency or type mismatch appears, fix it in the integration branch or route a specific change to the file owner.
4. The integrator checks `git diff`, secret tracking, `npm run build`, typecheck, lint, and a working five-choice scenario. Then open a PR from `feature/full-solution` to `main` and leave merging to the team.

If GitHub access is unavailable, keep the three local branches and exchange commit SHAs. Do not share uncommitted changes or copy files between worktrees.
