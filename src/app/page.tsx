"use client";

import { useMemo, useRef, useState } from "react";
import { districts } from "../data/districts";
import { initiatives } from "../data/initiatives";
import { calculateSelectionCost, DATASET_EXAMPLE, simulate, SimulationError, STARTING_BUDGET } from "../lib/simulation";
import { METRIC_CODES, scoreBreakdown } from "../lib/scoring";
import { CATEGORIES, type AIAnalysis, type AnalyzeResponse, type Category, type Decision, type DistrictId, type SimulationResult } from "../types/simulation";

const categoryInfo: Record<Category, { label: string; short: string; tone: string }> = {
  transport: { label: "Транспорт", short: "T", tone: "blue" },
  ecology: { label: "Экология и озеленение", short: "E", tone: "green" },
  social: { label: "Социальная сфера", short: "S", tone: "violet" },
  safety: { label: "Безопасность", short: "B", tone: "orange" },
  services: { label: "Городские сервисы", short: "C", tone: "teal" },
};
const metricLabels: Record<string, string> = { T1: "Разгрузка дорог", T2: "Общественный транспорт", E1: "Озеленение", E2: "Качество воздуха", S1: "Школы и детсады", S2: "Медпомощь", B1: "Безопасность улиц", B2: "Безопасность движения", C1: "Надёжность ЖКХ", C2: "Обращения жителей" };
const format = (value: number, digits = 2) => value.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = (value: number) => `${format(value, 0)} усл. ед.`;
const deltaText = (value: number) => `${value >= 0 ? "+" : ""}${format(value)}`;
const districtName = (id: DistrictId) => districts.find((district) => district.id === id)!.name;
const emptyDraft = (): Array<Decision | null> => Array.from({ length: 5 }, () => null);
const baseline = scoreBreakdown(districts);

export default function HomePage() {
  const [draft, setDraft] = useState<Array<Decision | null>>(emptyDraft);
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const selection = useMemo(() => draft.filter((decision): decision is Decision => decision !== null), [draft]);
  const spent = calculateSelectionCost(selection);
  const scenario = useMemo(() => {
    try { return { result: simulate(selection), validationError: null }; }
    catch (problem) { return { result: null, validationError: problem instanceof SimulationError ? problem.message : "Не удалось рассчитать сценарий." }; }
  }, [selection]);
  const result = scenario.result;
  const overBudget = spent > STARTING_BUDGET;

  function updateDraft(next: Array<Decision | null>) {
    requestVersion.current += 1;
    activeRequest.current?.abort();
    setDraft(next);
    setError(null);
    setAnalysis(null);
    setAnalysisState("idle");
  }

  function choose(index: number, initiativeId: string, districtId?: string) {
    const decision: Decision | null = initiativeId ? { initiativeId, ...(districtId ? { districtId: districtId as DistrictId } : {}) } : null;
    updateDraft(draft.map((previous, i) => i === index ? decision : previous));
  }

  async function requestAnalysis() {
    if (!result) return;
    const version = ++requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setAnalysisState("loading");
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection }), signal: controller.signal,
      });
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

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">Q</span><span>Qala Balance AI</span></div><span className="status-pill"><span className="status-dot" /> Синтетическая модель</span></header>
    <section className="hero">
      <div className="eyebrow">HACKALEM AI · ASTANA INNOVATIONS</div>
      <h1>Аким на 5 часов</h1>
      <p>Пять решений. Один городской бюджет. Выберите, что изменить в районах, и оцените последствия через два условных года.</p>
      <div className="hero-actions"><button className="primary-button" onClick={() => updateDraft(structuredClone(DATASET_EXAMPLE))}>Загрузить пример из датасета</button><span>5 мер · 95 усл. ед. · проверяемый расчёт</span></div>
    </section>
    <section className="budget-card" aria-label="Бюджет сценария">
      <div className="budget-heading"><div><span className="label">Единый бюджет города</span><strong>{money(STARTING_BUDGET)}</strong></div><span className="progress-count" aria-live="polite">{selection.length} / 5 решений</span></div>
      <div className={`budget-track ${overBudget ? "over-budget" : ""}`}><span style={{ width: `${Math.min(100, spent)}%` }} /></div>
      <div className="budget-numbers"><span>Расход <b>{money(spent)}</b></span><span>{overBudget ? "Превышение" : "Остаток"} <b className={overBudget ? "danger" : ""}>{money(Math.abs(STARTING_BUDGET - spent))}</b></span></div>
    </section>
    <details className="rules"><summary>Правила сценария и исходные данные</summary>
      <p>Ровно пять уникальных мероприятий; максимум два одного направления. Бюджет — не более 100 условных единиц. Остаток не даёт бонуса. Для районной меры нужен один район; городская действует во всех пяти.</p>
      <p>M1 и M3 несовместимы в любых районах. M4 + M7 и M5 + M13 нельзя применять в одном районе. Синергии: M1 + M2, M10 + M12, M5 + M6; фиксированный бонус +2 в районе первой меры пары. Порядок выбора не влияет на результат.</p>
      <p>Базовый Score без действий: <b>{format(baseline.score)}</b>. Это исходное состояние, а не результат пустого сценария. Все показатели: 0–100, больше — лучше. Горизонт — 8 кварталов. Данные синтетические.</p>
      <DistrictTable />
    </details>
    <section className="section-heading"><div><div className="eyebrow">01 · ВЫБОР СЦЕНАРИЯ</div><h2>Пять решений города</h2></div><button className="text-button" onClick={() => updateDraft(emptyDraft())}>Сбросить сценарий</button></section>
    <p className="section-hint">Можно взять две меры одного направления. Повторы и третья мера направления недоступны в списке.</p>
    <div className="category-counts">{CATEGORIES.map((category) => <span key={category}>{categoryInfo[category].label}: {selection.filter((decision) => initiatives.find((item) => item.id === decision.initiativeId)?.category === category).length}/2</span>)}</div>
    <div className="initiative-grid">{draft.map((chosen, index) => <DecisionCard key={index} index={index} chosen={chosen} draft={draft} onChoose={choose} />)}</div>
    <section className="results-section" aria-live="polite">
      <div className="section-heading"><div><div className="eyebrow">02 · РЕЗУЛЬТАТ СЦЕНАРИЯ</div><h2>Как изменится город</h2></div></div>
      {!result ? <div className="empty-state" role={selection.length === 5 ? "alert" : "status"}><div className="empty-icon">◎</div><h3>{selection.length === 5 ? "Сценарий нужно исправить" : "Соберите пять решений"}</h3><p>{scenario.validationError}</p><p className="section-hint">Score сценария не рассчитывается, пока не выполнены все правила.</p></div> : <ResultPanel result={result} />}
    </section>
    <section className="analysis-card" aria-busy={analysisState === "loading"}>
      <div><div className="eyebrow">03 · AI-АНАЛИЗ</div><h2>Объяснение для управленца</h2><p>Числа вычисляет модель города. AI поясняет сильные стороны и риски; без подключения доступен явно обозначенный локальный разбор.</p></div>
      <button className="primary-button" disabled={!result || analysisState === "loading"} onClick={requestAnalysis}>{analysisState === "loading" ? "Анализируем…" : "Получить AI-анализ →"}</button>
      {error && <div className="alert error" role="alert">{error} Можно повторить запрос.</div>}
      {analysis && <div className="analysis-result" aria-live="polite"><span className="label">Источник: {analysis.source === "fallback" ? "локальный анализ (без LLM)" : "OpenAI + проверенный расчёт"}</span>
        {analysis.source === "fallback" && <p>{analysis.fallbackReason === "missing_key" ? "OpenAI не подключён. Ниже — детерминированный разбор рассчитанного сценария." : "AI-сервис не вернул подходящий ответ. Показан локальный разбор; расчёт сохранён."}</p>}
        <h3>Итог</h3><p>{analysis.analysis.summary}</p><AnalysisList title="Сильные стороны" items={analysis.analysis.strengths} /><AnalysisList title="Риски" items={analysis.analysis.risks} /><AnalysisList title="Компромиссы" items={analysis.analysis.tradeoffs} /><h3>Проверенная рекомендация</h3><p>{analysis.analysis.recommendation}</p>
      </div>}
    </section>
    <footer><span>Qala Balance AI · HackAlem AI</span><span>Синтетическая модель · не прогноз для реальной Астаны</span></footer>
  </main>;
}

function DecisionCard({ index, chosen, draft, onChoose }: { index: number; chosen: Decision | null; draft: Array<Decision | null>; onChoose: (index: number, initiativeId: string, districtId?: string) => void }) {
  const selected = initiatives.find((initiative) => initiative.id === chosen?.initiativeId);
  const info = selected ? categoryInfo[selected.category] : null;
  const others = draft.filter((_, i) => i !== index);
  return <article className={`category-card ${info?.tone ?? ""}`}>
    <div className="category-title"><span className="category-icon">{index + 1}</span><div><span className="category-number">РЕШЕНИЕ {index + 1}</span><h3>{info?.label ?? "Выберите направление"}</h3></div></div>
    <label className="field-label" htmlFor={`initiative-${index}`}>Мероприятие {index + 1}</label>
    <select id={`initiative-${index}`} value={chosen?.initiativeId ?? ""} onChange={(event) => onChoose(index, event.target.value)}>
      <option value="">Не выбрано</option>
      {CATEGORIES.map((category) => <optgroup key={category} label={categoryInfo[category].label}>{initiatives.filter((item) => item.category === category).map((initiative) => {
        const duplicate = others.some((decision) => decision?.initiativeId === initiative.id);
        const limit = others.filter((decision) => initiatives.find((item) => item.id === decision?.initiativeId)?.category === category).length >= 2;
        return <option key={initiative.id} value={initiative.id} disabled={duplicate || limit}>{initiative.id} · {initiative.title} · {initiative.cost} ед.{duplicate ? " — уже выбрано" : limit ? " — лимит направления" : ""}</option>;
      })}</optgroup>)}
    </select>
    {selected?.type === "district" && <><label className="field-label" htmlFor={`district-${index}`}>Район решения {index + 1}</label><select id={`district-${index}`} value={chosen?.districtId ?? ""} onChange={(event) => onChoose(index, selected.id, event.target.value)}><option value="">Выберите район</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></>}
    {selected ? <div className="initiative-detail"><div className="cost-line"><strong>{money(selected.cost)}</strong><span>Лаг {selected.lag} кв. · {selected.type === "city" ? "все пять районов" : "один район"}</span></div><p>{selected.description}</p><p>Полные эффекты: {Object.entries(selected.effects).map(([code, value]) => `${code} ${value! > 0 ? "+" : ""}${value}`).join(", ")}.</p><p>К концу 8 кварталов реализуется {format((8 - selected.lag) / 8 * 100, 1)}% эффекта. Бонус синергии учитывается полностью.</p><small>Возможный риск: {selected.risk}</small></div> : <div className="card-placeholder">Выберите любую доступную меру из пяти направлений.</div>}
  </article>;
}

function ResultPanel({ result }: { result: SimulationResult }) {
  const score = result.projectedBreakdown;
  const weakest = result.projectedDistricts.filter((district) => Math.abs(score.districtScores[district.id] - score.weakestDistrictScore) < 1e-9).map((district) => district.name).join(", ");
  const critical = result.projectedDistricts.flatMap((district) => METRIC_CODES.filter((code) => district.metrics[code] < 40).map((code) => `${district.name}: ${code} = ${format(district.metrics[code])}`));
  return <div className="result-panel">
    <div className="score-row"><div><span className="label">Astana Quality of Life Score</span><div className="score-values"><strong data-testid="scenario-score">{format(result.projectedScore)}</strong><span className={result.projectedScore >= result.baselineScore ? "positive" : "negative"}>{deltaText(result.projectedScore - result.baselineScore)} к базе</span></div></div><div className="score-baseline"><span>Было</span><b>{format(result.baselineScore)}</b></div></div>
    <div className="formula-card"><p>Score = 0,7 × средний балл города + 0,3 × балл слабейшего района − критические значения</p><strong>0,7 × {format(score.populationWeightedAverage, 4)} + 0,3 × {format(score.weakestDistrictScore, 4)} − {score.criticalCount} = {format(score.score, 5)}</strong><p>Слабейший район: {weakest}. Критических значений: {result.baselineBreakdown.criticalCount} → {score.criticalCount}.</p></div>
    <h3>Изменения по направлениям</h3><p className="section-hint">Среднее двух показателей направления с учётом долей населения; это не вклад направления в Score.</p>
    <div className="category-results">{CATEGORIES.map((category) => <div key={category}><span>{categoryInfo[category].label}</span><b className={result.categoryDeltas[category] >= 0 ? "positive" : "negative"}>{deltaText(result.categoryDeltas[category])}</b></div>)}</div>
    <h3>Изменения по районам</h3><div className="district-results">{result.projectedDistricts.map((district) => <div key={district.id}><span>{district.name} · {format(district.populationShare * 100, 0)}% населения</span><span>{format(result.baselineBreakdown.districtScores[district.id])} → {format(score.districtScores[district.id])}</span><b className={result.districtDeltas[district.id] >= 0 ? "positive" : "negative"}>{deltaText(result.districtDeltas[district.id])}</b></div>)}</div>
    <h3>Синергии</h3>{result.synergies.length ? <ul>{result.synergies.map((item) => <li key={item.pair.join("-")}>{item.pair.join(" + ")}: {item.metric} +{item.bonus} · {districtName(item.districtId)}. Бонус без уменьшения лагом.</li>)}</ul> : <p className="section-hint">В этом наборе нет пар с дополнительным бонусом.</p>}
    <div className={critical.length ? "critical-note" : "result-note"}>{critical.length ? `Ниже 40: ${critical.join("; ")}. Штраф — ${score.criticalCount} балл(а).` : "Все показатели достигли порога 40: штрафа за критические значения нет."}</div>
    <details className="result-details"><summary>Все показатели районов: до → после</summary><DistrictTable result={result} /></details>
    <details className="result-details"><summary>Вклад каждой меры с учётом лага</summary><p className="section-hint">Прибавки к показателям до ограничения 0–100; синергии показаны отдельно. Это не аддитивные вклады в итоговый Score.</p><div className="table-scroll"><table><thead><tr><th>Мера</th><th>Где действует</th><th>Доля эффекта</th><th>Прибавки</th></tr></thead><tbody>{result.contributions.map((item) => <tr key={item.initiativeId}><th>{item.initiativeId}</th><td>{item.districtIds.length === 5 ? "Все районы" : item.districtIds.map(districtName).join(", ")}</td><td>{format(item.factor, 3)}</td><td>{Object.entries(item.effects).map(([code, value]) => `${code} ${deltaText(value!)}`).join("; ")}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function DistrictTable({ result }: { result?: SimulationResult }) {
  return <div className="table-scroll" tabIndex={0} aria-label="Показатели пяти районов"><table><thead><tr><th>Район</th><th>Население</th>{METRIC_CODES.map((code) => <th key={code} title={metricLabels[code]}>{code}<small>{metricLabels[code]}</small></th>)}</tr></thead><tbody>{districts.map((district, index) => <tr key={district.id}><th>{district.name}</th><td>{format(district.populationShare * 100, 0)}%</td>{METRIC_CODES.map((code) => {
    const after = result?.projectedDistricts[index].metrics[code];
    return <td className={(after ?? district.metrics[code]) < 40 ? "critical-cell" : ""} key={code}>{district.metrics[code]}{after !== undefined && <> → <b>{format(after)}</b></>}</td>;
  })}</tr>)}</tbody></table></div>;
}

function AnalysisList({ title, items }: { title: string; items: AIAnalysis["strengths"] }) {
  return <><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></>;
}
