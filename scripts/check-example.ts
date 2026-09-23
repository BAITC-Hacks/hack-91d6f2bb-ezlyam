import assert from "node:assert/strict";
import { DATASET_EXAMPLE, simulate } from "../src/lib/simulation";

const result = simulate(DATASET_EXAMPLE);
assert.equal(result.spent, 95);
assert.ok(Math.abs(result.baselineScore - 52.55768) < 1e-9);
assert.ok(Math.abs(result.projectedScore - 56.54307) < 1e-9);
assert.equal(result.projectedBreakdown.criticalCount, 0);
assert.equal(result.synergies.length, 1);
console.log(JSON.stringify({
  selection: result.selection,
  spent: result.spent,
  remaining: result.remaining,
  baseline: result.baselineBreakdown,
  projected: result.projectedBreakdown,
  displayedScore: result.projectedScore.toFixed(2),
  synergies: result.synergies,
}, null, 2));
