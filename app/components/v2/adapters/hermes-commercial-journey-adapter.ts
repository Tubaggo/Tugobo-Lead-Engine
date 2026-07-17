/**
 * Hermes Commercial Journey adapter (Founder Working Queue + Deal Workspace v1.0).
 *
 * Pure, step-based projection of a single opportunity's real commercial
 * position — never a percentage (no deterministic progression calculation
 * exists in this codebase to base one on), never an invented stage. Every
 * step is derived from a field another runtime already produces:
 * `mission.stage` (`hermes-mission-adapter.ts`), the Courier draft
 * (`hermes-courier.ts`), the WhatsApp delivery receipt / reply registries,
 * demo scheduling, and sales outcome — the exact same runtime objects
 * `founder-revenue-workspace-adapter.ts`/`hermes-opportunity-focus-adapter.ts`
 * already read.
 *
 * "TUGOBO kurulumu" never appears as a tracked stage — the objective label
 * is a fixed closing sentence, not a fake completed status (per the
 * sprint's explicit instruction).
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter follows.
 */

export type CommercialJourneyStepId =
  | "discovered"
  | "eligibility_verified"
  | "first_contact_ready"
  | "first_contact_sent"
  | "relevant_reply"
  | "demo_scheduled"
  | "proposal_conversation"
  | "won"
  | "lost";

export type CommercialJourneyStepState = "completed" | "active" | "upcoming";

export type CommercialJourneyStep = {
  id: CommercialJourneyStepId;
  label: string;
  state: CommercialJourneyStepState;
};

export type CommercialJourneyResponsibleParty = "hermes" | "founder" | "contact";

export type CommercialJourneyResult = {
  steps: CommercialJourneyStep[];
  /** The step the opportunity is actually at right now — "won"/"lost" only ever shows up here as the ladder's own terminal id. */
  currentStepId: CommercialJourneyStepId;
  /** "What was achieved, current result" — one sentence. */
  outcomeLabel: string;
  /** "Next expected event" — one sentence, or null once the journey reached a terminal state. */
  nextMilestoneLabel: string | null;
  responsibleParty: CommercialJourneyResponsibleParty | null;
  /** Fixed closing sentence — never a tracked runtime stage. */
  commercialObjectiveLabel: string;
};

export const COMMERCIAL_JOURNEY_STEP_LABELS: Record<CommercialJourneyStepId, string> = {
  discovered: "Keşfedildi",
  eligibility_verified: "Uygunluk doğrulandı",
  first_contact_ready: "İlk temas hazır",
  first_contact_sent: "İlk temas gönderildi",
  relevant_reply: "İlgili cevap",
  demo_scheduled: "Demo planlandı",
  proposal_conversation: "Teklif / satış görüşmesi",
  won: "Kazanıldı",
  lost: "Kaybedildi",
};

export const COMMERCIAL_OBJECTIVE_LABEL = "Ticari hedef: TUGOBO AI kurulumu";

/** The ladder's fixed order — every rank implies every rank before it is also reached. `won`/`lost` are terminal branches, not part of this linear ladder. */
const STEP_LADDER: CommercialJourneyStepId[] = [
  "discovered",
  "eligibility_verified",
  "first_contact_ready",
  "first_contact_sent",
  "relevant_reply",
  "demo_scheduled",
  "proposal_conversation",
];

/** Mirrors `MissionStage`'s own fixed order (`hermes-mission-adapter.ts`) — a local structural copy so this module never needs the `@/`-aliased import. */
const MISSION_STAGE_RANK: Record<string, number> = {
  discover: 0,
  verify: 1,
  enrich: 2,
  prepare: 3,
  approval: 4,
  "execution-ready": 5,
  completed: 6,
};

export type CommercialJourneyMissionLike = {
  stage: string;
};

export type CommercialJourneyDraftLike = {
  status: string;
};

export type CommercialJourneyReceiptLike = {
  missionId: string | null;
  status: string;
};

export type CommercialJourneyReplyLike = {
  missionId: string | null;
};

export type CommercialJourneyDemoLike = {
  missionId: string | null;
  status: string;
};

export type CommercialJourneySalesOutcomeLike = {
  missionId: string | null;
  status: string;
};

export type ComputeCommercialJourneyInput = {
  missionId: string;
  mission: CommercialJourneyMissionLike | null;
  draft?: CommercialJourneyDraftLike | null;
  recentReceipts?: CommercialJourneyReceiptLike[];
  recentReplies?: CommercialJourneyReplyLike[];
  recentDemoItems?: CommercialJourneyDemoLike[];
  recentSalesOutcomes?: CommercialJourneySalesOutcomeLike[];
};

function reachedEligibilityVerified(mission: CommercialJourneyMissionLike | null): boolean {
  if (!mission) return false;
  return (MISSION_STAGE_RANK[mission.stage] ?? 0) >= MISSION_STAGE_RANK.enrich;
}

function reachedFirstContactReady(draft: CommercialJourneyDraftLike | null | undefined): boolean {
  return Boolean(draft);
}

function reachedFirstContactSent(
  missionId: string,
  receipts: CommercialJourneyReceiptLike[],
): boolean {
  return receipts.some(
    (r) => r.missionId === missionId && (r.status === "sent" || r.status === "delivered" || r.status === "read"),
  );
}

function reachedRelevantReply(missionId: string, replies: CommercialJourneyReplyLike[]): boolean {
  return replies.some((r) => r.missionId === missionId);
}

function reachedDemoScheduled(missionId: string, demoItems: CommercialJourneyDemoLike[]): boolean {
  return demoItems.some(
    (d) => d.missionId === missionId && (d.status === "scheduled" || d.status === "completed"),
  );
}

function reachedProposalConversation(
  missionId: string,
  salesOutcomes: CommercialJourneySalesOutcomeLike[],
): boolean {
  return salesOutcomes.some((o) => o.missionId === missionId && o.status === "open");
}

function terminalOutcome(
  missionId: string,
  salesOutcomes: CommercialJourneySalesOutcomeLike[],
): "won" | "lost" | null {
  const outcome = salesOutcomes.find(
    (o) => o.missionId === missionId && (o.status === "won" || o.status === "lost"),
  );
  return outcome ? (outcome.status as "won" | "lost") : null;
}

const OUTCOME_SENTENCES: Record<CommercialJourneyStepId, string> = {
  discovered: "Fırsat keşfedildi.",
  eligibility_verified: "Uygunluk doğrulandı.",
  first_contact_ready: "Mesaj gönderime hazır.",
  first_contact_sent: "İlk temas gönderildi.",
  relevant_reply: "Olumlu cevap geldi.",
  demo_scheduled: "Demo planlandı.",
  proposal_conversation: "Teklif görüşmesi sürüyor.",
  won: "Satış kazanıldı.",
  lost: "Satış kaybedildi.",
};

const NEXT_MILESTONE_SENTENCES: Partial<Record<CommercialJourneyStepId, string>> = {
  discovered: "Uygunluk doğrulaması bekleniyor.",
  eligibility_verified: "Founder kararı bekleniyor.",
  first_contact_ready: "Founder kararı bekleniyor.",
  first_contact_sent: "İşletme cevabı bekleniyor.",
  relevant_reply: "Demo kararı bekleniyor.",
  demo_scheduled: "Hermes takip zamanını bekliyor.",
  proposal_conversation: "Founder sonucu belirlemeli.",
};

const RESPONSIBLE_PARTY: Partial<Record<CommercialJourneyStepId, CommercialJourneyResponsibleParty>> = {
  discovered: "hermes",
  eligibility_verified: "founder",
  first_contact_ready: "founder",
  first_contact_sent: "contact",
  relevant_reply: "founder",
  demo_scheduled: "hermes",
  proposal_conversation: "founder",
};

export function computeCommercialJourney(input: ComputeCommercialJourneyInput): CommercialJourneyResult {
  const receipts = input.recentReceipts ?? [];
  const replies = input.recentReplies ?? [];
  const demoItems = input.recentDemoItems ?? [];
  const salesOutcomes = input.recentSalesOutcomes ?? [];

  const terminal = terminalOutcome(input.missionId, salesOutcomes);

  // Highest reached rank on the linear ladder — each check assumes every
  // earlier one already holds (a real reply implies a real send; the
  // runtime itself never produces a reply without one).
  let reachedIndex = 0; // "discovered" — a mission existing is itself proof this happened.
  if (reachedEligibilityVerified(input.mission)) reachedIndex = 1;
  if (reachedFirstContactReady(input.draft)) reachedIndex = 2;
  if (reachedFirstContactSent(input.missionId, receipts)) reachedIndex = 3;
  if (reachedRelevantReply(input.missionId, replies)) reachedIndex = 4;
  if (reachedDemoScheduled(input.missionId, demoItems)) reachedIndex = 5;
  if (reachedProposalConversation(input.missionId, salesOutcomes)) reachedIndex = 6;

  const currentStepId: CommercialJourneyStepId = terminal ?? STEP_LADDER[reachedIndex]!;

  const steps: CommercialJourneyStep[] = STEP_LADDER.map((id, i) => ({
    id,
    label: COMMERCIAL_JOURNEY_STEP_LABELS[id],
    state: terminal
      ? "completed"
      : i < reachedIndex
        ? "completed"
        : i === reachedIndex
          ? "active"
          : "upcoming",
  }));
  steps.push({
    id: terminal === "lost" ? "lost" : "won",
    label: COMMERCIAL_JOURNEY_STEP_LABELS[terminal === "lost" ? "lost" : "won"],
    state: terminal ? "completed" : "upcoming",
  });

  return {
    steps,
    currentStepId,
    outcomeLabel: OUTCOME_SENTENCES[currentStepId],
    nextMilestoneLabel: terminal ? null : (NEXT_MILESTONE_SENTENCES[currentStepId] ?? null),
    responsibleParty: terminal ? null : (RESPONSIBLE_PARTY[currentStepId] ?? null),
    commercialObjectiveLabel: COMMERCIAL_OBJECTIVE_LABEL,
  };
}
