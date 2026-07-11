import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_DAILY_WORKSPACE_LABELS,
  computeFounderDaySummary,
  computeHermesHeaderStatus,
  computeTodayStatusSentence,
} from "./hermes-daily-workspace-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

/* ── computeHermesHeaderStatus ────────────────────────────────────── */

const baseInput = {
  importInProgress: false,
  runningJobCount: 0,
  lastScanAt: null,
  lastActivityAt: null,
  pendingDecisionCount: 0,
};

test("v8.6 header status: idle when nothing is in flight", () => {
  const status = computeHermesHeaderStatus(baseInput);
  assert.equal(status.mode, "idle");
  assert.equal(status.modeLabel, "Beklemede");
});

test("v8.6 header status: a scan in flight means running", () => {
  const status = computeHermesHeaderStatus({ ...baseInput, importInProgress: true });
  assert.equal(status.mode, "running");
  assert.equal(status.modeLabel, "Çalışıyor");
});

test("v8.6 header status: an executing job means running", () => {
  const status = computeHermesHeaderStatus({ ...baseInput, runningJobCount: 2 });
  assert.equal(status.mode, "running");
});

test("v8.6 header status: timestamps and pending count pass through unchanged — never invented", () => {
  const status = computeHermesHeaderStatus({
    ...baseInput,
    lastScanAt: 1_700_000_000_000,
    lastActivityAt: 1_700_000_100_000,
    pendingDecisionCount: 4,
  });
  assert.equal(status.lastScanAt, 1_700_000_000_000);
  assert.equal(status.lastActivityAt, 1_700_000_100_000);
  assert.equal(status.pendingDecisionCount, 4);
});

test("v8.6 header status: null timestamps stay null (no hardcoded fallback date)", () => {
  const status = computeHermesHeaderStatus(baseInput);
  assert.equal(status.lastScanAt, null);
  assert.equal(status.lastActivityAt, null);
});

test("C1 header status: a server-side acquisition run means running", () => {
  const status = computeHermesHeaderStatus({ ...baseInput, acquisitionRunning: true });
  assert.equal(status.mode, "running");
  assert.equal(status.modeLabel, "Çalışıyor");
});

test("C1 header status: broken acquisition config shows Kontrol Gerekli when idle", () => {
  const status = computeHermesHeaderStatus({ ...baseInput, acquisitionNeedsAttention: true });
  assert.equal(status.mode, "attention");
  assert.equal(status.modeLabel, "Kontrol Gerekli");
});

test("C1 header status: running wins over attention", () => {
  const status = computeHermesHeaderStatus({
    ...baseInput,
    importInProgress: true,
    acquisitionNeedsAttention: true,
  });
  assert.equal(status.mode, "running");
});

test("C1 header status: last scan is the newest of import history and acquisition runs", () => {
  const newer = computeHermesHeaderStatus({
    ...baseInput,
    lastScanAt: 1_000,
    acquisitionLastScanAt: 2_000,
  });
  assert.equal(newer.lastScanAt, 2_000);

  const older = computeHermesHeaderStatus({
    ...baseInput,
    lastScanAt: 3_000,
    acquisitionLastScanAt: 2_000,
  });
  assert.equal(older.lastScanAt, 3_000);

  const acquisitionOnly = computeHermesHeaderStatus({ ...baseInput, acquisitionLastScanAt: 2_000 });
  assert.equal(acquisitionOnly.lastScanAt, 2_000);

  const noneAtAll = computeHermesHeaderStatus({ ...baseInput, acquisitionLastScanAt: null });
  assert.equal(noneAtAll.lastScanAt, null);
});

/* ── computeFounderDaySummary ─────────────────────────────────────── */

test("v8.6 day summary: greeting follows the hour of day", () => {
  const morning = computeFounderDaySummary({ hour: 8, isRunning: false, pendingDecisionCount: 0 });
  const afternoon = computeFounderDaySummary({ hour: 14, isRunning: false, pendingDecisionCount: 0 });
  const evening = computeFounderDaySummary({ hour: 21, isRunning: false, pendingDecisionCount: 0 });
  const lateNight = computeFounderDaySummary({ hour: 2, isRunning: false, pendingDecisionCount: 0 });
  assert.ok(morning.startsWith("Günaydın."), morning);
  assert.ok(afternoon.startsWith("İyi günler."), afternoon);
  assert.ok(evening.startsWith("İyi akşamlar."), evening);
  assert.ok(lateNight.startsWith("İyi akşamlar."), lateNight);
});

test("v8.6 day summary: running state wins over pending decisions", () => {
  const summary = computeFounderDaySummary({ hour: 9, isRunning: true, pendingDecisionCount: 3 });
  assert.equal(summary, "Günaydın. Hermes şu anda bugünün fırsatlarını işliyor.");
});

test("v8.6 day summary: pending decisions surface in the sentence", () => {
  const summary = computeFounderDaySummary({ hour: 9, isRunning: false, pendingDecisionCount: 3 });
  assert.equal(summary, "Günaydın. Hermes bugünün fırsatlarını işledi — 3 karar seni bekliyor.");
});

test("v8.6 day summary: quiet day reads as completed analysis", () => {
  const summary = computeFounderDaySummary({ hour: 9, isRunning: false, pendingDecisionCount: 0 });
  assert.equal(summary, "Günaydın. Hermes bugünün analizini tamamladı.");
});

/* ── computeTodayStatusSentence ───────────────────────────────────── */

test("v8.6 today status: pending decisions produce a count sentence", () => {
  assert.equal(computeTodayStatusSentence(4), "Hermes 4 karar hazırladı.");
  assert.equal(computeTodayStatusSentence(1), "Hermes 1 karar hazırladı.");
});

test("v8.6 today status: zero decisions read as all clear — never an empty warning", () => {
  assert.equal(
    computeTodayStatusSentence(0),
    "Her şey kontrol altında — şu anda senden karar bekleyen bir şey yok.",
  );
});

/* ── Release audit — every new founder string stays founder-safe ──── */

test("v8.6 audit: daily-workspace labels carry no technical terms", () => {
  for (const [key, value] of Object.entries(HERMES_DAILY_WORKSPACE_LABELS)) {
    const hit = findForbiddenFounderTerm(value);
    assert.equal(hit, null, `HERMES_DAILY_WORKSPACE_LABELS.${key} ("${value}") contains forbidden term "${hit}"`);
  }
});

test("v8.6 audit: generated sentences are founder-safe in every state", () => {
  const sentences = [
    computeFounderDaySummary({ hour: 8, isRunning: true, pendingDecisionCount: 0 }),
    computeFounderDaySummary({ hour: 14, isRunning: false, pendingDecisionCount: 5 }),
    computeFounderDaySummary({ hour: 22, isRunning: false, pendingDecisionCount: 0 }),
    computeTodayStatusSentence(0),
    computeTodayStatusSentence(7),
  ];
  for (const sentence of sentences) {
    assert.equal(findForbiddenFounderTerm(sentence), null, sentence);
  }
});
