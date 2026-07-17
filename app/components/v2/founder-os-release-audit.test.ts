import { test } from "node:test";
import assert from "node:assert/strict";
import { FOUNDER_HOME_EMPTY_STATE_LABELS, findForbiddenFounderTerm } from "./founder-language.ts";
import { founderVisibleNavEntries } from "./layout/v2-nav.ts";
import { HERMES_DAILY_WORKSPACE_LABELS } from "./adapters/hermes-daily-workspace-adapter.ts";
import { HERMES_QUALIFICATION_FOUNDER_LABELS } from "./adapters/hermes-qualification-founder-adapter.ts";
import { HERMES_OUTREACH_FOUNDER_LABELS } from "./adapters/hermes-outreach-founder-adapter.ts";
import { HERMES_CONVERSATION_FOUNDER_LABELS } from "./adapters/hermes-conversation-founder-adapter.ts";
import { HERMES_FOLLOW_UP_PLAN_LABELS } from "./adapters/hermes-follow-up-plan-founder-adapter.ts";
import { HERMES_REVENUE_PIPELINE_LABELS, formatMrrLabel } from "./adapters/hermes-revenue-pipeline-founder-adapter.ts";
import { HERMES_ACQUISITION_EXPLAINABILITY_LABELS } from "./adapters/hermes-acquisition-explainability-adapter.ts";
import { computeHermesOpportunityFocusForFreshLead } from "./adapters/hermes-opportunity-focus-adapter.ts";

/* ── Sprint C7 — Founder Operating System v1.0 Release Audit ──
   Feature freeze. These tests are the production gate: while Developer Mode is
   OFF the founder must never see a technical term, an English string, a fake
   date, a fake ₺0, or a placeholder. Every founder-facing label map that the
   commercial chain (C1–C6) added is centrally asserted here. */

function assertFounderSafe(labels: Record<string, string>, mapName: string) {
  for (const [key, value] of Object.entries(labels)) {
    const hit = findForbiddenFounderTerm(value);
    assert.equal(hit, null, `${mapName}.${key} ("${value}") contains forbidden term "${hit}"`);
    assert.notEqual(value.trim(), "", `${mapName}.${key} is empty`);
  }
}

/* ── Every C1–C6 founder label map is technical-term-free ─────── */

test("C7 audit: daily workspace (header/home) labels are founder-safe", () => {
  assertFounderSafe(HERMES_DAILY_WORKSPACE_LABELS, "HERMES_DAILY_WORKSPACE_LABELS");
});

test("C7 audit: qualification labels are founder-safe", () => {
  assertFounderSafe(HERMES_QUALIFICATION_FOUNDER_LABELS, "HERMES_QUALIFICATION_FOUNDER_LABELS");
});

test("C7 audit: outreach labels are founder-safe", () => {
  assertFounderSafe(HERMES_OUTREACH_FOUNDER_LABELS, "HERMES_OUTREACH_FOUNDER_LABELS");
});

test("C7 audit: conversation labels are founder-safe", () => {
  assertFounderSafe(HERMES_CONVERSATION_FOUNDER_LABELS, "HERMES_CONVERSATION_FOUNDER_LABELS");
});

test("C7 audit: follow-up plan labels are founder-safe", () => {
  assertFounderSafe(HERMES_FOLLOW_UP_PLAN_LABELS, "HERMES_FOLLOW_UP_PLAN_LABELS");
});

test("C7 audit: revenue pipeline labels are founder-safe", () => {
  assertFounderSafe(HERMES_REVENUE_PIPELINE_LABELS, "HERMES_REVENUE_PIPELINE_LABELS");
});

test("C7 audit: acquisition explainability labels are founder-safe", () => {
  assertFounderSafe(HERMES_ACQUISITION_EXPLAINABILITY_LABELS, "HERMES_ACQUISITION_EXPLAINABILITY_LABELS");
});

/* ── Canonical daily workflow section titles ──────────────────── */

test("C7 audit: the canonical six-section daily flow titles are founder-safe Turkish", () => {
  // Founder Working Queue + Deal Workspace v1.0 — "Karar Merkezi" (single-touch
  // decisions only) became "Bugünkü Çalışma Listesi" (decisions + today's fresh
  // opportunities, same slot); "Fırsat Odağı" (a compact per-mission card) became
  // "Fırsat Alanı", the label shown when no mission is selected — once selected,
  // the full-width Deal Workspace renders instead (Deal Header, not this label).
  // Both are still literal titles in the workspace; the rest come from adapter
  // label maps. This documents the canonical Founder OS flow.
  const canonicalTitles = [
    "Bugünkü Çalışma Listesi",
    "Fırsat Alanı",
    HERMES_REVENUE_PIPELINE_LABELS.sectionTitle, // Gelir Nabzı
    HERMES_FOLLOW_UP_PLAN_LABELS.sectionTitle, // Hermes Takip Planı
    HERMES_ACQUISITION_EXPLAINABILITY_LABELS.sectionTitle, // Hermes Bugün Bunları Buldu
    "Hermes Aktivitesi",
  ];
  assert.equal(canonicalTitles.length, 6);
  for (const title of canonicalTitles) {
    assert.equal(findForbiddenFounderTerm(title), null, title);
    assert.notEqual(title.trim(), "");
  }
});

/* ── Fresh Opportunity Workspace Bridge fix — mission-less opportunity copy ── */

test("C7 audit: a fresh, mission-less opportunity's Deal Workspace copy is founder-safe and never overstates a pending decision", () => {
  const focus = computeHermesOpportunityFocusForFreshLead({
    id: "lead-audit-1",
    name: "Audit Test Otel",
    city: "Mersin",
    phone: "+90 555 000 0000",
    verifiedOpportunityScore: 80,
  });
  for (const value of [
    focus.currentStateLabel,
    focus.whyThisMatters,
    focus.hermesRecommendation,
    focus.founderNextAction,
    focus.revenueSignalLabel,
    focus.whatsappStatusLabel ?? "",
  ]) {
    assert.equal(findForbiddenFounderTerm(value), null, value);
    assert.notEqual(value.trim(), "");
  }
  // Never claims a founder decision, message, or channel state that doesn't exist yet.
  assert.equal(focus.primaryActionLabel, null);
  assert.equal(focus.salesReadinessLabel, null);
  assert.equal(focus.outreachStatusLabel, null);
});

/* ── Developer Mode gating (Scope 8) ──────────────────────────── */

test("C7 audit: Developer OFF exposes only the Hermes founder experience", () => {
  const off = founderVisibleNavEntries(false);
  assert.deepEqual(off.map((e) => e.id), ["hermes"]);
  const on = founderVisibleNavEntries(true);
  assert.ok(on.length > off.length, "Developer ON must reveal more than Developer OFF");
});

/* ── Empty-state copy is real Turkish, never a placeholder ────── */

test("C7 audit: founder home empty-state labels are founder-safe and non-placeholder", () => {
  assertFounderSafe(FOUNDER_HOME_EMPTY_STATE_LABELS, "FOUNDER_HOME_EMPTY_STATE_LABELS");
  for (const value of Object.values(FOUNDER_HOME_EMPTY_STATE_LABELS)) {
    assert.equal(/todo|placeholder|coming soon|lorem|tbd|xxx/i.test(value), false, value);
  }
});

/* ── Revenue: unknown is "Henüz belirlenmedi", never a fake ₺0 ── */

test("C7 audit: unknown revenue renders 'Henüz belirlenmedi', never fake ₺0", () => {
  assert.equal(formatMrrLabel(null), "Henüz belirlenmedi");
  assert.equal(formatMrrLabel(undefined), "Henüz belirlenmedi");
  assert.equal(/₺/.test(formatMrrLabel(null)), false);
  // A real 0 is a real value, not "unknown".
  assert.equal(formatMrrLabel(0), "₺0");
});

/* ── No English founder copy in the C-sprint section subtitles ── */

test("C7 audit: founder section subtitles carry no obvious English words", () => {
  const subtitles = [
    HERMES_REVENUE_PIPELINE_LABELS.sectionSubtitle,
    HERMES_FOLLOW_UP_PLAN_LABELS.sectionSubtitle,
    HERMES_CONVERSATION_FOUNDER_LABELS.sectionSubtitle,
    HERMES_QUALIFICATION_FOUNDER_LABELS.sectionSubtitle,
  ];
  const englishGiveaways = /\b(the|and|revenue|pipeline|opportunity|message|follow[- ]?up|customer|status|review|send)\b/i;
  for (const s of subtitles) {
    assert.equal(englishGiveaways.test(s), false, `English word in: ${s}`);
  }
});
