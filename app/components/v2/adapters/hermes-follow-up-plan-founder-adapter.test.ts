import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_FOLLOW_UP_PLAN_LABELS,
  computeFollowUpPlanView,
  selectFollowUpPlanForLead,
  type FollowUpPlanApiResultLike,
} from "./hermes-follow-up-plan-founder-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

function result(overrides: Partial<FollowUpPlanApiResultLike> = {}): FollowUpPlanApiResultLike {
  return {
    followUpCandidateId: "followup:read_no_reply:1",
    leadId: "l1",
    missionId: "m1",
    businessName: "Otel Deniz",
    state: "draft_needed",
    stateLabelTr: "Taslak Hazırlanacak",
    trigger: "read_no_reply",
    triggerLabelTr: "Okundu, Cevap Yok",
    priority: "high",
    channelStrategy: "same_channel",
    draftNeeded: true,
    approvalRequired: true,
    founderActionRequired: true,
    founderActionLabelTr: "Taslağı İncele",
    whatHappenedTr: "Mesaj okundu ama işletme henüz cevap vermedi.",
    whyItMattersTr: "Zamanında bir hatırlatma ilgiyi canlı tutar.",
    hermesRecommendationTr: "Hermes bir takip taslağı hazırlayabilir.",
    suggestedTimingTr: "Şimdi",
    ...overrides,
  };
}

test("today group holds due/draft_needed (non channel-review)", () => {
  const view = computeFollowUpPlanView({ results: [result()], summary: null, fetchState: "ready" });
  assert.equal(view.mode, "ready");
  assert.equal(view.today.length, 1);
  assert.equal(view.today[0].title, "Otel Deniz");
});

test("upcoming/approval/channel-review grouping", () => {
  const view = computeFollowUpPlanView({
    results: [
      result({ followUpCandidateId: "a", state: "waiting", stateLabelTr: "Zamanı Bekliyor" }),
      result({ followUpCandidateId: "b", state: "approval_required", stateLabelTr: "Founder Onayı Bekliyor" }),
      result({ followUpCandidateId: "c", state: "due", stateLabelTr: "Zamanı Geldi", channelStrategy: "manual_channel_review", trigger: "failed_delivery_recovery" }),
    ],
    summary: null,
    fetchState: "ready",
  });
  assert.equal(view.upcoming.length, 1);
  assert.equal(view.approval.length, 1);
  assert.equal(view.channelReview.length, 1);
  assert.equal(view.today.length, 0); // channel-review item excluded from today
});

test("cancelled/completed hidden from active groups", () => {
  const view = computeFollowUpPlanView({
    results: [result({ state: "cancelled" }), result({ followUpCandidateId: "x", state: "completed" })],
    summary: null,
    fetchState: "ready",
  });
  assert.equal(view.today.length + view.upcoming.length + view.approval.length + view.channelReview.length, 0);
  assert.equal(view.mode, "empty");
});

test("no card ever exposes a 'Gönder' action", () => {
  const states = ["due", "draft_needed", "waiting", "approval_required", "blocked"];
  for (const state of states) {
    const view = computeFollowUpPlanView({ results: [result({ state })], summary: null, fetchState: "ready" });
    const cards = [...view.today, ...view.upcoming, ...view.approval, ...view.channelReview];
    for (const c of cards) {
      if (c.founderActionLabelTr) assert.equal(/gönder/i.test(c.founderActionLabelTr), false, c.founderActionLabelTr);
    }
  }
});

test("leadNameById enriches display name over fallback", () => {
  const view = computeFollowUpPlanView({
    results: [result({ businessName: "İsimsiz işletme" })],
    summary: null,
    fetchState: "ready",
    leadNameById: { l1: "Grand Hotel" },
  });
  assert.equal(view.today[0].title, "Grand Hotel");
});

test("empty / loading / error states", () => {
  assert.equal(computeFollowUpPlanView({ results: [], summary: null, fetchState: "loading" }).mode, "loading");
  assert.equal(computeFollowUpPlanView({ results: [], summary: null, fetchState: "error" }).mode, "error");
  assert.equal(computeFollowUpPlanView({ results: [], summary: null, fetchState: "ready" }).mode, "empty");
});

test("all founder labels carry no forbidden technical terms", () => {
  for (const [key, value] of Object.entries(HERMES_FOLLOW_UP_PLAN_LABELS)) {
    assert.equal(findForbiddenFounderTerm(value), null, `${key}: ${value}`);
  }
});

test("card copy carries no forbidden technical terms", () => {
  const view = computeFollowUpPlanView({ results: [result()], summary: null, fetchState: "ready" });
  const c = view.today[0];
  for (const text of [c.title, c.stateLabelTr, c.reasonLabelTr, c.whatHappenedTr, c.whyItMattersTr, c.hermesRecommendationTr, c.suggestedTimingTr, c.founderActionLabelTr ?? ""]) {
    assert.equal(findForbiddenFounderTerm(text), null, text);
  }
});

test("card copy never exposes a raw candidate id or phone", () => {
  const view = computeFollowUpPlanView({ results: [result()], summary: null, fetchState: "ready" });
  // followUpCandidateId is present as a field (needed for status API) but the visible copy must not contain "followup:" or a phone.
  const visible = [view.today[0].title, view.today[0].whatHappenedTr, view.today[0].hermesRecommendationTr].join(" ");
  assert.equal(/followup:/.test(visible), false);
  assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(visible), false);
});

test("summary counters preferred over derived counts", () => {
  const view = computeFollowUpPlanView({
    results: [result()],
    summary: { total: 9, dueToday: 5, upcoming: 4, approvalRequired: 2, channelReview: 1, completed: 0, cancelled: 0, blocked: 0 },
    fetchState: "ready",
  });
  assert.equal(view.counters.dueToday, 5);
  assert.equal(view.counters.upcoming, 4);
});

test("selectFollowUpPlanForLead picks the matching lead", () => {
  const results = [result({ leadId: "a" }), result({ leadId: "b", state: "waiting" })];
  assert.equal(selectFollowUpPlanForLead(results, "b")?.state, "waiting");
  assert.equal(selectFollowUpPlanForLead(results, "z"), null);
});
