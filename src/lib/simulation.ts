import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { averageCategory, calculateDistrictScore, clampMetric, METRIC_CODES, scoreBreakdown } from "./scoring";
import { CATEGORIES, type Category, type Decision, type District, type DistrictId, type Initiative, type Metrics, type ScenarioSuggestion, type Selection, type SimulationResult } from "../types/simulation";

export const STARTING_BUDGET = 100;
export const HORIZON_QUARTERS = 8;
type ErrorCode = "INCOMPLETE_SELECTION" | "UNKNOWN_INITIATIVE" | "MISSING_DISTRICT" | "UNKNOWN_DISTRICT" | "OVER_BUDGET" | "INCOMPATIBLE_INITIATIVES" | "NO_DISTRICTS";

export class SimulationError extends Error {
  readonly code: ErrorCode;
  readonly overspend: number;
  constructor(code: ErrorCode, message: string, overspend = 0) { super(message); this.name = "SimulationError"; this.code = code; this.overspend = overspend; }
}

const copyDistrict = (district: District): District => ({ ...district, metrics: { ...district.metrics } });
const initiativeFor = (decision: Decision | undefined, category: Category): Initiative => {
  if (!decision || typeof decision.initiativeId !== "string" || !decision.initiativeId) throw new SimulationError("INCOMPLETE_SELECTION", "Выберите по одной инициативе в каждой из пяти категорий.");
  const initiative = initiatives.find((item) => item.id === decision.initiativeId && item.category === category);
  if (!initiative) throw new SimulationError("UNKNOWN_INITIATIVE", `Некорректная инициатива для направления ${category}.`);
  if (initiative.type === "district" && !decision.districtId) throw new SimulationError("MISSING_DISTRICT", `Для ${initiative.id} нужно выбрать район.`);
  if (decision.districtId && !districts.some((district) => district.id === decision.districtId)) throw new SimulationError("UNKNOWN_DISTRICT", `Неизвестный район: ${decision.districtId}.`);
  return initiative;
};

export function getSelectedInitiatives(selection: Selection): Initiative[] {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new SimulationError("INCOMPLETE_SELECTION", "Некорректный набор решений.");
  const selected = CATEGORIES.map((category) => initiativeFor(selection[category], category));
  if (new Set(selected.map((initiative) => initiative.id)).size !== selected.length) throw new SimulationError("INCOMPLETE_SELECTION", "Одно мероприятие нельзя выбрать повторно.");
  const pairs: Array<[string, string]> = [["M1", "M3"], ["M4", "M7"], ["M5", "M13"]];
  for (const [first, second] of pairs) {
    const a = selected.find((initiative) => initiative.id === first);
    const b = selected.find((initiative) => initiative.id === second);
    if (!a || !b) continue;
    const aDistrict = selection[a.category]?.districtId;
    const bDistrict = selection[b.category]?.districtId;
    if (first === "M1" || first === "M3" || aDistrict === bDistrict) throw new SimulationError("INCOMPATIBLE_INITIATIVES", `${first} и ${second} несовместимы.`);
  }
  return selected;
}

export function calculateSelectionCost(selection: Selection): number {
  if (!selection || typeof selection !== "object") throw new SimulationError("INCOMPLETE_SELECTION", "Некорректный набор решений.");
  return CATEGORIES.reduce((total, category) => total + (selection[category] ? initiativeFor(selection[category], category).cost : 0), 0);
}

const targetDistricts = (initiative: Initiative, decision: Decision): District[] => initiative.type === "city" ? districts : districts.filter((district) => district.id === decision.districtId);

function applyEffects(projected: District[], selected: Initiative[], selection: Selection): void {
  selected.forEach((initiative) => {
    const decision = selection[initiative.category];
    if (!decision) return;
    const factor = (HORIZON_QUARTERS - initiative.lag) / HORIZON_QUARTERS;
    for (const district of targetDistricts(initiative, decision)) {
      const output = projected.find((item) => item.id === district.id);
      if (!output) continue;
      for (const code of METRIC_CODES) {
        const effect = initiative.effects[code];
        if (effect !== undefined) output.metrics[code] = clampMetric(output.metrics[code] + effect * factor);
      }
    }
  });
  const synergy = (first: string, second: string, code: keyof Metrics, districtId: DistrictId | undefined) => {
    if (!selected.some((initiative) => initiative.id === first) || !selected.some((initiative) => initiative.id === second) || !districtId) return;
    const district = projected.find((item) => item.id === districtId);
    if (district) district.metrics[code] = clampMetric(district.metrics[code] + 2);
  };
  synergy("M1", "M2", "T1", selection.transport?.districtId);
  synergy("M10", "M12", "B1", selection.safety?.districtId);
  synergy("M5", "M6", "E2", selection.ecology?.districtId);
}

export function simulate(selection: Selection): SimulationResult {
  if (districts.length === 0) throw new SimulationError("NO_DISTRICTS", "Нет исходных данных по районам.");
  const selectedInitiatives = getSelectedInitiatives(selection);
  const spent = selectedInitiatives.reduce((sum, initiative) => sum + initiative.cost, 0);
  if (spent > STARTING_BUDGET) throw new SimulationError("OVER_BUDGET", `Бюджет превышен на ${spent - STARTING_BUDGET} условных единиц.`, spent - STARTING_BUDGET);
  const baselineDistricts = districts.map(copyDistrict);
  const projectedDistricts = districts.map(copyDistrict);
  applyEffects(projectedDistricts, selectedInitiatives, selection);
  const metricDeltas = Object.fromEntries(METRIC_CODES.map((code) => [code, Math.round((projectedDistricts.reduce((sum, district, index) => sum + district.metrics[code] - baselineDistricts[index].metrics[code], 0) / districts.length) * 100) / 100])) as Metrics;
  const categoryDeltas = Object.fromEntries(CATEGORIES.map((category) => [category, Math.round((averageCategory(projectedDistricts, category) - averageCategory(baselineDistricts, category)) * 100) / 100])) as Record<Category, number>;
  const baselineBreakdown = scoreBreakdown(baselineDistricts);
  const projectedBreakdown = scoreBreakdown(projectedDistricts);
  const districtDeltas = Object.fromEntries(districts.map((district, index) => [district.id, Math.round((calculateDistrictScore(projectedDistricts[index]) - calculateDistrictScore(district)) * 100) / 100])) as Record<DistrictId, number>;
  return { selection: structuredClone(selection), selectedInitiatives, baselineDistricts, projectedDistricts, baselineScore: baselineBreakdown.score, projectedScore: projectedBreakdown.score, baselineBreakdown, projectedBreakdown, spent, remaining: STARTING_BUDGET - spent, metricDeltas, categoryDeltas, districtDeltas };
}

export function findScoreImprovement(selection: Selection): ScenarioSuggestion | null {
  const current = simulate(selection);
  let best: ScenarioSuggestion | null = null;
  for (const category of CATEGORIES) for (const initiative of initiatives.filter((item) => item.category === category && item.id !== selection[category]?.initiativeId)) {
    for (const districtId of initiative.type === "district" ? districts.map((district) => district.id) : [undefined]) {
      const candidate: Selection = { ...selection, [category]: { initiativeId: initiative.id, ...(districtId ? { districtId } : {}) } };
      try { const result = simulate(candidate); if (result.projectedScore > current.projectedScore && (!best || result.projectedScore > best.projectedScore)) best = { selection: candidate, changes: [{ category, from: selection[category]!, to: candidate[category]! }], spent: result.spent, projectedScore: result.projectedScore }; } catch { /* invalid candidate */ }
    }
  }
  return best;
}
