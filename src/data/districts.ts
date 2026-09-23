import type { District } from "../types/simulation";

/** Synthetic starting values, not official statistics for Astana. */
export const districts: District[] = [
  {
    id: "esil",
    name: "Есиль",
    metrics: { transport: 72, greenery: 68, social: 67, safety: 73, services: 76 },
  },
  {
    id: "nura",
    name: "Нура",
    metrics: { transport: 61, greenery: 57, social: 59, safety: 66, services: 64 },
  },
  {
    id: "almaty",
    name: "Алматы",
    metrics: { transport: 64, greenery: 52, social: 63, safety: 58, services: 61 },
  },
  {
    id: "saryarka",
    name: "Сарыарка",
    metrics: { transport: 56, greenery: 48, social: 60, safety: 55, services: 53 },
  },
  {
    id: "baikonyr",
    name: "Байконыр",
    metrics: { transport: 52, greenery: 46, social: 54, safety: 57, services: 50 },
  },
];
