import assert from "node:assert/strict";
import test from "node:test";
import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { type District, type DistrictId, type MetricCode, type Selection } from "../types/simulation";
import { clampMetric, countCriticalValues, METRIC_CODES, scoreBreakdown, SCORE_WEIGHTS } from "./scoring";
import { calculateSelectionCost, DATASET_EXAMPLE, findScoreImprovement, simulate, SimulationError } from "./simulation";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const plan = (...ids: string[]): Selection => ids.map((initiativeId) => ({ initiativeId, ...(initiatives.find((item) => item.id === initiativeId)?.type === "district" ? { districtId: "nura" as const } : {}) }));
const rejects = (value: unknown, code: SimulationError["code"]) => assert.throws(() => simulate(value as Selection), (error: unknown) => error instanceof SimulationError && error.code === code);

// Independently transcribed catalog values from pages 2-3 of the supplied dataset.
const expectedCatalog = [
  ["M1", "transport", "district", 18, 2, { T1: 6, T2: 9 }],
  ["M2", "transport", "city", 22, 2, { T1: 4, B2: 3 }],
  ["M3", "transport", "district", 30, 4, { T1: 16, T2: 20, E2: 4 }],
  ["M4", "ecology", "district", 15, 2, { E1: 12, E2: 3, B1: 2 }],
  ["M5", "ecology", "district", 25, 3, { E2: 14, C1: 4 }],
  ["M6", "ecology", "city", 20, 4, { E1: 5, E2: 3 }],
  ["M7", "social", "district", 24, 3, { S1: 16 }],
  ["M8", "social", "district", 20, 3, { S2: 14 }],
  ["M9", "social", "district", 10, 1, { S1: 3, S2: 3, B1: 3 }],
  ["M10", "safety", "district", 12, 1, { B1: 12, B2: 2 }],
  ["M11", "safety", "district", 10, 1, { B2: 12, T1: -2 }],
  ["M12", "services", "city", 14, 1, { C2: 5 }],
  ["M13", "services", "district", 28, 4, { C1: 18, E2: 2 }],
  ["M14", "services", "city", 16, 1, { C1: 5, C2: 2 }],
];

test("all catalog prices, categories, targets, effects and lags match the PDF", () => {
  assert.deepEqual(initiatives.map((m) => [m.id, m.category, m.type, m.cost, m.lag, m.effects]), expectedCatalog);
});

test("five district populations and all fifty baseline indicators match the PDF", () => {
  assert.deepEqual(districts.map((d) => [d.name, d.populationShare, ...METRIC_CODES.map((k) => d.metrics[k])]), [
    ["Есиль", .27, 45, 62, 68, 72, 48, 55, 78, 60, 75, 70],
    ["Алматы", .24, 40, 75, 50, 55, 60, 65, 62, 52, 50, 60],
    ["Сарыарка", .20, 50, 70, 42, 40, 62, 68, 58, 55, 45, 55],
    ["Байконур", .13, 52, 68, 55, 50, 58, 60, 52, 58, 55, 58],
    ["Нура", .16, 55, 40, 45, 65, 38, 35, 55, 50, 60, 50],
  ]);
  close(districts.reduce((sum, d) => sum + d.populationShare, 0), 1);
  assert.deepEqual(Object.values(SCORE_WEIGHTS), [.10, .10, .09, .11, .11, .11, .09, .09, .10, .10]);
});

test("baseline retains full precision and displays 52.56", () => {
  const b = scoreBreakdown(districts);
  close(b.populationWeightedAverage, 56.8624);
  close(b.weakestDistrictScore, 49.18);
  assert.equal(b.criticalCount, 2);
  close(b.score, 52.55768);
  assert.equal(b.score.toFixed(2), "52.56");
});

test("official example: two social measures, cost 95, Score 56.54307", () => {
  const r = simulate(DATASET_EXAMPLE);
  assert.equal(r.spent, 95);
  assert.equal(r.remaining, 5);
  close(r.projectedScore, 56.54307);
  close(r.projectedBreakdown.populationWeightedAverage, 58.0776);
  close(r.projectedBreakdown.weakestDistrictScore, 52.9625);
  assert.equal(r.projectedBreakdown.criticalCount, 0);
  const nura = r.projectedDistricts.find((d) => d.id === "nura")!;
  assert.deepEqual(nura.metrics, { T1: 55, T2: 40, E1: 45, E2: 65, S1: 48, S2: 43.75, B1: 67.5, B2: 51.75, C1: 60, C2: 54.375 });
  assert.deepEqual(r.synergies, [{ pair: ["M10", "M12"], districtId: "nura", metric: "B1", bonus: 2 }]);
});

test("exactly five decisions: empty, four, six, object and sparse array fail", () => {
  for (const selection of [[], DATASET_EXAMPLE.slice(0, 4), [...DATASET_EXAMPLE, { initiativeId: "M2" }], {}, null]) rejects(selection, "INCOMPLETE_SELECTION");
  rejects(new Array(5), "UNKNOWN_INITIATIVE");
});

test("duplicate ID in a different district and three social measures fail", () => {
  rejects([...DATASET_EXAMPLE.slice(0, 4), { initiativeId: "M7", districtId: "esil" }], "DUPLICATE_INITIATIVE");
  rejects(plan("M7", "M8", "M9", "M10", "M12"), "CATEGORY_LIMIT");
});

test("unknown/malformed initiative and unknown fields fail", () => {
  for (const decision of [null, "M7", {}, { initiativeId: "M99" }, { initiativeId: "M7", districtId: "nura", cost: 0 }]) {
    rejects([decision, ...DATASET_EXAMPLE.slice(1)], "UNKNOWN_INITIATIVE");
  }
});

test("district is required for district measures and forbidden for city measures", () => {
  rejects([{ initiativeId: "M7" }, ...DATASET_EXAMPLE.slice(1)], "MISSING_DISTRICT");
  rejects([{ initiativeId: "M7", districtId: "unknown" }, ...DATASET_EXAMPLE.slice(1)], "UNKNOWN_DISTRICT");
  for (const districtId of ["nura", "", null, undefined]) {
    const selection = structuredClone(DATASET_EXAMPLE);
    selection[3] = { initiativeId: "M12", districtId } as Selection[number];
    rejects(selection, "UNEXPECTED_DISTRICT");
  }
});

test("BRT and LRT conflict even in different districts", () => {
  const selection = plan("M1", "M3", "M4", "M9", "M11");
  selection[1].districtId = "esil";
  rejects(selection, "INCOMPATIBLE_INITIATIVES");
});

test("land and fuel/network conflicts are local to one district", () => {
  for (const ids of [["M4", "M7", "M9", "M10", "M12"], ["M5", "M13", "M9", "M10", "M12"]]) {
    const selection = plan(...ids);
    rejects(selection, "INCOMPATIBLE_INITIATIVES");
    selection[0].districtId = "saryarka";
    assert.ok(simulate(selection).spent <= 100);
  }
});

test("budget exactly 100 succeeds, 101 fails; unused money gives no bonus", () => {
  const exact = plan("M3", "M13", "M8", "M10", "M9");
  assert.equal(simulate(exact).remaining, 0);
  rejects(plan("M2", "M5", "M7", "M12", "M14"), "OVER_BUDGET");
  assert.equal(simulate(plan("M9", "M11", "M10", "M12", "M4")).spent, 61);
  const r = simulate(DATASET_EXAMPLE);
  close(r.projectedScore, .7 * r.projectedBreakdown.populationWeightedAverage + .3 * r.projectedBreakdown.weakestDistrictScore - r.projectedBreakdown.criticalCount);
});

test("city effects reach all districts and city cost is charged once", () => {
  const r = simulate(DATASET_EXAMPLE);
  r.projectedDistricts.forEach((district, index) => close(district.metrics.C2 - districts[index].metrics.C2, 4.375));
  assert.equal(r.contributions.find((item) => item.initiativeId === "M12")!.districtIds.length, 5);
  assert.equal(calculateSelectionCost([{ initiativeId: "M12" }]), 14);
});

for (const [ids, metric, expected] of [
  [["M1", "M2", "M9", "M10", "M12"], "T1", 64.5],
  [["M5", "M6", "M9", "M10", "M12"], "E2", 77.25],
] as const) test(`synergy ${ids[0]} + ${ids[1]} is unscaled and applies only to the first measure's district`, () => {
  const selection = plan(...ids);
  const r = simulate(selection);
  close(r.projectedDistricts.find((d) => d.id === "nura")!.metrics[metric], expected);
  const cityEffect = metric === "T1" ? 3 : 1.5;
  close(r.projectedDistricts[0].metrics[metric] - districts[0].metrics[metric], cityEffect);
  assert.ok(r.synergies.some((item) => item.pair[0] === ids[0] && item.bonus === 2));
});

test("absent partner gives no synergy; all four lag factors and negative M11 effect work", () => {
  const r = simulate(plan("M3", "M5", "M9", "M11", "M12"));
  assert.deepEqual(r.synergies, []);
  close(r.projectedDistricts.find((d) => d.id === "nura")!.metrics.T1, 55 + 16 * .5 - 2 * .875);
  assert.equal(r.contributions.find((item) => item.initiativeId === "M5")!.factor, .625);
  assert.equal(simulate(plan("M1", "M4", "M9", "M10", "M12")).contributions.find((item) => item.initiativeId === "M1")!.factor, .75);
});

test("critical threshold is strictly below 40 and counts cells, not districts", () => {
  const d: District = structuredClone(districts[0]);
  d.populationShare = 1;
  for (const code of METRIC_CODES) d.metrics[code] = 40;
  assert.equal(countCriticalValues([d]), 0);
  d.metrics.T1 = 39.999;
  d.metrics.T2 = 39.999;
  assert.equal(countCriticalValues([d]), 2);
  for (const code of METRIC_CODES) d.metrics[code] = 0;
  assert.equal(scoreBreakdown([d]).score, -10); // The Score itself must not be clamped.
});

test("clamping happens after all effects, not after each measure", () => {
  const original = districts[4].metrics.T1;
  districts[4].metrics.T1 = 99;
  try {
    const r = simulate(plan("M1", "M2", "M9", "M11", "M12"));
    assert.equal(r.projectedDistricts[4].metrics.T1, 100);
  } finally { districts[4].metrics.T1 = original; }
  assert.equal(clampMetric(-2), 0);
  assert.equal(clampMetric(102), 100);
});

function permutations<T>(values: T[]): T[][] {
  if (!values.length) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map((tail) => [value, ...tail]));
}

test("all 120 orders yield identical results without mutating source data or input", () => {
  const source = structuredClone(districts);
  const input = structuredClone(DATASET_EXAMPLE);
  const expected = simulate(input);
  for (const order of permutations(input)) {
    const r = simulate(order);
    assert.deepEqual(r.projectedDistricts, expected.projectedDistricts);
    assert.deepEqual(r.projectedBreakdown, expected.projectedBreakdown);
  }
  assert.deepEqual(districts, source);
  assert.deepEqual(input, DATASET_EXAMPLE);
});

test("changing a decision changes Score and local search returns a valid improvement", () => {
  const original = simulate(DATASET_EXAMPLE);
  const changed = structuredClone(DATASET_EXAMPLE);
  changed[2].districtId = "esil";
  assert.notEqual(simulate(changed).projectedScore, original.projectedScore);
  const suggestion = findScoreImprovement(changed);
  assert.ok(suggestion);
  const verified = simulate(suggestion.selection);
  assert.ok(verified.projectedScore > simulate(changed).projectedScore);
  assert.equal(verified.spent, suggestion.spent);
  assert.equal(verified.projectedScore, suggestion.projectedScore);
});

/** Independent per-cell reference: no production effect/scoring helpers. */
function reference(selection: Selection) {
  const keys = ["T1", "T2", "E1", "E2", "S1", "S2", "B1", "B2", "C1", "C2"] as MetricCode[];
  const weights = [.10, .10, .09, .11, .11, .11, .09, .09, .10, .10];
  const rows = districts.map((district) => keys.map((key) => {
    let value = district.metrics[key];
    for (const decision of selection) {
      const m = initiatives.find((item) => item.id === decision.initiativeId)!;
      if (m.type === "city" || decision.districtId === district.id) value += (m.effects[key] ?? 0) * (1 - m.lag / 8);
    }
    for (const [first, second, metric] of [["M1", "M2", "T1"], ["M10", "M12", "B1"], ["M5", "M6", "E2"]]) {
      if (key === metric && selection.some((m) => m.initiativeId === first && m.districtId === district.id) && selection.some((m) => m.initiativeId === second)) value += 2;
    }
    return Math.max(0, Math.min(100, value));
  }));
  const scores = rows.map((row) => row.reduce((sum, value, index) => sum + value * weights[index], 0));
  return .7 * scores.reduce((sum, value, index) => sum + value * districts[index].populationShare, 0) + .3 * Math.min(...scores) - rows.flat().filter((value) => value < 40).length;
}

test("all 2002 unique ID combinations agree with independent validity and score checks", () => {
  let total = 0, validCount = 0;
  const codes = initiatives.map((item) => item.id);
  function visit(start: number, chosen: string[]) {
    if (chosen.length < 5) {
      for (let i = start; i < codes.length; i++) visit(i + 1, [...chosen, codes[i]]);
      return;
    }
    total++;
    const selection = chosen.map((initiativeId, index) => ({ initiativeId, ...(initiatives.find((m) => m.id === initiativeId)!.type === "district" ? { districtId: districts[(total + index) % 5].id as DistrictId } : {}) }));
    const selected = chosen.map((id) => initiatives.find((m) => m.id === id)!);
    const cost = selected.reduce((sum, m) => sum + m.cost, 0);
    const tooMany = selected.some((m) => selected.filter((other) => other.category === m.category).length > 2);
    const incompatible = [["M1", "M3"], ["M4", "M7"], ["M5", "M13"]].some(([a, b]) => {
      const first = selection.find((m) => m.initiativeId === a);
      const second = selection.find((m) => m.initiativeId === b);
      return first && second && (a === "M1" || first.districtId === second.districtId);
    });
    if (cost > 100 || tooMany || incompatible) assert.throws(() => simulate(selection), SimulationError);
    else {
      validCount++;
      close(simulate(selection).projectedScore, reference(selection));
    }
  }
  visit(0, []);
  assert.equal(total, 2002);
  assert.ok(validCount > 500);
});
