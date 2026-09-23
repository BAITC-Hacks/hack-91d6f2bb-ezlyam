import assert from "node:assert/strict";
import test from "node:test";
import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { CATEGORIES, type District, type Selection } from "../types/simulation";
import { clampMetric, countCriticalValues, scoreDistricts } from "./scoring";
import { calculateSelectionCost, findAffordableAlternative, findScoreImprovement, simulate, SimulationError, STARTING_BUDGET } from "./simulation";

const valid: Selection = { transport: { initiativeId: "M1", districtId: "nura" }, ecology: { initiativeId: "M5", districtId: "saryarka" }, social: { initiativeId: "M7", districtId: "nura" }, safety: { initiativeId: "M10", districtId: "nura" }, services: { initiativeId: "M12" } };

test("the catalog contains exactly the 14 initiatives from the dataset", () => {
  assert.equal(initiatives.length, 14);
  for (const category of CATEGORIES) assert.ok(initiatives.some((initiative) => initiative.category === category));
});

test("the baseline score matches the dataset", () => assert.equal(scoreDistricts(districts), 52.56));

test("a valid five-decision scenario applies lagged effects and stays in budget", () => {
  const result = simulate(valid);
  assert.equal(result.selectedInitiatives.length, 5);
  assert.equal(result.spent, 93);
  assert.equal(result.remaining, STARTING_BUDGET - 93);
  assert.notEqual(result.projectedScore, result.baselineScore);
  assert.equal(result.projectedDistricts.find((district) => district.id === "nura")?.metrics.S1, 48);
  assert.equal(result.projectedDistricts.find((district) => district.id === "nura")?.metrics.B1, 67.5);
});

test("district initiatives require a district", () => {
  assert.throws(() => simulate({ ...valid, transport: { initiativeId: "M1" } }), (error: unknown) => error instanceof SimulationError && error.code === "MISSING_DISTRICT");
  assert.throws(() => simulate({ ...valid, services: { initiativeId: "M12", districtId: "nura" } }), (error: unknown) => error instanceof SimulationError && error.code === "UNEXPECTED_DISTRICT");
});

test("incomplete and incompatible selections are rejected", () => {
  assert.throws(() => simulate({ ...valid, social: undefined }), (error: unknown) => error instanceof SimulationError && error.code === "INCOMPLETE_SELECTION");
  assert.throws(() => simulate({ ...valid, ecology: { initiativeId: "M4", districtId: "nura" }, social: { initiativeId: "M7", districtId: "nura" } }), (error: unknown) => error instanceof SimulationError && error.code === "INCOMPATIBLE_INITIATIVES");
  assert.throws(() => simulate({ ...valid, services: { initiativeId: "M13", districtId: "saryarka" } }), (error: unknown) => error instanceof SimulationError && error.code === "INCOMPATIBLE_INITIATIVES");
});

test("over-budget scenarios are rejected and receive an affordable replacement", () => {
  const expensive: Selection = { ...valid, transport: { initiativeId: "M3", districtId: "nura" }, services: { initiativeId: "M13", districtId: "almaty" } };
  assert.throws(() => simulate(expensive), (error: unknown) => error instanceof SimulationError && error.code === "OVER_BUDGET" && error.overspend === 19);
  const suggestion = findAffordableAlternative(expensive);
  assert.ok(suggestion);
  assert.equal(suggestion.changes.length, 2);
  assert.ok(suggestion.spent <= STARTING_BUDGET);
  assert.equal(simulate(suggestion.selection).spent, suggestion.spent);
});

test("the score formula counts critical values and clamps metrics", () => {
  assert.equal(clampMetric(-20), 0);
  assert.equal(clampMetric(120), 100);
  assert.equal(countCriticalValues(districts), 2);
  const outOfRange: District = { id: "nura", name: "Нура", populationShare: 1, metrics: { T1: 200, T2: -10, E1: 50, E2: 50, S1: 50, S2: 50, B1: 50, B2: 50, C1: 50, C2: 50 } };
  assert.ok(scoreDistricts([outOfRange]) >= 0 && scoreDistricts([outOfRange]) <= 100);
});

test("selection cost supports partial budget display", () => {
  assert.equal(calculateSelectionCost({ transport: valid.transport, services: valid.services }), 32);
  assert.equal(calculateSelectionCost(valid), 93);
});

test("changing a decision changes the result without mutating source data", () => {
  const original = structuredClone(districts);
  const first = simulate(valid);
  const second = simulate({ ...valid, transport: { initiativeId: "M2" } });
  assert.notEqual(first.projectedScore, second.projectedScore);
  assert.deepEqual(districts, original);
});

test("a score improvement suggestion is valid", () => {
  const suggestion = findScoreImprovement(valid);
  assert.ok(suggestion);
  assert.ok(suggestion.spent <= STARTING_BUDGET);
  assert.ok(suggestion.projectedScore > simulate(valid).projectedScore);
});
