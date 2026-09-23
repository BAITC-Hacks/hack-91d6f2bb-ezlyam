"use client";

import { useMemo, useRef, useState } from "react";
import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { calculateSelectionCost, simulate, SimulationError, STARTING_BUDGET } from "../lib/simulation";
import { CATEGORIES, type AIAnalysis, type AnalyzeResponse, type Category, type Decision, type DistrictId, type Selection } from "../types/simulation";

const categoryInfo: Record<Category, { label: string; short: string; tone: string }> = {
  transport: { label: "Транспорт", short: "T", tone: "blue" },
  ecology: { label: "Экология и озеленение", short: "E", tone: "green" },
  social: { label: "Социальная сфера", short: "S", tone: "violet" },
  safety: { label: "Безопасность", short: "B", tone: "orange" },
  services: { label: "Городские сервисы", short: "C", tone: "teal" },
};

const metricLabels: Record<string, string> = { T1: "Разгрузка дорог", T2: "Общественный транспорт", E1: "Озеленение", E2: "Качество воздуха", S1: "Школы и детсады", S2: "Медпомощь", B1: "Безопасность улиц", B2: "Безопасность движения", C1: "Надёжность ЖКХ", C2: "Обращения жителей" };

function formatMoney(value: number) {
  return `${(value * 10).toLocaleString("ru-RU")} млн ₸`;
}

function isComplete(selection: Selection): boolean {
  return CATEGORIES.every((category) => {
    const decision = selection[category];
    const initiative = initiatives.find((item) => item.id === decision?.initiativeId && item.category === category);
    return Boolean(initiative && (initiative.type === "city" || decision?.districtId));
  });
}

export default function HomePage() {
  const [selection, setSelection] = useState<Selection>({});
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const spent = useMemo(() => {
    try { return calculateSelectionCost(selection); } catch { return 0; }
  }, [selection]);
  const complete = isComplete(selection);
  const scenario = useMemo(() => {
    if (!complete) return { result: null, validationError: null };
    try { return { result: simulate(selection), validationError: null }; }
    catch (problem) { return { result: null, validationError: problem instanceof SimulationError ? problem.message : "Не удалось рассчитать сценарий." }; }
  }, [complete, selection]);
  const result = scenario.result;
  const overBudget = spent > STARTING_BUDGET;

  function choose(category: Category, initiativeId: string, districtId?: string) {
    setSelection((current) => {
      const next = { ...current };
      if (!initiativeId) delete next[category];
      else next[category] = { initiativeId, ...(districtId ? { districtId: districtId as DistrictId } : {}) };
      return next;
    });
    requestVersion.current += 1;
    setError(null);
    setAnalysis(null);
    setAnalysisState("idle");
  }

  function reset() {
    requestVersion.current += 1;
    setSelection({});
    setAnalysis(null);
    setAnalysisState("idle");
    setError(null);
  }

  async function requestAnalysis() {
    if (!result) return;
    const version = ++requestVersion.current;
    setAnalysisState("loading");
    setError(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selection }) });
      const payload = await response.json() as AnalyzeResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Не удалось получить анализ.");
      if (!payload.analysis) throw new Error("Ответ анализа оказался неполным.");
      if (version !== requestVersion.current) return;
      setAnalysis(payload);
      setAnalysisState("done");
    } catch (requestError) {
      if (version !== requestVersion.current) return;
      setAnalysisState("error");
      setError(requestError instanceof Error ? requestError.message : "Ошибка AI-анализа.");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">Q</span><span>Qala Balance AI</span></div>
        <span className="status-pill"><span className="status-dot" /> Синтетическая модель</span>
      </header>

      <section className="hero">
        <div className="eyebrow">HACKALEM AI · СИМУЛЯТОР РЕШЕНИЙ</div>
        <h1>Аким на 5 часов</h1>
        <p>Соберите сценарий развития города: выберите по одной инициативе в каждом направлении и посмотрите, как изменится качество жизни районов.</p>
      </section>

      <section className="budget-card">
        <div><span className="label">Единый бюджет города</span><strong>{formatMoney(STARTING_BUDGET)}</strong></div>
        <div className="budget-track"><span style={{ width: `${Math.min(100, (spent / STARTING_BUDGET) * 100)}%` }} /></div>
        <div className="budget-numbers"><span>Потрачено <b>{formatMoney(spent)}</b></span><span>Осталось <b className={overBudget ? "danger" : ""}>{formatMoney(STARTING_BUDGET - spent)}</b></span></div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {overBudget && <div className="alert error">Бюджет превышен. Замените одну или несколько инициатив.</div>}
      {scenario.validationError && !overBudget && <div className="alert error">{scenario.validationError}</div>}

      <section className="section-heading"><div><div className="eyebrow">01 · ВЫБОР СЦЕНАРИЯ</div><h2>Пять решений города</h2></div><span className="progress-count">{CATEGORIES.filter((category) => selection[category]?.initiativeId).length} / 5 выбрано</span></section>
      <div className="initiative-grid">
        {CATEGORIES.map((category) => {
          const chosen = selection[category];
          return <CategoryCard key={category} category={category} chosen={chosen} onChoose={choose} />;
        })}
      </div>

      <section className="results-section">
        <div className="section-heading"><div><div className="eyebrow">02 · РЕЗУЛЬТАТ СЦЕНАРИЯ</div><h2>Как изменится город</h2></div></div>
        {!result ? <div className="empty-state"><div className="empty-icon">◎</div><h3>Сценарий ещё не готов</h3><p>{scenario.validationError ?? "Выберите по одной инициативе и район для районных мер во всех пяти направлениях."}</p></div> : <ResultPanel result={result} />}
      </section>

      <section className="analysis-card">
        <div><div className="eyebrow">03 · AI-АНАЛИЗ</div><h2>Объяснение для управленца</h2><p>AI объяснит компромиссы уже рассчитанного сценария. Числа берутся только из симуляции.</p></div>
        <button className="primary-button" disabled={!result || overBudget || analysisState === "loading"} onClick={requestAnalysis}>{analysisState === "loading" ? "Анализируем…" : "Получить AI-анализ →"}</button>
        {analysis && <div className="analysis-result"><span className="label">Источник: {analysis.source === "fallback" ? "локальный анализ" : "OpenAI"}</span><h3>Итог</h3><p>{analysis.analysis.summary}</p><AnalysisList title="Сильные стороны" items={analysis.analysis.strengths} /><AnalysisList title="Риски" items={analysis.analysis.risks} /><AnalysisList title="Компромиссы" items={analysis.analysis.tradeoffs} /><h3>Рекомендация</h3><p>{analysis.analysis.recommendation}</p></div>}
      </section>

      <footer><span>Qala Balance AI</span><span>Модель синтетическая · 8 кварталов</span><button className="text-button" onClick={reset}>Сбросить сценарий</button></footer>
    </main>
  );
}

function CategoryCard({ category, chosen, onChoose }: { category: Category; chosen?: Decision; onChoose: (category: Category, initiativeId: string, districtId?: string) => void }) {
  const info = categoryInfo[category];
  const options = initiatives.filter((initiative) => initiative.category === category);
  const selected = options.find((initiative) => initiative.id === chosen?.initiativeId);
  return <article className={`category-card ${info.tone}`}>
    <div className="category-title"><span className="category-icon">{info.short}</span><div><span className="category-number">{String(CATEGORIES.indexOf(category) + 1).padStart(2, "0")}</span><h3>{info.label}</h3></div></div>
    <label className="field-label" htmlFor={`initiative-${category}`}>Мероприятие</label>
    <select id={`initiative-${category}`} value={chosen?.initiativeId ?? ""} onChange={(event) => onChoose(category, event.target.value)}>
      <option value="">Выберите инициативу</option>
      {options.map((initiative) => <option key={initiative.id} value={initiative.id}>{initiative.id} · {initiative.title} · {initiative.cost} ед.</option>)}
    </select>
    {selected?.type === "district" && <><label className="field-label" htmlFor={`district-${category}`}>Район</label><select id={`district-${category}`} value={chosen?.districtId ?? ""} onChange={(event) => onChoose(category, selected.id, event.target.value)}><option value="">Выберите район</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></>}
    {selected ? <div className="initiative-detail"><div className="cost-line"><strong>{formatMoney(selected.cost)}</strong><span>{selected.lag} кв. лаг · {selected.type === "city" ? "весь город" : "один район"}</span></div><p>{selected.description}</p><p>Полные эффекты: {Object.entries(selected.effects).map(([code, value]) => `${code} ${value! > 0 ? "+" : ""}${value}`).join(", ")}. За 8 кварталов учитывается доля {(8 - selected.lag) / 8}.</p><small>Риск: {selected.risk}</small></div> : <div className="card-placeholder">Выберите инициативу, чтобы увидеть эффект и ограничения.</div>}
  </article>;
}

function ResultPanel({ result }: { result: ReturnType<typeof simulate> }) {
  return <div className="result-panel"><div className="score-row"><div><span className="label">Astana Quality of Life Score</span><div className="score-values"><strong>{result.projectedScore.toFixed(2)}</strong><span className={result.projectedScore >= result.baselineScore ? "positive" : "negative"}>{result.projectedScore >= result.baselineScore ? "↑" : "↓"} {(result.projectedScore - result.baselineScore).toFixed(2)} к базе</span></div></div><div className="score-baseline"><span>Было</span><b>{result.baselineScore.toFixed(2)}</b></div></div><h3>Изменения по направлениям</h3><div className="category-results">{CATEGORIES.map((category) => <div key={category}><span>{categoryInfo[category].label}</span><b className={result.categoryDeltas[category] >= 0 ? "positive" : "negative"}>{result.categoryDeltas[category] >= 0 ? "+" : ""}{result.categoryDeltas[category].toFixed(2)}</b></div>)}</div><h3>Изменения по районам</h3><div className="district-results">{result.projectedDistricts.map((district) => <div key={district.id}><span>{district.name}</span><span>{result.baselineBreakdown.districtScores[district.id].toFixed(2)} → {result.projectedBreakdown.districtScores[district.id].toFixed(2)}</span><b className={result.districtDeltas[district.id] >= 0 ? "positive" : "negative"}>{result.districtDeltas[district.id] >= 0 ? "+" : ""}{result.districtDeltas[district.id].toFixed(2)}</b></div>)}</div><h3>Изменения показателей</h3><div className="metric-grid">{Object.entries(result.metricDeltas).map(([code, delta]) => <div className="metric-cell" key={code}><span>{code} · {metricLabels[code]}</span><b className={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)}</b></div>)}</div><div className="result-note">Критические значения: {result.projectedBreakdown.criticalCount}. Самый слабый район: {result.projectedBreakdown.weakestDistrictScore.toFixed(2)} балла.</div></div>;
}

function AnalysisList({ title, items }: { title: string; items: AIAnalysis["strengths"] }) {
  return <><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></>;
}
