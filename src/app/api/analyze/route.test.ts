import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";
import { DATASET_EXAMPLE, simulate } from "../../../lib/simulation";
import { isAIAnalysis } from "../../../lib/fallbackAnalysis";

const request = (body: unknown) => new Request("http://localhost/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function withMock(action: () => Promise<void>, fetchMock?: typeof fetch) {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  if (fetchMock) { process.env.OPENAI_API_KEY = "test-key"; globalThis.fetch = fetchMock; }
  else delete process.env.OPENAI_API_KEY;
  try { await action(); }
  finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
}

const modelResponse = (text: unknown, status = "completed") => new Response(JSON.stringify({
  id: "resp_test", object: "response", status,
  output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(text), annotations: [] }] }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

test("official two-social scenario returns clearly labeled Russian fallback without a key", async () => {
  await withMock(async () => {
    const response = await POST(request({ selection: DATASET_EXAMPLE }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "fallback");
    assert.equal(body.fallbackReason, "missing_key");
    assert.match(body.analysis.summary, /52,56/);
    assert.match(body.analysis.summary, /56,54/);
    assert.match(body.analysis.summary, /95 усл/);
    assert.doesNotMatch(JSON.stringify(body), /₸|млн/);
    assert.ok(isAIAnalysis(body.analysis));
    assert.match(body.analysis.tradeoffs.join(" "), /M10 \+ M12/);
  });
});

test("malformed JSON, object-shaped old contract and client-provided numbers fail", async () => {
  assert.equal((await POST(new Request("http://localhost/api/analyze", { method: "POST", body: "{" }))).status, 400);
  for (const body of [null, {}, { selection: {} }, { selection: DATASET_EXAMPLE, projectedScore: 9999 }, { selection: DATASET_EXAMPLE.slice(0, 4) }]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(await response.json()), ["error"]);
  }
});

test("all runtime validation errors return only a reason, never Score or AI output", async () => {
  const cases: Array<[unknown[], string]> = [
    [[null, ...DATASET_EXAMPLE.slice(1)], "UNKNOWN_INITIATIVE"],
    [[{ initiativeId: "M99" }, ...DATASET_EXAMPLE.slice(1)], "UNKNOWN_INITIATIVE"],
    [[{ initiativeId: "M7" }, ...DATASET_EXAMPLE.slice(1)], "MISSING_DISTRICT"],
    [[{ initiativeId: "M7", districtId: "unknown" }, ...DATASET_EXAMPLE.slice(1)], "UNKNOWN_DISTRICT"],
    [[{ initiativeId: "M7", districtId: "esil" }, ...DATASET_EXAMPLE.slice(0, 4)], "DUPLICATE_INITIATIVE"],
    [[...DATASET_EXAMPLE.slice(0, 3), { initiativeId: "M12", districtId: "nura" }, DATASET_EXAMPLE[4]], "UNEXPECTED_DISTRICT"],
    [[...DATASET_EXAMPLE.slice(0, 4), { initiativeId: "M9", districtId: "nura" }], "CATEGORY_LIMIT"],
    [[...DATASET_EXAMPLE.slice(0, 4), { initiativeId: "M4", districtId: "nura" }], "INCOMPATIBLE_INITIATIVES"],
  ];
  for (const [selection, code] of cases) {
    const response = await POST(request({ selection }));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(body.error.code, code);
  }
});

test("101-unit scenario returns 422 with overspend and no scenario Score", async () => {
  const selection = [{ initiativeId: "M2" }, { initiativeId: "M5", districtId: "saryarka" }, { initiativeId: "M7", districtId: "nura" }, { initiativeId: "M12" }, { initiativeId: "M14" }];
  const response = await POST(request({ selection }));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.equal(body.error.overspend, 1);
});

test("OpenAI receives computed target districts, lagged contributions, synergies and full precision", async () => {
  let captured: Record<string, unknown> | undefined;
  const explanation = { strengths: ["В Нуре усилены образование и первичная медицинская помощь."], risks: ["Инфраструктурным мерам потребуется время на реализацию."] };
  await withMock(async () => {
    const response = await POST(request({ selection: DATASET_EXAMPLE }));
    const body = await response.json();
    assert.equal(body.source, "openai");
    assert.deepEqual(body.analysis.strengths, explanation.strengths);
    assert.match(body.analysis.summary, /56,54/);
    assert.ok(isAIAnalysis(body.analysis));
    assert.ok(captured);
    assert.equal(captured.store, false);
    const input = captured.input as Array<{ content: string }>;
    const scenario = JSON.parse(input[1].content);
    assert.equal(scenario.scoreAfter, simulate(DATASET_EXAMPLE).projectedScore);
    assert.equal(scenario.spent, 95);
    const school = scenario.selectedInitiatives.find((m: { id: string }) => m.id === "M7");
    assert.equal(school.decision.districtId, "nura");
    assert.equal(school.realizedContribution.effects.S1, 10);
    assert.equal(scenario.synergies[0].bonus, 2);
  }, async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    return modelResponse(explanation);
  });
});

for (const [label, response] of [
  ["missing fields", () => modelResponse({})],
  ["invented numeric claim", () => modelResponse({ strengths: ["Score 99"], risks: ["Риск задержки."] })],
  ["extra recommendation", () => modelResponse({ strengths: ["Польза."], risks: ["Риск."], recommendation: "Потратить всё" })],
  ["empty list", () => modelResponse({ strengths: [], risks: ["Риск."] })],
  ["truncated response", () => modelResponse({ strengths: ["Польза."], risks: ["Риск."] }, "incomplete")],
  ["refusal", () => new Response(JSON.stringify({ id: "resp_test", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No" }] }] }), { headers: { "Content-Type": "application/json" } })],
  ["HTTP error", () => new Response(JSON.stringify({ error: { message: "Unavailable" } }), { status: 500, headers: { "Content-Type": "application/json" } })],
  ["network error", () => { throw new Error("Network unavailable"); }],
] as const) test(`${label} falls back without changing the computed summary`, async () => {
  await withMock(async () => {
    const result = await POST(request({ selection: DATASET_EXAMPLE }));
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.source, "fallback");
    assert.equal(body.fallbackReason, "unavailable");
    assert.match(body.analysis.summary, /56,54/);
  }, async () => response());
});
