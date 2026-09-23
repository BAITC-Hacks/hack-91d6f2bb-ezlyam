# Rebuild context for Codex

Qala Balance AI is a Russian-language city management simulator for HackAlem AI. The user chooses exactly five measures, one in each direction, within a fixed 1,000 million ₸ display budget. The deterministic model uses five synthetic districts, ten indicators, and 14 measures from the supplied «Датасет районов.docx». The baseline Score is 52.56.

The rebuild was organized as four sequential stages in one checkout: branch preparation, simulation core, interface, then AI analysis and documentation. Earlier three-agent prompts in Git history refer to the superseded 15-measure model and must not be reused. Read `README.md`, `AGENTS.md`, and the current TypeScript types before future work.

OpenAI receives only the calculated scenario. The server always validates and recomputes through `simulate()`. The app must remain usable without a key. Keep future changes in `feature/rebuild` until the team reviews a final PR to `main`.
