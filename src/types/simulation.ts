export const CATEGORIES = ["transport", "ecology", "social", "safety", "services"] as const;

export type Category = (typeof CATEGORIES)[number];
export type MetricCode = "T1" | "T2" | "E1" | "E2" | "S1" | "S2" | "B1" | "B2" | "C1" | "C2";
export type Metrics = Record<MetricCode, number>;
export type DistrictId = "esil" | "almaty" | "saryarka" | "baikonyr" | "nura";
export type InitiativeType = "district" | "city";

export interface District {
  id: DistrictId;
  name: string;
  populationShare: number;
  metrics: Metrics;
}

export interface Initiative {
  id: string;
  title: string;
  description: string;
  category: Category;
  type: InitiativeType;
  cost: number;
  lag: number;
  effects: Partial<Record<MetricCode, number>>;
  risk: string;
}

export interface Decision {
  initiativeId: string;
  districtId?: DistrictId;
}

/** Exactly five unique initiatives when complete; up to two per category. */
export type Selection = Decision[];

export interface ScoreBreakdown {
  districtScores: Record<DistrictId, number>;
  populationWeightedAverage: number;
  weakestDistrictScore: number;
  criticalCount: number;
  inequalityPenalty: number;
  score: number;
}

export interface ScenarioSuggestion {
  selection: Selection;
  changes: Array<{ index: number; from: Decision; to: Decision }>;
  spent: number;
  projectedScore: number;
}

export interface SimulationResult {
  selection: Selection;
  selectedInitiatives: Initiative[];
  baselineDistricts: District[];
  projectedDistricts: District[];
  baselineScore: number;
  projectedScore: number;
  baselineBreakdown: ScoreBreakdown;
  projectedBreakdown: ScoreBreakdown;
  spent: number;
  remaining: number;
  metricDeltas: Metrics;
  categoryDeltas: Record<Category, number>;
  districtDeltas: Record<DistrictId, number>;
  contributions: Array<{
    initiativeId: string;
    districtIds: DistrictId[];
    factor: number;
    effects: Partial<Metrics>;
  }>;
  synergies: Array<{ pair: [string, string]; districtId: DistrictId; metric: MetricCode; bonus: number }>;
}

export interface AIAnalysis {
  summary: string;
  strengths: string[];
  risks: string[];
  tradeoffs: string[];
  recommendation: string;
}

export interface AnalyzeResponse {
  analysis: AIAnalysis;
  source: "openai" | "fallback";
  fallbackReason?: "missing_key" | "unavailable";
}
