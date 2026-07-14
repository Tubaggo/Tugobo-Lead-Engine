import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REVENUE_STAGE_LABELS_TR,
  buildRevenuePipelineAuditEvent,
  calculateRevenueArr,
  deriveRevenuePipelineStage,
  evaluateRevenuePipelineItem,
  selectAtRiskRevenue,
  selectClosestToRevenue,
  sortRevenuePipeline,
  summarizeRevenuePipeline,
  type RevenuePipelineInput,
  type RevenuePipelineItem,
  type RevenuePipelineStage,
} from "./hermes-revenue-pipeline-runtime.ts";
import { defaultRevenuePipelinePolicy } from "./hermes-revenue-pipeline-policy.ts";

const POLICY = defaultRevenuePipelinePolicy();
const HOUR = 60 * 60 * 1000;
const NOW = 1_000_000_000;

function input(overrides: Partial<RevenuePipelineInput> = {}): RevenuePipelineInput {
  return {
    lead: { id: "l1", name: "Otel Deniz" },
    mission: { missionId: "m1" },
    currentTime: NOW,
    policy: POLICY,
    ...overrides,
  };
}

function evalItem(overrides: Partial<RevenuePipelineInput> = {}): RevenuePipelineItem {
  return evaluateRevenuePipelineItem(input(overrides));
}

/* ── stage precedence ───────────────────────────────────────── */

test("discovered when nothing else", () => {
  assert.equal(evalItem().stage, "discovered");
});

test("qualified when sales_ready", () => {
  assert.equal(evalItem({ qualification: { status: "sales_ready" } }).stage, "qualified");
});

test("outreach_prepared when outreach draft_ready", () => {
  assert.equal(evalItem({ outreach: { status: "draft_ready" }, qualification: { status: "sales_ready" } }).stage, "outreach_prepared");
});

test("approval_pending when outreach approval_required", () => {
  assert.equal(evalItem({ outreach: { status: "approval_required" } }).stage, "approval_pending");
});

test("approval_pending when mission stage approval", () => {
  assert.equal(evalItem({ mission: { missionId: "m1", stage: "approval" } }).stage, "approval_pending");
});

test("contacted when a successful delivery exists", () => {
  assert.equal(evalItem({ deliveryReceipts: [{ status: "delivered", occurredAt: NOW - HOUR }] }).stage, "contacted");
});

test("reply_received when a reply exists", () => {
  assert.equal(evalItem({ lastReplyAt: NOW - HOUR, deliveryReceipts: [{ status: "delivered", occurredAt: NOW - 2 * HOUR }] }).stage, "reply_received");
});

test("conversation_active for hot/pricing conversation", () => {
  assert.equal(evalItem({ conversation: { state: "hot_opportunity" } }).stage, "conversation_active");
  assert.equal(evalItem({ conversation: { state: "pricing_discussion" } }).stage, "conversation_active");
});

test("demo_pending when demo requested/scheduling", () => {
  assert.equal(evalItem({ demoItem: { status: "demo_requested" } }).stage, "demo_pending");
});

test("demo_scheduled when demo scheduled", () => {
  assert.equal(evalItem({ demoItem: { status: "scheduled" } }).stage, "demo_scheduled");
});

test("follow_up_due when orchestration due", () => {
  assert.equal(evalItem({ followUpOrchestration: { state: "draft_needed" } }).stage, "follow_up_due");
});

test("outcome_pending when demo completed and outcome open", () => {
  assert.equal(evalItem({ demoItem: { status: "completed" }, salesOutcome: { status: "open" } }).stage, "outcome_pending");
});

test("won overrides everything", () => {
  const d = evalItem({ salesOutcome: { status: "won", estimatedMrr: 9000 }, demoItem: { status: "scheduled" }, conversation: { state: "hot_opportunity" } });
  assert.equal(d.stage, "won");
  assert.equal(d.health, "closed");
});

test("lost overrides everything", () => {
  assert.equal(evalItem({ salesOutcome: { status: "lost", estimatedMrr: 5000 }, demoItem: { status: "scheduled" } }).stage, "lost");
});

test("paused stage", () => {
  assert.equal(evalItem({ salesOutcome: { status: "paused" } }).stage, "paused");
});

test("blocked for wrong_number conversation", () => {
  assert.equal(evalItem({ conversation: { state: "wrong_number" } }).stage, "blocked");
});

test("deterministic precedence: closed beats demo beats conversation beats reply", () => {
  // demo scheduled + hot conversation + reply → demo_scheduled (demo outranks conversation)
  assert.equal(evalItem({ demoItem: { status: "scheduled" }, conversation: { state: "hot_opportunity" }, lastReplyAt: NOW }).stage, "demo_scheduled");
});

test("no contradictory stages — every stage has a label", () => {
  const stages: RevenuePipelineStage[] = Object.keys(REVENUE_STAGE_LABELS_TR) as RevenuePipelineStage[];
  assert.equal(stages.length, 15);
  for (const s of stages) assert.ok(REVENUE_STAGE_LABELS_TR[s]);
});

/* ── revenue amounts ────────────────────────────────────────── */

test("unknown revenue stays null (never fake 0)", () => {
  const d = evalItem({ conversation: { state: "hot_opportunity" } });
  assert.equal(d.estimatedMrr, null);
  assert.equal(d.potentialMrr, null);
  assert.equal(d.realizedMrr, null);
  assert.equal(d.riskedMrr, null);
});

test("won revenue becomes realized, not potential", () => {
  const d = evalItem({ salesOutcome: { status: "won", estimatedMrr: 9000 } });
  assert.equal(d.realizedMrr, 9000);
  assert.equal(d.realizedArr, 108000);
  assert.equal(d.potentialMrr, null);
  assert.equal(d.riskedMrr, null);
});

test("open revenue becomes potential", () => {
  const d = evalItem({ demoItem: { status: "scheduled" }, salesOutcome: { status: "open", estimatedMrr: 7000 } });
  assert.equal(d.stage, "demo_scheduled");
  assert.equal(d.potentialMrr, 7000);
  assert.equal(d.realizedMrr, null);
});

test("at-risk open revenue becomes risked", () => {
  // demo requested long ago + estimate → at_risk + risked
  const d = evalItem({ demoItem: { status: "demo_requested", updatedAt: NOW - 48 * HOUR }, salesOutcome: { status: "open", estimatedMrr: 6000 } });
  assert.equal(d.health, "at_risk");
  assert.equal(d.riskedMrr, 6000);
  assert.equal(d.potentialMrr, 6000);
});

test("lost revenue only when known", () => {
  assert.equal(evalItem({ salesOutcome: { status: "lost", estimatedMrr: 5000 } }).lostMrr, 5000);
  assert.equal(evalItem({ salesOutcome: { status: "lost" } }).lostMrr, null);
});

test("ARR = MRR × 12; null stays null", () => {
  assert.equal(calculateRevenueArr(1000), 12000);
  assert.equal(calculateRevenueArr(null), null);
});

test("0 and null preserved (0 is a real value, not unknown)", () => {
  const d = evalItem({ salesOutcome: { status: "won", estimatedMrr: 0 } });
  assert.equal(d.realizedMrr, 0);
  assert.notEqual(d.realizedMrr, null);
});

/* ── risk intelligence ──────────────────────────────────────── */

test("delivery_failed risk → critical, action required", () => {
  const d = evalItem({ deliveryReceipts: [{ status: "failed", occurredAt: NOW - HOUR }] });
  assert.ok(d.riskCodes.includes("delivery_failed"));
  assert.equal(d.priority, "critical");
});

test("reply_waiting after threshold", () => {
  const d = evalItem({ deliveryReceipts: [{ status: "read", occurredAt: NOW - 80 * HOUR }] });
  assert.ok(d.riskCodes.includes("reply_waiting"));
});

test("hot_reply_unhandled when hot conversation with no demo/follow-up", () => {
  const d = evalItem({ conversation: { state: "hot_opportunity" } });
  assert.ok(d.riskCodes.includes("hot_reply_unhandled"));
});

test("demo_not_scheduled after threshold", () => {
  const d = evalItem({ demoItem: { status: "demo_requested", updatedAt: NOW - 48 * HOUR } });
  assert.ok(d.riskCodes.includes("demo_not_scheduled"));
});

test("demo_no_show risk", () => {
  const d = evalItem({ demoItem: { status: "no_show", updatedAt: NOW - HOUR } });
  assert.ok(d.riskCodes.includes("demo_no_show"));
});

test("follow_up_overdue risk", () => {
  const d = evalItem({ followUpOrchestration: { state: "draft_needed", overdueByMinutes: 48 * 60 } });
  assert.ok(d.riskCodes.includes("follow_up_overdue"));
});

test("outcome_missing when demo completed, outcome open too long", () => {
  const d = evalItem({ demoItem: { status: "completed", updatedAt: NOW - 100 * HOUR }, salesOutcome: { status: "open", updatedAt: NOW - 100 * HOUR } });
  assert.ok(d.riskCodes.includes("outcome_missing"));
});

test("stale_opportunity when no activity past threshold", () => {
  const d = evalItem({ conversation: { state: "hot_opportunity", updatedAt: NOW - 200 * HOUR } });
  assert.ok(d.riskCodes.includes("stale_opportunity"));
});

test("missing_revenue_estimate at advanced stage without estimate → attention", () => {
  const d = evalItem({ demoItem: { status: "scheduled" } });
  assert.ok(d.riskCodes.includes("missing_revenue_estimate"));
});

test("blocked contact codes", () => {
  assert.ok(evalItem({ conversation: { state: "wrong_number" } }).riskCodes.includes("wrong_number"));
  assert.ok(evalItem({ conversation: { state: "not_interested" } }).riskCodes.includes("not_interested"));
});

test("no risk → none code", () => {
  const d = evalItem({ salesOutcome: { status: "won", estimatedMrr: 9000 } });
  assert.deepEqual(d.riskCodes, ["none"]);
});

/* ── summary ────────────────────────────────────────────────── */

test("summary stage/health counts + separated revenue", () => {
  const items = [
    evalItem({ salesOutcome: { status: "won", estimatedMrr: 9000 } }),
    evalItem({ lead: { id: "l2", name: "B" }, mission: { missionId: "m2" }, demoItem: { status: "scheduled" }, salesOutcome: { status: "open", estimatedMrr: 5000 } }),
    evalItem({ lead: { id: "l3", name: "C" }, mission: { missionId: "m3" }, salesOutcome: { status: "lost", estimatedMrr: 3000 } }),
  ];
  const s = summarizeRevenuePipeline(items);
  assert.equal(s.won, 1);
  assert.equal(s.demoScheduled, 1);
  assert.equal(s.lost, 1);
  assert.equal(s.realizedMrr, 9000);
  assert.equal(s.potentialMrr, 5000);
  assert.equal(s.lostMrr, 3000);
});

test("potentialMrr null when no real estimates (no fake 0)", () => {
  const s = summarizeRevenuePipeline([evalItem({ demoItem: { status: "scheduled" } })]);
  assert.equal(s.potentialMrr, null);
  assert.equal(s.realizedMrr, null);
});

test("conversion nullable when denominator 0", () => {
  const s = summarizeRevenuePipeline([evalItem()]); // discovered only
  assert.equal(s.conversion.qualifiedToContacted, null);
  assert.equal(s.conversion.demoToWon, null);
});

test("conversion percentage computed when denominator > 0", () => {
  const items = [
    evalItem({ demoItem: { status: "scheduled" } }),           // reached demo (rank7)
    evalItem({ lead: { id: "l2", name: "B" }, mission: { missionId: "m2" }, salesOutcome: { status: "won", estimatedMrr: 1 } }), // won (rank10)
  ];
  const s = summarizeRevenuePipeline(items);
  // reachedDemo = 2, won = 1 → demoToWon = 50
  assert.equal(s.conversion.demoToWon, 50);
});

/* ── sorting + selectors ────────────────────────────────────── */

test("sorting: critical before high; input not mutated", () => {
  const failed = evalItem({ deliveryReceipts: [{ status: "failed", occurredAt: NOW - HOUR }] }); // critical
  const demo = evalItem({ lead: { id: "l2", name: "B" }, mission: { missionId: "m2" }, demoItem: { status: "scheduled" } }); // high-ish
  const inp = [demo, failed];
  const sorted = sortRevenuePipeline(inp);
  assert.equal(sorted[0].priority, "critical");
  assert.deepEqual(inp.map((x) => x.priority), [demo.priority, failed.priority]);
});

test("selectClosestToRevenue picks near-revenue open stages", () => {
  const items = [
    evalItem({ demoItem: { status: "scheduled" } }),
    evalItem({ lead: { id: "l2", name: "B" }, mission: { missionId: "m2" } }), // discovered
    evalItem({ lead: { id: "l3", name: "C" }, mission: { missionId: "m3" }, salesOutcome: { status: "won", estimatedMrr: 1 } }),
  ];
  const near = selectClosestToRevenue(items);
  assert.ok(near.every((i) => i.stage !== "discovered" && i.stage !== "won"));
});

test("selectAtRiskRevenue only at_risk", () => {
  const items = [
    evalItem({ deliveryReceipts: [{ status: "failed", occurredAt: NOW - HOUR }] }),
    evalItem({ lead: { id: "l2", name: "B" }, mission: { missionId: "m2" }, salesOutcome: { status: "won", estimatedMrr: 1 } }),
  ];
  const risky = selectAtRiskRevenue(items);
  assert.ok(risky.every((i) => i.health === "at_risk"));
});

/* ── founder copy safety ────────────────────────────────────── */

test("no fabricated revenue in signal label when unknown", () => {
  const d = evalItem({ conversation: { state: "hot_opportunity" } });
  assert.match(d.revenueSignalLabelTr, /henüz belirlenmedi/i);
  assert.equal(/₺/.test(d.revenueSignalLabelTr), false);
});

test("audit scrubber hides phone/secret", () => {
  const e = buildRevenuePipelineAuditEvent({ type: "hermes_revenue_pipeline_evaluated", at: 1, detailTr: "Ara +90 555 123 45 67 secret=x" });
  assert.equal(/\+?\d[\d\s\-()]{8,}\d/.test(e.detailTr), false);
  assert.ok(e.detailTr.includes("secret=[gizli]"));
});

test("deriveRevenuePipelineStage matches evaluate", () => {
  const inp = input({ demoItem: { status: "scheduled" } });
  assert.equal(deriveRevenuePipelineStage(inp), evaluateRevenuePipelineItem(inp).stage);
});
