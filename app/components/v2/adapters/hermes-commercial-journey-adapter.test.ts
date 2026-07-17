import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCommercialJourney,
  COMMERCIAL_JOURNEY_STEP_LABELS,
  type ComputeCommercialJourneyInput,
} from "./hermes-commercial-journey-adapter.ts";

const MISSION_ID = "mission:lead-1";

function buildInput(overrides: Partial<ComputeCommercialJourneyInput> = {}): ComputeCommercialJourneyInput {
  return {
    missionId: MISSION_ID,
    mission: { stage: "discover" },
    draft: null,
    recentReceipts: [],
    recentReplies: [],
    recentDemoItems: [],
    recentSalesOutcomes: [],
    ...overrides,
  };
}

test("freshly discovered mission: 'discovered' is the active (current) step, nothing is completed yet, everything else is upcoming", () => {
  const journey = computeCommercialJourney(buildInput());
  assert.equal(journey.currentStepId, "discovered");
  assert.equal(journey.steps[0]!.id, "discovered");
  assert.equal(journey.steps[0]!.state, "active");
  assert.ok(journey.steps.slice(1).every((s) => s.state === "upcoming"));
});

test("mission past enrichment: eligibility_verified completed, first_contact_ready active", () => {
  const journey = computeCommercialJourney(buildInput({ mission: { stage: "enrich" } }));
  assert.equal(journey.currentStepId, "eligibility_verified");
});

test("a draft exists: first_contact_ready reached", () => {
  const journey = computeCommercialJourney(
    buildInput({ mission: { stage: "prepare" }, draft: { status: "draft_ready" } }),
  );
  assert.equal(journey.currentStepId, "first_contact_ready");
  assert.equal(journey.outcomeLabel, "Mesaj gönderime hazır.");
  assert.equal(journey.nextMilestoneLabel, "Founder kararı bekleniyor.");
  assert.equal(journey.responsibleParty, "founder");
});

test("a sent/delivered receipt exists: first_contact_sent reached", () => {
  const journey = computeCommercialJourney(
    buildInput({
      mission: { stage: "prepare" },
      draft: { status: "approved" },
      recentReceipts: [{ missionId: MISSION_ID, status: "delivered" }],
    }),
  );
  assert.equal(journey.currentStepId, "first_contact_sent");
  assert.equal(journey.outcomeLabel, "İlk temas gönderildi.");
  assert.equal(journey.nextMilestoneLabel, "İşletme cevabı bekleniyor.");
  assert.equal(journey.responsibleParty, "contact");
});

test("a reply exists: relevant_reply reached", () => {
  const journey = computeCommercialJourney(
    buildInput({
      mission: { stage: "prepare" },
      draft: { status: "approved" },
      recentReceipts: [{ missionId: MISSION_ID, status: "sent" }],
      recentReplies: [{ missionId: MISSION_ID }],
    }),
  );
  assert.equal(journey.currentStepId, "relevant_reply");
  assert.equal(journey.outcomeLabel, "Olumlu cevap geldi.");
  assert.equal(journey.nextMilestoneLabel, "Demo kararı bekleniyor.");
});

test("a scheduled demo: demo_scheduled reached", () => {
  const journey = computeCommercialJourney(
    buildInput({
      mission: { stage: "prepare" },
      draft: { status: "approved" },
      recentReceipts: [{ missionId: MISSION_ID, status: "sent" }],
      recentReplies: [{ missionId: MISSION_ID }],
      recentDemoItems: [{ missionId: MISSION_ID, status: "scheduled" }],
    }),
  );
  assert.equal(journey.currentStepId, "demo_scheduled");
  assert.equal(journey.outcomeLabel, "Demo planlandı.");
  assert.equal(journey.nextMilestoneLabel, "Hermes takip zamanını bekliyor.");
  assert.equal(journey.responsibleParty, "hermes");
});

test("an open sales outcome: proposal_conversation reached", () => {
  const journey = computeCommercialJourney(
    buildInput({
      mission: { stage: "prepare" },
      draft: { status: "approved" },
      recentReceipts: [{ missionId: MISSION_ID, status: "sent" }],
      recentDemoItems: [{ missionId: MISSION_ID, status: "completed" }],
      recentSalesOutcomes: [{ missionId: MISSION_ID, status: "open" }],
    }),
  );
  assert.equal(journey.currentStepId, "proposal_conversation");
  assert.equal(journey.responsibleParty, "founder");
});

test("won outcome: every ladder step completed, terminal step is 'won', no next milestone", () => {
  const journey = computeCommercialJourney(
    buildInput({ recentSalesOutcomes: [{ missionId: MISSION_ID, status: "won" }] }),
  );
  assert.equal(journey.currentStepId, "won");
  assert.equal(journey.outcomeLabel, "Satış kazanıldı.");
  assert.equal(journey.nextMilestoneLabel, null);
  assert.equal(journey.responsibleParty, null);
  assert.ok(journey.steps.every((s) => s.state === "completed"));
  assert.equal(journey.steps[journey.steps.length - 1]!.id, "won");
});

test("lost outcome: terminal step is 'lost', not 'won'", () => {
  const journey = computeCommercialJourney(
    buildInput({ recentSalesOutcomes: [{ missionId: MISSION_ID, status: "lost" }] }),
  );
  assert.equal(journey.currentStepId, "lost");
  assert.equal(journey.outcomeLabel, "Satış kaybedildi.");
  assert.equal(journey.steps[journey.steps.length - 1]!.id, "lost");
});

test("a receipt/reply/demo for a DIFFERENT mission never advances this mission's journey", () => {
  const journey = computeCommercialJourney(
    buildInput({
      mission: { stage: "discover" },
      recentReceipts: [{ missionId: "mission:other", status: "delivered" }],
      recentReplies: [{ missionId: "mission:other" }],
    }),
  );
  assert.equal(journey.currentStepId, "discovered");
});

test("no mission at all: currentStepId falls back to 'discovered', never throws", () => {
  const journey = computeCommercialJourney(buildInput({ mission: null }));
  assert.equal(journey.currentStepId, "discovered");
});

test("the journey has exactly 8 steps (7-step ladder + one terminal won/lost slot)", () => {
  const journey = computeCommercialJourney(buildInput());
  assert.equal(journey.steps.length, 8);
});

test("'TUGOBO kurulumu' never appears as a tracked step id or label — only as the fixed commercial objective sentence", () => {
  const journey = computeCommercialJourney(buildInput());
  const stepLabels = Object.values(COMMERCIAL_JOURNEY_STEP_LABELS);
  for (const label of stepLabels) {
    assert.ok(!/tugobo/i.test(label), label);
  }
  assert.ok(/tugobo/i.test(journey.commercialObjectiveLabel));
});
