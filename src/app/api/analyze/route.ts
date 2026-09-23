import OpenAI from "openai";
import type { AIAnalysis, AnalyzeResponse, Selection, SimulationResult } from "../../../types/simulation";
import { buildFallbackAnalysis, buildSafeRecommendation } from "../../../lib/fallbackAnalysis";
import { simulate, SimulationError, STARTING_BUDGET } from "../../../lib/simulation";

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
} as const;

function nonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 1500;
}

function parseAnalysis(text: string): AIAnalysis | null {
  if (!text || text.length > 12_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!nonemptyText(record.summary) || !nonemptyText(record.recommendation)) return null;
  for (const key of ["strengths", "risks", "tradeoffs"] as const) {
    const entries = record[key];
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 5 || !entries.every(nonemptyText)) {
      return null;
    }
  }
  return {
    summary: record.summary.trim(),
    strengths: (record.strengths as string[]).map((item) => item.trim()),
    risks: (record.risks as string[]).map((item) => item.trim()),
    tradeoffs: (record.tradeoffs as string[]).map((item) => item.trim()),
    recommendation: record.recommendation.trim(),
  };
}

function modelInput(result: SimulationResult): string {
  return JSON.stringify({
    budgetMillionTenge: STARTING_BUDGET,
    spent: result.spent,
    remaining: result.remaining,
    scoreBefore: result.baselineScore,
    scoreAfter: result.projectedScore,
    categoryDeltas: result.categoryDeltas,
    districts: result.projectedDistricts.map((district, index) => ({
      name: district.name,
      before: result.baselineDistricts[index].metrics,
      after: district.metrics,
      scoreDelta: result.districtDeltas[district.id],
    })),
    initiatives: result.selectedInitiatives.map((initiative) => ({
      title: initiative.title,
      category: initiative.category,
      cost: initiative.cost,
      risk: initiative.risk,
    })),
    approvedRecommendation: buildSafeRecommendation(result),
  });
}

function errorResponse(code: string, message: string, status: number, overspend = 0): Response {
  return Response.json({ error: { code, message, overspend } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Отправьте JSON с полем selection.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || !("selection" in body)) {
    return errorResponse("INVALID_REQUEST", "Отправьте выбор пяти инициатив в поле selection.", 400);
  }

  let result: SimulationResult;
  try {
    result = simulate((body as { selection: Selection }).selection);
  } catch (error) {
    if (error instanceof SimulationError) {
      return errorResponse(error.code, error.message, 422, error.overspend);
    }
    return errorResponse("SIMULATION_ERROR", "Не удалось рассчитать сценарий.", 500);
  }

  const fallback: AnalyzeResponse = { analysis: buildFallbackAnalysis(result), source: "fallback" };
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return Response.json(fallback);

  try {
    const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 0 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      store: false,
      instructions: [
        "Ты аналитик условной городской бюджетной симуляции. Ответь по-русски простым языком.",
        "Опирайся только на переданный JSON. Не придумывай данные, цены или факты об Астане.",
        "Бюджет и Score уже рассчитаны кодом; не пересчитывай и не меняй их.",
        "Явно называй сильные стороны, риски и компромиссы, включая ухудшения.",
        "Рекомендацию бери только из approvedRecommendation и не предлагай расходов сверх бюджета.",
        "Не выдавай результат за реальный прогноз будущего города.",
      ].join(" "),
      input: modelInput(result),
      text: {
        format: {
          type: "json_schema",
          name: "qala_balance_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    });
    if (response.status !== "completed") return Response.json(fallback);
    const analysis = parseAnalysis(response.output_text);
    if (!analysis) return Response.json(fallback);

    // The recommendation is always checked by deterministic code, even when AI prose is used.
    analysis.recommendation = fallback.analysis.recommendation;
    const payload: AnalyzeResponse = { analysis, source: "openai" };
    return Response.json(payload);
  } catch {
    return Response.json(fallback);
  }
}
