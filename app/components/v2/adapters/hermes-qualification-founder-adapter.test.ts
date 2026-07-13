import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_QUALIFICATION_FOUNDER_LABELS,
  computeQualificationFounderView,
  selectQualificationReviewItems,
  type QualificationApiResultLike,
  type QualificationApiSummaryLike,
} from "./hermes-qualification-founder-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

function apiResult(overrides: Partial<QualificationApiResultLike> = {}): QualificationApiResultLike {
  return {
    leadId: "lead-1",
    businessName: "Mersin Marina Hotel",
    status: "sales_ready",
    statusLabelTr: "Satışa Hazır",
    confidenceLabelTr: "Güven Yüksek",
    scoreSnapshot: { verifiedOpportunityScore: 91, leadScore: 80, icpScore: 75 },
    positiveReasonsTr: ["Fırsat puanı satış eşiğinin üzerinde", "Doğrudan iletişim kanalı hazır"],
    cautionReasonsTr: [],
    founderSummaryTr: "Hermes Mersin Marina Hotel işletmesini satışa hazır gördü.",
    hermesRecommendationTr: "Mesaj hazırlamaya uygun — taslak hazırlanınca onay sana gelecek.",
    nextActionLabelTr: "Mesaj hazırlığı yapılacak — son onay founder'da.",
    eligibleForOutreachDraft: true,
    requiresFounderReview: false,
    ...overrides,
  };
}

function summary(overrides: Partial<QualificationApiSummaryLike> = {}): QualificationApiSummaryLike {
  return {
    total: 1,
    salesReady: 1,
    reviewRequired: 0,
    dataNeeded: 0,
    watch: 0,
    notQualified: 0,
    blocked: 0,
    ...overrides,
  };
}

/* ── kartlar ────────────────────────────────────────────────── */

test("sales_ready founder kartı: durum, puan, nedenler, taslak rozeti", () => {
  const view = computeQualificationFounderView({
    results: [apiResult()],
    summary: summary(),
    fetchState: "ready",
  });
  assert.equal(view.mode, "ready");
  assert.equal(view.cards.length, 1);
  const card = view.cards[0];
  assert.equal(card.title, "Mersin Marina Hotel");
  assert.equal(card.statusLabelTr, "Satışa Hazır");
  assert.equal(card.scoreLabel, "Fırsat Puanı 91");
  assert.equal(card.whyReadyTr.length, 2);
  assert.equal(card.draftBadgeTr, HERMES_QUALIFICATION_FOUNDER_LABELS.draftEligible);
  assert.equal(card.isSalesReady, true);
});

test("review_required kartı: amber rozet + dikkat noktası", () => {
  const view = computeQualificationFounderView({
    results: [
      apiResult({
        status: "review_required",
        statusLabelTr: "Founder İncelemesi Gerekli",
        cautionReasonsTr: ["Bir nokta founder doğrulaması gerektiriyor"],
        eligibleForOutreachDraft: false,
        requiresFounderReview: true,
      }),
    ],
    summary: summary({ salesReady: 0, reviewRequired: 1 }),
    fetchState: "ready",
  });
  const card = view.cards[0];
  assert.equal(card.isSalesReady, false);
  assert.equal(card.attentionTr, "Bir nokta founder doğrulaması gerektiriyor");
  assert.equal(card.draftBadgeTr, HERMES_QUALIFICATION_FOUNDER_LABELS.reviewNeeded);
});

test("data_needed ve watch kart üretmez, yalnız sayaçta görünür", () => {
  const view = computeQualificationFounderView({
    results: [
      apiResult({ leadId: "l1", status: "data_needed", statusLabelTr: "Daha Fazla Veri Gerekli" }),
      apiResult({ leadId: "l2", status: "watch", statusLabelTr: "İzlemeye Alındı" }),
    ],
    summary: summary({ salesReady: 0, dataNeeded: 1, watch: 1, total: 2 }),
    fetchState: "ready",
  });
  assert.equal(view.mode, "ready");
  assert.equal(view.cards.length, 0);
  assert.equal(view.counters.dataNeeded, 1);
  assert.equal(view.counters.watch, 1);
});

test("kart sınırları: en fazla 5 sales_ready + 3 review_required", () => {
  const results = [
    ...Array.from({ length: 7 }, (_, i) => apiResult({ leadId: `s${i}`, businessName: `Hazır ${i}` })),
    ...Array.from({ length: 5 }, (_, i) =>
      apiResult({ leadId: `r${i}`, businessName: `İnceleme ${i}`, status: "review_required" }),
    ),
  ];
  const view = computeQualificationFounderView({ results, summary: null, fetchState: "ready" });
  assert.equal(view.cards.filter((c) => c.isSalesReady).length, 5);
  assert.equal(view.cards.filter((c) => !c.isSalesReady).length, 3);
});

/* ── boş / yükleniyor / hata ────────────────────────────────── */

test("sonuç yokken settled fetch boş durumu döner", () => {
  const view = computeQualificationFounderView({ results: [], summary: null, fetchState: "ready" });
  assert.equal(view.mode, "empty");
});

test("fetch sürerken loading, başarısızken error", () => {
  assert.equal(
    computeQualificationFounderView({ results: null, summary: null, fetchState: "loading" }).mode,
    "loading",
  );
  assert.equal(
    computeQualificationFounderView({ results: null, summary: null, fetchState: "error" }).mode,
    "error",
  );
});

test("gerçek veri varken error asla gösterilmez", () => {
  const view = computeQualificationFounderView({
    results: [apiResult()],
    summary: summary(),
    fetchState: "error",
  });
  assert.equal(view.mode, "ready");
});

/* ── founder dili ───────────────────────────────────────────── */

test("tüm etiketler founder-güvenlidir — teknik terim yok", () => {
  for (const label of Object.values(HERMES_QUALIFICATION_FOUNDER_LABELS)) {
    assert.equal(findForbiddenFounderTerm(label), null, `yasaklı terim: "${label}"`);
    assert.ok(!label.toLowerCase().includes("qualification"), `"qualification" sızdı: "${label}"`);
    assert.ok(!label.toLowerCase().includes("icp"), `"icp" sızdı: "${label}"`);
  }
  const view = computeQualificationFounderView({
    results: [apiResult()],
    summary: summary(),
    fetchState: "ready",
  });
  for (const card of view.cards) {
    const texts = [card.title, card.statusLabelTr, card.nextStepTr, card.draftBadgeTr, ...card.whyReadyTr];
    for (const text of texts) {
      assert.equal(findForbiddenFounderTerm(text), null, `yasaklı terim: "${text}"`);
    }
  }
});

test("kartlarda ham telefon veya ham enum yoktur", () => {
  const view = computeQualificationFounderView({
    results: [apiResult()],
    summary: summary(),
    fetchState: "ready",
  });
  const serialized = JSON.stringify(view.cards);
  assert.ok(!serialized.includes("+90 5"));
  assert.ok(!serialized.includes("sales_ready"));
});

/* ── Karar Merkezi seçimi ───────────────────────────────────── */

test("yalnız requiresFounderReview=true olan review_required sonuçları karar öğesi olur", () => {
  const reviews = selectQualificationReviewItems([
    apiResult({ status: "review_required", requiresFounderReview: true }),
    apiResult({ leadId: "l2", status: "review_required", requiresFounderReview: false }),
    apiResult({ leadId: "l3", status: "sales_ready", requiresFounderReview: false }),
    apiResult({ leadId: "l4", status: "watch" }),
  ]);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].leadId, "lead-1");
});
