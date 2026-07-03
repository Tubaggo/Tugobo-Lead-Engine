import type {
  ExecutionConfidence,
  ExecutionContext,
  ExecutionPriority,
  ExecutionReason,
  ExecutionState,
  RecommendedActionResult,
} from "@/app/lib/execution-runtime";

/**
 * Hermes Monitor — Shadow Runtime (Sprint A2).
 *
 * Hermes never judges a lead itself: priority, confidence, momentum,
 * execution state, recommended action and reasons are consumed verbatim
 * from the Execution Runtime. Everything in this module is a read-only
 * projection of those judgements into "what Hermes would do" — no task
 * here ever executes, mutates, persists, or calls anything external.
 */

// ── Agents ────────────────────────────────────────────────────

export type HermesAgentKey =
  | "scout"
  | "tracer"
  | "enricher"
  | "appraiser"
  | "scribe"
  | "courier"
  | "shepherd"
  | "listener"
  | "concierge"
  | "herald"
  | "medic";

export type HermesAgentMeta = {
  key: HermesAgentKey;
  label: string;
  /** Founder-facing conditional-tense intent — agents declare, never execute. */
  shadowIntent: string;
  /**
   * Whether the agent's real action would leave a footprint outside the
   * system (message sent, demo booked). External agents can never be
   * autonomous in shadow mode — their tasks always carry an approval flag.
   */
  external: boolean;
};

/**
 * The full registry is declared even though some agents can never produce
 * a shadow task in A2: `courier` sends only founder-approved drafts (no
 * approval flow exists yet), `herald` is the monitor's own briefing step,
 * and `medic` triages failed tasks (nothing fails in a runtime that never
 * executes). Registering them now fixes the vocabulary A3+ will build on.
 */
export const HERMES_AGENT_REGISTRY: Record<HermesAgentKey, HermesAgentMeta> = {
  scout: { key: "scout", label: "Scout", shadowIntent: "İletişim kanalını doğrulardı", external: false },
  tracer: { key: "tracer", label: "Tracer", shadowIntent: "Web sitesini incelerdi", external: false },
  enricher: { key: "enricher", label: "Enricher", shadowIntent: "Lead verisini zenginleştirirdi", external: false },
  appraiser: { key: "appraiser", label: "Appraiser", shadowIntent: "AI ticari incelemesi yapardı", external: false },
  scribe: { key: "scribe", label: "Scribe", shadowIntent: "Outreach taslağı hazırlardı", external: false },
  courier: { key: "courier", label: "Courier", shadowIntent: "Onaylı ilk temas mesajını gönderirdi", external: true },
  shepherd: { key: "shepherd", label: "Shepherd", shadowIntent: "Takip temasını planlardı", external: true },
  listener: { key: "listener", label: "Listener", shadowIntent: "Gelen yanıtları izlerdi", external: false },
  concierge: { key: "concierge", label: "Concierge", shadowIntent: "Demo hazırlığı yapardı", external: true },
  herald: { key: "herald", label: "Herald", shadowIntent: "Founder brifingini hazırlardı", external: false },
  medic: { key: "medic", label: "Medic", shadowIntent: "Başarısız görevleri yeniden denerdi", external: false },
};

// ── Decisions ─────────────────────────────────────────────────

/** The Decision Engine's only vocabulary — deterministic, no free text. */
export type ShadowDecision = "RUN" | "WAIT" | "SKIP" | "APPROVAL" | "ESCALATE";

/**
 * Decision Engine output for one lead. `taskType`/`suggestedAgent` are null
 * exactly when the decision produces no work item (SKIP, or an escalation
 * that is purely a founder judgement with no agent to suggest).
 */
export type ShadowDecisionResult = {
  decision: ShadowDecision;
  taskType: ShadowTaskType | null;
  suggestedAgent: HermesAgentKey | null;
  /** True when the real-world action behind this task would need founder sign-off. */
  requiresApproval: boolean;
  /** One deterministic founder-facing line explaining this specific decision. */
  decisionReason: string;
};

// ── Shadow tasks ──────────────────────────────────────────────

export type ShadowTaskType =
  | "contact-verification"
  | "website-scan"
  | "enrichment"
  | "ai-review"
  | "outreach-draft"
  | "follow-up"
  | "recovery"
  | "demo-preparation"
  | "proposal"
  | "reply-monitoring"
  | "close-decision"
  | "founder-review";

/** Derived 1:1 from the decision — shadow tasks have no lifecycle of their own. */
export type ShadowTaskStatus =
  | "would-run"
  | "deferred"
  | "awaiting-founder"
  | "escalated";

/**
 * One intention Hermes would act on. Runtime-only projection: never
 * persisted, never executed — rebuilt from scratch on every monitor pass,
 * exactly like the ExecutionContext it derives from.
 */
export type ShadowTask = {
  id: string;
  leadId: string;
  hotelName: string;
  city: string;
  createdAt: number;
  taskType: ShadowTaskType;
  /** Borrowed verbatim from ExecutionContext judgements — never recalculated. */
  priority: ExecutionPriority;
  confidence: ExecutionConfidence;
  executionState: ExecutionState;
  reasons: ExecutionReason[];
  /** What created this task — always the monitor sweep in A2. */
  source: "hermes-monitor";
  suggestedAgent: HermesAgentKey | null;
  /** The Execution Runtime's own recommendation, carried unmodified. */
  suggestedAction: RecommendedActionResult;
  requiresApproval: boolean;
  decision: ShadowDecision;
  decisionReason: string;
  status: ShadowTaskStatus;
  /** ₺/ay — weightedMrr, falling back to forecastContribution (queue convention). */
  estimatedImpact: number;
};

/**
 * One lead's full evaluation in a monitor pass — the shared intermediate
 * the event stream, ledger and summary are all projected from. `task` is
 * null exactly when the decision was SKIP.
 */
export type ShadowEvaluationRecord = {
  context: ExecutionContext;
  result: ShadowDecisionResult;
  task: ShadowTask | null;
};

// ── Runtime events ────────────────────────────────────────────

export type HermesEventType =
  | "task.created"
  | "decision.run"
  | "decision.wait"
  | "decision.skip"
  | "decision.approval"
  | "decision.escalated"
  | "brief.generated"
  | "monitor.completed";

/** Ephemeral projection of one monitor step — an audit trail, not storage. */
export type HermesRuntimeEvent = {
  id: string;
  type: HermesEventType;
  at: number;
  actor: "hermes:monitor";
  leadId: string | null;
  taskId: string | null;
  detail: string;
};

// ── Shadow ledger ─────────────────────────────────────────────

export type HermesLedgerEntry = {
  at: number;
  decision: ShadowDecision;
  suggestedAgent: HermesAgentKey | null;
  agentLabel: string | null;
  taskId: string | null;
  /** Evidence lines — each traceable to an ExecutionReason or the decision rule. */
  evidence: string[];
};

export type HermesLedgerLeadGroup = {
  leadId: string;
  hotelName: string;
  city: string;
  priority: ExecutionPriority;
  entries: HermesLedgerEntry[];
};

/** Read-only, grouped by lead, entries in chronological order. */
export type HermesLedger = {
  generatedAt: number;
  leads: HermesLedgerLeadGroup[];
};

// ── Summary & briefing ────────────────────────────────────────

export type HermesApprovalCandidate = {
  leadId: string;
  hotelName: string;
  city: string;
  taskId: string;
  actionLabel: string;
  actionReason: string;
  priority: ExecutionPriority;
  confidence: ExecutionConfidence;
  estimatedImpact: number;
  decision: ShadowDecision;
};

export type HermesMonitorSummary = {
  generatedAt: number;
  leadsEvaluated: number;
  shadowTaskCount: number;
  decisionCounts: Record<ShadowDecision, number>;
  agentTaskCounts: Partial<Record<HermesAgentKey, number>>;
  /** Tasks whose real action would wait on founder sign-off (escalations excluded). */
  approvalCandidates: HermesApprovalCandidate[];
  /** Founder-decision items — conflicting signals or commercial close calls. */
  escalations: HermesApprovalCandidate[];
};

export type HermesBriefApprovalItem = {
  leadId: string;
  hotelName: string;
  actionLabel: string;
  reason: string;
  estimatedImpactLabel: string;
  priority: ExecutionPriority;
};

/** Preview only — what the Herald agent will one day deliver each morning. */
export type HermesMonitorBrief = {
  generatedAt: number;
  headline: string;
  summary: string;
  highlights: string[];
  approvalQueue: HermesBriefApprovalItem[];
};

// ── Public runtime shape ──────────────────────────────────────

export type HermesMonitor = {
  generatedAt: number;
  summary: HermesMonitorSummary;
  tasks: ShadowTask[];
  ledger: HermesLedger;
  events: HermesRuntimeEvent[];
  brief: HermesMonitorBrief;
};
