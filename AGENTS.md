# Qala Balance AI repository guidance

The current implementation is developed in `feature/rebuild`. The older three-agent branches are historical and must not be used as the source of current product rules. Keep the history intact; do not force push or rewrite `main`.

Read `README.md` and `docs/TEAM_WORKFLOW.md` before changing the app. The user's product brief and supplied district dataset take precedence over older prompts in Git history.

## Current model contract

- `src/types/simulation.ts` contains the shared client/server types.
- Exactly one initiative is selected in each of `transport`, `ecology`, `social`, `safety`, and `services`.
- `Selection` maps each category to `{ initiativeId, districtId? }`. District measures require a district; city measures must omit it.
- `src/data/districts.ts` has five synthetic districts and ten `T1`–`C2` indicators; `src/data/initiatives.ts` has `M1`–`M14`.
- `STARTING_BUDGET` is 100 conditional units, displayed as 1,000 million ₸. One unit equals 10 million ₸.
- `simulate()` validates selection, budget, and conflicts, then applies lagged effects, synergy, clamping, and the deterministic Score. Never duplicate the formula in UI or AI code.
- `POST /api/analyze` recomputes the scenario on the server. OpenAI explains the computed data; missing or invalid OpenAI output uses the deterministic fallback.

The dataset's original selection rule allowed two measures in one direction. This interface deliberately uses one per direction. Consequently, two catalog synergies cannot occur in this version; `README.md` documents the limitation.

Before committing, run tests, TypeScript checking, lint, production build, and `git diff --check`. Do not commit `.env.local` or an API key.
