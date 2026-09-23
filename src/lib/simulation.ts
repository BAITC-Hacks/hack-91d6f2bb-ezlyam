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
