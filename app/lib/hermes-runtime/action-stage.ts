/**
 * The founder's priority ladder — ported from the Hermes line.
 *
 * Source: `app/components/v2/adapters/founder-revenue-workspace-adapter.ts` on
 * `main` (v6.1, extended through v6.6). The `ActionStage` union, the Turkish
 * labels, the suggested-action copy, `ACTION_STAGE_RANK` and the branch order
 * inside `actionStageOf` are that file's, reproduced value-for-value.
 *
 * This is the one documented, ranked, tested precedence in either codeline, and
 * the reconciliation discovery named rewriting it as the duplication risk to
 * avoid. So it is not rewritten. What changes is only where its inputs come
 * from: durable Hermes records instead of in-memory registries — plus one
 * targeted v3.8.1 amendment to `actionStageOf` itself, documented at its own
 * definition: a terminal sales outcome now resolves before any transient
 * signal, instead of after every other one. That is a precedence *fix*, not a
 * second ladder — the 15-value `ActionStage` union, every other branch, and
 * `ACTION_STAGE_RANK` are unchanged.
 *
 * Follow-up candidates and sales outcomes are not persisted in Milestone 1, so
 * they arrive as optional structural inputs defaulting to empty. That keeps the
 * ladder complete — `follow_up_required` and `outcome_required` still sit in
 * their correct positions and still win over the stages below them — without
 * porting two more registries this milestone does not need. The structural-type
 * approach is the Hermes file's own: it declares `MissionLike` rather than
 * importing `HermesMission`, for exactly this reason.
 *
 * Pure: no React, no I/O, no `server-only`.
 */

import {
  isHotReplyIntelligence,
  type HermesDeliveryRecord,
  type HermesDemoRecord,
  type HermesMissionRecord,
  type HermesReplyRecord,
} from "./schema.ts";

/* ── Structural inputs for the two domains Milestone 1 does not store ── */

/** Structural subset of the Hermes line's `FollowUpCandidate`. */
export type FollowUpLike = {
  missionId: string | null;
  status: string;
};

/** Structural subset of the Hermes line's `SalesOutcomeItem`. */
export type SalesOutcomeLike = {
  missionId: string | null;
  status: string;
};

/**
 * Structural subset of a mission, matching the Hermes adapter's `MissionLike`.
 *
 * `HermesMissionRecord` satisfies it automatically.
 */
export type MissionLike = Pick<HermesMissionRecord, "missionId" | "stage">;

/* ── Action stage (the founder's priority ladder) ──────────────────── */

export type ActionStage =
  | "failed"
  | "hot_reply"
  | "demo_pending"
  | "follow_up_required"
  | "outcome_required"
  | "reply_needs_review"
  | "reply_received"
  | "approval_required"
  | "read"
  | "delivered"
  | "sent"
  | "ready"
  | "won"
  | "lost"
  | "unknown";

export const ACTION_STAGE_LABELS: Record<ActionStage, string> = {
  failed: "Başarısız",
  hot_reply: "Sıcak Cevap",
  demo_pending: "Demo Bekliyor",
  follow_up_required: "Takip Gerekli",
  outcome_required: "Sonuç Bekliyor",
  reply_needs_review: "İnceleme Gerekiyor",
  reply_received: "Cevap Geldi",
  approval_required: "Onay Bekliyor",
  read: "Okundu",
  delivered: "Teslim Edildi",
  sent: "Gönderildi",
  ready: "Yürütmeye Hazır",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  unknown: "Bilinmiyor",
};

export const SUGGESTED_ACTION_LABELS: Record<ActionStage, string> = {
  failed: "Teslim edilemedi — tekrar deneyin",
  hot_reply: "Sıcak cevap — hemen aksiyon alın",
  demo_pending: "Demo zamanı planla",
  follow_up_required: "Takip mesajı öner",
  outcome_required: "Demo/follow-up sonrası satış sonucunu belirle",
  reply_needs_review: "Cevap net değil — manuel inceleyin",
  reply_received: "Cevap geldi, incele",
  approval_required: "Founder onayı bekleniyor",
  read: "Mesaj okundu — demo planlanabilir",
  delivered: "Teslim edildi — yanıt bekleniyor",
  sent: "Gönderildi — teslimat bekleniyor",
  ready: "Yürütmeye hazır",
  won: "Satış kazanıldı, onboarding sürecine geç",
  lost: "Kayıp nedeni kaydedildi",
  unknown: "İzleniyor",
};

/**
 * Lower rank = higher priority. Ported verbatim.
 *
 * `won`/`lost` rank near the very bottom — a mission with a decided outcome
 * needs nothing further from the founder, but still gets a badge (rather than
 * vanishing) so its final state stays visible. `reply_needs_review` ranks just
 * below `outcome_required` because an unclassifiable reply might *be* a hot
 * one, and the founder cannot know that without opening it.
 */
export const ACTION_STAGE_RANK: Record<ActionStage, number> = {
  failed: 0,
  hot_reply: 1,
  demo_pending: 2,
  follow_up_required: 3,
  outcome_required: 4,
  reply_needs_review: 5,
  reply_received: 6,
  approval_required: 7,
  read: 8,
  delivered: 9,
  sent: 10,
  ready: 11,
  won: 12,
  lost: 13,
  unknown: 14,
};

/* ── Lookups (newest-first feeds, so `.find` returns the latest) ────── */

function latestDeliveryForMission(
  missionId: string,
  deliveries: readonly HermesDeliveryRecord[],
): HermesDeliveryRecord | undefined {
  return deliveries.find((d) => d.missionId === missionId);
}

/**
 * Only replies the store already resolved to this mission count here. An
 * unmapped reply has no `missionId` to match against, so it can never attach
 * itself to a specific mission's queue entry — it still surfaces in the
 * workspace-wide reply feed instead.
 */
function latestReplyForMission(
  missionId: string,
  replies: readonly HermesReplyRecord[],
): HermesReplyRecord | undefined {
  return replies.find((r) => r.missionId === missionId);
}

/** "Pending" = the founder has not scheduled or resolved it yet. */
function hasPendingDemoForMission(
  missionId: string,
  demos: readonly HermesDemoRecord[],
): boolean {
  return demos.some(
    (d) =>
      d.missionId === missionId &&
      (d.status === "demo_requested" || d.status === "scheduling_needed"),
  );
}

/** "Active" = still needs a founder decision. */
function hasActiveFollowUpForMission(
  missionId: string,
  followUps: readonly FollowUpLike[],
): boolean {
  return followUps.some(
    (f) =>
      f.missionId === missionId &&
      (f.status === "candidate" || f.status === "approval_required"),
  );
}

function outcomeForMission(
  missionId: string,
  outcomes: readonly SalesOutcomeLike[],
): SalesOutcomeLike | undefined {
  return outcomes.find((o) => o.missionId === missionId);
}

export type ActionStageInputs = {
  deliveries?: readonly HermesDeliveryRecord[];
  replies?: readonly HermesReplyRecord[];
  demos?: readonly HermesDemoRecord[];
  followUps?: readonly FollowUpLike[];
  salesOutcomes?: readonly SalesOutcomeLike[];
};

/**
 * The mission's current position on the ladder.
 *
 * Branch order is the Hermes original's, with one deliberate, minimal
 * amendment made in v3.8.1 rather than the rewrite the reconciliation
 * discovery warned against: a **terminal** sales outcome (`won` / `lost`) is
 * now resolved *first*, before any transient signal. The original checked
 * `won`/`lost` last, on the theory that "every more urgent stage still wins
 * even for an already-decided mission" — but a decided mission has nothing
 * left to be urgent *about*. A stale `sent`/`read`/`delivered` receipt, an
 * unresolved reply, or a follow-up that should already have been superseded
 * is exactly the kind of transient debris a terminal decision is supposed to
 * settle; showing the founder "Gönderildi" for a lead that is already won is
 * not a lower-priority truth, it is a wrong one. Every other branch —
 * `outcome_required` for a merely *open* outcome, the whole transient
 * ladder below it — is untouched.
 *
 * Everything else about branch order is the Hermes original's, including the
 * one remaining subtlety its comment calls out: `demo_pending` /
 * `follow_up_required` / `outcome_required` are checked independently of
 * whether a reply is still in the (aging) reply feed, because those items
 * live in their own records and outlive the reply that created them.
 *
 * Signature changed from seven positional arguments to one options object —
 * the only deviation, and a mechanical one: with follow-ups and outcomes
 * optional in this milestone, positional defaults would make a miswired call
 * silently pass the wrong feed.
 */
export function actionStageOf(
  mission: MissionLike,
  inputs: ActionStageInputs = {},
): ActionStage {
  const {
    deliveries = [],
    replies = [],
    demos = [],
    followUps = [],
    salesOutcomes = [],
  } = inputs;

  const outcome = outcomeForMission(mission.missionId, salesOutcomes);
  if (outcome?.status === "won") return "won";
  if (outcome?.status === "lost") return "lost";

  const delivery = latestDeliveryForMission(mission.missionId, deliveries);
  if (delivery?.status === "failed") return "failed";

  const reply = latestReplyForMission(mission.missionId, replies);

  if (reply && isHotReplyIntelligence(reply)) return "hot_reply";
  if (hasPendingDemoForMission(mission.missionId, demos)) return "demo_pending";
  if (hasActiveFollowUpForMission(mission.missionId, followUps)) return "follow_up_required";

  if (outcome?.status === "open") return "outcome_required";

  if (reply) {
    if (reply.intent === "human_review_required") return "reply_needs_review";
    return "reply_received";
  }

  if (mission.stage === "approval") return "approval_required";
  if (delivery?.status === "read") return "read";
  if (delivery?.status === "delivered") return "delivered";
  if (delivery?.status === "sent") return "sent";
  if (mission.stage === "execution-ready") return "ready";

  return "unknown";
}

export type ActionQueueEntry = {
  missionId: string;
  leadId: string;
  hotelName: string;
  stage: ActionStage;
  stageLabel: string;
  suggestedAction: string;
  rank: number;
};

/**
 * The whole queue, most urgent first.
 *
 * Ties break on `missionId` so the order is stable across reads — a queue that
 * reshuffles between two identical requests is a queue a founder stops trusting.
 */
export function computeActionQueue(
  missions: readonly HermesMissionRecord[],
  inputs: ActionStageInputs = {},
): ActionQueueEntry[] {
  return missions
    .map((mission) => {
      const stage = actionStageOf(mission, inputs);
      return {
        missionId: mission.missionId,
        leadId: mission.leadId,
        hotelName: mission.hotelName,
        stage,
        stageLabel: ACTION_STAGE_LABELS[stage],
        suggestedAction: SUGGESTED_ACTION_LABELS[stage],
        rank: ACTION_STAGE_RANK[stage],
      };
    })
    .sort((a, b) =>
      a.rank === b.rank ? a.missionId.localeCompare(b.missionId) : a.rank - b.rank,
    );
}
