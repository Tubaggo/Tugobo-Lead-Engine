"use client";

import { useState, useMemo } from "react";
import {
  adaptScoredLeadsToAutomationCards,
  computeAutomationSummary,
  QUEUE_LABELS,
  type AutomationCard,
  type AutomationQueueType,
  type AutomationSummary,
} from "@/app/components/v2/adapters/automation-center-adapter";
import { formatMrr } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import {
  MISSION_STAGE_ACCENT_CLS,
  MISSION_STAGE_BAR_CLS,
  TASK_TYPE_LABELS,
  missionBucketOf,
  type HermesDecisionMap,
  type HermesMission,
  type MissionBucket,
} from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { ScoredLead } from "@/app/lib/leads";
import { SALES_PRIORITY_LABELS } from "@/lib/verified-opportunity/priority-engine";
import { HERMES_AGENT_REGISTRY } from "@/app/lib/hermes-monitor";
import type { HermesAgentKey, HermesMonitor, ShadowTask } from "@/app/lib/hermes-monitor";
import {
  PIPELINE_STATE_LABELS,
  STAGE_SHORT_LABELS,
  buildInitialPipeline,
  buildPipelineTimelineEntries,
  computeMissionPipelineUiState,
  pipelineAgentFlow,
  type HermesPipeline,
  type HermesPipelineStep,
  type MissionPipelineUiState,
} from "@/app/components/v2/hermes-pipeline-engine";
import {
  selectCls,
  inputCls,
  kpiStripCls,
  kpiLabelCls,
  kpiValueCls,
  kpiSubCls,
  toolbarCls,
  screenCardCls,
  sectionLabelCls,
} from "@/app/components/v2/design-system";

/* ── Props ──────────────────────────────────────────────────────── */

type Props = {
  leads: ScoredLead[];
  selectedId: string | null;
  onSelect: (card: AutomationCard) => void;
  monitor: HermesMonitor;
  missions: HermesMission[];
  selectedHermesMissionId: string | null;
  onSelectHermesMission: (mission: HermesMission) => void;
  hermesDecisions: HermesDecisionMap;
  onApproveMission: (mission: HermesMission) => void;
  onRejectTask: (taskId: string) => void;
  hermesPipelines: Record<string, HermesPipeline>;
  onStartPipeline: (mission: HermesMission) => void;
};

/* ── Shared vocabulary ──────────────────────────────────────────── */

const CONFIDENCE_LABELS: Record<ShadowTask["confidence"], string> = {
  high: "Yüksek güven",
  medium: "Orta güven",
  low: "Düşük güven",
};

const EXEC_PRIORITY_DOT: Record<ShadowTask["priority"], string> = {
  CRITICAL: "bg-rose-400",
  URGENT: "bg-rose-400",
  HIGH: "bg-amber-400",
  NORMAL: "bg-sky-400",
  LOW: "bg-zinc-600",
};

const REASON_DOT: Record<string, string> = {
  critical: "bg-rose-400",
  major: "bg-amber-400",
  minor: "bg-zinc-600",
};

function AgentBadge({ agent }: { agent: ShadowTask["suggestedAgent"] }) {
  if (!agent) {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-rose-400 ring-1 ring-inset ring-rose-500/20">
        Founder
      </span>
    );
  }
  const meta = HERMES_AGENT_REGISTRY[agent];
  return (
    <span
      title={meta.shadowIntent}
      className="inline-flex items-center rounded-full bg-violet-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/20"
    >
      {meta.label}
    </span>
  );
}

/** Mission-level agent slot badge — also renders "founder" (the founder's own turn) and "—" (nothing pending). */
function MissionAgentBadge({ slot, label }: { slot: HermesAgentKey | "founder" | null; label: string }) {
  const cls =
    slot === null
      ? "bg-white/[0.04] text-zinc-600 ring-white/[0.06]"
      : slot === "founder"
        ? "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20"
        : "bg-violet-500/[0.10] text-violet-300 ring-violet-500/20";
  const title = slot && slot !== "founder" ? HERMES_AGENT_REGISTRY[slot].shadowIntent : undefined;
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

/* ── 1. Hermes Mission Brief ────────────────────────────────────── */

function MissionBrief({
  monitor,
  missions,
  pipelines,
}: {
  monitor: HermesMonitor;
  missions: HermesMission[];
  pipelines: Record<string, HermesPipeline>;
}) {
  const pending = missions.filter((m) => missionBucketOf(m) === "approval").length;
  const running = missions.filter((m) => pipelines[m.missionId]?.state === "running").length;
  const completed = missions.filter((m) => pipelines[m.missionId]?.state === "completed").length;
  const blocked = missions.filter((m) => pipelines[m.missionId]?.state === "blocked").length;
  const ready = missions.filter(
    (m) => !pipelines[m.missionId] && computeMissionPipelineUiState(m, undefined) === "ready",
  ).length;

  return (
    <div className="border-b border-white/[0.06] px-5 py-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-indigo-400">
        Hermes Görev Brifi
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-200">
        <span className="font-semibold">{monitor.brief.headline}</span> Hermes bu sabah{" "}
        <span className="font-semibold text-zinc-100">{monitor.summary.leadsEvaluated} fırsatı</span>{" "}
        değerlendirdi ve{" "}
        <span className="font-semibold text-zinc-100">{missions.length} mission</span> başlattı.
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
        <span className="font-semibold text-amber-400">{pending} karar</span> bekliyor ·{" "}
        <span className="font-semibold text-emerald-400">{ready} mission</span> başlatılmaya hazır ·{" "}
        <span className="font-semibold text-sky-400">{running} pipeline</span> çalışıyor
        {completed > 0 && (
          <>
            {" "}
            · <span className="font-semibold text-zinc-300">{completed} pipeline</span> tamamlandı
          </>
        )}
        {blocked > 0 && (
          <>
            {" "}
            · <span className="font-semibold text-rose-400">{blocked} pipeline</span> durduruldu
          </>
        )}
      </p>
      <p className="mt-1.5 text-[10px] text-zinc-600">
        Founder onayı pipeline&apos;ı başlatır — Hermes sonrasını tek başına yürütür. Dış iletişim yok.
      </p>
    </div>
  );
}

/* ── 2. Hermes Workforce strip ──────────────────────────────────── */

type WorkforceStatus = { label: string; dot: string; active: boolean };

function workforceStatus(
  agent: HermesAgentKey,
  tasks: ShadowTask[],
  decisions: HermesDecisionMap,
  missions: HermesMission[],
  pipelines: Record<string, HermesPipeline>,
): WorkforceStatus {
  // Alive first: is this agent the one actively running a pipeline stage
  // right now? If so, that overrides the generic task-count status below —
  // this is what makes the strip feel like a real workforce instead of a
  // static queue count.
  for (const mission of missions) {
    const pipeline = pipelines[mission.missionId];
    if (!pipeline || pipeline.state !== "running" || pipeline.currentStageIndex === null) continue;
    const step = pipeline.steps[pipeline.currentStageIndex];
    if (step?.agent === agent && step.status === "running") {
      return { label: `Çalışıyor: ${mission.hotelName}`, dot: "bg-emerald-400", active: true };
    }
  }

  const mine = tasks.filter((t) => t.suggestedAgent === agent && !decisions[t.id]);

  if (agent === "herald") {
    return { label: "Brif hazır", dot: "bg-sky-400", active: true };
  }
  if (agent === "medic") {
    return { label: "Boşta — hata yok", dot: "bg-zinc-600", active: false };
  }
  if (agent === "courier") {
    const approvedDrafts = tasks.filter(
      (t) => t.taskType === "outreach-draft" && decisions[t.id]?.status === "approved",
    ).length;
    return approvedDrafts > 0
      ? { label: `Gönderime hazır · ${approvedDrafts} (A6)`, dot: "bg-amber-400", active: true }
      : { label: "Onay kapısında", dot: "bg-zinc-600", active: false };
  }
  if (agent === "listener") {
    const watching = mine.filter((t) => t.decision === "WAIT").length;
    return watching > 0
      ? { label: `İzliyor · ${watching}`, dot: "bg-sky-400", active: true }
      : { label: "Boşta", dot: "bg-zinc-600", active: false };
  }

  if (mine.length === 0) return { label: "Boşta", dot: "bg-zinc-600", active: false };
  if (mine.some((t) => t.decision === "RUN")) {
    return { label: `Sırada · ${mine.length}`, dot: "bg-emerald-400", active: true };
  }
  if (mine.some((t) => t.decision === "APPROVAL" || t.decision === "ESCALATE")) {
    return { label: `Onay bekliyor · ${mine.length}`, dot: "bg-amber-400", active: true };
  }
  return { label: `Bekliyor · ${mine.length}`, dot: "bg-sky-400", active: true };
}

function WorkforceStrip({
  tasks,
  decisions,
  missions,
  pipelines,
}: {
  tasks: ShadowTask[];
  decisions: HermesDecisionMap;
  missions: HermesMission[];
  pipelines: Record<string, HermesPipeline>;
}) {
  const agents = Object.keys(HERMES_AGENT_REGISTRY) as HermesAgentKey[];
  return (
    <div className="border-b border-white/[0.06] px-5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
          Hermes İşgücü
        </span>
        {agents.map((key) => {
          const meta = HERMES_AGENT_REGISTRY[key];
          const st = workforceStatus(key, tasks, decisions, missions, pipelines);
          return (
            <span key={key} className="flex items-center gap-1.5" title={meta.shadowIntent}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot} ${st.label.startsWith("Çalışıyor") ? "animate-pulse" : ""}`} />
              <span
                className={`text-[10px] font-semibold ${st.active ? "text-zinc-200" : "text-zinc-500"}`}
              >
                {meta.label}
              </span>
              <span className="text-[9px] text-zinc-600">{st.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── 3. Mission Queue (hero) ────────────────────────────────────── */

const MISSION_BUCKET_META: Record<MissionBucket, { title: string; hint: string; accent: string }> = {
  approval: {
    title: "Founder Onayı",
    hint: "Onayla — Hermes pipeline'ı hemen başlatır",
    accent: "text-amber-400",
  },
  ready: {
    title: "Başlatmaya Hazır",
    hint: "Güvenli — tek tıkla 4 aşamalı pipeline çalışır",
    accent: "text-emerald-400",
  },
  "in-progress": {
    title: "Devam Ediyor",
    hint: "Hermes hâlâ doğruluyor, zenginleştiriyor veya izliyor",
    accent: "text-sky-400",
  },
  completed: {
    title: "Tamamlandı",
    hint: "Karara bağlandı — mission kapandı",
    accent: "text-zinc-400",
  },
};

/** Compact horizontal stepper — the pipeline's visual core, shown both collapsed and expanded. */
function PipelineStepper({
  mission,
  pipeline,
  compact = false,
}: {
  mission: HermesMission;
  pipeline: HermesPipeline | undefined;
  compact?: boolean;
}) {
  const steps: HermesPipelineStep[] = pipeline ? pipeline.steps : buildInitialPipeline(mission).steps;
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const cls =
          step.status === "succeeded"
            ? "bg-emerald-500/[0.14] text-emerald-400"
            : step.status === "running"
              ? "bg-amber-500/[0.16] text-amber-400 animate-pulse"
              : step.status === "failed"
                ? "bg-rose-500/[0.14] text-rose-400"
                : step.status === "skipped"
                  ? "bg-white/[0.02] text-zinc-700"
                  : "bg-white/[0.04] text-zinc-500";
        return (
          <div key={step.id} className="flex items-center gap-1">
            <span
              title={`${STAGE_SHORT_LABELS[step.stage]} · ${HERMES_AGENT_REGISTRY[step.agent].label}`}
              className={`flex h-5 items-center gap-1 rounded-full px-2 text-[9px] font-semibold ${cls}`}
            >
              {step.status === "succeeded" && "✔ "}
              {step.status === "failed" && "✕ "}
              {!compact && STAGE_SHORT_LABELS[step.stage]}
              {compact && step.status === "running" && STAGE_SHORT_LABELS[step.stage]}
            </span>
            {i < steps.length - 1 && <span className="text-[9px] text-zinc-700">→</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Once a pipeline exists, mission-level progress reflects real stage completion, not the frozen pre-pipeline estimate. */
function displayProgress(
  mission: HermesMission,
  pipeline: HermesPipeline | undefined,
): { pct: number; barCls: string; accentCls: string } {
  if (!pipeline) {
    return { pct: mission.progress, barCls: MISSION_STAGE_BAR_CLS[mission.stage], accentCls: MISSION_STAGE_ACCENT_CLS[mission.stage] };
  }
  const succeeded = pipeline.steps.filter((s) => s.status === "succeeded").length;
  const pct = Math.round((succeeded / pipeline.steps.length) * 100);
  const barCls = pipeline.state === "blocked" ? "bg-rose-400" : pipeline.state === "completed" ? "bg-emerald-400" : "bg-amber-400";
  const accentCls = pipeline.state === "blocked" ? "text-rose-400" : pipeline.state === "completed" ? "text-emerald-400" : "text-amber-400";
  return { pct, barCls, accentCls };
}

function MissionProgressBar({ mission, pipeline }: { mission: HermesMission; pipeline: HermesPipeline | undefined }) {
  const { pct, barCls, accentCls } = displayProgress(mission, pipeline);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[9px] font-semibold tabular-nums ${accentCls}`}>{pct}%</span>
    </div>
  );
}

/** Start/trigger control — disappears entirely once a pipeline exists (only the stepper remains). */
function PipelineTrigger({
  uiState,
  onStart,
}: {
  uiState: MissionPipelineUiState;
  onStart: () => void;
}) {
  if (uiState !== "ready") return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onStart();
      }}
      className="shrink-0 rounded-md bg-indigo-500 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors duration-100 hover:bg-indigo-400"
    >
      Hermes Çalıştır
    </button>
  );
}

function MissionCard({
  mission,
  isSelected,
  isExpanded,
  pipeline,
  onSelect,
  onToggleExpand,
  onApprove,
  onReject,
  onStartPipeline,
}: {
  mission: HermesMission;
  isSelected: boolean;
  isExpanded: boolean;
  pipeline: HermesPipeline | undefined;
  onSelect: (mission: HermesMission) => void;
  onToggleExpand: (missionId: string) => void;
  onApprove: (mission: HermesMission) => void;
  onReject: (taskId: string) => void;
  onStartPipeline: (mission: HermesMission) => void;
}) {
  const primaryTask = mission.tasks.find((t) => t.id === mission.primaryTaskId) ?? mission.tasks[0];
  const uiState = computeMissionPipelineUiState(mission, pipeline);
  const agentFlow = pipeline ? pipelineAgentFlow(pipeline) : null;
  const currentSlot = agentFlow ? agentFlow.current : mission.currentAgent;
  const currentLabel = agentFlow
    ? (agentFlow.current ? HERMES_AGENT_REGISTRY[agentFlow.current].label : pipeline?.state === "completed" ? "Tamamlandı" : "—")
    : mission.currentAgentLabel;
  const nextSlot = agentFlow ? agentFlow.next : mission.nextAgent;
  const nextLabel = agentFlow ? (agentFlow.next ? HERMES_AGENT_REGISTRY[agentFlow.next].label : "—") : mission.nextAgentLabel;
  const displayStatus = pipeline ? PIPELINE_STATE_LABELS[pipeline.state] : mission.status;
  const timeline = [...mission.timeline, ...buildPipelineTimelineEntries(pipeline)].sort((a, b) => a.at - b.at);

  return (
    <div
      className={[
        "rounded-lg border transition-colors duration-100",
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/[0.08] ring-1 ring-inset ring-indigo-500/20"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.04]",
      ].join(" ")}
    >
      {/* Collapsed header: Mission → Progress → Current Agent → Next Agent → Status */}
      <div onClick={() => onSelect(mission)} className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(mission.missionId);
          }}
          className="shrink-0 text-[10px] text-zinc-600 transition-colors duration-100 hover:text-zinc-300"
        >
          {isExpanded ? "▾" : "▸"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${EXEC_PRIORITY_DOT[mission.priority]}`}
            />
            <p className="truncate text-[12px] font-semibold leading-snug text-zinc-100">
              {mission.hotelName}
            </p>
            <span className="shrink-0 text-[10px] font-normal text-zinc-600">{mission.city}</span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-zinc-500">{displayStatus}</p>
        </div>

        <div className="hidden shrink-0 items-center lg:flex">
          <PipelineStepper mission={mission} pipeline={pipeline} compact />
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          <span className={`text-[9px] font-semibold uppercase tracking-wide ${pipeline ? "" : MISSION_STAGE_ACCENT_CLS[mission.stage]}`}>
            {pipeline ? PIPELINE_STATE_LABELS[pipeline.state] : mission.stageLabel}
          </span>
          <MissionProgressBar mission={mission} pipeline={pipeline} />
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <MissionAgentBadge slot={currentSlot} label={currentLabel} />
          <span className="text-[9px] text-zinc-700">→</span>
          <MissionAgentBadge slot={nextSlot} label={nextLabel} />
        </div>

        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-300">
          {mission.estimatedImpact > 0 ? `${formatMrr(mission.estimatedImpact)}/ay` : ""}
        </span>

        <PipelineTrigger uiState={uiState} onStart={() => onStartPipeline(mission)} />
      </div>

      {/* Expanded: Tasks → Evidence → Approval → Pipeline → Timeline */}
      {isExpanded && (
        <div className="space-y-3 border-t border-white/[0.06] px-3.5 py-3">
          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              Görevler · {mission.taskCount}
            </p>
            <div className="space-y-1.5">
              {mission.tasks.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-2 rounded-md bg-white/[0.02] px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <AgentBadge agent={t.suggestedAgent} />
                      <span className="text-[10px] text-zinc-500">{TASK_TYPE_LABELS[t.taskType]}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-300">&ldquo;{t.suggestedAction.label}.&rdquo;</p>
                  </div>
                  <span className="shrink-0 text-[9px] text-zinc-600">{CONFIDENCE_LABELS[t.confidence]}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">Kanıt</p>
            <ul className="space-y-1">
              {(primaryTask?.reasons ?? []).slice(0, 4).map((r, i) => (
                <li key={`${r.source}-${i}`} className="flex items-start gap-2">
                  <span
                    className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${REASON_DOT[r.severity ?? "minor"] ?? "bg-zinc-600"}`}
                  />
                  <span className="text-[10px] leading-relaxed text-zinc-500">{r.message}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">Onay</p>
            {mission.decisionState === "approved" ? (
              <span className="inline-flex items-center rounded-md bg-emerald-500/[0.12] px-2 py-1 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                ✓ Onaylandı
              </span>
            ) : mission.decisionState === "rejected" ? (
              <span className="inline-flex items-center rounded-md bg-rose-500/[0.12] px-2 py-1 text-[10px] font-semibold text-rose-400 ring-1 ring-inset ring-rose-500/25">
                ✕ Reddedildi
              </span>
            ) : mission.decisionState === "pending" ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(mission);
                  }}
                  className="rounded-md bg-emerald-500/[0.12] px-2.5 py-1 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 transition-colors duration-100 hover:bg-emerald-500/[0.20]"
                >
                  Onayla — Pipeline&apos;ı Başlat
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject(mission.primaryTaskId);
                  }}
                  className="rounded-md bg-rose-500/[0.10] px-2.5 py-1 text-[10px] font-semibold text-rose-400 ring-1 ring-inset ring-rose-500/20 transition-colors duration-100 hover:bg-rose-500/[0.16]"
                >
                  Reddet
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-zinc-600">Onay gerekmiyor — güvenli iç görev</p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              Hermes Pipeline
            </p>
            <div className="flex items-center justify-between gap-2">
              <PipelineStepper mission={mission} pipeline={pipeline} />
              <PipelineTrigger uiState={uiState} onStart={() => onStartPipeline(mission)} />
            </div>
            {uiState === "gated" && (
              <p className="mt-1.5 text-[10px] text-zinc-600">
                Önce Founder onayı gerekli — onaylandığında pipeline hemen başlar.
              </p>
            )}
            {uiState === "waiting" && (
              <p className="mt-1.5 text-[10px] text-zinc-600">
                Yanıt veya takip zamanı bekleniyor — pipeline henüz başlatılamaz.
              </p>
            )}
            {uiState === "unsupported" && (
              <p className="mt-1.5 text-[10px] text-zinc-600">Bu görev A6&apos;da bağlanacak.</p>
            )}
            {pipeline?.state === "blocked" && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-rose-400">
                {pipeline.steps.find((s) => s.status === "failed")?.result?.message ?? "Pipeline durduruldu."}
              </p>
            )}
            <p className="mt-1.5 text-[9px] text-zinc-600">Güvenli iç aksiyon · Dış iletişim yok</p>
          </div>

          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              Zaman Akışı
            </p>
            <div className="max-h-[160px] space-y-1 overflow-y-auto">
              {timeline.length === 0 ? (
                <p className="text-[10px] text-zinc-600">Henüz aktivite yok</p>
              ) : (
                timeline.map((item, i) => (
                  <div key={`${item.at}-${i}`} className="flex items-baseline gap-2">
                    <span className="w-[34px] shrink-0 text-[9px] tabular-nums text-zinc-600">
                      {new Date(item.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`w-[56px] shrink-0 text-[9px] font-semibold ${item.actorCls}`}>
                      {item.actorLabel}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-500" title={item.text}>
                      {item.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MissionQueue({
  missions,
  selectedHermesMissionId,
  expandedMissionId,
  onSelectHermesMission,
  onToggleExpand,
  onApproveMission,
  onRejectTask,
  hermesPipelines,
  onStartPipeline,
}: {
  missions: HermesMission[];
  selectedHermesMissionId: string | null;
  expandedMissionId: string | null;
  onSelectHermesMission: (mission: HermesMission) => void;
  onToggleExpand: (missionId: string) => void;
  onApproveMission: (mission: HermesMission) => void;
  onRejectTask: (taskId: string) => void;
  hermesPipelines: Record<string, HermesPipeline>;
  onStartPipeline: (mission: HermesMission) => void;
}) {
  const order: MissionBucket[] = ["approval", "ready", "in-progress", "completed"];
  const groups = order
    .map((key) => ({
      key,
      meta: MISSION_BUCKET_META[key],
      items: missions.filter((m) => missionBucketOf(m) === key),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="border-b border-white/[0.06] px-5 py-10 text-center">
        <p className="text-[12px] font-medium text-zinc-500">Hermes mission önerisi yok</p>
        <p className="mt-1 text-[10px] text-zinc-600">
          Havuz sakin — değerlendirme her yüklemede yenilenir
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.06] px-5 py-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
        Mission Kuyruğu
      </p>
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className={`text-[11px] font-bold ${g.meta.accent}`}>
                {g.meta.title} · {g.items.length}
              </span>
              <span className="text-[9px] text-zinc-600">{g.meta.hint}</span>
            </div>
            <div className="space-y-2">
              {g.items.map((mission) => (
                <MissionCard
                  key={mission.missionId}
                  mission={mission}
                  isSelected={mission.missionId === selectedHermesMissionId}
                  isExpanded={mission.missionId === expandedMissionId}
                  pipeline={hermesPipelines[mission.missionId]}
                  onSelect={onSelectHermesMission}
                  onToggleExpand={onToggleExpand}
                  onApprove={onApproveMission}
                  onReject={onRejectTask}
                  onStartPipeline={onStartPipeline}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 4. Today's Hermes Activity timeline ──────────────────────────
   Now includes real pipeline execution events (stage started/result),
   not just shadow-task prep and approvals. */

type TimelineItem = {
  at: number;
  actor: string;
  actorCls: string;
  text: string;
};

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function buildTimeline(
  monitor: HermesMonitor,
  decisions: HermesDecisionMap,
  missions: HermesMission[],
  pipelines: Record<string, HermesPipeline>,
): TimelineItem[] {
  const hermesItems: TimelineItem[] = [];

  for (const task of monitor.tasks) {
    const agentLabel = task.suggestedAgent
      ? HERMES_AGENT_REGISTRY[task.suggestedAgent].label
      : "Hermes";
    hermesItems.push({
      at: task.createdAt,
      actor: agentLabel,
      actorCls: "text-violet-300",
      text: `${task.suggestedAction.label} hazırlandı — ${task.hotelName}`,
    });
    if (task.requiresApproval && !decisions[task.id]) {
      hermesItems.push({
        at: task.createdAt,
        actor: "Hermes",
        actorCls: "text-indigo-300",
        text: `Founder onayına alındı — ${task.hotelName}`,
      });
    }
  }

  // Keep the feed digestible: head of the prep work + the closing summary.
  const capped =
    hermesItems.length > 12 ? hermesItems.slice(0, 12) : hermesItems;

  capped.push({
    at: monitor.generatedAt,
    actor: "Herald",
    actorCls: "text-sky-300",
    text: "Sabah brifi hazırlandı",
  });
  capped.push({
    at: monitor.generatedAt,
    actor: "Hermes",
    actorCls: "text-indigo-300",
    text: `Değerlendirme tamamlandı — ${monitor.summary.leadsEvaluated} lead, ${monitor.summary.shadowTaskCount} görev`,
  });

  const byId = new Map(monitor.tasks.map((t) => [t.id, t]));
  const founderItems: TimelineItem[] = Object.entries(decisions)
    .map(([taskId, d]) => {
      const t = byId.get(taskId);
      if (!t) return null;
      return {
        at: d.at,
        actor: "Founder",
        actorCls: "text-zinc-100",
        text: `${d.status === "approved" ? "Onayladı" : "Reddetti"} — ${t.hotelName} · ${t.suggestedAction.label}`,
      };
    })
    .filter((x): x is TimelineItem => x !== null);

  const pipelineItems: TimelineItem[] = missions.flatMap((m) => {
    const p = pipelines[m.missionId];
    if (!p) return [];
    return buildPipelineTimelineEntries(p).map((e) => ({
      at: e.at,
      actor: e.actorLabel,
      actorCls: e.actorCls,
      text: `${e.text} — ${m.hotelName}`,
    }));
  });

  return [...capped, ...founderItems, ...pipelineItems].sort((a, b) => a.at - b.at);
}

function TodayTimeline({
  monitor,
  decisions,
  missions,
  pipelines,
}: {
  monitor: HermesMonitor;
  decisions: HermesDecisionMap;
  missions: HermesMission[];
  pipelines: Record<string, HermesPipeline>;
}) {
  const items = buildTimeline(monitor, decisions, missions, pipelines);
  return (
    <div className="border-b border-white/[0.06] px-5 py-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
        Bugünün Hermes Aktivitesi
      </p>
      <div className="mt-2.5 max-h-[240px] space-y-0 overflow-y-auto">
        {items.map((item, i) => (
          <div
            key={`${item.at}-${i}`}
            className="flex items-baseline gap-3 border-b border-white/[0.03] py-1.5 last:border-b-0"
          >
            <span className="w-[34px] shrink-0 text-[9px] tabular-nums text-zinc-600">
              {timeLabel(item.at)}
            </span>
            <span className={`w-[64px] shrink-0 text-[10px] font-semibold ${item.actorCls}`}>
              {item.actor}
            </span>
            <span className="min-w-0 flex-1 truncate text-[10.5px] text-zinc-400" title={item.text}>
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 5. Supporting: automation queues (demoted, collapsible) ────── */

const QUEUE_FILTER_OPTIONS: Array<{ value: AutomationQueueType | "all"; label: string }> = [
  { value: "all", label: "Tüm Kuyruklar" },
  { value: "daily-outreach", label: "Günlük Outreach" },
  { value: "follow-up", label: "Takip" },
  { value: "re-enrich", label: "Yeniden Zenginleştir" },
  { value: "website-scan", label: "Web Sitesi Tarama" },
  { value: "contact-finder", label: "İletişim Bul" },
  { value: "whatsapp-verify", label: "WhatsApp Doğrula" },
  { value: "ai-review", label: "AI İnceleme" },
];

function PriorityDot({ priority }: { priority: AutomationCard["priority"] }) {
  const cls =
    priority === "critical"
      ? "bg-rose-400"
      : priority === "high"
        ? "bg-amber-400"
        : priority === "medium"
          ? "bg-sky-400"
          : "bg-zinc-600";
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

function StatusBadge({ status, label }: { status: AutomationCard["status"]; label: string }) {
  const cls =
    status === "overdue"
      ? "bg-rose-500/[0.12] text-rose-400 ring-rose-500/20"
      : status === "blocked"
        ? "bg-zinc-700/50 text-zinc-500 ring-zinc-600/20"
        : status === "ready"
          ? "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20"
          : "bg-zinc-700/50 text-zinc-500 ring-zinc-600/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

function QueueBadge({ queue }: { queue: AutomationQueueType }) {
  const label = QUEUE_LABELS[queue];
  const cls =
    queue === "follow-up" || queue === "daily-outreach"
      ? "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20"
      : queue === "re-enrich" || queue === "website-scan"
        ? "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20"
        : queue === "contact-finder" || queue === "whatsapp-verify"
          ? "bg-violet-500/[0.10] text-violet-400 ring-violet-500/20"
          : "bg-indigo-500/[0.10] text-indigo-400 ring-indigo-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-medium ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3.5">
      <p className={kpiLabelCls}>{label}</p>
      <p className={`${kpiValueCls} ${accent ?? "text-zinc-100"}`}>{value}</p>
      {sub && <p className={kpiSubCls}>{sub}</p>}
    </div>
  );
}

function QueueSummaryStrip({ summary }: { summary: AutomationSummary }) {
  return (
    <div className="shrink-0 overflow-x-auto border-b border-white/[0.06]">
      <div className="flex min-w-max gap-0 divide-x divide-white/[0.06]">
        {summary.queues.map((q) => (
          <div key={q.type} className="flex min-w-[110px] flex-col gap-0.5 px-4 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              {q.label}
            </p>
            <p className="text-[18px] font-bold tabular-nums leading-none text-zinc-200">
              {q.total}
            </p>
            <p className="text-[9px] text-zinc-600">
              {q.ready} hazır{q.overdue > 0 ? ` · ${q.overdue} gecikti` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutomationSection({
  leads,
  selectedId,
  onSelect,
}: {
  leads: ScoredLead[];
  selectedId: string | null;
  onSelect: (card: AutomationCard) => void;
}) {
  const [open, setOpen] = useState(false);
  const [queueFilter, setQueueFilter] = useState<AutomationQueueType | "all">("all");
  const [search, setSearch] = useState("");

  const allCards = useMemo(() => adaptScoredLeadsToAutomationCards(leads), [leads]);
  const summary = useMemo(() => computeAutomationSummary(allCards), [allCards]);

  const filtered = useMemo(() => {
    let list = allCards;
    if (queueFilter !== "all") {
      list = list.filter((c) => c.queues.includes(queueFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.hotelName.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allCards, queueFilter, search]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 transition-colors duration-100 hover:bg-white/[0.02]"
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
          Destek Görünümü — Otomasyon Kuyrukları
        </span>
        <span className="text-[10px] text-zinc-600">
          {summary.total} kayıt · {summary.ready} hazır{" "}
          <span className="ml-1 text-zinc-500">{open ? "▴ Gizle" : "▾ Göster"}</span>
        </span>
      </button>

      {open && (
        <>
          {/* KPI strip */}
          <div className={`${kpiStripCls} border-t border-white/[0.06]`}>
            <KpiCard label="Toplam Bekleyen" value={summary.total} sub="aktif otomasyon" />
            <KpiCard
              label="Hazır"
              value={summary.ready}
              sub="şimdi çalıştırılabilir"
              accent="text-emerald-400"
            />
            <KpiCard
              label="Gecikmiş"
              value={summary.overdue}
              sub="takip geçti"
              accent={summary.overdue > 0 ? "text-rose-400" : "text-zinc-100"}
            />
            <KpiCard
              label="Engellendi"
              value={summary.blocked}
              sub="DNC / geçersiz"
              accent={summary.blocked > 0 ? "text-amber-400" : "text-zinc-100"}
            />
          </div>

          <QueueSummaryStrip summary={summary} />

          {/* Toolbar */}
          <div className={toolbarCls}>
            <select
              className={selectCls}
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value as AutomationQueueType | "all")}
            >
              {QUEUE_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="Otel veya şehir ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="ml-auto text-[10px] text-zinc-600">
              {filtered.length} lead
            </span>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <p className="text-[13px] font-medium">Bekleyen otomasyon yok</p>
              <p className="mt-1 text-[11px]">Filtre veya arama koşullarını değiştirin</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-[var(--background-elev)]">
                <tr className="border-b border-white/[0.06]">
                  {[
                    "Otel",
                    "Kuyruk",
                    "Öncelik",
                    "Durum",
                    "Neden",
                    "Fırsat",
                    "Son Aktivite",
                    "Aksiyon",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`${sectionLabelCls} px-4 py-2.5 text-left font-semibold`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((card) => {
                  const isSelected = card.id === selectedId;
                  return (
                    <tr
                      key={`${card.id}-${card.primaryQueue}`}
                      onClick={() => onSelect(card)}
                      className={[
                        "cursor-pointer border-b border-white/[0.04] transition-colors duration-100",
                        isSelected
                          ? "bg-indigo-500/[0.08]"
                          : "hover:bg-white/[0.03]",
                      ].join(" ")}
                    >
                      {/* Otel */}
                      <td className="px-4 py-2.5">
                        <p className="text-[12px] font-medium text-zinc-200 leading-snug">
                          {card.hotelName}
                        </p>
                        <p className="text-[10px] text-zinc-600">
                          {card.city} · {card.hotelType}
                        </p>
                      </td>

                      {/* Kuyruk */}
                      <td className="px-4 py-2.5">
                        <QueueBadge queue={card.primaryQueue} />
                      </td>

                      {/* Öncelik */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <PriorityDot priority={card.priority} />
                          <span className="text-[11px] capitalize text-zinc-400">
                            {card.priority === "critical"
                              ? "Kritik"
                              : card.priority === "high"
                                ? "Yüksek"
                                : card.priority === "medium"
                                  ? "Orta"
                                  : "Düşük"}
                          </span>
                        </div>
                      </td>

                      {/* Durum */}
                      <td className="px-4 py-2.5">
                        <StatusBadge status={card.status} label={card.statusLabel} />
                      </td>

                      {/* Neden */}
                      <td className="max-w-[200px] px-4 py-2.5">
                        <p className="truncate text-[11px] text-zinc-500">{card.reason}</p>
                      </td>

                      {/* Fırsat */}
                      <td className="px-4 py-2.5">
                        <span className="text-[12px] font-semibold tabular-nums text-zinc-300">
                          {card.opportunityScore}
                        </span>
                      </td>

                      {/* Son Aktivite */}
                      <td className="px-4 py-2.5">
                        <span className="text-[11px] text-zinc-600">
                          {card.lastActivityLabel}
                        </span>
                      </td>

                      {/* Aksiyon */}
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(card);
                          }}
                          className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-zinc-300 transition-colors duration-100 hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                          {card.actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

/* ── Main workspace ─────────────────────────────────────────────── */

export default function AutomationCenterScreen({
  leads,
  selectedId,
  onSelect,
  monitor,
  missions,
  selectedHermesMissionId,
  onSelectHermesMission,
  hermesDecisions,
  onApproveMission,
  onRejectTask,
  hermesPipelines,
  onStartPipeline,
}: Props) {
  // Which mission's card is expanded inline — independent of side-panel
  // selection, so the founder can scan several missions without losing place.
  const [expandedMissionId, setExpandedMissionId] = useState<string | null>(null);
  const toggleExpand = (missionId: string) =>
    setExpandedMissionId((cur) => (cur === missionId ? null : missionId));

  return (
    <div className={`${screenCardCls} flex-1`}>
      <div className="flex-1 overflow-y-auto">
        {/* 1 — Mission brief: Hermes reports, first thing the founder reads */}
        <MissionBrief monitor={monitor} missions={missions} pipelines={hermesPipelines} />

        {/* 2 — Workforce: who is doing what right now (alive during a running pipeline) */}
        <WorkforceStrip tasks={monitor.tasks} decisions={hermesDecisions} missions={missions} pipelines={hermesPipelines} />

        {/* 3 — Mission queue: the hero — where supervision happens */}
        <MissionQueue
          missions={missions}
          selectedHermesMissionId={selectedHermesMissionId}
          expandedMissionId={expandedMissionId}
          onSelectHermesMission={onSelectHermesMission}
          onToggleExpand={toggleExpand}
          onApproveMission={onApproveMission}
          onRejectTask={onRejectTask}
          hermesPipelines={hermesPipelines}
          onStartPipeline={onStartPipeline}
        />

        {/* 4 — Today's activity feed (all missions + real pipeline events) */}
        <TodayTimeline monitor={monitor} decisions={hermesDecisions} missions={missions} pipelines={hermesPipelines} />

        {/* 5 — Supporting: the old automation view, demoted and collapsed */}
        <AutomationSection leads={leads} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  );
}
