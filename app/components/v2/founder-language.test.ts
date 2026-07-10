import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOUNDER_DECISION_PANEL_LABELS,
  FOUNDER_ERROR_LABELS,
  FOUNDER_FORBIDDEN_TERMS,
  FOUNDER_HOME_EMPTY_STATE_LABELS,
  FOUNDER_HOME_LABELS,
  FOUNDER_PIPELINE_STATE_LABELS,
  FOUNDER_SUMMARY_PANEL_LABELS,
  findForbiddenFounderTerm,
  founderizeTimelineText,
} from "./founder-language.ts";
import { HERMES_LEAD_INTAKE_BUTTON_LABELS, computeHermesLeadIntakeSummary } from "./adapters/hermes-lead-intake-adapter.ts";
import { FOUNDER_EMPTY_STATE_LABELS, computeHermesHealth } from "./adapters/founder-revenue-workspace-adapter.ts";
import { founderVisibleNavEntries } from "./layout/v2-nav.ts";

/* ── v8.4 Release Audit — no technical vocabulary in founder copy ──
   The sprint's Scope 1/7 contract: while Developer Mode is OFF, no
   founder-facing string may contain runtime / registry / bridge / webhook /
   provider / courier / mission / pipeline / developer / … vocabulary.
   Every founder label map is centrally asserted here. */

function assertFounderSafe(labels: Record<string, string>, mapName: string) {
  for (const [key, value] of Object.entries(labels)) {
    const hit = findForbiddenFounderTerm(value);
    assert.equal(hit, null, `${mapName}.${key} ("${value}") contains forbidden term "${hit}"`);
  }
}

test("v8.4 audit: the forbidden-term detector works", () => {
  assert.equal(findForbiddenFounderTerm("Mission Runtime çalışıyor"), "runtime");
  assert.equal(findForbiddenFounderTerm("Provider Registry"), "registry");
  assert.equal(findForbiddenFounderTerm("Onayla — Hermes'i Başlat"), null);
});

test("v8.4 audit: founder decision panel labels carry no technical terms", () => {
  assertFounderSafe(FOUNDER_DECISION_PANEL_LABELS, "FOUNDER_DECISION_PANEL_LABELS");
});

test("v8.4 audit: founder summary panel labels carry no technical terms", () => {
  assertFounderSafe(FOUNDER_SUMMARY_PANEL_LABELS, "FOUNDER_SUMMARY_PANEL_LABELS");
});

test("v8.4 audit: founder home labels carry no technical terms", () => {
  assertFounderSafe(FOUNDER_HOME_LABELS, "FOUNDER_HOME_LABELS");
});

test("v8.4 audit: founder pipeline-state labels carry no technical terms and cover all 7 states", () => {
  assertFounderSafe(FOUNDER_PIPELINE_STATE_LABELS, "FOUNDER_PIPELINE_STATE_LABELS");
  assert.deepEqual(
    Object.keys(FOUNDER_PIPELINE_STATE_LABELS).sort(),
    ["blocked", "completed", "failed", "paused", "queued", "running", "waiting"],
  );
});

test("v8.4 audit: lead-intake button labels no longer name Developer or Lead Import", () => {
  assertFounderSafe(HERMES_LEAD_INTAKE_BUTTON_LABELS, "HERMES_LEAD_INTAKE_BUTTON_LABELS");
});

test("v8.4 audit: lead-intake founder summary + suggested action are founder-safe in every state", () => {
  const states: Array<Parameters<typeof computeHermesLeadIntakeSummary>[0]> = [
    { leads: [], missions: [] },
    { leads: [], missions: [{ stage: "approval" }] },
    { leads: [], missions: [], importInProgress: true },
    { leads: [], missions: [], importError: "boom" },
  ];
  for (const state of states) {
    const result = computeHermesLeadIntakeSummary(state);
    assert.equal(findForbiddenFounderTerm(result.founderSummary), null, result.founderSummary);
    assert.equal(findForbiddenFounderTerm(result.suggestedAction), null, result.suggestedAction);
  }
});

test("v8.4 audit: founder empty-state labels carry no technical terms", () => {
  assertFounderSafe(FOUNDER_EMPTY_STATE_LABELS, "FOUNDER_EMPTY_STATE_LABELS");
});

test("v8.4 audit: Hermes health values are founder-safe (tile titles Webhook/Runtime are Developer-only)", () => {
  for (const input of [
    { hermesRuntimeAvailable: true, whatsappReadinessStatus: "controlled_live_ready" as const, deliveryFeedReachable: true },
    { hermesRuntimeAvailable: false, whatsappReadinessStatus: null, deliveryFeedReachable: null },
    { hermesRuntimeAvailable: true, whatsappReadinessStatus: "blocked" as const, deliveryFeedReachable: false },
  ]) {
    const health = computeHermesHealth(input);
    for (const value of Object.values(health)) {
      assert.equal(findForbiddenFounderTerm(value), null, value);
    }
  }
});

/* ── v8.4 Developer Isolation — the sidebar contract ─────────────── */

test("v8.4 isolation: Developer OFF renders only Hermes, and no visible label contains a technical term", () => {
  const visible = founderVisibleNavEntries(false);
  assert.deepEqual(visible.map((e) => e.id), ["hermes"]);
  for (const entry of visible) {
    assert.equal(findForbiddenFounderTerm(entry.label), null, entry.label);
    assert.equal(entry.items, undefined);
  }
});

test("v8.4 isolation: Developer ON restores every developer screen unchanged", () => {
  const visible = founderVisibleNavEntries(true);
  assert.deepEqual(visible.map((e) => e.id), ["hermes", "developer"]);
  assert.equal(visible.find((e) => e.id === "developer")!.items!.length, 13);
});

/* ── founderizeTimelineText ───────────────────────────────────────── */

test("founderizeTimelineText replaces the runtime word Mission with founder vocabulary", () => {
  assert.equal(founderizeTimelineText("Mission tamamlandı"), "İş tamamlandı");
  assert.equal(founderizeTimelineText("mission kapandı"), "iş kapandı");
  assert.equal(founderizeTimelineText("Web sitesi tarandı"), "Web sitesi tarandı");
});

/* ── Guard: the forbidden list itself stays meaningful ────────────── */

test("v8.4 audit: forbidden list contains the sprint's explicit vocabulary", () => {
  for (const required of ["runtime", "registry", "bridge", "webhook", "provider", "courier", "developer"]) {
    assert.ok((FOUNDER_FORBIDDEN_TERMS as readonly string[]).includes(required), required);
  }
});

/* ── v8.5 Release Candidate Polish — Scope 3/5 exact copy contract ──── */

test("v8.5 RC: the six Hermes Home empty states match the sprint spec verbatim", () => {
  assert.equal(
    FOUNDER_HOME_EMPTY_STATE_LABELS.hermesToday,
    "Henüz bugüne ait satış aktivitesi yok. Hermes çalışmaya başladığında özet burada görünecek.",
  );
  assert.equal(FOUNDER_HOME_EMPTY_STATE_LABELS.leadIntake, "Hermes henüz yeni fırsat taraması başlatmadı.");
  assert.equal(
    FOUNDER_HOME_EMPTY_STATE_LABELS.decisionCenter,
    "Şu anda senden karar bekleyen bir satış görevi yok. Hermes çalışmaya devam ediyor.",
  );
  assert.equal(
    FOUNDER_HOME_EMPTY_STATE_LABELS.opportunityFocus,
    "Bir fırsat seçtiğinde Hermes bu otel için önerilen sonraki adımı gösterecek.",
  );
  assert.equal(FOUNDER_HOME_EMPTY_STATE_LABELS.revenuePulse, "Henüz satış sonucu kaydedilmedi.");
  assert.equal(
    FOUNDER_HOME_EMPTY_STATE_LABELS.activity,
    "Hermes aktivitesi başladığında önemli gelişmeler burada görünecek.",
  );
});

test("v8.5 RC: Hermes Home empty-state copy is founder-safe (no technical vocabulary)", () => {
  assertFounderSafe(FOUNDER_HOME_EMPTY_STATE_LABELS, "FOUNDER_HOME_EMPTY_STATE_LABELS");
});

test("v8.5 RC: error/loading copy is safe and operational — no stack trace, route, or raw fetch error", () => {
  assertFounderSafe(FOUNDER_ERROR_LABELS, "FOUNDER_ERROR_LABELS");
  // Never a raw HTTP status, endpoint path, or the word "fetch"/"error" (English) leaking through.
  for (const [key, value] of Object.entries(FOUNDER_ERROR_LABELS)) {
    assert.ok(!/\/api\//.test(value), `${key} leaks a route path: "${value}"`);
    assert.ok(!/HTTP \d/.test(value), `${key} leaks an HTTP status: "${value}"`);
  }
  assert.equal(FOUNDER_ERROR_LABELS.retryButton, "Tekrar Dene");
});

test("v8.5 RC: founder decision buttons are decision-oriented, never a vague label", () => {
  const vague = ["Aç", "Git", "İşlem Yap", "Devam", "Detay"];
  const buttonLabels = [
    FOUNDER_DECISION_PANEL_LABELS.approveButton,
    FOUNDER_DECISION_PANEL_LABELS.rejectButton,
    FOUNDER_DECISION_PANEL_LABELS.startButton,
    HERMES_LEAD_INTAKE_BUTTON_LABELS.reviewOpportunities,
    HERMES_LEAD_INTAKE_BUTTON_LABELS.openDeveloperLeadImport,
  ];
  for (const label of buttonLabels) {
    assert.ok(!vague.includes(label), label);
  }
});

test("v8.5 RC: lead-intake idle/error summaries use 'fırsat', never the English 'lead'", () => {
  const idle = computeHermesLeadIntakeSummary({ leads: [], missions: [] });
  const errored = computeHermesLeadIntakeSummary({ leads: [], missions: [], importError: "boom" });
  assert.ok(!/\blead\b/i.test(idle.founderSummary), idle.founderSummary);
  assert.ok(!/\blead\b/i.test(errored.founderSummary), errored.founderSummary);
});
