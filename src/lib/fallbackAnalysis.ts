import { initiatives } from "../data/initiatives";
import { districts } from "../data/districts";
import { CATEGORIES, type AIAnalysis, type Category, type ScenarioSuggestion, type SimulationResult } from "../types/simulation";

const names: Record<Category, string> = {
  transport: "транспорт", ecology: "экология", social: "социальная сфера",
  safety: "безопасность", services: "городские сервисы",
};
const number = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
const money = (units: number) => `${number(units)} усл. ед.`;

function recommendation(suggestion: ScenarioSuggestion | null): string {
  if (!suggestion) return "Одиночной замены, которая повышает Score и сохраняет бюджет, не найдено. Сравните другой набор решений.";
  const change = suggestion.changes[0];
  const from = initiatives.find((item) => item.id === change.from.initiativeId)!;
  const to = initiatives.find((item) => item.id === change.to.initiativeId)!;
  const district = change.to.districtId ? ` в районе ${districts.find((item) => item.id === change.to.districtId)!.name}` : " для всего города";
  return `Замените решение «${from.id} · ${from.title}» на «${to.id} · ${to.title}»${district}. Расход ${money(suggestion.spent)}, расчётный Score ${number(suggestion.projectedScore)}. Это проверенная одиночная замена, а не глобальный оптимум.`;
}

/** Объяснение составляется только из результатов детерминированного расчёта. */
export function buildFallbackAnalysis(result: SimulationResult, improvement: ScenarioSuggestion | null): AIAnalysis {
  const scoreChange = result.projectedScore - result.baselineScore;
  const sorted = CATEGORIES.map((category) => ({ category, delta: result.categoryDeltas[category] }))
    .sort((a, b) => b.delta - a.delta);
  const strongest = sorted[0];
  const bestDistrict = result.projectedDistricts.reduce((current, district) =>
    result.districtDeltas[district.id] > result.districtDeltas[current.id] ? district : current);
  const weakest = result.projectedDistricts.reduce((current, district) =>
    result.projectedBreakdown.districtScores[district.id] < result.projectedBreakdown.districtScores[current.id]
      ? district : current);
  const risks = result.selectedInitiatives.map((initiative) => `${initiative.id}: ${initiative.risk}`);
  const negative = sorted.filter((entry) => entry.delta < 0);

  return {
    summary: `За 8 кварталов сценарий расходует ${money(result.spent)} из ${money(result.spent + result.remaining)}. Astana Quality of Life Score меняется с ${number(result.baselineScore)} до ${number(result.projectedScore)} (${scoreChange >= 0 ? "+" : ""}${number(scoreChange)}). Это синтетическая модель, а не прогноз для Астаны.`,
    strengths: [
      strongest.delta > 0
        ? `Наибольший средний прирост — «${names[strongest.category]}»: +${number(strongest.delta)} пункта.`
        : "Средние показатели направлений не выросли.",
      result.districtDeltas[bestDistrict.id] > 0
        ? `Наибольший прирост районного балла — ${bestDistrict.name}: +${number(result.districtDeltas[bestDistrict.id])}.`
        : "Баллы районов не выросли; стоит пересмотреть распределение мер.",
    ],
    risks: risks.length ? risks : ["Риски выбранных мероприятий не указаны."],
    tradeoffs: [
      `Остаток бюджета: ${money(result.remaining)}; неиспользованные средства не увеличивают Score.`,
      `К концу сценария самый слабый район — ${weakest.name}: ${number(result.projectedBreakdown.weakestDistrictScore)} балла.`,
      `Критических показателей ниже 40: ${result.projectedBreakdown.criticalCount}; штраф в формуле Score: ${number(result.projectedBreakdown.inequalityPenalty)}.`,
      result.synergies.length
        ? `Синергии без уменьшения лагом: ${result.synergies.map((item) => `${item.pair.join(" + ")} → ${item.metric} +${item.bonus}, ${districts.find((district) => district.id === item.districtId)!.name}`).join("; ")}.`
        : "Синергий в выбранном наборе нет.",
      negative.length
        ? `Снижение среднего показателя: ${negative.map((item) => `${names[item.category]} ${number(item.delta)}`).join(", ")}.`
        : "Средние показатели всех направлений не снизились.",
    ],
    recommendation: recommendation(improvement),
  };
}

const validText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 600;
const validList = (value: unknown): value is string[] => Array.isArray(value) && value.length >= 1 && value.length <= 5 && value.every(validText);

export function isAIAnalysis(value: unknown): value is AIAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const fields = ["summary", "strengths", "risks", "tradeoffs", "recommendation"];
  return Object.keys(record).length === fields.length && fields.every((field) => field in record) &&
    validText(record.summary) && validList(record.strengths) && validList(record.risks) &&
    validList(record.tradeoffs) && validText(record.recommendation);
}
