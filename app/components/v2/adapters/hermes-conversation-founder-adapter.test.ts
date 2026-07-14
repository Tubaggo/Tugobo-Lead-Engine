import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_CONVERSATION_FOUNDER_LABELS,
  computeConversationFounderView,
  selectConversationForLead,
  type ConversationApiResultLike,
} from "./hermes-conversation-founder-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

function result(overrides: Partial<ConversationApiResultLike> = {}): ConversationApiResultLike {
  return {
    leadId: "l1",
    missionId: "m1",
    businessName: "Otel Deniz",
    state: "hot_opportunity",
    stateLabelTr: "Sıcak Fırsat",
    priorityLabelTr: "Yüksek",
    replyPreviewSafe: "İlgileniyoruz.",
    whatHappenedTr: "İşletme ilgi gösterdi — sıcak bir fırsat oluştu.",
    whyItMattersTr: "Sıcak ilgi hızlı yanıt ister.",
    hermesRecommendationTr: "Hermes bir cevap taslağı hazırlayabilir — incele ve onayla.",
    nextActionLabelTr: "Mesaj taslağını incele ve onayla.",
    founderActionRequired: true,
    founderActionLabelTr: "Mesaj Taslağını İncele",
    approvalRequired: true,
    conversationClosed: false,
    ...overrides,
  };
}

const summary = {
  total: 1,
  hotOpportunity: 1,
  pricingDiscussion: 0,
  demoRequested: 0,
  callRequested: 0,
  followUpLater: 0,
  reviewRequired: 0,
  notInterested: 0,
  wrongNumber: 0,
  closed: 0,
};

test("hot conversation renders a ready card", () => {
  const view = computeConversationFounderView({ results: [result()], summary, fetchState: "ready" });
  assert.equal(view.mode, "ready");
  assert.equal(view.cards.length, 1);
  assert.equal(view.cards[0].title, "Otel Deniz");
  assert.equal(view.cards[0].stateLabelTr, "Sıcak Fırsat");
  assert.equal(view.counters.hotOpportunity, 1);
});

test("pricing / demo / call / review conversations all render", () => {
  for (const state of ["pricing_discussion", "demo_requested", "call_requested", "human_review_required"]) {
    const view = computeConversationFounderView({ results: [result({ state, stateLabelTr: state })], summary: null, fetchState: "ready" });
    assert.equal(view.mode, "ready", state);
    assert.equal(view.cards.length, 1, state);
  }
});

test("passive (reply_received) and closed (closed_won) are hidden from cards", () => {
  const view = computeConversationFounderView({
    results: [result({ state: "reply_received" }), result({ state: "closed_won" })],
    summary: null,
    fetchState: "ready",
  });
  assert.equal(view.cards.length, 0);
  assert.equal(view.mode, "empty");
});

test("no card ever exposes a 'Gönder' (send) action", () => {
  const states = ["hot_opportunity", "pricing_discussion", "demo_requested", "call_requested", "follow_up_later", "not_interested", "wrong_number", "human_review_required"];
  for (const state of states) {
    const view = computeConversationFounderView({ results: [result({ state })], summary: null, fetchState: "ready" });
    for (const card of view.cards) {
      if (card.founderActionLabelTr) assert.equal(/gönder/i.test(card.founderActionLabelTr), false, card.founderActionLabelTr);
    }
  }
});

test("leadNameById enriches display name over the fallback", () => {
  const view = computeConversationFounderView({
    results: [result({ businessName: "İsimsiz işletme" })],
    summary: null,
    fetchState: "ready",
    leadNameById: { l1: "Grand Hotel" },
  });
  assert.equal(view.cards[0].title, "Grand Hotel");
});

test("empty / loading / error states", () => {
  assert.equal(computeConversationFounderView({ results: [], summary: null, fetchState: "loading" }).mode, "loading");
  assert.equal(computeConversationFounderView({ results: [], summary: null, fetchState: "error" }).mode, "error");
  assert.equal(computeConversationFounderView({ results: [], summary: null, fetchState: "ready" }).mode, "empty");
});

test("all founder labels carry no forbidden technical terms", () => {
  for (const [key, value] of Object.entries(HERMES_CONVERSATION_FOUNDER_LABELS)) {
    assert.equal(findForbiddenFounderTerm(value), null, `${key}: ${value}`);
  }
});

test("card copy carries no forbidden technical terms", () => {
  const view = computeConversationFounderView({ results: [result()], summary: null, fetchState: "ready" });
  const card = view.cards[0];
  for (const text of [card.title, card.stateLabelTr, card.whatHappenedTr, card.whyItMattersTr, card.hermesRecommendationTr, card.nextStepTr, card.founderActionLabelTr ?? ""]) {
    assert.equal(findForbiddenFounderTerm(text), null, text);
  }
});

test("card copy never exposes a raw provider message id or phone number", () => {
  const view = computeConversationFounderView({ results: [result()], summary: null, fetchState: "ready" });
  const json = JSON.stringify(view.cards[0]);
  assert.equal(/wamid\./.test(json), false);
  assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(json), false);
});

test("selectConversationForLead picks the matching lead", () => {
  const results = [result({ leadId: "a" }), result({ leadId: "b", state: "demo_requested" })];
  assert.equal(selectConversationForLead(results, "b")?.state, "demo_requested");
  assert.equal(selectConversationForLead(results, "z"), null);
  assert.equal(selectConversationForLead(results, null), null);
});
