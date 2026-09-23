import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { averageCategory, calculateDistrictScore, clampMetric, METRIC_CODES, scoreBreakdown } from "./scoring";
import { CATEGORIES, type Category, type Decision, type District, type DistrictId, type Initiative, type Metrics, type ScenarioSuggestion, type Selection, type SimulationResult } from "../types/simulation";

export const STARTING_BUDGET = 100;
export const HORIZON_QUARTERS = 8;
export const REQUIRED_DECISIONS = 5;
export const MAX_PER_CATEGORY = 2;
export const DATASET_EXAMPLE: Selection = [
  { initiativeId: "M7", districtId: "nura" },
  { initiativeId: "M8", districtId: "nura" },
  { initiativeId: "M10", districtId: "nura" },
  { initiativeId: "M12" },
  { initiativeId: "M5", districtId: "saryarka" },
];

type ErrorCode = "INCOMPLETE_SELECTION" | "UNKNOWN_INITIATIVE" | "MISSING_DISTRICT" | "UNEXPECTED_DISTRICT" | "UNKNOWN_DISTRICT" | "OVER_BUDGET" | "INCOMPATIBLE_INITIATIVES" | "DUPLICATE_INITIATIVE" | "CATEGORY_LIMIT";
export class SimulationError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly overspend = 0) {
    super(message);
    this.name = "SimulationError";
  }
}

function initiativeFor(decision: Decision): Initiative {
  if (!decision || typeof decision !== "object" || Array.isArray(decision) || typeof decision.initiativeId !== "string") {
    throw new SimulationError("UNKNOWN_INITIATIVE", "Укажите ID мероприятия из каталога.");
  }
  if (Object.keys(decision).some((key) => key !== "initiativeId" && key !== "districtId")) {
    throw new SimulationError("UNKNOWN_INITIATIVE", "У решения есть неизвестные поля.");
  }
  const initiative = initiatives.find((item) => item.id === decision.initiativeId);
  if (!initiative) throw new SimulationError("UNKNOWN_INITIATIVE", "Мероприятие отсутствует в каталоге M1–M14.");
  return initiative;
}

/** Shared runtime validation. Categories come only from the catalog. */
export function getSelectedInitiatives(selection: Selection): Initiative[] {
  if (!Array.isArray(selection) || selection.length !== REQUIRED_DECISIONS) {
    throw new SimulationError("INCOMPLETE_SELECTION", "Выберите ровно пять уникальных мероприятий.");
  }
  const selected = Array.from(selection, initiativeFor);
  if (new Set(selected.map((initiative) => initiative.id)).size !== REQUIRED_DECISIONS) {
    throw new SimulationError("DUPLICATE_INITIATIVE", "Одно мероприятие нельзя выбирать повторно, даже в другом районе.");
  }
  for (const category of CATEGORIES) {
    if (selected.filter((initiative) => initiative.category === category).length > MAX_PER_CATEGORY) {
      throw new SimulationError("CATEGORY_LIMIT", "Можно выбрать не более двух мероприятий одного направления.");
    }
  }
  selected.forEach((initiative, index) => {
    const decision = selection[index];
    if (initiative.type === "city" && Object.hasOwn(decision, "districtId")) {
      throw new SimulationError("UNEXPECTED_DISTRICT", `Для городской меры ${initiative.id} район не указывается.`);
    }
    if (initiative.type === "district" && !decision.districtId) {
      throw new SimulationError("MISSING_DISTRICT", `Для ${initiative.id} выберите район.`);
    }
    if (initiative.type === "district" && !districts.some((district) => district.id === decision.districtId)) {
      throw new SimulationError("UNKNOWN_DISTRICT", `Для ${initiative.id} указан неизвестный район.`);
    }
  });
  for (const [first, second] of [["M1", "M3"], ["M4", "M7"], ["M5", "M13"]]) {
    const a = selection.find((decision) => decision.initiativeId === first);
    const b = selection.find((decision) => decision.initiativeId === second);
    if (a && b && (first === "M1" || a.districtId === b.districtId)) {
      throw new SimulationError("INCOMPATIBLE_INITIATIVES", first === "M1"
        ? "M1 и M3 несовместимы, даже в разных районах."
        : `${first} и ${second} нельзя применять в одном районе.`);
    }
  }
  return selected;
}

/** Partial selections can show cost, but never receive a scenario Score. */
export function calculateSelectionCost(selection: Selection): number {
  if (!Array.isArray(selection)) throw new SimulationError("INCOMPLETE_SELECTION", "Ожидается список решений.");
  return Array.from(selection, initiativeFor).reduce((total, initiative) => total + initiative.cost, 0);
}

function applyEffects(projected: District[], selected: Initiative[], selection: Selection) {
  const contributions: SimulationResult["contributions"] = [];
  const synergies: SimulationResult["synergies"] = [];
  // Canonical accumulation order also makes floating point results order-independent.
  for (const initiative of [...selected].sort((a, b) => a.id.localeCompare(b.id))) {
    const decision = selection.find((item) => item.initiativeId === initiative.id)!;
    const targets = projected.filter((district) => initiative.type === "city" || district.id === decision.districtId);
    const factor = (HORIZON_QUARTERS - initiative.lag) / HORIZON_QUARTERS;
    const effects = Object.fromEntries(Object.entries(initiative.effects).map(([code, effect]) => [code, effect * factor])) as Partial<Metrics>;
    contributions.push({ initiativeId: initiative.id, districtIds: targets.map((district) => district.id), factor, effects });
    for (const district of targets) for (const code of METRIC_CODES) district.metrics[code] += effects[code] ?? 0;
  }
  const pairs: Array<[string, string, keyof Metrics]> = [["M1", "M2", "T1"], ["M10", "M12", "B1"], ["M5", "M6", "E2"]];
  for (const [first, second, metric] of pairs) {
    const firstDecision = selection.find((decision) => decision.initiativeId === first);
    if (!firstDecision || !selection.some((decision) => decision.initiativeId === second)) continue;
    const district = projected.find((item) => item.id === firstDecision.districtId)!;
    district.metrics[metric] += 2;
    synergies.push({ pair: [first, second], districtId: district.id, metric, bonus: 2 });
  }
  // Clamp once, after every ordinary effect and fixed synergy bonus.
  for (const district of projected) for (const code of METRIC_CODES) district.metrics[code] = clampMetric(district.metrics[code]);
  return { contributions, synergies };
}

export function simulate(selection: Selection): SimulationResult {
  const selectedInitiatives = getSelectedInitiatives(selection);
  const spent = selectedInitiatives.reduce((sum, initiative) => sum + initiative.cost, 0);
  if (spent > STARTING_BUDGET) throw new SimulationError("OVER_BUDGET", `Бюджет превышен на ${spent - STARTING_BUDGET} усл. ед. Замените или уберите меру.`, spent - STARTING_BUDGET);
  const baselineDistricts = structuredClone(districts);
  const projectedDistricts = structuredClone(districts);
  const effects = applyEffects(projectedDistricts, selectedInitiatives, selection);
  const metricDeltas = Object.fromEntries(METRIC_CODES.map((code) => [code,
    projectedDistricts.reduce((sum, district, index) => sum + district.populationShare * (district.metrics[code] - baselineDistricts[index].metrics[code]), 0),
  ])) as Metrics;
  const categoryDeltas = Object.fromEntries(CATEGORIES.map((category) => [category,
    averageCategory(projectedDistricts, category) - averageCategory(baselineDistricts, category),
  ])) as Record<Category, number>;
  const baselineBreakdown = scoreBreakdown(baselineDistricts);
  const projectedBreakdown = scoreBreakdown(projectedDistricts);
  const districtDeltas = Object.fromEntries(districts.map((district, index) => [district.id,
    calculateDistrictScore(projectedDistricts[index]) - calculateDistrictScore(district),
  ])) as Record<DistrictId, number>;
  return {
    selection: structuredClone(selection), selectedInitiatives, baselineDistricts, projectedDistricts,
    baselineScore: baselineBreakdown.score, projectedScore: projectedBreakdown.score,
    baselineBreakdown, projectedBreakdown, spent, remaining: STARTING_BUDGET - spent,
    metricDeltas, categoryDeltas, districtDeltas, ...effects,
  };
}

/** Exhaustive single replacement, including changing a district; not a global optimum. */
export function findScoreImprovement(selection: Selection): ScenarioSuggestion | null {
  const current = simulate(selection);
  let best: ScenarioSuggestion | null = null;
  selection.forEach((from, index) => {
    for (const initiative of initiatives) {
      if (selection.some((decision, other) => other !== index && decision.initiativeId === initiative.id)) continue;
      for (const districtId of initiative.type === "district" ? districts.map((district) => district.id) : [undefined]) {
        const to: Decision = { initiativeId: initiative.id, ...(districtId ? { districtId } : {}) };
        if (from.initiativeId === to.initiativeId && from.districtId === to.districtId) continue;
        const candidate = selection.map((decision, i) => i === index ? to : decision);
        try {
          const result = simulate(candidate);
          if (result.projectedScore > current.projectedScore + 1e-9 && (!best || result.projectedScore > best.projectedScore + 1e-9)) {
            best = { selection: candidate, changes: [{ index, from, to }], spent: result.spent, projectedScore: result.projectedScore };
          }
        } catch (error) {
          if (!(error instanceof SimulationError)) throw error;
        }
      }
    }
  });
  return best;
}
