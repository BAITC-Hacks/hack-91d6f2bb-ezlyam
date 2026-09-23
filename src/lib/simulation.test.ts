import assert from "node:assert/strict";
import test from "node:test";
import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { CATEGORIES, type District, type Selection } from "../types/simulation";
import { clampMetric, scoreDistricts } from "./scoring";
import { simulate, SimulationError, STARTING_BUDGET } from "./simulation";

const affordable: Selection = {
  transport: "bike-network",
  greenery: "courtyard-trees",
  social: "mobile-clinics",
  safety: "street-lighting",
  services: "service-kiosks",
};

test("catalog has three distinct initiatives for each category", () => {
  for (const category of CATEGORIES) {
    const categoryItems = initiatives.filter((item) => item.category === category);
    assert.equal(categoryItems.length, 3);
    assert.equal(new Set(categoryItems.map((item) => item.id)).size, 3);
  }
});

test("a valid scenario spends within budget and changes the deterministic score", () => {
  const result = simulate(affordable);
  assert.equal(result.selectedInitiatives.length, 5);
  assert.equal(result.spent, 610);
  assert.equal(result.remaining, STARTING_BUDGET - 610);
  assert.ok(result.projectedScore > result.baselineScore);
  assert.deepEqual(simulate(affordable), result);
});

test("changing a choice changes the score and does not mutate baseline data", () => {
  const original = structuredClone(districts);
  const first = simulate(affordable);
  const second = simulate({ ...affordable, transport: "bus-priority" });
  assert.notEqual(first.projectedScore, second.projectedScore);
  assert.deepEqual(districts, original);
  assert.deepEqual(first.baselineDistricts, original);
});

test("incomplete, mismatched and over-budget selections are rejected", () => {
  assert.throws(() => simulate({ ...affordable, social: "" }), (error: unknown) =>
    error instanceof SimulationError && error.code === "INCOMPLETE_SELECTION");
  assert.throws(() => simulate({ ...affordable, social: "bike-network" }), (error: unknown) =>
    error instanceof SimulationError && error.code === "UNKNOWN_INITIATIVE");
  const expensive: Selection = {
    transport: "rapid-transit",
    greenery: "green-river",
    social: "new-schools",
    safety: "dispatch-safety",
    services: "smart-maintenance",
  };
  assert.throws(() => simulate(expensive), (error: unknown) =>
    error instanceof SimulationError && error.code === "OVER_BUDGET" && error.overspend === 430);
});

test("metrics and score remain within 0–100, including bad or empty input", () => {
  assert.equal(clampMetric(-20), 0);
  assert.equal(clampMetric(120), 100);
  assert.equal(clampMetric(Number.NaN), 0);
  assert.equal(scoreDistricts([]), 0);
  const outOfRange: District = {
    id: "test",
    name: "Тест",
    metrics: { transport: 200, greenery: -10, social: 50, safety: 50, services: 50 },
  };
  assert.ok(scoreDistricts([outOfRange]) >= 0 && scoreDistricts([outOfRange]) <= 100);
});

test("large disparity carries a transparent inequality penalty", () => {
  const high: District = {
    id: "high", name: "Высокий", metrics: { transport: 100, greenery: 100, social: 100, safety: 100, services: 100 },
  };
  const low: District = {
    id: "low", name: "Низкий", metrics: { transport: 0, greenery: 0, social: 0, safety: 0, services: 0 },
  };
  assert.equal(scoreDistricts([high, low]), 42);
});
