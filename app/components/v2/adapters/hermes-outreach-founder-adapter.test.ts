import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_OUTREACH_FOUNDER_LABELS,
  computeOutreachFounderView,
  selectOutreachForLead,
  type OutreachApiResultLike,
} from "./hermes-outreach-founder-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

function result(overrides: Partial<OutreachApiResultLike> = {}): OutreachApiResultLike {
  return {
    leadId: "lead-1",
    businessName: "Mersin Marina Hotel",
    status: "approval_required",
    statusLabelTr: "Founder Onayı Bekliyor",
    channelLabelTr: "WhatsApp",
    templateLabelTr: "WhatsApp İlk Temas",
    languageLabelTr: "Türkçe",
    toneLabelTr: "Danışman",
    lengthLabelTr: "Kısa",
    personalizationSignalsTr: ["Otel adı: Mersin Marina Hotel", "Şehir: Mersin"],
    founderSummaryTr: "Hermes mesaj hazırladı.",
    hermesRecommendationTr: "Mesajı incele ve onayla.",
    nextActionLabelTr: "Founder onayı bekleniyor.",
    approvalNeeded: true,
    ...overrides,
  };
}

test("ready: approval_required kart olur, waiting kart olmaz ama sayaçta kalır", () => {
  const v = computeOutreachFounderView({
    results: [result(), result({ leadId: "l2", status: "waiting", statusLabelTr: "Hazırlanıyor" })],
    summary: null,
    fetchState: "ready",
  });
  assert.equal(v.mode, "ready");
  assert.equal(v.cards.length, 1);
  assert.equal(v.cards[0].leadId, "lead-1");
  assert.equal(v.counters.waiting, 1);
  assert.equal(v.counters.approvalRequired, 1);
  assert.equal(v.counters.awaitingFounder, 1);
});

test("summary öncelikli sayaç kaynağıdır", () => {
  const v = computeOutreachFounderView({
    results: [result()],
    summary: { total: 9, waiting: 2, draftReady: 1, approvalRequired: 3, awaitingFounder: 4 },
    fetchState: "ready",
  });
  assert.equal(v.counters.awaitingFounder, 4);
  assert.equal(v.counters.approvalRequired, 3);
  assert.equal(v.counters.waiting, 2);
});

test("boş sonuç + ready → empty", () => {
  const v = computeOutreachFounderView({ results: [], summary: null, fetchState: "ready" });
  assert.equal(v.mode, "empty");
});

test("veri yok + loading/error durumları", () => {
  assert.equal(computeOutreachFounderView({ results: null, summary: null, fetchState: "loading" }).mode, "loading");
  assert.equal(computeOutreachFounderView({ results: null, summary: null, fetchState: "error" }).mode, "error");
});

test("gerçek veri varken error gösterilmez (kartlar kazanır)", () => {
  const v = computeOutreachFounderView({ results: [result()], summary: null, fetchState: "error" });
  assert.equal(v.mode, "ready");
});

test("kart en fazla 4 personalization gösterir", () => {
  const v = computeOutreachFounderView({
    results: [result({ personalizationSignalsTr: ["a", "b", "c", "d", "e", "f"] })],
    summary: null,
    fetchState: "ready",
  });
  assert.equal(v.cards[0].whyPreparedTr.length, 4);
});

test("selectOutreachForLead doğru lead'i seçer", () => {
  const results = [result(), result({ leadId: "l2" })];
  assert.equal(selectOutreachForLead(results, "l2")!.leadId, "l2");
  assert.equal(selectOutreachForLead(results, "yok"), null);
  assert.equal(selectOutreachForLead(results, null), null);
});

test("founder-güvenli: hiçbir founder etiketi yasaklı teknik terim içermez", () => {
  for (const value of Object.values(HERMES_OUTREACH_FOUNDER_LABELS)) {
    assert.equal(findForbiddenFounderTerm(value), null, `Yasaklı terim: "${value}"`);
  }
});

test("founder-güvenli: kart içeriği yasaklı teknik terim içermez", () => {
  const v = computeOutreachFounderView({ results: [result()], summary: null, fetchState: "ready" });
  const card = v.cards[0];
  const strings = [
    card.title,
    card.statusLabelTr,
    card.channelLabelTr,
    card.templateLabelTr,
    card.languageLabelTr,
    card.toneLabelTr,
    card.nextStepTr,
    ...card.whyPreparedTr,
  ];
  for (const s of strings) {
    assert.equal(findForbiddenFounderTerm(s), null, `Yasaklı terim: "${s}"`);
  }
});
