# Current development context

Product: Qala Balance AI, HackAlem AI / Astana Innovations «Аким на 5 часов».

The supplied dataset defines all numeric requirements. Read README.md and AGENTS.md. Historical prompts that demand one decision per category or convert units to tenge are superseded.

Maintain five unique decisions, at most two per category, budget <=100, exact catalog M1–M14, district/city scope, three synergies and incompatibilities. Invalid selections receive no Score. Numeric results come from deterministic code, not the LLM.

The reproducibility gate is pnpm test, pnpm typecheck, pnpm lint, pnpm check:example, pnpm build and the README demonstration. The expected official example is cost 95 and Score 56.54307. Mock API tests do not replace a real OpenAI connectivity check.
