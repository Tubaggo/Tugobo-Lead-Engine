import type { ExecutionContext, RecommendedActionKey } from "@/app/lib/execution-runtime";
import type { HermesAgentKey, ShadowDecisionResult, ShadowTaskType } from "./types";

/**
 * Shadow Decision Engine.
 *
 * Consumes one ExecutionContext and answers a single question: what would
 * Hermes do with this lead right now — RUN / WAIT / SKIP / APPROVAL /
 * ESCALATE. It never recomputes priority, state, momentum, confidence or
 * the recommended action; the Execution Runtime already decided those and
 * Hermes trusts them. This engine only classifies the *autonomy* of the
 * already-recommended action.
 */

type ActionAutonomy =
  /** Internal, reversible, no external footprint — Hermes would run it. */
  | "safe"
  /** Leaves a footprint outside the system — always founder-gated in A2. */
  | "external"
  /** Nothing to do but watch — Hermes would hold and monitor. */
  | "monitor"
  /** A commercial judgement only the founder can make. */
  | "founder"
  /** No work implied. */
  | "none";

type ActionPlan = {
  autonomy: ActionAutonomy;
  taskType: ShadowTaskType | null;
  agent: HermesAgentKey | null;
  /** True when the real action behind the task ultimately needs founder sign-off. */
  requiresApproval: boolean;
};

/**
 * Every RecommendedActionKey maps to exactly one plan — exhaustive by
 * construction, so a new runtime action fails the typecheck here instead
 * of silently falling through.
 *
 * `call`/`whatsapp` are deliberately "safe": what Hermes would run *now*
 * is the Scribe draft (internal, reversible); the send itself belongs to
 * Courier and stays behind the approval flag until A5.
 */
const ACTION_PLANS: Record<RecommendedActionKey, ActionPlan> = {
  verify_contact: { autonomy: "safe", taskType: "contact-verification", agent: "scout", requiresApproval: false },
  re_enrich: { autonomy: "safe", taskType: "enrichment", agent: "enricher", requiresApproval: false },
  ai_review: { autonomy: "safe", taskType: "ai-review", agent: "appraiser", requiresApproval: false },
  call: { autonomy: "safe", taskType: "outreach-draft", agent: "scribe", requiresApproval: true },
  whatsapp: { autonomy: "safe", taskType: "outreach-draft", agent: "scribe", requiresApproval: true },
  follow_up: { autonomy: "external", taskType: "follow-up", agent: "shepherd", requiresApproval: true },
  recover: { autonomy: "external", taskType: "recovery", agent: "shepherd", requiresApproval: true },
  book_demo: { autonomy: "external", taskType: "demo-preparation", agent: "concierge", requiresApproval: true },
  prepare_proposal: { autonomy: "external", taskType: "proposal", agent: "scribe", requiresApproval: true },
  close_opportunity: { autonomy: "founder", taskType: "close-decision", agent: null, requiresApproval: true },
  wait: { autonomy: "monitor", taskType: "reply-monitoring", agent: "listener", requiresApproval: false },
  no_action: { autonomy: "none", taskType: null, agent: null, requiresApproval: false },
};

const SKIP: ShadowDecisionResult = {
  decision: "SKIP",
  taskType: null,
  suggestedAgent: null,
  requiresApproval: false,
  decisionReason: "",
};

export function decideShadow(context: ExecutionContext): ShadowDecisionResult {
  const { facts, judgements } = context;
  const action = judgements.recommendedAction.action;

  // Rule 1 — DNC is a hard wall. No agent, no task, no exceptions.
  if (facts.contact.doNotContact) {
    return { ...SKIP, decisionReason: "İletişim yasağı (DNC) aktif — Hermes bu lead için hiçbir görev önermez." };
  }

  // Rule 2 — nothing to orchestrate on finished or dormant work.
  if (judgements.executionState === "completed") {
    return { ...SKIP, decisionReason: "İş tamamlanmış — yürütülecek görev yok." };
  }
  if (judgements.executionState === "dormant") {
    return { ...SKIP, decisionReason: "Lead uykuda — Hermes izlemeye devam eder, görev üretmez." };
  }

  // Rule 3 — conflicting signals: high risk, dead momentum, repeated failed
  // contact. Any automated next step would be a guess; the founder decides.
  if (
    facts.risk.riskLevel === "critical" &&
    judgements.operationalMomentum === "stalled" &&
    facts.contact.contactAttempts >= 3
  ) {
    return {
      decision: "ESCALATE",
      taskType: "founder-review",
      suggestedAgent: null,
      requiresApproval: true,
      decisionReason:
        "Çelişkili sinyaller: kritik risk, durmuş momentum ve 3+ sonuçsuz temas — otomatik adım yerine Founder incelemesi gerekli.",
    };
  }

  const plan = ACTION_PLANS[action];

  if (plan.autonomy === "none") {
    return { ...SKIP, decisionReason: "Çalışma zamanı aksiyon önermiyor — görev üretilmez." };
  }

  // Rule 4 — founder-only commercial decisions are never automated,
  // whatever the confidence.
  if (plan.autonomy === "founder") {
    return {
      decision: "ESCALATE",
      taskType: plan.taskType,
      suggestedAgent: null,
      requiresApproval: true,
      decisionReason: "Fırsatı kapatma kararı ticari bir yargı — yalnızca Founder verir.",
    };
  }

  // Rule 5 — waiting states hold. A reply window is open or a follow-up
  // is scheduled for later; acting early would burn the cooldown.
  if (plan.autonomy === "monitor" || judgements.executionState === "waiting") {
    return {
      decision: "WAIT",
      taskType: "reply-monitoring",
      suggestedAgent: "listener",
      requiresApproval: false,
      decisionReason: "Yanıt penceresi açık — Listener izlerdi, yeni temas beklemede kalırdı.",
    };
  }
  if (judgements.executionState === "scheduled") {
    return {
      decision: "WAIT",
      taskType: "follow-up",
      suggestedAgent: "shepherd",
      requiresApproval: true,
      decisionReason: "Takip zamanı henüz gelmedi — Shepherd görevi vadesine kadar bekletirdi.",
    };
  }

  // The enrichment plan splits by the automation queue the lead already
  // sits in: a website-scan queue member goes to Tracer, everything else
  // to Enricher. Borrowed fact, not a new judgement.
  const agent: HermesAgentKey | null =
    action === "re_enrich" && facts.automation?.primaryQueue === "website-scan" ? "tracer" : plan.agent;
  const taskType: ShadowTaskType | null =
    action === "re_enrich" && facts.automation?.primaryQueue === "website-scan" ? "website-scan" : plan.taskType;

  // Rule 6 — approval-gated work with weak evidence escalates instead of
  // queueing: the founder should look at the lead, not rubber-stamp a task
  // the runtime itself is unsure about.
  if (plan.requiresApproval && judgements.executionConfidence === "low") {
    return {
      decision: "ESCALATE",
      taskType,
      suggestedAgent: agent,
      requiresApproval: true,
      decisionReason:
        "Önerilen aksiyon onay gerektiriyor ama kanıt güveni düşük — onay kuyruğu yerine Founder incelemesine taşınırdı.",
    };
  }

  // Rule 7 — external footprint always waits for the founder in A2.
  if (plan.autonomy === "external") {
    return {
      decision: "APPROVAL",
      taskType,
      suggestedAgent: agent,
      requiresApproval: true,
      decisionReason: "Dış temas içeren adım — Hermes hazırlar, gönderim Founder onayına bağlanırdı.",
    };
  }

  // Rule 8 — safe internal work is what Hermes would run unattended.
  return {
    decision: "RUN",
    taskType,
    suggestedAgent: agent,
    requiresApproval: plan.requiresApproval,
    decisionReason: plan.requiresApproval
      ? "İç hazırlık güvenli — taslak üretilirdi; gönderim ayrıca Founder onayı isterdi."
      : "Güvenli iç görev — dış etki yok, Hermes otomatik çalıştırırdı.",
  };
}
