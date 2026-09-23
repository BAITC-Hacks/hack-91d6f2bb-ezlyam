# Qala Balance AI repository guidance

Read README.md and docs/TEAM_WORKFLOW.md before changing the app. The supplied district dataset and current user brief override historical prompts and earlier design choices.

## Model contract

- Selection is Decision[]: exactly five unique M1–M14 initiatives, at most two per category.
- Budget is 100 conditional units; no currency conversion is specified.
- District measures require districtId; city measures omit it and affect all five districts.
- simulate() validates before calculating. Invalid scenarios have no Score.
- Sum lagged effects, then fixed synergies, then clamp indicators once. Keep numeric precision until display.
- The server recomputes selection. OpenAI only explains ready calculations.
- Official example: M7/M8/M10 in Nura, M12 city, M5 Saryarka; cost 95, Score 56.54307.
- AI fallback must be labeled as local analysis, not a live model response.

Run pnpm test, pnpm typecheck, pnpm lint, pnpm check:example, pnpm build before delivery. In a Git checkout run git diff --check. Do not commit .env.local or secrets. Preserve existing Git history; do not force push or change main directly. An extracted ZIP has no branch or upstream until explicitly connected to the team's repository.
