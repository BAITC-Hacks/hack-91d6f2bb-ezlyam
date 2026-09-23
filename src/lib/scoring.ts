import { CATEGORIES, type Category, type District, type Metrics } from "../types/simulation";

export const SCORE_WEIGHTS: Readonly<Metrics> = {
  transport: 0.25,
  greenery: 0.16,
  social: 0.24,
  safety: 0.20,
  services: 0.15,
};

export const clampMetric = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

const roundOne = (value: number): number => Math.round(value * 10) / 10;

export function calculateDistrictScore(district: District): number {
  return CATEGORIES.reduce(
    (sum, category) => sum + clampMetric(district.metrics[category]) * SCORE_WEIGHTS[category],
    0,
  );
}

/**
 * Score = weighted mean of district metrics minus 0.1 point for each point
 * by which the gap between best and worst districts exceeds 20 points.
 * All metrics and the final score are clamped to 0–100; result has one decimal.
 */
export function scoreDistricts(districts: readonly District[]): number {
  if (districts.length === 0) return 0;

  const scores = districts.map(calculateDistrictScore);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const gap = Math.max(...scores) - Math.min(...scores);
  const inequalityPenalty = Math.max(0, gap - 20) * 0.1;
  return roundOne(clampMetric(mean - inequalityPenalty));
}

export function averageMetric(districts: readonly District[], category: Category): number {
  if (districts.length === 0) return 0;
  const total = districts.reduce((sum, district) => sum + clampMetric(district.metrics[category]), 0);
  return roundOne(total / districts.length);
}
