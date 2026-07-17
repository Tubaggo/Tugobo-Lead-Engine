"use client";

import { useState } from "react";
import type { HermesMission } from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { HermesOpportunityFocus } from "@/app/components/v2/adapters/hermes-opportunity-focus-adapter";
import type {
  CommercialJourneyResult,
  CommercialJourneyResponsibleParty,
} from "@/app/components/v2/adapters/hermes-commercial-journey-adapter";
import type { HermesPipeline } from "@/app/components/v2/hermes-pipeline-engine";
import { pipelineAgentFlow, STAGE_SHORT_LABELS } from "@/app/components/v2/hermes-pipeline-engine";
import type { HermesOutboundDraft } from "@/app/components/v2/hermes-courier";
import { DRAFT_STATUS_LABELS, DRAFT_CHANNEL_LABELS, NO_SEND_NOTE } from "@/app/components/v2/hermes-courier";
import type { HermesDeliveryRequest } from "@/app/components/v2/hermes-delivery-gateway";
import { DELIVERY_STATUS_LABELS } from "@/app/components/v2/hermes-delivery-gateway";
import { computeControlledSendReadiness } from "@/app/components/v2/adapters/hermes-controlled-send-readiness-adapter";
import { computeOpportunityWorkspaceMode } from "@/app/components/v2/adapters/hermes-opportunity-workspace-mode-adapter";
import type { DraftRevisionBusinessContextLike, DraftRevisionResult } from "@/app/components/v2/hermes-draft-revision";
import { HERMES_AGENT_REGISTRY } from "@/app/lib/hermes-monitor";
import {
  FOUNDER_PIPELINE_STATE_LABELS,
  FOUNDER_DECISION_PANEL_LABELS,
  FOUNDER_PREPARATION_BRIDGE_LABELS,
} from "@/app/components/v2/founder-language";
import { btnCls, btnPrimaryCls, sectionLabelCls } from "@/app/components/v2/design-system";

/**
 * Deal Workspace (Commercial Journey Driven Opportunity Workspace v1.0).
 *
 * The full-width central view for one selected opportunity. Every field is
 * read from runtime state another screen already computed:
 * `computeHermesOpportunityFocus` (briefing, status, timeline),
 * `computeCommercialJourney` (journey), the mission's own `HermesPipeline`/
 * `HermesOutboundDraft`/`HermesDeliveryRequest` records (execution, message,
 * delivery), plus the matched reply/demo/outcome for this mission. This
 * component only lays them out — no new computation beyond the pure
 * `computeOpportunityWorkspaceMode` (which mode object should own the
 * screen right now) and `computeControlledSendReadiness`; no fetch, no
 * mutation beyond the same `onApproveMission`/`onRejectMission`/
 * `onApproveDraft`/`onRejectDraft`/`onEditDraft` handlers already used.
 *
 * Workspace Mode replaces the old "always render all 8 sections, only the
 * decision area is conditional" layout: exactly one mode owns the main work
 * area at a time, matching the founder's real current commercial stage —
 * never a future stage, never a past one shown alongside it.
 */

const RESPONSIBLE_PARTY_LABEL: Record<CommercialJourneyResponsibleParty, string> = {
  hermes: "Hermes",
  founder: "Sen",
  contact: "İşletme",
};

const JOURNEY_STEP_DOT_CLS: Record<"completed" | "active" | "upcoming", string> = {
  completed: "bg-emerald-400",
  active: "bg-indigo-400",
  upcoming: "bg-zinc-700",
};

/**
 * Founder Message Review & Revision Flow v1.0 — the honest, always-true
 * sentence for the mission-approval gate. Never borrows
 * `opportunityFocus.hermesRecommendation`/`founderNextAction` here: those
 * strings are written for whichever real Karar Merkezi decision item
 * happens to match, which can legitimately describe a message even when no
 * real draft exists yet — `mission.decisionState === "pending"` only ever
 * means "Hermes's shadow simulation wants approval to start the pipeline,"
 * never "a message is ready." Approving here calls `onApproveMission`,
 * which really does start the mission pipeline — never a message send.
 */
const MISSION_START_EXPLANATION =
  "Hermes bu fırsat için hazırlığa henüz başlamadı — devam etmek için onayın gerekiyor.";

const UNSAVED_EDIT_NOTE = "Düzenlemeyi kaydet veya vazgeç — onay, kaydedilmemiş bir değişiklikle verilemez.";

export type DealWorkspaceReplyLike = { textPreview: string; occurredAt: number };
export type DealWorkspaceDemoLike = { statusLabel: string | null };
/** `status` accepts the real SalesOutcomeStatus union — only "won"/"lost" ever trigger the closed mode; every other value (open/paused/no_decision/unknown) falls through naturally. */
export type DealWorkspaceOutcomeLike = { status: string };

export type DealWorkspaceProps = {
  /** Working Queue + Deal Workspace bridge fix — a fresh, real acquisition opportunity may not have formed a mission yet (no ShadowTask was generated for it). `null` renders the workspace from `opportunityFocus`/`journey` alone; every mission-specific section (execution, draft, delivery) already degrades gracefully via its own null check. */
  mission: HermesMission | null;
  opportunityFocus: HermesOpportunityFocus;
  journey: CommercialJourneyResult;
  isNew: boolean;
  pipeline: HermesPipeline | null;
  draft: HermesOutboundDraft | null;
  delivery: HermesDeliveryRequest | null;
  /** Commercial Journey Driven Opportunity Workspace v1.0 — the real reply/demo/outcome matched to this mission (or null). Presence alone (plus outcome.status) decides Workspace Mode; display reuses `opportunityFocus`'s already-computed founder-safe labels wherever possible. */
  reply: DealWorkspaceReplyLike | null;
  demo: DealWorkspaceDemoLike | null;
  outcome: DealWorkspaceOutcomeLike | null;
  isPendingDecision: boolean;
  /** Founder Message Review & Revision Flow v1.0 — the lead's own real phone, unrelated to the draft (HermesOutboundDraft carries no destination field at all). */
  recipientPhone: string | null | undefined;
  /** True only when the lead's own signalVerification marks the WhatsApp channel verified/likely — never inferred from phone presence alone. */
  recipientPhoneVerified: boolean;
  /** True only when the already-fetched WhatsAppReadinessStatus is "controlled_live_ready" — every other value must always read as not-ready. */
  whatsappProviderReady: boolean;
  /** Founder Conversational Message Revision v1.0 — real, already-verified business fields the "Hermes'e Talimat Ver" revision may cite; null for a lead with no scored record at all. */
  businessContext: DraftRevisionBusinessContextLike | null;
  /** Founder Preparation-to-Draft Runtime Bridge fix — an already founder-safe reason (translated by `founderApprovalBlockerLabel`) when the last "Onayla — Hermes'i Başlat" click's preflight guard rejected it; null otherwise. */
  approvalBlockerReason: string | null;
  onApproveMission: () => void;
  onRejectMission: () => void;
  onApproveDraft: () => void;
  onRejectDraft: () => void;
  onEditDraft: (body: string) => void;
  onBack: () => void;
};

export default function DealWorkspace({
  mission,
  opportunityFocus,
  journey,
  isNew,
  pipeline,
  draft,
  delivery,
  reply,
  demo,
  outcome,
  isPendingDecision,
  recipientPhone,
  recipientPhoneVerified,
  whatsappProviderReady,
  businessContext,
  approvalBlockerReason,
  onApproveMission,
  onRejectMission,
  onApproveDraft,
  onRejectDraft,
  onEditDraft,
  onBack,
}: DealWorkspaceProps) {
  const agentFlow = pipeline ? pipelineAgentFlow(pipeline) : null;
  const currentStep =
    pipeline && pipeline.currentStageIndex !== null ? pipeline.steps[pipeline.currentStageIndex] : undefined;
  const lastFinishedStep = pipeline
    ? [...pipeline.steps].reverse().find((s) => s.finishedAt !== null)
    : undefined;

  // Founder Message Review & Revision Flow v1.0 — edit-mode is local UI state
  // only (no new registry, no parallel draft state): entering edit seeds the
  // buffer from the real draft body; "Kaydet" is the only path that ever
  // calls `onEditDraft` (same draft id, same handler chain V2Shell already
  // wires to `applyDraftEdit`); "Vazgeç" discards the buffer untouched.
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftEditBuffer, setDraftEditBuffer] = useState("");
  const [copied, setCopied] = useState(false);

  // Founder Conversational Message Revision v1.0 — session-only state (no
  // persistence, no new registry). "Hermes'e Talimat Ver" reuses the exact
  // same `onEditDraft` prop the manual edit flow already calls (same
  // `applyDraftEdit`, same draft id/missionId/channel/createdAt, same
  // re-approval reset via its own "edited" status) — this component never
  // mutates the draft itself.
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [isRevising, setIsRevising] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [lastRevisionResult, setLastRevisionResult] = useState<DraftRevisionResult | null>(null);
  const [lastInstructionSent, setLastInstructionSent] = useState<string | null>(null);
  const [externalActionSafetyMessage, setExternalActionSafetyMessage] = useState<string | null>(null);

  const runHermesRevision = async (instructionOverride?: string) => {
    const instruction = (instructionOverride ?? revisionInstruction).trim();
    if (!draft || !businessContext || isRevising || instruction === "") return;
    setIsRevising(true);
    setRevisionError(null);
    setExternalActionSafetyMessage(null);
    setLastRevisionResult(null);
    setLastInstructionSent(instruction);
    try {
      const readiness = computeControlledSendReadiness({
        draftStatus: draft.status,
        draftBody: draft.body,
        hasUnsavedEdit: isEditingDraft,
        recipientPhone,
        recipientPhoneVerified,
        whatsappProviderReady,
      });
      const res = await fetch("/api/hermes/draft-revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          draftBody: draft.body,
          businessContext: { ...businessContext, channel: draft.channel },
          readiness: {
            draftStatusLabel: readiness.draftStatusLabel,
            phoneLabel: readiness.phoneLabel,
            controlledSendReady: readiness.controlledSendReady,
            controlledSendLabel: readiness.controlledSendLabel,
            nextStepLabel: readiness.nextStepLabel,
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setRevisionError(body?.error || "Hermes şu anda mesajı yeniden hazırlayamadı. Tekrar deneyebilirsin.");
        return;
      }
      const payload = (await res.json()) as { blocked: boolean; safetyMessage?: string; result?: DraftRevisionResult };
      if (payload.blocked) {
        setExternalActionSafetyMessage(payload.safetyMessage ?? "Gönderim ayrı bir founder onayı gerektirir.");
        return;
      }
      if (!payload.result) {
        setRevisionError("Hermes'in yanıtı geçersizdi — taslak değiştirilmedi.");
        return;
      }
      setLastRevisionResult(payload.result);
      if (payload.result.intent === "revise_draft" && payload.result.revisedBody) {
        onEditDraft(payload.result.revisedBody);
        setRevisionInstruction("");
      }
    } catch {
      setRevisionError("Hermes'e şu anda ulaşılamıyor. Tekrar deneyebilirsin.");
    } finally {
      setIsRevising(false);
    }
  };

  const REVISION_QUICK_INSTRUCTIONS = [
    "Daha kısa yaz.",
    "Daha profesyonel yap.",
    "Daha samimi yap.",
    "İşletmeye özel yeniden yaz.",
  ] as const;

  const startEditingDraft = () => {
    if (!draft) return;
    setDraftEditBuffer(draft.body);
    setIsEditingDraft(true);
  };
  const saveDraftEdit = () => {
    const trimmed = draftEditBuffer.trim();
    if (trimmed === "") return; // boş mesaj kaydedilemez
    onEditDraft(trimmed);
    setIsEditingDraft(false);
  };
  const cancelDraftEdit = () => {
    setIsEditingDraft(false);
    setDraftEditBuffer("");
  };
  const copyDraftBody = () => {
    if (!draft) return;
    void navigator.clipboard?.writeText(draft.body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Commercial Journey Driven Opportunity Workspace v1.0 — one deterministic
  // mode, derived purely from real runtime objects (never the mission's own
  // shadow decisionState/stage). See hermes-opportunity-workspace-mode-adapter.ts
  // for the exact priority ladder.
  const workspaceMode = computeOpportunityWorkspaceMode({
    mission,
    pipeline,
    draft,
    delivery,
    reply,
    demo,
    outcome,
    journey,
  });

  // Founder Message Review & Revision Flow v1.0 fix, still in force: a real
  // draft always wins over the shadow-simulated mission-approval gate. Only
  // meaningful within the "opportunity_review" mode now — every other mode
  // implies a real draft/delivery/reply/demo/outcome already exists, so the
  // mission-approval question no longer applies once past this mode.
  const showMissionApproval = mission !== null && mission.decisionState === "pending" && !draft;

  const canEditDraft = draft !== null && draft.status !== "approved" && draft.status !== "rejected";
  // Founder Conversational Message Revision v1.0 — deliberately wider than
  // `canEditDraft`: an already-approved draft can still be revised by
  // instruction (the point of test #18 — revising an approved draft must
  // reset it to review, which `onEditDraft`/`applyDraftEdit` already does
  // via its own "edited" status). A rejected draft can never be revised.
  const canReviseDraft = draft !== null && draft.status !== "rejected";
  const controlledSendReadiness =
    draft && draft.status === "approved"
      ? computeControlledSendReadiness({
          draftStatus: draft.status,
          draftBody: draft.body,
          hasUnsavedEdit: isEditingDraft,
          recipientPhone,
          recipientPhoneVerified,
          whatsappProviderReady,
        })
      : null;

  return (
    <div className="flex flex-col">
      <div className="border-b border-white/[0.06] px-5 py-2.5">
        <button type="button" onClick={onBack} className="text-[11px] font-medium text-zinc-400 hover:text-zinc-100">
          ← Çalışma Listesine Dön
        </button>
      </div>

      {/* Common area 1 — Opportunity Header (every mode) */}
      <div className="border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-semibold text-zinc-100">{opportunityFocus.title}</h2>
          {isNew && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/[0.12] px-2 py-[2px] text-[9px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              Yeni
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-500">{opportunityFocus.subtitle}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2.5 py-[3px] text-[10px] font-semibold text-zinc-200">
            {journey.steps.find((s) => s.id === journey.currentStepId)?.label ?? opportunityFocus.currentStateLabel}
          </span>
          <span className="inline-flex items-center rounded-full bg-white/[0.04] px-2.5 py-[3px] text-[10px] text-zinc-400">
            {opportunityFocus.revenueSignalLabel}
          </span>
          {opportunityFocus.whatsappStatusLabel && (
            <span className="inline-flex items-center rounded-full bg-white/[0.04] px-2.5 py-[3px] text-[10px] text-zinc-400">
              {opportunityFocus.whatsappStatusLabel}
            </span>
          )}
        </div>
      </div>

      {/* Common area 2 — küçük Ticari Yolculuk özeti (every mode, unchanged content) */}
      <div className="border-b border-white/[0.06] px-5 py-3.5">
        <p className={sectionLabelCls}>Ticari Yolculuk</p>
        <ul className="mt-2.5 space-y-1.5">
          {journey.steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${JOURNEY_STEP_DOT_CLS[step.state]}`} />
              <span
                className={`text-[11px] ${
                  step.state === "upcoming" ? "text-zinc-600" : step.state === "active" ? "font-semibold text-zinc-100" : "text-zinc-400"
                }`}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-600">
          {journey.commercialObjectiveLabel}
        </p>
      </div>

      {/* Mode-specific main work area — exactly one of these renders. */}

      {workspaceMode === "opportunity_review" && (
        <div className="px-5 py-3.5">
          <p className={sectionLabelCls}>Hermes Brifingi</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-200">{opportunityFocus.whyThisMatters}</p>
          {/* Founder Preparation-to-Draft Runtime Bridge fix — while no real
              draft exists yet (`showMissionApproval`), `opportunityFocus.hermesRecommendation`
              may still carry the Karar Merkezi's generic "Hazırlanan mesaj gözden
              geçirilip onaylanmayı bekliyor." sentence (true only once a draft
              exists). Overridden here, locally, with the honest pre-draft line —
              the adapter's own data and every other decision item's copy are untouched. */}
          <p className="mt-2 text-[11px] font-medium text-indigo-300">
            {showMissionApproval ? FOUNDER_PREPARATION_BRIDGE_LABELS.preDraftRecommendation : opportunityFocus.hermesRecommendation}
          </p>
          <p className="mt-2 text-[11px] font-semibold text-zinc-300">{opportunityFocus.revenueSignalLabel}</p>

          <div className="mt-3.5 border-t border-white/[0.06] pt-3">
            <p className={sectionLabelCls}>Bugünkü Tek Karar</p>
            {showMissionApproval ? (
              <>
                <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-200">{MISSION_START_EXPLANATION}</p>
                {approvalBlockerReason && (
                  <p className="mt-1.5 text-[10px] font-medium text-amber-300">{approvalBlockerReason}</p>
                )}
                <div className="mt-2.5 flex gap-1.5">
                  <button
                    type="button"
                    disabled={isPendingDecision}
                    onClick={onApproveMission}
                    className={`${btnPrimaryCls} ${isPendingDecision ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {isPendingDecision ? "İşleniyor…" : FOUNDER_DECISION_PANEL_LABELS.approveButton}
                  </button>
                  <button
                    type="button"
                    disabled={isPendingDecision}
                    onClick={onRejectMission}
                    className={`${btnCls} ${isPendingDecision ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {FOUNDER_DECISION_PANEL_LABELS.rejectButton}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{opportunityFocus.founderNextAction}</p>
            )}
          </div>
        </div>
      )}

      {workspaceMode === "preparation" && (
        <div className="px-5 py-3.5">
          <p className={sectionLabelCls}>Yürütme Durumu</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">{FOUNDER_DECISION_PANEL_LABELS.executionStatus}</span>
            <span className="text-[10px] font-semibold text-zinc-200">
              {pipeline ? FOUNDER_PIPELINE_STATE_LABELS[pipeline.state] : FOUNDER_DECISION_PANEL_LABELS.executionNotStarted}
            </span>
          </div>
          {agentFlow?.current && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">{FOUNDER_DECISION_PANEL_LABELS.executionAgent}</span>
              <span className="text-[10px] font-semibold text-indigo-300">
                {HERMES_AGENT_REGISTRY[agentFlow.current].label}
              </span>
            </div>
          )}
          {currentStep && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">{FOUNDER_DECISION_PANEL_LABELS.executionStep}</span>
              <span className="text-[10px] font-medium text-zinc-300">{STAGE_SHORT_LABELS[currentStep.stage]}</span>
            </div>
          )}
          <div className="mt-2.5">
            <p className="text-[10px] text-zinc-500">{FOUNDER_DECISION_PANEL_LABELS.executionLastResult}</p>
            {lastFinishedStep?.result ? (
              <p
                className={`mt-1 text-[10px] leading-relaxed ${lastFinishedStep.result.status === "failed" ? "text-rose-400" : "text-zinc-400"}`}
              >
                {lastFinishedStep.result.message}
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-600">{FOUNDER_DECISION_PANEL_LABELS.executionNoResult}</p>
            )}
          </div>
          <p className="mt-3 text-[10px] text-zinc-600">Hermes çalışıyor — şu anda senden bir karar beklenmiyor.</p>
        </div>
      )}

      {(workspaceMode === "message_review" || workspaceMode === "controlled_send_ready") && draft && (
        <div className="px-5 py-3.5">
          <p className={sectionLabelCls}>Mesaj Taslağı</p>
          <div className="mt-2.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5 text-[10px]">
              <div>
                <p className="text-zinc-600">Kanal</p>
                <p className="mt-0.5 font-semibold text-zinc-200">{DRAFT_CHANNEL_LABELS[draft.channel]}</p>
              </div>
              <div>
                <p className="text-zinc-600">Alıcı</p>
                <p className="mt-0.5 font-semibold text-zinc-200">{opportunityFocus.title}</p>
              </div>
              <div className="col-span-2">
                <p className="text-zinc-600">WhatsApp Numarası</p>
                <p className={`mt-0.5 font-semibold ${recipientPhoneVerified && recipientPhone?.trim() ? "text-zinc-200" : "text-amber-300"}`}>
                  {recipientPhoneVerified && recipientPhone?.trim() ? recipientPhone : "WhatsApp numarası henüz doğrulanmadı."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">{DRAFT_STATUS_LABELS[draft.status]}</span>
              {draft.editedAt && <span className="text-[9px] text-zinc-600">— düzenlendi</span>}
            </div>

            {/* Founder Conversational Message Revision v1.0 — priority order per
                spec: talimat ver → manuel düzenle → onayla. Hidden only for a
                rejected draft (canReviseDraft); an approved draft can still be
                revised — doing so resets it to review via the same onEditDraft
                path the manual edit flow already uses. */}
            {canReviseDraft && businessContext && (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-indigo-300">
                  Hermes&apos;e Talimat Ver
                </p>
                <textarea
                  value={revisionInstruction}
                  onChange={(e) => setRevisionInstruction(e.target.value)}
                  disabled={isRevising}
                  rows={2}
                  placeholder="Örn: Mesajı daha kısa ve daha samimi yaz."
                  className="mt-2 w-full resize-y rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none disabled:opacity-60"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {REVISION_QUICK_INSTRUCTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={isRevising}
                      onClick={() => setRevisionInstruction(q)}
                      className={`rounded-full bg-white/[0.05] px-2.5 py-1 text-[9.5px] font-medium text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 ${isRevising ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={isRevising || revisionInstruction.trim() === ""}
                    onClick={() => void runHermesRevision()}
                    className={`${btnPrimaryCls} ${isRevising || revisionInstruction.trim() === "" ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {isRevising ? "Hermes mesajı yeniden hazırlıyor…" : "Hermes Revize Etsin"}
                  </button>
                </div>

                {revisionError && (
                  <p className="mt-2 text-[10px] font-medium text-rose-400">{revisionError}</p>
                )}

                {externalActionSafetyMessage && (
                  <div className="mt-2 rounded-lg bg-amber-500/[0.08] px-2.5 py-2 ring-1 ring-inset ring-amber-500/20">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-300">
                      Gönderim Ayrı Bir Founder Onayı Gerektirir
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-zinc-300">{externalActionSafetyMessage}</p>
                  </div>
                )}

                {lastRevisionResult && (
                  <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
                    {lastInstructionSent && (
                      <p className="text-[9px] text-zinc-600">
                        Son talimat: <span className="text-zinc-500">&ldquo;{lastInstructionSent}&rdquo;</span>
                      </p>
                    )}
                    <p className="text-[10.5px] leading-relaxed text-zinc-200">{lastRevisionResult.changeSummary}</p>
                    {lastRevisionResult.usedSignals.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lastRevisionResult.usedSignals.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded-full bg-emerald-500/[0.08] px-2 py-[2px] text-[9px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {lastRevisionResult.warnings.map((w, i) => (
                      <p key={i} className="text-[9.5px] text-amber-300">
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isEditingDraft ? (
              <>
                <textarea
                  value={draftEditBuffer}
                  onChange={(e) => setDraftEditBuffer(e.target.value)}
                  rows={7}
                  autoFocus
                  className="w-full resize-y rounded-lg border border-indigo-500/30 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-zinc-200 focus:border-indigo-500/50 focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={draftEditBuffer.trim() === ""}
                    onClick={saveDraftEdit}
                    className={`${btnPrimaryCls} ${draftEditBuffer.trim() === "" ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    Değişiklikleri Kaydet
                  </button>
                  <button type="button" onClick={cancelDraftEdit} className={btnCls}>
                    Vazgeç
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-200">{draft.body}</p>
                {(draft.status === "approved" || draft.status === "rejected") && (
                  <p className="text-[10px] text-zinc-600">
                    {draft.status === "rejected" ? "Taslak reddedildi." : NO_SEND_NOTE}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {canEditDraft && (
                    <button type="button" disabled={isRevising} onClick={startEditingDraft} className={`${btnCls} ${isRevising ? "cursor-not-allowed opacity-60" : ""}`}>
                      Mesajı Düzenle
                    </button>
                  )}
                  <button type="button" onClick={copyDraftBody} className={btnCls}>
                    {copied ? "Kopyalandı" : "Kopyala"}
                  </button>
                  {canEditDraft && (
                    <>
                      <button
                        type="button"
                        disabled={isPendingDecision || isRevising}
                        onClick={onRejectDraft}
                        className={`${btnCls} ${isPendingDecision || isRevising ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        Reddet
                      </button>
                      <button
                        type="button"
                        disabled={isPendingDecision || isRevising}
                        onClick={onApproveDraft}
                        className={`${btnPrimaryCls} ${isPendingDecision || isRevising ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {isPendingDecision ? "İşleniyor…" : "Mesajı Onayla"}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Ready For Controlled Send — only ever appears once the draft is genuinely approved; never a fake "ready" claim. */}
            {controlledSendReadiness && (
              <div
                className={`rounded-lg px-3 py-2.5 ring-1 ring-inset ${
                  controlledSendReadiness.controlledSendReady
                    ? "bg-emerald-500/[0.06] ring-emerald-500/20"
                    : "bg-amber-500/[0.06] ring-amber-500/20"
                }`}
              >
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Kontrollü Gönderime Hazır mı?
                </p>
                <div className="mt-1.5 space-y-1 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Taslak</span>
                    <span className="font-medium text-zinc-200">{controlledSendReadiness.draftStatusLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Numara</span>
                    <span className="font-medium text-zinc-200">{controlledSendReadiness.phoneLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Founder Onayı</span>
                    <span className="font-medium text-zinc-200">{controlledSendReadiness.founderApprovalLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Kontrollü Gönderim</span>
                    <span
                      className={`font-semibold ${controlledSendReadiness.controlledSendReady ? "text-emerald-300" : "text-amber-300"}`}
                    >
                      {controlledSendReadiness.controlledSendLabel}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-500">
                  {controlledSendReadiness.controlledSendReady
                    ? controlledSendReadiness.nextStepLabel
                    : `Sonraki adım: ${controlledSendReadiness.nextStepLabel}`}
                </p>
              </div>
            )}

            {isEditingDraft && <p className="text-[9px] text-amber-300">{UNSAVED_EDIT_NOTE}</p>}
          </div>
        </div>
      )}

      {workspaceMode === "delivery_waiting" && (
        <div className="px-5 py-3.5">
          <p className={sectionLabelCls}>Teslimat / Cevap Bekleniyor</p>
          {delivery && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">{FOUNDER_DECISION_PANEL_LABELS.deliveryStatus}</span>
              <span className="text-[10px] font-semibold text-zinc-200">{DELIVERY_STATUS_LABELS[delivery.status]}</span>
            </div>
          )}
          <p className="mt-2.5 text-[11.5px] font-medium text-zinc-100">{journey.outcomeLabel}</p>
          {journey.nextMilestoneLabel && (
            <p className="mt-1 text-[11px] text-zinc-400">
              {journey.nextMilestoneLabel}
              {journey.responsibleParty && (
                <span className="ml-1.5 text-zinc-600">— {RESPONSIBLE_PARTY_LABEL[journey.responsibleParty]}</span>
              )}
            </p>
          )}
          <p className="mt-3 text-[10px] text-zinc-600">Şu anda senden beklenen bir karar yok — Hermes cevabı izliyor.</p>
        </div>
      )}

      {workspaceMode === "reply_review" && (
        <div className="px-5 py-3.5">
          <p className={sectionLabelCls}>Cevap İncelemesi</p>
          {reply && (
            <>
              <p className="mt-2 text-[10px] text-zinc-600">{new Date(reply.occurredAt).toLocaleString("tr-TR")}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-200">&ldquo;{reply.textPreview}&rdquo;</p>
            </>
          )}
          {opportunityFocus.replyIntentLabel && (
            <p className="mt-2 text-[11px] font-medium text-sky-300">{opportunityFocus.replyIntentLabel}</p>
          )}
          <p className="mt-2 text-[11px] text-indigo-300">{opportunityFocus.hermesRecommendation}</p>
          <p className="mt-2 text-[11px] font-semibold text-zinc-300">{opportunityFocus.founderNextAction}</p>
        </div>
      )}

      {workspaceMode === "demo_progress" && (
        <div className="px-5 py-3.5">
          <p className={sectionLabelCls}>Demo İlerlemesi</p>
          {demo?.statusLabel && <p className="mt-2 text-[11.5px] font-medium text-zinc-100">{demo.statusLabel}</p>}
          <p className="mt-2 text-[11px] text-zinc-400">{journey.outcomeLabel}</p>
          {journey.nextMilestoneLabel && (
            <p className="mt-1 text-[11px] text-zinc-400">
              {journey.nextMilestoneLabel}
              {journey.responsibleParty && (
                <span className="ml-1.5 text-zinc-600">— {RESPONSIBLE_PARTY_LABEL[journey.responsibleParty]}</span>
              )}
            </p>
          )}
        </div>
      )}

      {workspaceMode === "closed" && (
        <div className="px-5 py-3.5">
          <p className={sectionLabelCls}>Sonuç</p>
          <p className="mt-2 text-[13px] font-semibold text-zinc-100">{journey.outcomeLabel}</p>
          <p className="mt-2 text-[10px] text-zinc-600">Şu anda senden beklenen bir karar yok.</p>
        </div>
      )}

      {/* Common area 3 — Aktivite / Timeline, shown only if meaningful; never overshadows the mode-specific area above. */}
      {opportunityFocus.timeline.length > 0 && (
        <div className="border-t border-white/[0.06] px-5 py-3.5">
          <p className={sectionLabelCls}>Aktivite</p>
          <ul className="mt-2 space-y-1.5">
            {opportunityFocus.timeline.map((entry, i) => (
              <li key={i} className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.tone === "success"
                      ? "bg-emerald-400"
                      : entry.tone === "danger"
                        ? "bg-rose-400"
                        : entry.tone === "warning"
                          ? "bg-amber-400"
                          : entry.tone === "info"
                            ? "bg-sky-400"
                            : "bg-zinc-500"
                  }`}
                />
                <span className="flex-1 truncate text-[10px] text-zinc-400">{entry.label}</span>
                <span className="shrink-0 text-[9px] text-zinc-600">
                  {entry.occurredAt ? new Date(entry.occurredAt).toLocaleString("tr-TR") : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
