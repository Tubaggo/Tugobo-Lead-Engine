import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REVENUE_PIPELINE_POLICY,
  buildRevenuePipelinePolicy,
  defaultRevenuePipelinePolicy,
} from "./hermes-revenue-pipeline-policy.ts";

test("safe defaults", () => {
  const d = DEFAULT_REVENUE_PIPELINE_POLICY;
  assert.equal(d.enabled, true);
  assert.equal(d.staleOpportunityHours, 168);
  assert.equal(d.replyWaitingRiskHours, 72);
  assert.equal(d.demoSchedulingRiskHours, 24);
  assert.equal(d.followUpOverdueRiskHours, 24);
  assert.equal(d.outcomePendingRiskHours, 48);
  assert.equal(d.requireRevenueEstimateForForecast, true);
  assert.equal(d.includePausedInPotential, false);
  assert.equal(d.includeReviewRequiredInPotential, false);
  assert.equal(d.maxPipelineItems, 500);
});

test("invalid durations fall back to defaults", () => {
  const p = buildRevenuePipelinePolicy({ staleOpportunityHours: NaN, replyWaitingRiskHours: Infinity });
  assert.equal(p.staleOpportunityHours, 168);
  assert.equal(p.replyWaitingRiskHours, 72);
});

test("maximum limits clamp", () => {
  const p = buildRevenuePipelinePolicy({ staleOpportunityHours: 999999, maxPipelineItems: 999999 });
  assert.equal(p.staleOpportunityHours, 8760);
  assert.equal(p.maxPipelineItems, 2000);
});

test("risk hours clamp to minimum 1", () => {
  const p = buildRevenuePipelinePolicy({ demoSchedulingRiskHours: 0 });
  assert.equal(p.demoSchedulingRiskHours, 1);
});

test("defaultRevenuePipelinePolicy is enabled", () => {
  assert.equal(defaultRevenuePipelinePolicy().enabled, true);
});

test("updatedAt is set from argument", () => {
  assert.equal(buildRevenuePipelinePolicy({}, 999).updatedAt, 999);
});

test("revenue rule flags respected", () => {
  const p = buildRevenuePipelinePolicy({ includePausedInPotential: true, requireRevenueEstimateForForecast: false });
  assert.equal(p.includePausedInPotential, true);
  assert.equal(p.requireRevenueEstimateForForecast, false);
});
