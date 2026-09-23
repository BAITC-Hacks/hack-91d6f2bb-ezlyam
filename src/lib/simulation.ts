import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import {
  CATEGORIES,
  type Category,
  type District,
  type Initiative,
  type Metrics,
  type Selection,
  type SimulationResult,
} from "../types/simulation";
import { averageMetric, calculateDistrictScore, clampMetric, scoreDistricts } from "./scoring";

export const STARTING_BUDGET = 1000;

export interface ScenarioSuggestion {
  selection: Selection;
  changes: Array<{ category: Category; from: Initiative; to: Initiative }>;
  spent: number;
  projectedScore: number;
}

export class SimulationError extends Error {
  readonly code: "INCOMPLETE_SELECTION" | "UNKNOWN_INITIATIVE" | "OVER_BUDGET" | "NO_DISTRICTS";
  readonly overspend: number;

  constructor(
    code: "INCOMPLETE_SELECTION" | "UNKNOWN_INITIATIVE" | "OVER_BUDGET" | "NO_DISTRICTS",
    message: string,
    overspend = 0,
  ) {
    super(message);
    this.name = "SimulationError";
    this.code = code;
    this.overspend = overspend;
  }
}

function getSelectedInitiatives(selection: Selection): Initiative[] {
  if (
    !selection ||
    typeof selection !== "object" ||
    Array.isArray(selection) ||
    Object.keys(selection).length !== CATEGORIES.length ||
    CATEGORIES.some((category) => typeof selection[category] !== "string" || !selection[category])
  ) {
    throw new SimulationError("INCOMPLETE_SELECTION", "Выберите по одной инициативе в каждой из пяти категорий.");
  }

  return CATEGORIES.map((category) => {
    const initiative = initiatives.find((item) => item.id === selection[category]);
    if (!initiative || initiative.category !== category) {
      throw new SimulationError("UNKNOWN_INITIATIVE", `Некорректная инициатива для категории ${category}.`);
    }
    return initiative;
  });
}

/** Returns the current spend even while the user has selected fewer than five categories. */
export function calculateSelectionCost(selection: Partial<Selection>): number {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new SimulationError("INCOMPLETE_SELECTION", "Некорректный набор решений.");
  }

  return CATEGORIES.reduce((total, category) => {
    const id = selection[category];
    if (!id) return total;
    const initiative = initiatives.find((item) => item.id === id && item.category === category);
    if (!initiative) {
      throw new SimulationError("UNKNOWN_INITIATIVE", `Некорректная инициатива для категории ${category}.`);
    }
    return total + initiative.cost;
  }, 0);
}

function copyDistrict(district: District): District {
  return { ...district, metrics: { ...district.metrics } };
}

export function simulate(selection: Selection): SimulationResult {
  if (districts.length === 0) {
    throw new SimulationError("NO_DISTRICTS", "Нет исходных данных по районам.");
  }

  const selectedInitiatives = getSelectedInitiatives(selection);
  const spent = selectedInitiatives.reduce((sum, initiative) => sum + initiative.cost, 0);
  if (spent > STARTING_BUDGET) {
    const overspend = spent - STARTING_BUDGET;
    throw new SimulationError("OVER_BUDGET", `Бюджет превышен на ${overspend} млн ₸.`, overspend);
  }

  const baselineDistricts = districts.map(copyDistrict);
  const projectedDistricts = districts.map(copyDistrict);
  for (const initiative of selectedInitiatives) {
    const targets = new Set(initiative.targetDistrictIds);
    for (const district of projectedDistricts) {
      if (!targets.has(district.id)) continue;
      for (const category of CATEGORIES) {
        const effect = initiative.effects[category];
        if (effect !== undefined) {
          district.metrics[category] = clampMetric(district.metrics[category] + effect);
        }
      }
    }
  }

  const categoryDeltas = Object.fromEntries(
    CATEGORIES.map((category: Category) => [
      category,
      Math.round((averageMetric(projectedDistricts, category) - averageMetric(baselineDistricts, category)) * 10) / 10,
    ]),
  ) as Metrics;
  const districtDeltas = Object.fromEntries(
    projectedDistricts.map((district, index) => [
      district.id,
      Math.round((calculateDistrictScore(district) - calculateDistrictScore(baselineDistricts[index])) * 10) / 10,
    ]),
  ) as Record<string, number>;

  return {
    selection: { ...selection },
    selectedInitiatives,
    baselineDistricts,
    projectedDistricts,
    baselineScore: scoreDistricts(baselineDistricts),
    projectedScore: scoreDistricts(projectedDistricts),
    spent,
    remaining: STARTING_BUDGET - spent,
    categoryDeltas,
    districtDeltas,
  };
}

function describeSuggestion(original: Selection, result: SimulationResult): ScenarioSuggestion {
  const changes = CATEGORIES.flatMap((category) => {
    if (original[category] === result.selection[category]) return [];
    const from = initiatives.find((item) => item.id === original[category] && item.category === category);
    const to = initiatives.find((item) => item.id === result.selection[category] && item.category === category);
    return from && to ? [{ category, from, to }] : [];
  });
  return {
    selection: result.selection,
    changes,
    spent: result.spent,
    projectedScore: result.projectedScore,
  };
}

/** Find the best affordable plan while changing as few of the user's choices as possible. */
export function findAffordableAlternative(selection: Selection): ScenarioSuggestion | null {
  getSelectedInitiatives(selection);
  if (calculateSelectionCost(selection) <= STARTING_BUDGET) return null;

  let best: ScenarioSuggestion | null = null;
  const candidate = {} as Selection;

  function search(index: number, cost: number, changes: number): void {
    if (cost > STARTING_BUDGET || (best && changes > best.changes.length)) return;
    if (index === CATEGORIES.length) {
      const result = simulate(candidate);
      const suggestion = describeSuggestion(selection, result);
      if (
        !best ||
        suggestion.changes.length < best.changes.length ||
        (suggestion.changes.length === best.changes.length && suggestion.projectedScore > best.projectedScore) ||
        (suggestion.changes.length === best.changes.length && suggestion.projectedScore === best.projectedScore && suggestion.spent < best.spent)
      ) {
        best = suggestion;
      }
      return;
    }

    const category = CATEGORIES[index];
    for (const item of initiatives.filter((entry) => entry.category === category)) {
      candidate[category] = item.id;
      search(index + 1, cost + item.cost, changes + Number(item.id !== selection[category]));
    }
  }

  search(0, 0, 0);
  return best;
}

/** Find a single affordable swap that produces the largest positive Score gain. */
export function findScoreImprovement(selection: Selection): ScenarioSuggestion | null {
  const current = simulate(selection);
  let best: ScenarioSuggestion | null = null;

  for (const category of CATEGORIES) {
    for (const item of initiatives.filter((entry) => entry.category === category && entry.id !== selection[category])) {
      const candidate = { ...selection, [category]: item.id };
      if (calculateSelectionCost(candidate) > STARTING_BUDGET) continue;
      const result = simulate(candidate);
      if (result.projectedScore <= current.projectedScore) continue;
      const suggestion = describeSuggestion(selection, result);
      if (
        !best ||
        suggestion.projectedScore > best.projectedScore ||
        (suggestion.projectedScore === best.projectedScore && suggestion.spent < best.spent)
      ) {
        best = suggestion;
      }
    }
  }

  return best;
}
