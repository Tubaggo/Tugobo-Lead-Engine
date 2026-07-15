import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFounderNarrative,
  founderNarrativeSentences,
  type ComputeFounderNarrativeInput,
} from "./hermes-founder-narrative-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

function buildInput(overrides: Partial<ComputeFounderNarrativeInput> = {}): ComputeFounderNarrativeInput {
  return {
    isRunning: false,
    pendingDecisionCount: 0,
    draftsPreparedCount: 0,
    revenueSummary: { replyReceivedCount: 0, hotReplyCount: 0, followUpRequiredCount: 0, wonCount: 0, lostCount: 0 },
    intakeSummary: { evaluatedLeadCount: 0, newOpportunityCount: 0 },
    ...overrides,
  };
}

/* ── Determinism ────────────────────────────────────────────────── */

test("computeFounderNarrative is a pure function: identical input always yields identical output", () => {
  const input = buildInput({
    isRunning: true,
    pendingDecisionCount: 3,
    draftsPreparedCount: 2,
    revenueSummary: { replyReceivedCount: 1, hotReplyCount: 1, followUpRequiredCount: 1, wonCount: 1, lostCount: 0 },
    intakeSummary: { evaluatedLeadCount: 18, newOpportunityCount: 4 },
  });
  const a = computeFounderNarrative(input);
  const b = computeFounderNarrative(input);
  assert.deepEqual(a, b);
});

/* ── Manual QA scenario 1 — morning with pending decisions ────────── */

test("morning with pending decisions: requiredAction names the exact count, status is idle", () => {
  const n = computeFounderNarrative(buildInput({ pendingDecisionCount: 3 }));
  assert.equal(n.status, "Hazırlığım tamam.");
  assert.equal(n.requiredAction, "Bugün senden yalnızca 3 karar bekliyorum.");
});

/* ── Manual QA scenario 2 — morning with no pending decisions ─────── */

test("morning with no pending decisions: requiredAction is the all-clear sentence", () => {
  const n = computeFounderNarrative(buildInput({ pendingDecisionCount: 0 }));
  assert.equal(n.requiredAction, "Şimdilik senden herhangi bir işlem beklemiyorum.");
});

/* ── Manual QA scenario 3 — reply received ─────────────────────────── */

test("reply received (not hot): findings mentions the generic reply, not a hot-reply sentence", () => {
  const n = computeFounderNarrative(
    buildInput({ revenueSummary: { replyReceivedCount: 1, hotReplyCount: 0, followUpRequiredCount: 0, wonCount: 0, lostCount: 0 } }),
  );
  assert.deepEqual(n.findings, ["1 işletmeden cevap geldi."]);
});

test("hot reply: findings mentions the hot reply, never also the generic reply sentence (no duplicated information)", () => {
  const n = computeFounderNarrative(
    buildInput({ revenueSummary: { replyReceivedCount: 1, hotReplyCount: 1, followUpRequiredCount: 0, wonCount: 0, lostCount: 0 } }),
  );
  assert.deepEqual(n.findings, ["1 sıcak cevap geldi."]);
});

/* ── Manual QA scenario 4 — follow-up day ──────────────────────────── */

test("follow-up day: findings mentions the follow-up count", () => {
  const n = computeFounderNarrative(
    buildInput({ revenueSummary: { replyReceivedCount: 0, hotReplyCount: 0, followUpRequiredCount: 2, wonCount: 0, lostCount: 0 } }),
  );
  assert.deepEqual(n.findings, ["2 işletme için takip zamanı geldi."]);
});

/* ── Manual QA scenario 5 — idle day ───────────────────────────────── */

test("idle day: no running pipeline, no pending decisions, no findings — narrative is still exactly 2 sentences (status + requiredAction)", () => {
  const n = computeFounderNarrative(buildInput());
  assert.equal(n.status, "Hazırlığım tamam.");
  assert.deepEqual(n.workCompleted, []);
  assert.deepEqual(n.findings, []);
  assert.equal(n.requiredAction, "Şimdilik senden herhangi bir işlem beklemiyorum.");
  assert.equal(founderNarrativeSentences(n).length, 2);
});

/* ── Manual QA scenario 6 — running mission ────────────────────────── */

test("running mission: status reflects active execution, never the idle phrase", () => {
  const n = computeFounderNarrative(buildInput({ isRunning: true }));
  assert.equal(n.status, "Hermes şu anda çalışıyor.");
});

/* ── Manual QA scenario 7 — completed mission (sales outcome resolved) ── */

test("completed mission (won): findings reports the won count", () => {
  const n = computeFounderNarrative(
    buildInput({ revenueSummary: { replyReceivedCount: 0, hotReplyCount: 0, followUpRequiredCount: 0, wonCount: 1, lostCount: 0 } }),
  );
  assert.deepEqual(n.findings, ["1 satış kazanıldı."]);
});

/* ── Work completed — evaluated/qualified/drafts ──────────────────── */

test("work completed: evaluated + qualified leads populate the top two clauses, in priority order", () => {
  const n = computeFounderNarrative(buildInput({ intakeSummary: { evaluatedLeadCount: 18, newOpportunityCount: 4 } }));
  assert.deepEqual(n.workCompleted, [
    "Hermes bugüne kadar 18 işletmeyi değerlendirdi.",
    "4 tanesi satış için uygun bulundu.",
  ]);
});

test("work completed never mentions a zero count", () => {
  const n = computeFounderNarrative(buildInput({ intakeSummary: { evaluatedLeadCount: 0, newOpportunityCount: 0 }, draftsPreparedCount: 2 }));
  assert.deepEqual(n.workCompleted, ["2 mesaj taslağı hazırladı."]);
  for (const s of n.workCompleted) assert.ok(!/\b0\b/.test(s), s);
});

test("work completed is capped at 2 clauses even when all three candidates apply", () => {
  const n = computeFounderNarrative(
    buildInput({ intakeSummary: { evaluatedLeadCount: 18, newOpportunityCount: 4 }, draftsPreparedCount: 2 }),
  );
  assert.equal(n.workCompleted.length, 2);
});

/* ── Sentence budget — never exceeds the sprint's 6-sentence maximum ── */

test("total sentence count never exceeds 6, even when every signal fires at once", () => {
  const n = computeFounderNarrative(
    buildInput({
      isRunning: true,
      pendingDecisionCount: 3,
      draftsPreparedCount: 2,
      revenueSummary: { replyReceivedCount: 1, hotReplyCount: 1, followUpRequiredCount: 2, wonCount: 1, lostCount: 1 },
      intakeSummary: { evaluatedLeadCount: 18, newOpportunityCount: 4 },
    }),
  );
  const all = founderNarrativeSentences(n);
  assert.ok(all.length <= 6, `expected <=6 sentences, got ${all.length}: ${all.join(" | ")}`);
  assert.equal(all.length, 6);
});

/* ── Founder-language safety — no forbidden technical vocabulary ─── */

test("every possible sentence across every field is founder-safe (no forbidden technical terms)", () => {
  const scenarios: ComputeFounderNarrativeInput[] = [
    buildInput(),
    buildInput({ isRunning: true }),
    buildInput({ pendingDecisionCount: 5 }),
    buildInput({ draftsPreparedCount: 3 }),
    buildInput({ intakeSummary: { evaluatedLeadCount: 40, newOpportunityCount: 9 } }),
    buildInput({ revenueSummary: { replyReceivedCount: 2, hotReplyCount: 1, followUpRequiredCount: 3, wonCount: 2, lostCount: 1 } }),
  ];
  for (const scenario of scenarios) {
    const sentences = founderNarrativeSentences(computeFounderNarrative(scenario));
    for (const s of sentences) {
      assert.equal(findForbiddenFounderTerm(s), null, s);
    }
  }
});

/* ── No hallucination — every rendered clause traces to a >0 input count ── */

test("no clause is ever emitted for a zero-valued counter", () => {
  const n = computeFounderNarrative(
    buildInput({
      draftsPreparedCount: 0,
      revenueSummary: { replyReceivedCount: 0, hotReplyCount: 0, followUpRequiredCount: 0, wonCount: 0, lostCount: 0 },
      intakeSummary: { evaluatedLeadCount: 0, newOpportunityCount: 0 },
    }),
  );
  assert.deepEqual(n.workCompleted, []);
  assert.deepEqual(n.findings, []);
});
