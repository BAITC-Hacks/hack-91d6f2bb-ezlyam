import type { District } from "../types/simulation";

/** Синтетические значения, не официальная статистика Астаны. */
export const districts: District[] = [
  { id: "esil", name: "Есиль", populationShare: 0.27, metrics: { T1: 45, T2: 62, E1: 68, E2: 72, S1: 48, S2: 55, B1: 78, B2: 60, C1: 75, C2: 70 } },
  { id: "almaty", name: "Алматы", populationShare: 0.24, metrics: { T1: 40, T2: 75, E1: 50, E2: 55, S1: 60, S2: 65, B1: 62, B2: 52, C1: 50, C2: 60 } },
  { id: "saryarka", name: "Сарыарка", populationShare: 0.20, metrics: { T1: 50, T2: 70, E1: 42, E2: 40, S1: 62, S2: 68, B1: 58, B2: 55, C1: 45, C2: 55 } },
  { id: "baikonyr", name: "Байконур", populationShare: 0.13, metrics: { T1: 52, T2: 68, E1: 55, E2: 50, S1: 58, S2: 60, B1: 52, B2: 58, C1: 55, C2: 58 } },
  { id: "nura", name: "Нура", populationShare: 0.16, metrics: { T1: 55, T2: 40, E1: 45, E2: 65, S1: 38, S2: 35, B1: 55, B2: 50, C1: 60, C2: 50 } },
];
