import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACQUISITION_NEXT_ACTIONS,
  ACQUISITION_REASON_SENTENCES,
  ACQUISITION_STATUS_SENTENCES,
  HERMES_ACQUISITION_EXPLAINABILITY_LABELS,
  computeAcquisitionExplainability,
  explainOpportunity,
  type ExplainableLeadLike,
  type FounderOpportunityExplanation,
} from "./hermes-acquisition-explainability-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

/** Fixed "now" so calendar-day filtering is deterministic: 2026-07-13 10:00 local. */
const NOW = new Date(2026, 6, 13, 10, 0, 0).getTime();
const TODAY = NOW - 60 * 60 * 1000;
const YESTERDAY = NOW - 26 * 60 * 60 * 1000;

function lead(overrides: Partial<ExplainableLeadLike> = {}): ExplainableLeadLike {
  return {
    name: "Mersin Marina Hotel",
    firstImportedAt: TODAY,
    phone: "+90 555 111 22 33",
    website: "https://mersinmarina.example",
    verifiedOpportunityScore: 91,
    ...overrides,
  };
}

/* ── status mapping ─────────────────────────────────────────── */

test("high-score lead with phone and website reads as priority (green)", () => {
  const e = explainOpportunity(lead());
  assert.equal(e.attentionLevel, "ready");
  assert.equal(e.status, ACQUISITION_STATUS_SENTENCES.ready);
  assert.equal(e.scoreLabel, "Fırsat Puanı 91");
});

test("workable lead below the priority bar reads as watching (amber)", () => {
  const e = explainOpportunity(lead({ verifiedOpportunityScore: 55 }));
  assert.equal(e.attentionLevel, "watching");
  assert.equal(e.status, ACQUISITION_STATUS_SENTENCES.watching);
  assert.equal(e.scoreLabel, "Fırsat Puanı 55");
});

test("lead without a website is set aside (gray) with no score shown", () => {
  const e = explainOpportunity(lead({ website: undefined, websiteCandidateUrl: undefined }));
  assert.equal(e.attentionLevel, "waiting");
  assert.equal(e.status, ACQUISITION_STATUS_SENTENCES.waiting);
  assert.equal(e.scoreLabel, null);
});

test("lead with no phone and no WhatsApp signal is set aside even with a high score", () => {
  const e = explainOpportunity(lead({ phone: undefined }));
  assert.equal(e.attentionLevel, "waiting");
});

test("score falls back through opportunityScore then leadScore", () => {
  const e = explainOpportunity(
    lead({ verifiedOpportunityScore: undefined, opportunityScore: undefined, leadScore: 72 }),
  );
  assert.equal(e.scoreLabel, "Fırsat Puanı 72");
  assert.equal(e.attentionLevel, "ready");
});

/* ── reason generation ──────────────────────────────────────── */

test("picked reasons read the existing runtime signals, in the spec's wording", () => {
  const e = explainOpportunity(
    lead({
      signalVerification: { whatsappVerification: "verified", reservationSignal: "detected" },
      adsLikelihood: "likely",
      icpAlignment: { otaDependencyLevel: "high", estimatedPropertySize: "large" },
    }),
  );
  assert.deepEqual(e.reasons, [
    ACQUISITION_REASON_SENTENCES.whatsappActive,
    ACQUISITION_REASON_SENTENCES.reservationEngine,
    ACQUISITION_REASON_SENTENCES.adsTrace,
    ACQUISITION_REASON_SENTENCES.otaDependencyHigh,
    ACQUISITION_REASON_SENTENCES.largeProperty,
  ]);
});

test("WhatsApp signal is also read from homepage intelligence and confidence fields", () => {
  const fromHomepage = explainOpportunity(lead({ websiteIntelligence: { hasWhatsAppLink: true } }));
  assert.ok(fromHomepage.reasons.includes(ACQUISITION_REASON_SENTENCES.whatsappActive));
  const fromConfidence = explainOpportunity(lead({ whatsappConfidence: "confirmed" }));
  assert.ok(fromConfidence.reasons.includes(ACQUISITION_REASON_SENTENCES.whatsappActive));
});

test("large property is read from units when ICP has no estimate", () => {
  const e = explainOpportunity(lead({ units: 45 }));
  assert.ok(e.reasons.includes(ACQUISITION_REASON_SENTENCES.largeProperty));
});

test("a picked card never renders an empty reason list", () => {
  const e = explainOpportunity(lead({ verifiedOpportunityScore: 75 }));
  assert.ok(e.reasons.length > 0);
  assert.ok(e.reasons.includes(ACQUISITION_REASON_SENTENCES.websiteLive));
});

test("set-aside reasons name the data gaps, never a verdict", () => {
  const e = explainOpportunity(
    lead({ website: undefined, phone: undefined, reviewsCount: 2 }),
  );
  assert.deepEqual(e.reasons, [
    ACQUISITION_REASON_SENTENCES.noWebsite,
    ACQUISITION_REASON_SENTENCES.noContactChannel,
    ACQUISITION_REASON_SENTENCES.lowDigitalVisibility,
  ]);
});

test("a set-aside card never renders an empty reason list either", () => {
  const e = explainOpportunity(
    lead({ website: undefined, hasInstagram: true, reviewsCount: 200 }),
  );
  assert.ok(e.reasons.length > 0);
});

/* ── next action generation ─────────────────────────────────── */

test("priority lead with WhatsApp gets the first-contact promise", () => {
  const e = explainOpportunity(lead({ whatsappConfidence: "confirmed" }));
  assert.equal(e.nextAction, ACQUISITION_NEXT_ACTIONS.prepareFirstContact);
});

test("priority lead without WhatsApp gets website analysis as the next step", () => {
  const e = explainOpportunity(lead());
  assert.equal(e.nextAction, ACQUISITION_NEXT_ACTIONS.analyzeWebsite);
});

test("watching lead with an unanalyzed website gets website analysis", () => {
  const e = explainOpportunity(lead({ verifiedOpportunityScore: 50 }));
  assert.equal(e.nextAction, ACQUISITION_NEXT_ACTIONS.analyzeWebsite);
});

test("watching lead whose website is already verified keeps being watched", () => {
  const e = explainOpportunity(
    lead({
      verifiedOpportunityScore: 50,
      signalVerification: { websiteVerification: "verified" },
    }),
  );
  assert.equal(e.nextAction, ACQUISITION_NEXT_ACTIONS.keepWatchingSignals);
});

test("set-aside lead always gets the revisit promise", () => {
  const e = explainOpportunity(lead({ website: undefined }));
  assert.equal(e.nextAction, ACQUISITION_NEXT_ACTIONS.revisitLater);
});

/* ── section view: today filter, sorting, caps ──────────────── */

test("only businesses first seen today enter the view", () => {
  const view = computeAcquisitionExplainability({
    leads: [
      lead({ name: "Bugünkü Otel", firstImportedAt: TODAY }),
      lead({ name: "Dünkü Otel", firstImportedAt: YESTERDAY }),
      lead({ name: "Tarihsiz Otel", firstImportedAt: undefined, createdAt: undefined }),
    ],
    now: NOW,
  });
  assert.equal(view.mode, "ready");
  assert.deepEqual(
    view.found.map((e) => e.title),
    ["Bugünkü Otel"],
  );
});

test("createdAt is the fallback first-seen moment", () => {
  const view = computeAcquisitionExplainability({
    leads: [lead({ firstImportedAt: undefined, createdAt: TODAY })],
    now: NOW,
  });
  assert.equal(view.found.length, 1);
});

test("found list sorts priority first, then score descending, and caps at 5", () => {
  const leads: ExplainableLeadLike[] = [
    lead({ name: "Watching A", verifiedOpportunityScore: 60 }),
    lead({ name: "Ready Low", verifiedOpportunityScore: 74 }),
    lead({ name: "Ready High", verifiedOpportunityScore: 95 }),
    lead({ name: "Watching B", verifiedOpportunityScore: 65 }),
    lead({ name: "Ready Mid", verifiedOpportunityScore: 82 }),
    lead({ name: "Watching C", verifiedOpportunityScore: 40 }),
  ];
  const view = computeAcquisitionExplainability({ leads, now: NOW });
  assert.deepEqual(
    view.found.map((e) => e.title),
    ["Ready High", "Ready Mid", "Ready Low", "Watching B", "Watching A"],
  );
  assert.equal(view.found.length, 5);
});

test("set-aside businesses land in revisit, capped at 3", () => {
  const leads = ["A", "B", "C", "D"].map((n) =>
    lead({ name: `Pansiyon ${n}`, website: undefined }),
  );
  const view = computeAcquisitionExplainability({ leads, now: NOW });
  assert.equal(view.revisit.length, 3);
  assert.equal(view.found.length, 0);
  assert.equal(view.mode, "ready");
});

/* ── empty / loading / error states ─────────────────────────── */

test("no discoveries today with a settled fetch renders the empty state", () => {
  const view = computeAcquisitionExplainability({
    leads: [lead({ firstImportedAt: YESTERDAY })],
    fetchState: "ready",
    now: NOW,
  });
  assert.equal(view.mode, "empty");
  assert.equal(view.found.length, 0);
  assert.equal(view.revisit.length, 0);
});

test("no cards while the status fetch is in flight renders loading", () => {
  const view = computeAcquisitionExplainability({ leads: [], fetchState: "loading", now: NOW });
  assert.equal(view.mode, "loading");
});

test("no cards after a failed status fetch renders the error state", () => {
  const view = computeAcquisitionExplainability({ leads: [], fetchState: "error", now: NOW });
  assert.equal(view.mode, "error");
});

test("cards found today win over a failed status fetch — never hide real data behind an error", () => {
  const view = computeAcquisitionExplainability({
    leads: [lead()],
    fetchState: "error",
    now: NOW,
  });
  assert.equal(view.mode, "ready");
  assert.equal(view.found.length, 1);
});

test("missing fetchState defaults to the empty state, never an error", () => {
  const view = computeAcquisitionExplainability({ leads: [], now: NOW });
  assert.equal(view.mode, "empty");
});

/* ── founder wording ────────────────────────────────────────── */

function allStringsOf(e: FounderOpportunityExplanation): string[] {
  return [e.title, e.status, e.scoreLabel ?? "", e.nextAction, ...e.reasons];
}

test("every emitted string is founder-safe — no technical vocabulary", () => {
  const variants: ExplainableLeadLike[] = [
    lead(),
    lead({ verifiedOpportunityScore: 50 }),
    lead({ website: undefined, phone: undefined, reviewsCount: 0 }),
    lead({
      whatsappConfidence: "confirmed",
      adsLikelihood: "likely",
      icpAlignment: { otaDependencyLevel: "high", estimatedPropertySize: "large" },
      websiteIntelligence: { hasBookingEngine: true },
    }),
  ];
  for (const v of variants) {
    for (const text of allStringsOf(explainOpportunity(v))) {
      assert.equal(findForbiddenFounderTerm(text), null, `forbidden term in: "${text}"`);
    }
  }
  for (const label of Object.values(HERMES_ACQUISITION_EXPLAINABILITY_LABELS)) {
    assert.equal(findForbiddenFounderTerm(label), null, `forbidden term in label: "${label}"`);
  }
});

test("a set-aside card never says rejected / failed / filtered / low score", () => {
  const e = explainOpportunity(lead({ website: undefined, phone: undefined }));
  const banned = ["rejected", "failed", "filtered", "low score", "düşük skor", "skor"];
  for (const text of allStringsOf(e)) {
    const lower = text.toLowerCase();
    for (const term of banned) {
      assert.ok(!lower.includes(term), `"${term}" leaked into: "${text}"`);
    }
  }
});

test("status sentences sound like Hermes speaking", () => {
  assert.equal(ACQUISITION_STATUS_SENTENCES.ready, "Hermes bu işletmeyi öncelikli gördü.");
  assert.equal(ACQUISITION_STATUS_SENTENCES.watching, "Hermes bu işletmeyi izlemeye aldı.");
  assert.equal(ACQUISITION_STATUS_SENTENCES.waiting, "İşleme alınmadı");
  assert.equal(
    ACQUISITION_NEXT_ACTIONS.revisitLater,
    "Hermes bu işletmeyi daha sonra tekrar değerlendirecek.",
  );
});

test("loading, error and empty copy match the spec verbatim", () => {
  assert.equal(
    HERMES_ACQUISITION_EXPLAINABILITY_LABELS.loading,
    "Hermes bugünkü fırsatları hazırlıyor...",
  );
  assert.equal(
    HERMES_ACQUISITION_EXPLAINABILITY_LABELS.error,
    "Bugünkü fırsatlar şu anda yüklenemedi.",
  );
  assert.equal(HERMES_ACQUISITION_EXPLAINABILITY_LABELS.retry, "Tekrar Dene");
  assert.equal(HERMES_ACQUISITION_EXPLAINABILITY_LABELS.emptyTitle, "Bugün yeni fırsat bulunmadı.");
  assert.equal(
    HERMES_ACQUISITION_EXPLAINABILITY_LABELS.emptySubtitle,
    "Hermes mevcut işletmeleri izlemeye devam ediyor.",
  );
});
