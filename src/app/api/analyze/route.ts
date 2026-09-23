import OpenAI from "openai";
import { type AIAnalysis, type AnalyzeResponse, type Selection } from "../../../types/simulation";
import { findScoreImprovement, SimulationError, simulate, STARTING_BUDGET } from "../../../lib/simulation";
import { buildFallbackAnalysis } from "../../../lib/fallbackAnalysis";

export const runtime = "nodejs";
const EXPLANATION_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    strengths: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["strengths", "risks"],
};
type Explanation = Pick<AIAnalysis, "strengths" | "risks">;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isExplanation(value: unknown): value is Explanation {
  if (!isRecord(value) || Object.keys(value).length !== 2) return false;
  return ["strengths", "risks"].every((field) => {
    const list = value[field];
    // All numeric claims and recommendations are rendered from deterministic code.
    return Array.isArray(list) && list.length >= 1 && list.length <= 5 && list.every((text) =>
      typeof text === "string" && text.trim().length > 0 && text.length <= 600 && !/[\d\p{N}]/u.test(text));
  });
}

function buildScenarioPayload(result: ReturnType<typeof simulate>) {
  return {
    moneyUnit: "conditional units, no currency conversion",
    budget: STARTING_BUDGET, spent: result.spent, remaining: result.remaining,
    scoreBefore: result.baselineScore, scoreAfter: result.projectedScore,
    scoreChange: result.projectedScore - result.baselineScore,
    baselineBreakdown: result.baselineBreakdown, projectedBreakdown: result.projectedBreakdown,
    categoryChanges: result.categoryDeltas,
    districts: result.projectedDistricts.map((district, index) => ({
      id: district.id, name: district.name, populationShare: district.populationShare,
      before: result.baselineDistricts[index].metrics, after: district.metrics,
      scoreChange: result.districtDeltas[district.id],
    })),
    selectedInitiatives: result.selectedInitiatives.map((initiative) => ({
      id: initiative.id, title: initiative.title, category: initiative.category,
      decision: result.selection.find((decision) => decision.initiativeId === initiative.id),
      cost: initiative.cost, lag: initiative.lag,
      realizedContribution: result.contributions.find((item) => item.initiativeId === initiative.id),
      qualitativeRisk: initiative.risk,
    })),
    synergies: result.synergies,
  };
}

async function requestOpenAIExplanation(result: ReturnType<typeof simulate>, apiKey: string): Promise<Explanation> {
  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    store: false, max_output_tokens: 900,
    input: [
      { role: "system", content: "Ты русскоязычный аналитик Qala Balance AI. Получаешь готовые расчёты синтетической модели. Объясни сильные стороны и риски конкретного сценария, учитывая районный охват, лаги, синергии и оставшиеся критические показатели. Не считай числа, не вводи новые эффекты и не представляй вывод как реальный прогноз. Пиши только качественные объяснения: без цифр, процентов, числовых утверждений, кодов мер или показателей. Используй названия районов и мероприятий. Бюджет, Score, компромиссы и проверенные рекомендации приложение покажет отдельно из расчёта. Верни только strengths и risks: от одного до пяти коротких предложений в каждом массиве." },
      { role: "user", content: JSON.stringify(buildScenarioPayload(result)) },
    ],
    text: { format: { type: "json_schema", name: "qala_balance_explanation", strict: true, schema: EXPLANATION_SCHEMA } },
  });
  if (response.status !== "completed" || !response.output_text?.trim()) throw new Error("Incomplete AI response");
  const parsed: unknown = JSON.parse(response.output_text);
  if (!isExplanation(parsed)) throw new Error("Invalid qualitative explanation");
  return parsed;
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: { code: "INVALID_JSON", message: "Отправьте корректный JSON." } }, { status: 400 }); }
  if (!isRecord(body) || Object.keys(body).length !== 1 || !Array.isArray(body.selection)) {
    return Response.json({ error: { code: "INVALID_SELECTION", message: "Передайте только selection: массив из пяти решений с initiativeId и районом для районных мер." } }, { status: 400 });
  }
  let result: ReturnType<typeof simulate>;
  try {
    // simulate validates untrusted JSON at runtime before using any decision.
    result = simulate(body.selection as Selection);
  } catch (error) {
    if (error instanceof SimulationError) {
      return Response.json({ error: { code: error.code, message: error.message, ...(error.code === "OVER_BUDGET" ? { overspend: error.overspend, budget: STARTING_BUDGET } : {}) } }, { status: error.code === "OVER_BUDGET" ? 422 : 400 });
    }
    return Response.json({ error: { code: "SIMULATION_FAILED", message: "Не удалось рассчитать сценарий." } }, { status: 500 });
  }
  const improvement = findScoreImprovement(result.selection);
  const fallback = buildFallbackAnalysis(result, improvement);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const payload: AnalyzeResponse = { analysis: fallback, source: "fallback", fallbackReason: "missing_key" };
    return Response.json(payload);
  }
  try {
    const explanation = await requestOpenAIExplanation(result, apiKey);
    const payload: AnalyzeResponse = { analysis: { ...fallback, ...explanation }, source: "openai" };
    return Response.json(payload);
  } catch {
    console.warn("OpenAI explanation unavailable or invalid; returning local analysis.");
    const payload: AnalyzeResponse = { analysis: fallback, source: "fallback", fallbackReason: "unavailable" };
    return Response.json(payload);
  }
}
