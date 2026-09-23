import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

const selection = {
  transport: { initiativeId: "M1", districtId: "nura" },
  ecology: { initiativeId: "M5", districtId: "saryarka" },
  social: { initiativeId: "M7", districtId: "nura" },
  safety: { initiativeId: "M10", districtId: "nura" },
  services: { initiativeId: "M12" },
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("valid selection returns a deterministic Russian fallback without a key", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const response = await POST(request({ selection, projectedScore: 9999 }));
    // Only a selection is accepted, so client-provided numbers cannot influence the result.
    assert.equal(response.status, 400);
    const validResponse = await POST(request({ selection }));
    assert.equal(validResponse.status, 200);
    const body = await validResponse.json();
    assert.equal(body.source, "fallback");
    assert.match(body.analysis.summary, /52,56/);
    assert.ok(body.analysis.strengths.length > 0);
    assert.ok(body.analysis.risks.length > 0);
    assert.ok(body.analysis.tradeoffs.length > 0);
    assert.ok(body.analysis.recommendation.length > 0);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("invalid JSON, incomplete selection, and invalid district are rejected", async () => {
  const malformed = new Request("http://localhost/api/analyze", { method: "POST", body: "{" });
  assert.equal((await POST(malformed)).status, 400);
  assert.equal((await POST(request({ selection: { ...selection, social: undefined } }))).status, 400);
  const invalidDistrict = await POST(request({ selection: { ...selection, transport: { initiativeId: "M1", districtId: "unknown" } } }));
  assert.equal(invalidDistrict.status, 400);
  assert.equal((await invalidDistrict.json()).error.code, "UNKNOWN_DISTRICT");
});

test("over-budget selection returns a valid affordable suggestion", async () => {
  const expensive = { ...selection, transport: { initiativeId: "M3", districtId: "nura" }, services: { initiativeId: "M13", districtId: "almaty" } };
  const response = await POST(request({ selection: expensive }));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.overspend, 19);
  assert.ok(body.suggestion.spent <= 100);
  assert.equal(body.suggestion.remaining, 100 - body.suggestion.spent);
});

test("malformed model response falls back without losing the scenario", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "resp_test", object: "response", status: "completed", output: [] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
  try {
    const response = await POST(request({ selection }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).source, "fallback");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("a valid structured model response keeps the computed recommendation", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  const modelAnalysis = {
    summary: "Сценарий улучшает качество городской среды.",
    strengths: ["Сильный эффект для транспорта."],
    risks: ["Есть задержка эффекта."],
    tradeoffs: ["Бюджет ограничивает другие меры."],
    recommendation: "Придуманная моделью рекомендация",
  };
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "resp_test", object: "response", created_at: 1, status: "completed",
    output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(modelAnalysis), annotations: [] }] }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const response = await POST(request({ selection }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "openai");
    assert.equal(body.analysis.summary, modelAnalysis.summary);
    assert.notEqual(body.analysis.recommendation, modelAnalysis.recommendation);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
