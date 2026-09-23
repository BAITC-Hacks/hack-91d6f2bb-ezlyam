import { districts } from "../data/districts";
import { type Category, type District, type DistrictId, type MetricCode, type Metrics, type ScoreBreakdown } from "../types/simulation";

export const METRIC_CODES: readonly MetricCode[] = ["T1", "T2", "E1", "E2", "S1", "S2", "B1", "B2", "C1", "C2"];
export const SCORE_WEIGHTS: Readonly<Metrics> = { T1: 0.10, T2: 0.10, E1: 0.09, E2: 0.11, S1: 0.11, S2: 0.11, B1: 0.09, B2: 0.09, C1: 0.10, C2: 0.10 };

export const clampMetric = (value: number): number => Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

export function calculateDistrictScore(district: District): number {
  return METRIC_CODES.reduce((sum, code) => sum + clampMetric(district.metrics[code]) * SCORE_WEIGHTS[code], 0);
}

export function countCriticalValues(districtsToScore: readonly District[]): number {
  return districtsToScore.reduce((count, district) => count + METRIC_CODES.filter((code) => clampMetric(district.metrics[code]) < 40).length, 0);
}

export function scoreBreakdown(districtsToScore: readonly District[]): ScoreBreakdown {
  if (districtsToScore.length === 0) return { districtScores: {} as Record<DistrictId, number>, populationWeightedAverage: 0, weakestDistrictScore: 0, criticalCount: 0, inequalityPenalty: 0, score: 0 };
  const districtScores = Object.fromEntries(districtsToScore.map((district) => [district.id, calculateDistrictScore(district)])) as Record<DistrictId, number>;
  const populationWeightedAverage = districtsToScore.reduce((sum, district) => sum + district.populationShare * districtScores[district.id], 0);
  const weakestDistrictScore = Math.min(...districtsToScore.map((district) => districtScores[district.id]));
  const criticalCount = countCriticalValues(districtsToScore);
  const score = 0.7 * populationWeightedAverage + 0.3 * weakestDistrictScore - criticalCount;
  return {
    districtScores,
    populationWeightedAverage,
    weakestDistrictScore,
    criticalCount,
    inequalityPenalty: criticalCount,
    score,
  };
}

export function scoreDistricts(districtsToScore: readonly District[]): number {
  return scoreBreakdown(districtsToScore).score;
}

export function averageMetric(districtsToScore: readonly District[], code: MetricCode): number {
  if (districtsToScore.length === 0) return 0;
  return districtsToScore.reduce((sum, district) => sum + district.populationShare * clampMetric(district.metrics[code]), 0);
}

export function averageCategory(districtsToScore: readonly District[], category: Category): number {
  const codesByCategory: Record<Category, MetricCode[]> = { transport: ["T1", "T2"], ecology: ["E1", "E2"], social: ["S1", "S2"], safety: ["B1", "B2"], services: ["C1", "C2"] };
  const codes = codesByCategory[category];
  if (districtsToScore.length === 0) return 0;
  return districtsToScore.reduce((sum, district) => sum + district.populationShare * codes.reduce((inner, code) => inner + clampMetric(district.metrics[code]), 0) / codes.length, 0);
}

export function baselineScore(): number {
  return scoreDistricts(districts);
}
