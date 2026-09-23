"use client";

import { useMemo, useState } from "react";
import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { calculateSelectionCost, simulate, SimulationError, STARTING_BUDGET } from "../lib/simulation";
import { CATEGORIES, type Category, type Decision, type DistrictId, type Selection } from "../types/simulation";

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
  return CATEGORIES.every((category) => Boolean(selection[category]?.initiativeId));
}

export default function HomePage() {
  const [selection, setSelection] = useState<Selection>({});
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spent = useMemo(() => {
    try { return calculateSelectionCost(selection); } catch { return 0; }
  }, [selection]);
  const complete = isComplete(selection);
  const result = useMemo(() => {
    if (!complete) return null;
    try { return simulate(selection); } catch { return null; }
  }, [complete, selection]);
  const overBudget = spent > STARTING_BUDGET;

  function choose(category: Category, initiativeId: string, districtId?: string) {
    setSelection((current) => ({ ...current, [category]: { initiativeId, ...(districtId ? { districtId: districtId as DistrictId } : {}) } }));
    setError(null);
    setAnalysis(null);
    setAnalysisState("idle");
  }

  function reset() {
    setSelection({});
    setAnalysis(null);
    setAnalysisState("idle");
    setError(null);
  }

  async function requestAnalysis() {
    if (!result) return;
    setAnalysisState("loading");
    setError(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selection }) });
      const payload = await response.json() as { analysis?: { summary?: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось получить анализ.");
      setAnalysis(payload.analysis?.summary ?? "Анализ готов.");
      setAnalysisState("done");
    } catch (requestError) {
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

      <section className="section-heading"><div><div className="eyebrow">01 · ВЫБОР СЦЕНАРИЯ</div><h2>Пять решений города</h2></div><span className="progress-count">{Object.keys(selection).length} / 5 выбрано</span></section>
      <div className="initiative-grid">
        {CATEGORIES.map((category) => {
          const chosen = selection[category];
          return <CategoryCard key={category} category={category} chosen={chosen} onChoose={choose} />;
        })}
      </div>

      <section className="results-section">
        <div className="section-heading"><div><div className="eyebrow">02 · РЕЗУЛЬТАТ СЦЕНАРИЯ</div><h2>Как изменится город</h2></div></div>
        {!result ? <div className="empty-state"><div className="empty-icon">◎</div><h3>Сценарий ещё не готов</h3><p>Выберите по одной инициативе во всех пяти направлениях, чтобы увидеть расчёт.</p></div> : <ResultPanel result={result} />}
      </section>

      <section className="analysis-card">
        <div><div className="eyebrow">03 · AI-АНАЛИЗ</div><h2>Объяснение для управленца</h2><p>AI объяснит компромиссы уже рассчитанного сценария. Числа берутся только из симуляции.</p></div>
        <button className="primary-button" disabled={!result || overBudget || analysisState === "loading"} onClick={requestAnalysis}>{analysisState === "loading" ? "Анализируем…" : "Получить AI-анализ →"}</button>
        {analysis && <div className="analysis-result">{analysis}</div>}
        {analysisState === "error" && <div className="analysis-result muted">AI-анализ временно недоступен. После подключения fallback здесь появится детерминированное объяснение.</div>}
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
    {selected ? <div className="initiative-detail"><div className="cost-line"><strong>{selected.cost} ед.</strong><span>{selected.lag} кв. лаг</span></div><p>{selected.description}</p><small>Риск: {selected.risk}</small></div> : <div className="card-placeholder">Выберите инициативу, чтобы увидеть эффект и ограничения.</div>}
  </article>;
}

function ResultPanel({ result }: { result: ReturnType<typeof simulate> }) {
  return <div className="result-panel"><div className="score-row"><div><span className="label">Astana Quality of Life Score</span><div className="score-values"><strong>{result.projectedScore.toFixed(2)}</strong><span className={result.projectedScore >= result.baselineScore ? "positive" : "negative"}>{result.projectedScore >= result.baselineScore ? "↑" : "↓"} {(result.projectedScore - result.baselineScore).toFixed(2)} к базе</span></div></div><div className="score-baseline"><span>Было</span><b>{result.baselineScore.toFixed(2)}</b></div></div><div className="metric-grid">{Object.entries(result.metricDeltas).map(([code, delta]) => <div className="metric-cell" key={code}><span>{code} · {metricLabels[code]}</span><b className={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)}</b></div>)}</div><div className="result-note">Критические значения: {result.projectedBreakdown.criticalCount}. Самый слабый район: {result.projectedBreakdown.weakestDistrictScore.toFixed(2)} балла.</div></div>;
}
