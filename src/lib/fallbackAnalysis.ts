import { CATEGORIES, type AIAnalysis, type Category, type SimulationResult } from "../types/simulation";
import { calculateDistrictScore } from "./scoring";
import { findScoreImprovement, type ScenarioSuggestion } from "./simulation";

const CATEGORY_NAMES: Record<Category, string> = {
  transport: "транспорт",
  greenery: "озеленение",
  social: "социальная инфраструктура",
  safety: "безопасность",
  services: "городские сервисы",
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);

const formatSigned = (value: number): string =>
  value > 0 ? "+" + formatNumber(value) : formatNumber(value);

function makeRecommendation(suggestion: ScenarioSuggestion | null, currentScore: number): string {
  if (!suggestion || suggestion.changes.length === 0) {
    return "Сценарий уже укладывается в бюджет. Проверка одиночных замен не нашла вариант с более высоким Score; сравните новый сценарий, изменив несколько решений.";
  }

  const changes = suggestion.changes
    .map(
      ({ category, from, to }) =>
        "в категории «" +
        CATEGORY_NAMES[category] +
        "» заменить «" +
        from.title +
        "» на «" +
        to.title +
        "»",
    )
    .join("; ");
  const gain = suggestion.projectedScore - currentScore;

  return (
    "В пределах бюджета попробуйте " +
    changes +
    ". Расчётная стоимость — " +
    formatNumber(suggestion.spent) +
    " млн ₸, Score изменится с " +
    formatNumber(currentScore) +
    " до " +
    formatNumber(suggestion.projectedScore) +
    " (" +
    formatSigned(gain) +
    ")."
  );
}

/** Build a deterministic Russian explanation from the simulation output only. */
export function buildFallbackAnalysis(
  result: SimulationResult,
  improvement: ScenarioSuggestion | null = findScoreImprovement(result.selection),
): AIAnalysis {
  const scoreChange = result.projectedScore - result.baselineScore;
  const scoreTrend =
    scoreChange > 0
      ? "вырос на " + formatNumber(scoreChange)
      : scoreChange < 0
        ? "снизился на " + formatNumber(Math.abs(scoreChange))
        : "не изменился";

  const sortedCategories = CATEGORIES.map((category) => ({
    category,
    delta: result.categoryDeltas[category],
  })).sort((left, right) => right.delta - left.delta);
  const strongestCategory = sortedCategories[0];
  const weakestDistrict = result.projectedDistricts
    .map((district) => ({ district, score: calculateDistrictScore(district) }))
    .sort((left, right) => left.score - right.score)[0];
  const bestDistrict = result.projectedDistricts
    .map((district) => ({ district, delta: result.districtDeltas[district.id] ?? 0 }))
    .sort((left, right) => right.delta - left.delta)[0];
  const negativeCategories = sortedCategories.filter((item) => item.delta < 0);
  const initiativeRisks = result.selectedInitiatives.map((initiative) => initiative.risk.trim()).filter(Boolean);

  const strengths = [
    "Score по синтетической модели " +
      scoreTrend +
      ": " +
      formatNumber(result.baselineScore) +
      " → " +
      formatNumber(result.projectedScore) +
      ".",
  ];

  if (strongestCategory && strongestCategory.delta > 0) {
    strengths.push(
      "Наибольший средний прирост — в направлении «" +
        CATEGORY_NAMES[strongestCategory.category] +
        "»: " +
        formatSigned(strongestCategory.delta) +
        " пункта.",
    );
  }

  if (bestDistrict && bestDistrict.delta > 0) {
    strengths.push(
      "Больше всего вырос расчётный балл района «" +
        bestDistrict.district.name +
        "»: " +
        formatSigned(bestDistrict.delta) +
        ".",
    );
  } else {
    strengths.push("Расчёт учитывает последствия выбранных мер для всех пяти районов.");
  }

  const risks = initiativeRisks.slice(0, 3);
  if (negativeCategories.length > 0) {
    risks.push(
      "Показатель направления «" +
        CATEGORY_NAMES[negativeCategories[0].category] +
        "» изменился на " +
        formatSigned(negativeCategories[0].delta) +
        " пункта в среднем.",
    );
  }
  if (risks.length === 0) {
    risks.push("В каталоге для выбранных мер не указаны отдельные риски.");
  }

  const tradeoffs = [
    "Использовано " +
      formatNumber(result.spent) +
      " из " +
      formatNumber(result.spent + result.remaining) +
      " млн ₸; осталось " +
      formatNumber(result.remaining) +
      " млн ₸.",
    negativeCategories.length > 0
      ? "Есть снижение в направлениях: " +
          negativeCategories
            .map((item) => CATEGORY_NAMES[item.category] + " (" + formatSigned(item.delta) + ")")
            .join(", ") +
          "."
      : "Средние показатели категорий не снизились.",
  ];

  if (weakestDistrict) {
    tradeoffs.push(
      "После сценария самым слабым по взвешенным показателям остаётся район «" +
        weakestDistrict.district.name +
        "» (" +
        formatNumber(weakestDistrict.score) +
        " из 100).",
    );
  }

  return {
    summary:
      "Выбрано пять инициатив на " +
      formatNumber(result.spent) +
      " млн ₸. Score изменился с " +
      formatNumber(result.baselineScore) +
      " до " +
      formatNumber(result.projectedScore) +
      "; бюджет не превышен.",
    strengths,
    risks,
    tradeoffs,
    recommendation: makeRecommendation(improvement, result.projectedScore),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 600;
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 5 &&
    value.every((item) => isNonEmptyString(item))
  );
}

/** Validate model output at runtime before returning it to the browser. */
export function isAIAnalysis(value: unknown): value is AIAnalysis {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  const keys = ["summary", "strengths", "risks", "tradeoffs", "recommendation"];
  return (
    Object.keys(record).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(record, key)) &&
    isNonEmptyString(record.summary) &&
    isStringList(record.strengths) &&
    isStringList(record.risks) &&
    isStringList(record.tradeoffs) &&
    isNonEmptyString(record.recommendation)
  );
}
