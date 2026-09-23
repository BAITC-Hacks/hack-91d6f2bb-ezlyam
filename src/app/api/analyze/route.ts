import OpenAI from "openai";
import { CATEGORIES, type AIAnalysis, type AnalyzeResponse, type Selection } from "../../../types/simulation";
import {
  findAffordableAlternative,
  findScoreImprovement,
  SimulationError,
  simulate,
  STARTING_BUDGET,
} from "../../../lib/simulation";
import { buildFallbackAnalysis, isAIAnalysis } from "../../../lib/fallbackAnalysis";

export const runtime = "nodejs";

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    tradeoffs: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
  },
  required: ["summary", "strengths", "risks", "tradeoffs", "recommendation"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSelection(value: unknown): value is Selection {
  if (!isRecord(value) || Object.keys(value).length !== CATEGORIES.length) return false;
  return CATEGORIES.every((category) => {
    const decision = value[category];
    return isRecord(decision) && typeof decision.initiativeId === "string" &&
      decision.initiativeId.trim().length > 0 &&
      (decision.districtId === undefined || typeof decision.districtId === "string") &&
      Object.keys(decision).every((key) => key === "initiativeId" || key === "districtId");
  });
}

function buildScenarioPayload(
  result: ReturnType<typeof simulate>,
  improvement: ReturnType<typeof findScoreImprovement>,
) {
  return {
    moneyUnit: "million KZT",
    budgetMillionTenge: STARTING_BUDGET * 10,
    spentMillionTenge: result.spent * 10,
    remainingMillionTenge: result.remaining * 10,
    scoreBefore: result.baselineScore,
    scoreAfter: result.projectedScore,
    scoreChange: Number((result.projectedScore - result.baselineScore).toFixed(2)),
    criticalBefore: result.baselineBreakdown.criticalCount,
    criticalAfter: result.projectedBreakdown.criticalCount,
    categoryChanges: result.categoryDeltas,
    districts: result.projectedDistricts.map((district, index) => ({
      id: district.id,
      name: district.name,
      before: result.baselineDistricts[index]?.metrics,
      after: district.metrics,
      scoreChange: result.districtDeltas[district.id] ?? 0,
    })),
    selectedInitiatives: result.selectedInitiatives.map((initiative) => ({
      id: initiative.id,
      title: initiative.title,
      category: initiative.category,
      costMillionTenge: initiative.cost * 10,
      lag: initiative.lag,
      effects: initiative.effects,
      risk: initiative.risk,
    })),
    computedImprovement: improvement
      ? {
          changes: improvement.changes.map(({ category, from, to }) => ({
            category,
            from,
            to,
          })),
          spentMillionTenge: improvement.spent * 10,
          projectedScore: improvement.projectedScore,
        }
      : null,
  };
}

async function requestOpenAIAnalysis(
  scenario: ReturnType<typeof buildScenarioPayload>,
  apiKey: string,
): Promise<AIAnalysis> {
  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    store: false,
    max_output_tokens: 900,
    input: [
      {
        role: "system",
        content:
          "Ты русскоязычный аналитик городских сценариев Qala Balance AI. Объясняй только переданные вычисленные значения. Не пересчитывай и не меняй Score, бюджет, эффекты или выбор. Данные синтетические, поэтому не представляй вывод как прогноз для реальной Астаны. Укажи сильные стороны, риски и компромиссы. В рекомендации опирайся только на computedImprovement; не предлагай меру, которой нет в этой структуре. Если computedImprovement равен null, скажи, что одиночное улучшение не найдено. Ответь по-русски и верни все поля по заданной JSON Schema.",
      },
      {
        role: "user",
        content: JSON.stringify(scenario),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "qala_balance_analysis",
        strict: true,
        schema: ANALYSIS_SCHEMA,
      },
    },
  });

  if (response.status !== "completed" || !response.output_text.trim()) {
    throw new Error("OpenAI did not return a completed structured response.");
  }

  const parsed: unknown = JSON.parse(response.output_text);
  if (!isAIAnalysis(parsed)) {
    throw new Error("OpenAI response did not match the analysis contract.");
  }

  return parsed;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "Отправьте корректный JSON." } },
      { status: 400 },
    );
  }

  if (!isRecord(body) || Object.keys(body).length !== 1 || !isSelection(body.selection)) {
    return Response.json(
      {
        error: {
          code: "INVALID_SELECTION",
          message: "Передайте selection с пятью решениями: initiativeId и, для районных мер, districtId.",
        },
      },
      { status: 400 },
    );
  }

  const selection = body.selection;
  let result: ReturnType<typeof simulate>;
  try {
    result = simulate(selection);
  } catch (error) {
    if (error instanceof SimulationError) {
      if (error.code === "OVER_BUDGET") {
        const alternative = findAffordableAlternative(selection);
        return Response.json(
          {
            error: {
              code: error.code,
              message: error.message,
              overspend: error.overspend,
              budget: STARTING_BUDGET,
            },
            suggestion: alternative
              ? {
                  selection: alternative.selection,
                  changes: alternative.changes.map(({ category, from, to }) => ({
                    category,
                    from,
                    to,
                  })),
                  spent: alternative.spent,
                  remaining: STARTING_BUDGET - alternative.spent,
                  projectedScore: alternative.projectedScore,
                }
              : null,
          },
          { status: 422 },
        );
      }

      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 },
      );
    }

    return Response.json(
      { error: { code: "SIMULATION_FAILED", message: "Не удалось рассчитать сценарий." } },
      { status: 500 },
    );
  }

  const improvement = findScoreImprovement(selection);
  const fallback = buildFallbackAnalysis(result, improvement);
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    const payload: AnalyzeResponse = { analysis: fallback, source: "fallback" };
    return Response.json(payload);
  }

  try {
    const scenario = buildScenarioPayload(result, improvement);
    const analysis = await requestOpenAIAnalysis(scenario, apiKey);
    const payload: AnalyzeResponse = {
      analysis: {
        ...analysis,
        // Keep the recommendation tied to the deterministic affordable swap.
        recommendation: fallback.recommendation,
      },
      source: "openai",
    };
    return Response.json(payload);
  } catch {
    console.warn("OpenAI analysis unavailable or invalid; returning deterministic fallback.");
    const payload: AnalyzeResponse = { analysis: fallback, source: "fallback" };
    return Response.json(payload);
  }
}
