import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_REVENUE_PIPELINE_LABELS,
  buildRevenueDailyLines,
  computeRevenuePipelineView,
  formatMrrLabel,
  selectRevenuePipelineForLead,
  type RevenuePipelineApiItemLike,
  type RevenuePipelineApiSummaryLike,
} from "./hermes-revenue-pipeline-founder-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

function item(overrides: Partial<RevenuePipelineApiItemLike> = {}): RevenuePipelineApiItemLike {
  return {
    leadId: "l1",
    missionId: "m1",
    title: "Otel Deniz",
    stage: "demo_scheduled",
    stageLabelTr: "Demo Planlandı",
    health: "healthy",
    healthLabelTr: "Yolunda",
    revenueSignalLabelTr: "Potansiyel aylık gelir: ₺7.000",
    estimatedMrr: 7000,
    potentialMrr: 7000,
    whyItMattersTr: "Demo, satışa en yakın aşamalardan biridir.",
    hermesRecommendationTr: "Demoya hazırlan; süreç yolunda.",
    founderNextActionTr: "Demo Planla — Yolunda",
    founderActionLabelTr: "Demo Planla",
    riskReasonsTr: [],
    ...overrides,
  };
}

const summary: RevenuePipelineApiSummaryLike = {
  total: 1, active: 1, attentionRequired: 0, atRisk: 0, outcomePending: 0,
  won: 0, lost: 0, potentialMrr: 7000, realizedMrr: null, riskedMrr: null,
};

test("formatMrrLabel: null → Henüz belirlenmedi; number → ₺; 0 is real", () => {
  assert.equal(formatMrrLabel(null), "Henüz belirlenmedi");
  assert.equal(formatMrrLabel(undefined), "Henüz belirlenmedi");
  assert.equal(formatMrrLabel(7000), "₺7.000");
  assert.equal(formatMrrLabel(0), "₺0");
});

test("closest list holds near-revenue open stages", () => {
  const view = computeRevenuePipelineView({ items: [item()], summary, fetchState: "ready" });
  assert.equal(view.mode, "ready");
  assert.equal(view.closest.length, 1);
  assert.equal(view.closest[0].title, "Otel Deniz");
});

test("at-risk list only at_risk items", () => {
  const view = computeRevenuePipelineView({
    items: [item({ health: "at_risk", stage: "demo_pending", riskReasonsTr: ["Demo talebi var ama planlanmadı"] })],
    summary: { ...summary, atRisk: 1 },
    fetchState: "ready",
  });
  assert.equal(view.atRisk.length, 1);
  assert.equal(view.atRisk[0].riskReasonsTr.length, 1);
});

test("unknown MRR shown as 'Henüz belirlenmedi', never fake ₺0", () => {
  const view = computeRevenuePipelineView({
    items: [item({ estimatedMrr: null, potentialMrr: null, revenueSignalLabelTr: "Gelir tahmini henüz belirlenmedi" })],
    summary: { ...summary, potentialMrr: null },
    fetchState: "ready",
  });
  assert.equal(view.closest[0].mrrLabel, "Henüz belirlenmedi");
  assert.equal(view.summary.potentialMrrLabel, "Henüz belirlenmedi");
  assert.equal(/₺0/.test(view.summary.potentialMrrLabel), false);
});

test("realized 0 shows as ₺0 (real value)", () => {
  const view = computeRevenuePipelineView({ items: [item()], summary: { ...summary, realizedMrr: 0 }, fetchState: "ready" });
  assert.equal(view.summary.realizedMrrLabel, "₺0");
});

test("leadNameById enriches title", () => {
  const view = computeRevenuePipelineView({ items: [item({ title: "İsimsiz işletme" })], summary, fetchState: "ready", leadNameById: { l1: "Grand Hotel" } });
  assert.equal(view.closest[0].title, "Grand Hotel");
});

test("empty / loading / error states", () => {
  assert.equal(computeRevenuePipelineView({ items: [], summary: null, fetchState: "loading" }).mode, "loading");
  assert.equal(computeRevenuePipelineView({ items: [], summary: null, fetchState: "error" }).mode, "error");
  assert.equal(computeRevenuePipelineView({ items: [], summary: null, fetchState: "ready" }).mode, "empty");
});

test("no card exposes a 'Gönder' action or raw identifiers", () => {
  const view = computeRevenuePipelineView({ items: [item()], summary, fetchState: "ready" });
  const c = view.closest[0];
  if (c.founderActionLabelTr) assert.equal(/gönder/i.test(c.founderActionLabelTr), false);
  const json = JSON.stringify(c);
  assert.equal(/wamid\.|followup:|revenue:m/.test(json), false);
});

test("all founder labels carry no forbidden technical terms", () => {
  for (const [key, value] of Object.entries(HERMES_REVENUE_PIPELINE_LABELS)) {
    assert.equal(findForbiddenFounderTerm(value), null, `${key}: ${value}`);
  }
});

test("card copy carries no forbidden technical terms", () => {
  const view = computeRevenuePipelineView({ items: [item()], summary, fetchState: "ready" });
  const c = view.closest[0];
  for (const t of [c.title, c.stageLabelTr, c.whyItMattersTr, c.hermesRecommendationTr, c.founderNextActionTr, c.mrrLabel]) {
    assert.equal(findForbiddenFounderTerm(t), null, t);
  }
});

test("buildRevenueDailyLines uses only real data; no 'bu ay' without realized revenue", () => {
  assert.deepEqual(buildRevenueDailyLines(null), []);
  const lines = buildRevenueDailyLines({ ...summary, atRisk: 2, outcomePending: 1, realizedMrr: 45000 });
  assert.ok(lines.some((l) => /2 fırsat risk altında/.test(l)));
  assert.ok(lines.some((l) => /45\.000/.test(l)));
  const noRevenue = buildRevenueDailyLines({ ...summary, realizedMrr: null });
  assert.equal(noRevenue.some((l) => /gelir ₺/.test(l)), false);
});

test("selectRevenuePipelineForLead picks matching lead", () => {
  const items = [item({ leadId: "a" }), item({ leadId: "b", stage: "won" })];
  assert.equal(selectRevenuePipelineForLead(items, "b")?.stage, "won");
  assert.equal(selectRevenuePipelineForLead(items, "z"), null);
});
