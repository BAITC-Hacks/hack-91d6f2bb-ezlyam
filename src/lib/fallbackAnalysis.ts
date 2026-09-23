import type { AIAnalysis, Category, SimulationResult } from "../types/simulation";
import { calculateDistrictScore } from "./scoring";
import { findScoreImprovement, STARTING_BUDGET } from "./simulation";

const CATEGORY_NAMES: Record<Category, string> = {
  transport: "транспорта",
  greenery: "озеленения",
  social: "социальной инфраструктуры",
  safety: "безопасности",
  services: "городских сервисов",
};

const points = (value: number): string => value.toFixed(1).replace(".", ",");
const signed = (value: number): string => `${value > 0 ? "+" : ""}${points(value)}`;

/** A server-approved recommendation that cannot exceed the fixed budget. */
export function buildSafeRecommendation(result: SimulationResult): string {
  const improvement = findScoreImprovement(result.selection);
  if (!improvement) {
    return `Текущий набор укладывается в бюджет (${result.spent} из ${STARTING_BUDGET} млн ₸). Среди одиночных замен инициатив нет варианта, который повысит Score без перерасхода; сохраните этот сценарий или сравните несколько замен вручную.`;
  }

  const change = improvement.changes[0];
  return `Замените «${change.from.title}» на «${change.to.title}». Расход составит ${improvement.spent} из ${STARTING_BUDGET} млн ₸, остаток — ${STARTING_BUDGET - improvement.spent} млн ₸; расчётный Score вырастет с ${points(result.projectedScore)} до ${points(improvement.projectedScore)}.`;
}

/** Deterministic explanation of the already computed scenario; no network or model needed. */
export function buildFallbackAnalysis(result: SimulationResult): AIAnalysis {
  const scoreDelta = result.projectedScore - result.baselineScore;
  const orderedCategories = (Object.entries(result.categoryDeltas) as Array<[Category, number]>)
    .sort((a, b) => b[1] - a[1]);
  const improved = orderedCategories.filter(([, delta]) => delta > 0);
  const weakened = orderedCategories.filter(([, delta]) => delta < 0);
  const costliest = [...result.selectedInitiatives].sort((a, b) => b.cost - a.cost)[0];
  const districtChanges = result.projectedDistricts.map((district, index) => ({
    name: district.name,
    delta: result.districtDeltas[district.id] ?? 0,
    projected: calculateDistrictScore(district),
    baseline: calculateDistrictScore(result.baselineDistricts[index]),
  }));
  const leastImproved = [...districtChanges].sort((a, b) => a.delta - b.delta)[0];
  const beforeGap = Math.max(...districtChanges.map((item) => item.baseline)) -
    Math.min(...districtChanges.map((item) => item.baseline));
  const afterGap = Math.max(...districtChanges.map((item) => item.projected)) -
    Math.min(...districtChanges.map((item) => item.projected));

  const strengths = improved.slice(0, 2).map(([category, delta]) =>
    `Средний показатель ${CATEGORY_NAMES[category]} изменился на ${signed(delta)} пункта.`);
  if (strengths.length === 0) {
    strengths.push("Выбранные меры не повысили средние показатели; это сигнал пересмотреть набор инициатив.");
  }

  const risks = weakened.slice(0, 2).map(([category, delta]) =>
    `Средний показатель ${CATEGORY_NAMES[category]} снизился на ${points(Math.abs(delta))} пункта.`);
  if (costliest) risks.push(`Риск инициативы «${costliest.title}»: ${costliest.risk}`);
  if (leastImproved) {
    risks.push(`Зона «${leastImproved.name}» получила наименьшее изменение районного показателя (${signed(leastImproved.delta)}).`);
  }

  const tradeoffs: string[] = [];
  if (costliest) {
    tradeoffs.push(`Самая дорогая мера — «${costliest.title}» (${costliest.cost} млн ₸), поэтому на остальные решения остаётся меньше средств.`);
  }
  tradeoffs.push(`Разрыв между самым сильным и слабым районом по взвешенному показателю изменился с ${points(beforeGap)} до ${points(afterGap)} пункта.`);
  tradeoffs.push(`Из ${STARTING_BUDGET} млн ₸ потрачено ${result.spent}, осталось ${result.remaining} млн ₸; дополнительные меры в этот расчёт не включены.`);

  return {
    summary: `В условном сценарии Astana Quality of Life Score изменился с ${points(result.baselineScore)} до ${points(result.projectedScore)} (${signed(scoreDelta)}). Это результат модели на синтетических данных, а не прогноз для Астаны.`,
    strengths,
    risks,
    tradeoffs,
    recommendation: buildSafeRecommendation(result),
  };
}
