/** Shared contract for the three implementation lanes. Monetary values are million ₸. */
export const CATEGORIES = [
  "transport",
  "greenery",
  "social",
  "safety",
  "services",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Metrics = Record<Category, number>;
export type Selection = Record<Category, string>;

export interface District {
  id: string;
  name: string;
  metrics: Metrics;
}

export interface Initiative {
  id: string;
  title: string;
  description: string;
  category: Category;
  cost: number;
  targetDistrictIds: string[];
  effects: Partial<Metrics>;
  risk: string;
}

export interface SimulationResult {
  selection: Selection;
  selectedInitiatives: Initiative[];
  baselineDistricts: District[];
  projectedDistricts: District[];
  baselineScore: number;
  projectedScore: number;
  spent: number;
  remaining: number;
  /** Change in the mean district metric for each category. */
  categoryDeltas: Metrics;
  /** Change in each district's weighted metric score, keyed by district ID. */
  districtDeltas: Record<string, number>;
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
}
