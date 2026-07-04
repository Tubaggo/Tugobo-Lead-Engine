"use client";

import { useState, useEffect } from "react";
import type { AutomationCard, AutomationSummary } from "@/app/components/v2/adapters/automation-center-adapter";
import { QUEUE_LABELS } from "@/app/components/v2/adapters/automation-center-adapter";
import { formatMrr } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import { useLeadMutations } from "@/app/hooks/useLeadMutations";
import { SALES_PRIORITY_LABELS } from "@/lib/verified-opportunity/priority-engine";
import { HERMES_AGENT_REGISTRY } from "@/app/lib/hermes-monitor";
import type { HermesAgentKey, HermesMonitorSummary, ShadowTask } from "@/app/lib/hermes-monitor";
import {
  MISSION_STAGE_ACCENT_CLS,
  MISSION_STAGE_BAR_CLS,
  TASK_TYPE_LABELS,
} from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { HermesMission } from "@/app/components/v2/adapters/hermes-mission-adapter";
import { actionLabelOf } from "@/app/components/v2/hermes-execution";
import {
  PIPELINE_STATE_LABELS,
  STAGE_SHORT_LABELS,
  buildPipelineTimelineEntries,
  computeMissionPipelineUiState,
  pipelineAgentFlow,
} from "@/app/components/v2/hermes-pipeline-engine";
import type { HermesPipeline } from "@/app/components/v2/hermes-pipeline-engine";
import {
  DRAFT_CHANNEL_LABELS,
  DRAFT_STATUS_LABELS,
  FOUNDER_DECISION_NEEDED,
  NO_SEND_NOTE,
  NOT_SENT_LABEL,
  UNVERIFIED_CHANNEL_WARNING,
  buildDraftTimelineEntries,
  type DraftGuardResult,
  type HermesOutboundDraft,
} from "@/app/components/v2/hermes-courier";
import {
  DELIVERY_PROVIDER_LABELS,
  DELIVERY_STATUS_LABELS,
  GATEWAY_STOP_NOTE,
  NO_SEND_BUTTON_NOTE,
  buildDeliveryTimelineEntries,
  type DeliveryGuardResult,
  type HermesDeliveryRequest,
} from "@/app/components/v2/hermes-delivery-gateway";
import {
  RECEIPT_STATUS_LABELS,
  SEND_MODE_LABELS,
  SHADOW_SEND_DISCLAIMER,
  buildConnectorTimelineEntries,
  type HermesProviderReceipt,
  type ProviderGuardResult,
} from "@/app/components/v2/hermes-provider-connectors";
import {
  NOT_AUTHORIZED_LABEL,
  NOT_CONFIGURED_LABEL,
  NOT_CONNECTED_LABEL,
  PROVIDER_NOT_LIVE_READY_WARNING,
  SESSION_HEALTH_LABELS,
  SESSION_STATUS_LABELS,
  SETUP_REQUIRED_LABEL,
  SHADOW_READY_LABEL,
  buildSessionTimelineEntries,
  type HermesProviderSession,
  type ProviderSessionGuardResult,
} from "@/app/components/v2/hermes-provider-sessions";
import type { OperationalMomentum, ExecutionState } from "@/app/lib/execution-runtime";

/* ── Design tokens ──────────────────────────────────────────────── */

const PANEL = "flex w-[280px] shrink-0 flex-col gap-0 overflow-y-auto rounded-xl border border-white/[0.08] bg-[var(--background-elev)]";
const SEC = "border-b border-white/[0.06] px-4 py-4";
const SEC_TITLE = "mb-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500";
const ROW = "flex items-center justify-between";
const LABEL = "text-[10px] text-zinc-500";
const VALUE = "text-[11px] font-medium text-zinc-300";

/* ── Base button ────────────────────────────────────────────────── */

function Btn({
  label,
  onClick,
  loading,
  variant = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const base =
    "flex h-8 w-full items-center justify-center rounded-lg px-3 text-[11px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";
  const v =
    variant === "primary"
      ? "bg-indigo-500 text-white hover:bg-indigo-400"
      : variant === "danger"
        ? "bg-rose-500/[0.12] text-rose-400 ring-1 ring-inset ring-rose-500/20 hover:bg-rose-500/[0.18]"
        : "border border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${v}`}
    >
      {loading ? "Yükleniyor…" : label}
    </button>
  );
}

/* ── Shared error box ───────────────────────────────────────────── */

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] p-3 text-[10px] leading-relaxed text-rose-400">
      {error}
    </div>
  );
}

/* ── Success chip (shared header for all result cards) ──────────── */

function SuccessChip({ label, timestamp }: { label: string; timestamp: number | null }) {
  const rel = timestamp
    ? (() => {
        const s = Math.round((Date.now() - timestamp) / 1000);
        if (s < 10) return "az önce";
        if (s < 60) return `${s}s önce`;
        return `${Math.round(s / 60)}dk önce`;
      })()
    : null;

  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
        <span>✓</span>
        <span>{label}</span>
      </span>
      {rel && <span className="text-[9px] text-zinc-600">{rel}</span>}
    </div>
  );
}

/* ── AI Message result card ─────────────────────────────────────── */

function MessageResultCard({
  text,
  generatedAt,
  phone,
}: {
  text: string;
  generatedAt: number | null;
  phone: string | null;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* silently fail */});
  }

  function handleWhatsApp() {
    if (!phone) return;
    const clean = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div className="space-y-3">
      <SuccessChip label="Mesaj Oluşturuldu" timestamp={generatedAt} />
      <div className="min-h-[160px] rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5">
        <p className="select-text whitespace-pre-wrap text-[11.5px] leading-[1.7] text-zinc-200">
          {text}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className={[
            "flex h-8 flex-1 items-center justify-center rounded-lg border text-[10px] font-semibold transition-colors duration-150",
            copied
              ? "border-emerald-500/30 bg-emerald-500/[0.10] text-emerald-400"
              : "border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100",
          ].join(" ")}
        >
          {copied ? "✓ Kopyalandı" : "Kopyala"}
        </button>
        {phone && (
          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex h-8 flex-1 items-center justify-center rounded-lg bg-emerald-500/[0.12] text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20 transition-colors duration-150 hover:bg-emerald-500/[0.18]"
          >
            WhatsApp Aç
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Contact Finder result card ─────────────────────────────────── */

type ContactResult = {
  bestContactType: string;
  bestContactValue: string;
  confidence: string;
};

function ContactFoundCard({
  card,
  result,
  foundAt,
}: {
  card: AutomationCard;
  result: ContactResult;
  foundAt: number | null;
}) {
  function openWhatsApp() {
    if (!card.phone) return;
    window.open(`https://wa.me/${card.phone.replace(/[^0-9]/g, "")}`, "_blank");
  }
  function openWebsite() {
    if (!card.website) return;
    const url = card.website.startsWith("http") ? card.website : `https://${card.website}`;
    window.open(url, "_blank");
  }
  function openInstagram() {
    if (!card.instagram) return;
    window.open(`https://instagram.com/${card.instagram.replace(/^@/, "")}`, "_blank");
  }

  const channels = [
    card.phone ? { label: "WhatsApp", value: card.phone } : null,
    card.instagram ? { label: "Instagram", value: `@${card.instagram.replace(/^@/, "")}` } : null,
    card.website ? { label: "Website", value: card.website } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  return (
    <div className="space-y-3">
      <SuccessChip label="İletişim Bulundu" timestamp={foundAt} />
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 space-y-2.5">
        {channels.map((ch) => (
          <div key={ch.label} className={ROW}>
            <span className="text-[10px] font-medium text-zinc-500">{ch.label}</span>
            <span className="max-w-[155px] truncate text-[11px] text-zinc-200">{ch.value}</span>
          </div>
        ))}
        {channels.length > 0 && (
          <div className="border-t border-white/[0.06] pt-2.5 space-y-2">
            <div className={ROW}>
              <span className="text-[10px] text-zinc-500">Güven</span>
              <span className="text-[13px] font-bold text-emerald-400">{result.confidence}</span>
            </div>
            <div className={ROW}>
              <span className="text-[10px] text-zinc-500">Kaynak</span>
              <span className="text-[11px] text-zinc-300">{result.bestContactType}</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {card.phone && (
          <button
            type="button"
            onClick={openWhatsApp}
            className="flex h-8 w-full items-center justify-center rounded-lg bg-emerald-500/[0.12] text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20 transition-colors duration-150 hover:bg-emerald-500/[0.18]"
          >
            WhatsApp Aç
          </button>
        )}
        {card.website && (
          <button
            type="button"
            onClick={openWebsite}
            className="flex h-8 w-full items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[10px] font-semibold text-zinc-300 transition-colors duration-150 hover:bg-white/[0.08] hover:text-zinc-100"
          >
            Website Aç
          </button>
        )}
        {card.instagram && (
          <button
            type="button"
            onClick={openInstagram}
            className="flex h-8 w-full items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[10px] font-semibold text-zinc-300 transition-colors duration-150 hover:bg-white/[0.08] hover:text-zinc-100"
          >
            Instagram Aç
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Re-Enrich result card ──────────────────────────────────────── */

type EnrichResult = {
  score: number | string;
  tier: string;
  hasWebsite: boolean;
  hasWhatsApp: boolean;
  hasInstagram: boolean;
  hasReservationCta: boolean;
  icpScore: number | string;
  enrichedAt: number;
};

function EnrichResultCard({ result }: { result: EnrichResult }) {
  const rel = (() => {
    const s = Math.round((Date.now() - result.enrichedAt) / 1000);
    if (s < 10) return "az önce";
    if (s < 60) return `${s} saniye önce`;
    if (s < 3600) return `${Math.round(s / 60)} dakika önce`;
    return `${Math.round(s / 3600)} saat önce`;
  })();

  const checks = [
    { label: "Website", ok: result.hasWebsite },
    { label: "WhatsApp", ok: result.hasWhatsApp },
    { label: "Instagram", ok: result.hasInstagram },
    { label: "Rezervasyon CTA", ok: result.hasReservationCta },
  ];

  return (
    <div className="space-y-3">
      <SuccessChip label="Zenginleştirme Tamamlandı" timestamp={result.enrichedAt} />
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 space-y-3">
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">Son Tarama</p>
          <div className="space-y-1.5">
            {checks.map((ch) => (
              <div key={ch.label} className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-bold leading-none ${ch.ok ? "text-emerald-400" : "text-zinc-700"}`}
                >
                  {ch.ok ? "✓" : "—"}
                </span>
                <span className={`text-[10.5px] ${ch.ok ? "text-zinc-300" : "text-zinc-600"}`}>
                  {ch.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          <div className={ROW}>
            <span className="text-[10px] text-zinc-500">Fırsat Skoru</span>
            <span className="text-[14px] font-bold tabular-nums text-indigo-400">{result.score}</span>
          </div>
          <div className={ROW}>
            <span className="text-[10px] text-zinc-500">ICP Uyumu</span>
            <span className="text-[14px] font-bold tabular-nums text-sky-400">{result.icpScore}</span>
          </div>
          <div className={ROW}>
            <span className="text-[10px] text-zinc-500">Tier</span>
            <span className="text-[11px] font-semibold capitalize text-zinc-300">{result.tier}</span>
          </div>
        </div>

        <p className="border-t border-white/[0.06] pt-2.5 text-[9px] text-zinc-600">
          Güncellendi: {rel}
        </p>
      </div>
    </div>
  );
}

/* ── Lead status display card ───────────────────────────────────── */

type LeadStatusConfig = { label: string; dot: string; badge: string };

const STATUS_CONFIG: Record<string, LeadStatusConfig> = {
  new: {
    label: "Yeni",
    dot: "bg-sky-400",
    badge: "bg-sky-500/[0.12] text-sky-400 ring-sky-500/20",
  },
  contacted: {
    label: "İletişim Kuruldu",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/[0.12] text-emerald-400 ring-emerald-500/20",
  },
  needs_follow_up: {
    label: "Takip Gerekli",
    dot: "bg-amber-400",
    badge: "bg-amber-500/[0.12] text-amber-400 ring-amber-500/20",
  },
  replied: {
    label: "Yanıt Verdi",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/[0.12] text-emerald-400 ring-emerald-500/20",
  },
  meeting: {
    label: "Toplantı",
    dot: "bg-violet-400",
    badge: "bg-violet-500/[0.12] text-violet-400 ring-violet-500/20",
  },
  won: {
    label: "Kazanıldı",
    dot: "bg-violet-400",
    badge: "bg-violet-500/[0.14] text-violet-300 ring-violet-500/20",
  },
  lost: {
    label: "Kaybedildi",
    dot: "bg-rose-400",
    badge: "bg-rose-500/[0.12] text-rose-400 ring-rose-500/20",
  },
  dnc: {
    label: "İletişim Engellendi",
    dot: "bg-rose-500",
    badge: "bg-rose-500/[0.14] text-rose-400 ring-rose-500/20",
  },
};

function relTimeLabel(ts: number | null | undefined): string {
  if (!ts || ts <= 0) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "Az önce";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dakika önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.round(h / 24);
  if (d === 1) return "Dün";
  if (d <= 7) return `${d} gün önce`;
  return `${Math.round(d / 7)} hafta önce`;
}

function followUpLabel(ts: number | null | undefined): string {
  if (!ts || ts <= 0) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(ts);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return `${Math.abs(diff)} gün gecikti`;
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  return `${diff} gün sonra`;
}

function LeadStatusCard({
  status,
  doNotContact,
  lastContactedAt,
  updatedAt,
  nextFollowUpAt,
  contactAttempts,
}: {
  status: string;
  doNotContact: boolean;
  lastContactedAt: number | null;
  updatedAt: number | null;
  nextFollowUpAt: number | null;
  contactAttempts: number;
}) {
  const key = doNotContact ? "dnc" : (status in STATUS_CONFIG ? status : "new");
  const cfg = STATUS_CONFIG[key] ?? STATUS_CONFIG["new"]!;
  const lastTs = lastContactedAt ?? updatedAt;
  const followUp = followUpLabel(nextFollowUpAt);
  const followUpColor =
    followUp.includes("gecikti")
      ? "text-rose-400"
      : followUp === "Bugün"
        ? "text-amber-400"
        : nextFollowUpAt
          ? "text-zinc-300"
          : "text-zinc-600";

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
        <span className={`rounded-md px-2 py-[3px] text-[10px] font-semibold ring-1 ring-inset ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>
      <div className="border-t border-white/[0.06] pt-3 space-y-2.5">
        <div className={ROW}>
          <span className={LABEL}>Son Aktivite</span>
          <span className={VALUE}>{relTimeLabel(lastTs)}</span>
        </div>
        <div className={ROW}>
          <span className={LABEL}>Sonraki Takip</span>
          <span className={`text-[11px] font-medium ${followUpColor}`}>{followUp}</span>
        </div>
        <div className={ROW}>
          <span className={LABEL}>İletişim Denemesi</span>
          <span className={`text-[11px] font-medium tabular-nums ${contactAttempts > 0 ? "text-zinc-300" : "text-zinc-600"}`}>
            {contactAttempts > 0 ? contactAttempts : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── State types ────────────────────────────────────────────────── */

type MsgApiState = { loading: boolean; result: string | null; error: string | null; generatedAt: number | null };
type CfApiState = { loading: boolean; result: ContactResult | null; error: string | null; foundAt: number | null };
type ReEnrichApiState = { loading: boolean; result: EnrichResult | null; error: string | null };

const EMPTY_MSG: MsgApiState = { loading: false, result: null, error: null, generatedAt: null };
const EMPTY_CF: CfApiState = { loading: false, result: null, error: null, foundAt: null };
const EMPTY_ENRICH: ReEnrichApiState = { loading: false, result: null, error: null };

/* ── Hermes Mission Decision Center (A3.6) ───────────────────────── */

const HERMES_DECISION_LABELS: Record<ShadowTask["decision"], string> = {
  RUN: "Otomatik Çalıştırılır",
  APPROVAL: "Onay Bekliyor",
  ESCALATE: "Founder Kararı",
  WAIT: "İzlemede",
  SKIP: "Atlandı",
};

const HERMES_CONFIDENCE_LABELS: Record<ShadowTask["confidence"], string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const MOMENTUM_LABELS: Record<OperationalMomentum, string> = {
  accelerating: "Hızlanıyor",
  stable: "Stabil",
  slowing: "Yavaşlıyor",
  stalled: "Durdu",
  recovering: "Toparlanıyor",
  reactivated: "Yeniden Aktif",
};

const EXEC_STATE_LABELS: Record<ExecutionState, string> = {
  dormant: "Uykuda",
  ready: "Hazır",
  blocked: "Engelli",
  waiting: "Yanıt Bekleniyor",
  scheduled: "Planlandı",
  completed: "Tamamlandı",
};

const REASON_DOT: Record<string, string> = {
  critical: "bg-rose-400",
  major: "bg-amber-400",
  minor: "bg-zinc-600",
};

function MissionDecisionCenter({
  mission,
  momentum,
  pipeline,
  onApprove,
  onReject,
  onStartPipeline,
  draft,
  manualDraftGuard,
  onCreateDraft,
  onEditDraft,
  onApproveDraft,
  onRejectDraft,
  delivery,
  deliveryGuard,
  receipt,
  connectorGuard,
  onRunShadowSend,
  providerSession,
  providerSessionGuard,
}: {
  mission: HermesMission;
  momentum: OperationalMomentum | null;
  pipeline: HermesPipeline | null;
  onApprove: (mission: HermesMission) => void;
  onReject: (taskId: string) => void;
  onStartPipeline: (mission: HermesMission) => void;
  draft: HermesOutboundDraft | null;
  manualDraftGuard: DraftGuardResult;
  onCreateDraft: () => void;
  onEditDraft: (missionId: string, body: string) => void;
  onApproveDraft: (missionId: string) => void;
  onRejectDraft: (missionId: string) => void;
  delivery: HermesDeliveryRequest | null;
  deliveryGuard: DeliveryGuardResult;
  receipt: HermesProviderReceipt | null;
  connectorGuard: ProviderGuardResult;
  onRunShadowSend: (missionId: string) => void;
  providerSession: HermesProviderSession | null;
  providerSessionGuard: ProviderSessionGuardResult;
}) {
  const primaryTask = mission.tasks.find((t) => t.id === mission.primaryTaskId) ?? mission.tasks[0]!;
  const reasons = primaryTask.reasons.slice(0, 6);
  const pipelineUiState = computeMissionPipelineUiState(mission, pipeline ?? undefined);
  const agentFlow = pipeline ? pipelineAgentFlow(pipeline) : null;
  const currentAgentLabel = agentFlow
    ? agentFlow.current
      ? HERMES_AGENT_REGISTRY[agentFlow.current].label
      : pipeline?.state === "completed"
        ? "Tamamlandı"
        : "—"
    : mission.currentAgentLabel;
  const currentAgentIntent = agentFlow
    ? agentFlow.current
      ? HERMES_AGENT_REGISTRY[agentFlow.current].shadowIntent
      : pipeline?.state === "completed"
        ? "Mission kapandı — aktif ajan yok"
        : "Beklemede"
    : mission.currentAgent === null
      ? "Mission kapandı — aktif ajan yok"
      : mission.currentAgent === "founder"
        ? "Şu an sıra Founder'da — mission kararını bekliyor"
        : HERMES_AGENT_REGISTRY[mission.currentAgent].shadowIntent;
  const nextAgentLabel = agentFlow
    ? agentFlow.next
      ? HERMES_AGENT_REGISTRY[agentFlow.next].label
      : "—"
    : mission.nextAgentLabel;
  const nextAgentIntent = agentFlow
    ? agentFlow.next
      ? HERMES_AGENT_REGISTRY[agentFlow.next].shadowIntent
      : "Belirlenmiş bir sonraki adım yok"
    : mission.nextAgent === null
      ? "Belirlenmiş bir sonraki adım yok"
      : mission.nextAgent === "founder"
        ? "Hazırlık tamamlandığında Founder onayı istenecek"
        : HERMES_AGENT_REGISTRY[mission.nextAgent].shadowIntent;
  const completedSteps = pipeline?.steps.filter((s) => s.status === "succeeded") ?? [];
  const remainingSteps = pipeline?.steps.filter((s) => s.status === "queued") ?? [];
  const currentStep = pipeline?.currentStageIndex !== null && pipeline ? pipeline.steps[pipeline.currentStageIndex!] : undefined;
  const lastFinishedStep = [...(pipeline?.steps ?? [])].reverse().find((s) => s.finishedAt !== null);
  const timeline = [
    ...mission.timeline,
    ...buildPipelineTimelineEntries(pipeline ?? undefined),
    ...buildDraftTimelineEntries(draft ?? undefined),
    ...buildDeliveryTimelineEntries(delivery ?? undefined),
    ...buildConnectorTimelineEntries(receipt ?? undefined),
    ...buildSessionTimelineEntries(providerSession ?? undefined),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className={PANEL}>
      {/* Header */}
      <div className={SEC}>
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-indigo-400">
          Hermes Karar Merkezi
        </p>
        <p className="mt-1.5 text-[14px] font-semibold leading-snug text-zinc-100">
          {mission.hotelName}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">{mission.city}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span
            className={`rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] font-semibold ${pipeline ? "" : MISSION_STAGE_ACCENT_CLS[mission.stage]}`}
          >
            {pipeline ? PIPELINE_STATE_LABELS[pipeline.state] : mission.stageLabel}
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] text-zinc-400">
            {pipeline ? PIPELINE_STATE_LABELS[pipeline.state] : mission.status}
          </span>
        </div>
      </div>

      {/* Mission Overview */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Mission Özeti</p>
        <p className="text-[11.5px] leading-relaxed text-zinc-200">
          &ldquo;{primaryTask.suggestedAction.label}.&rdquo;
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {[
            { label: "Görev", value: mission.taskCount },
            { label: "Tamamlanan", value: mission.completedTaskCount },
            { label: "Engellenen", value: mission.blockedTaskCount },
            { label: "İzlemede", value: mission.waitingTaskCount },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white/[0.02] px-2.5 py-2">
              <p className="text-[13px] font-bold tabular-nums text-zinc-200">{s.value}</p>
              <p className="text-[9px] text-zinc-600">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mission Progress — reflects real pipeline stage completion once one exists */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Mission İlerlemesi</p>
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full ${
                pipeline
                  ? pipeline.state === "blocked"
                    ? "bg-rose-400"
                    : pipeline.state === "completed"
                      ? "bg-emerald-400"
                      : "bg-amber-400"
                  : MISSION_STAGE_BAR_CLS[mission.stage]
              }`}
              style={{
                width: `${pipeline ? Math.round((completedSteps.length / pipeline.steps.length) * 100) : mission.progress}%`,
              }}
            />
          </div>
          <span
            className={`text-[12px] font-bold tabular-nums ${pipeline ? "" : MISSION_STAGE_ACCENT_CLS[mission.stage]}`}
          >
            {pipeline ? Math.round((completedSteps.length / pipeline.steps.length) * 100) : mission.progress}%
          </span>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-600">
          {pipeline ? PIPELINE_STATE_LABELS[pipeline.state] : `${mission.stageLabel} — ${mission.status}`}
        </p>
      </div>

      {/* Current Agent */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Mevcut Ajan</p>
        <p className="text-[12px] font-semibold text-zinc-100">{currentAgentLabel}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{currentAgentIntent}</p>
      </div>

      {/* Next Agent */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Sıradaki Ajan</p>
        <p className="text-[12px] font-semibold text-zinc-100">{nextAgentLabel}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{nextAgentIntent}</p>
      </div>

      {/* Evidence */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Kanıt</p>
        <ul className="space-y-1.5">
          {reasons.map((r, i) => (
            <li key={`${r.source}-${i}`} className="flex items-start gap-2">
              <span
                className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${REASON_DOT[r.severity ?? "minor"] ?? "bg-zinc-600"}`}
              />
              <span className="text-[10.5px] leading-relaxed text-zinc-400">{r.message}</span>
            </li>
          ))}
          {reasons.length === 0 && (
            <li className="text-[10px] text-zinc-600">Çalışma zamanı gerekçesi bulunamadı</li>
          )}
        </ul>
      </div>

      {/* Execution Context (borrowed judgements, never recalculated) */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Execution Context</p>
        <div className="space-y-2">
          <div className={ROW}>
            <span className={LABEL}>Öncelik</span>
            <span className={VALUE}>{SALES_PRIORITY_LABELS[mission.priority]}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Güven</span>
            <span className={VALUE}>{HERMES_CONFIDENCE_LABELS[mission.confidence]}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Momentum</span>
            <span className={VALUE}>{momentum ? MOMENTUM_LABELS[momentum] : "—"}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Yürütme Durumu</span>
            <span className={VALUE}>{EXEC_STATE_LABELS[primaryTask.executionState]}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Görev Türü</span>
            <span className={VALUE}>{TASK_TYPE_LABELS[primaryTask.taskType]}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Ham Karar</span>
            <span className={VALUE}>{HERMES_DECISION_LABELS[primaryTask.decision]}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Tahmini Etki</span>
            <span className={VALUE}>
              {mission.estimatedImpact > 0 ? `${formatMrr(mission.estimatedImpact)}/ay` : "—"}
            </span>
          </div>
        </div>
        <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[9px] leading-relaxed text-zinc-600">
          {primaryTask.suggestedAction.reason}
        </p>
      </div>

      {/* Related Lead */}
      <div className={SEC}>
        <p className={SEC_TITLE}>İlgili Lead</p>
        <p className="text-[12px] font-semibold text-zinc-100">{mission.hotelName}</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">{mission.city}</p>
        <p className="mt-1.5 text-[9px] text-zinc-600">
          Lead detayına Destek Görünümü — Otomasyon Kuyrukları tablosundan ulaşabilirsin.
        </p>
      </div>

      {/* Founder Decision */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Founder Kararı</p>
        {mission.decisionState === "approved" ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-2.5">
            <span className="text-[10px] font-semibold text-emerald-400">✓</span>
            <span className="text-[10px] text-emerald-400">
              Onaylandı — pipeline aşağıdan takip edilebilir
            </span>
          </div>
        ) : mission.decisionState === "rejected" ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2.5">
            <span className="text-[10px] font-semibold text-rose-400">✕</span>
            <span className="text-[10px] text-rose-400">Reddedildi — Hermes bu mission&apos;ı bırakır</span>
          </div>
        ) : mission.decisionState === "pending" ? (
          <>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onApprove(mission)}
                className="flex h-8 flex-1 items-center justify-center rounded-lg bg-emerald-500/[0.14] text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 transition-colors duration-150 hover:bg-emerald-500/[0.22]"
              >
                Onayla — Pipeline&apos;ı Başlat
              </button>
              <button
                type="button"
                onClick={() => onReject(mission.primaryTaskId)}
                className="flex h-8 flex-1 items-center justify-center rounded-lg bg-rose-500/[0.10] text-[11px] font-semibold text-rose-400 ring-1 ring-inset ring-rose-500/20 transition-colors duration-150 hover:bg-rose-500/[0.16]"
              >
                Reddet
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">
              Onay, 4 aşamalı pipeline&apos;ı hemen başlatır — Hermes sonrasını tek başına yürütür.
            </p>
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-zinc-500">
            Onay gerekmiyor — güvenli iç görev; tek tıkla pipeline başlatılabilir.
          </p>
        )}
      </div>

      {/* Hermes Pipeline (A5) — the only place a mission can actually run, autonomously across 4 stages */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Hermes Pipeline</p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500">Pipeline Durumu</span>
          <span
            className={`text-[10px] font-semibold ${
              pipeline?.state === "blocked"
                ? "text-rose-400"
                : pipeline?.state === "completed"
                  ? "text-emerald-400"
                  : pipeline
                    ? "text-amber-400"
                    : "text-zinc-500"
            }`}
          >
            {pipeline ? PIPELINE_STATE_LABELS[pipeline.state] : "Henüz başlatılmadı"}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500">Mevcut Aşama</span>
          <span className="text-[10px] font-medium text-zinc-300">
            {currentStep ? STAGE_SHORT_LABELS[currentStep.stage] : "—"}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/[0.02] px-2.5 py-2">
            <p className="text-[13px] font-bold tabular-nums text-emerald-400">{completedSteps.length}</p>
            <p className="text-[9px] text-zinc-600">
              Tamamlanan{completedSteps.length > 0 ? `: ${completedSteps.map((s) => STAGE_SHORT_LABELS[s.stage]).join(", ")}` : ""}
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.02] px-2.5 py-2">
            <p className="text-[13px] font-bold tabular-nums text-zinc-300">{remainingSteps.length}</p>
            <p className="text-[9px] text-zinc-600">
              Kalan{remainingSteps.length > 0 ? `: ${remainingSteps.map((s) => STAGE_SHORT_LABELS[s.stage]).join(", ")}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-[10px] text-zinc-500">Yürütme Sonucu</p>
          {lastFinishedStep?.result ? (
            <p
              className={`mt-1 text-[10px] leading-relaxed ${lastFinishedStep.result.status === "failed" ? "text-rose-400" : "text-zinc-400"}`}
            >
              {actionLabelOf(lastFinishedStep.stage)}: {lastFinishedStep.result.message}
              {lastFinishedStep.result.detail ? ` — ${lastFinishedStep.result.detail}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-zinc-600">Henüz sonuç yok</p>
          )}
        </div>

        {pipelineUiState === "ready" && (
          <button
            type="button"
            onClick={() => onStartPipeline(mission)}
            className="mt-3 flex h-8 w-full items-center justify-center rounded-lg bg-indigo-500 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-indigo-400"
          >
            Hermes Çalıştır
          </button>
        )}
        {pipelineUiState === "gated" && (
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            Önce Founder onayı gerekli — onaylandığında pipeline hemen başlar.
          </p>
        )}
        {pipelineUiState === "waiting" && (
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            Yanıt veya takip zamanı bekleniyor — pipeline henüz başlatılamaz.
          </p>
        )}
        {pipelineUiState === "unsupported" && (
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Bu görev A6&apos;da bağlanacak.</p>
        )}

        <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[9px] leading-relaxed text-zinc-600">
          Güvenli iç aksiyon · Dış iletişim yok
        </p>

        <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
          Pipeline Zaman Akışı
        </p>
        <div className="mt-1.5 max-h-[200px] space-y-1.5 overflow-y-auto">
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
                <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-zinc-400">
                  {item.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Courier Taslağı (v4.1.0-A) — draft prep + founder review, never a send */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Courier Taslağı</p>
        {draft ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-sky-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-sky-400 ring-1 ring-inset ring-sky-500/20">
                {DRAFT_CHANNEL_LABELS[draft.channel]}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] font-semibold text-zinc-300">
                {DRAFT_STATUS_LABELS[draft.status]}
              </span>
            </div>
            {draft.channel === "unknown" && (
              <p className="mt-2 text-[10px] leading-relaxed text-amber-400">{UNVERIFIED_CHANNEL_WARNING}</p>
            )}
            {draft.reason && (
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">{draft.reason}</p>
            )}
            {draft.subject && (
              <div className="mt-2.5">
                <p className={LABEL}>Konu</p>
                <p className={`${VALUE} mt-0.5`}>{draft.subject}</p>
              </div>
            )}
            <textarea
              value={draft.body}
              onChange={(e) => onEditDraft(draft.missionId, e.target.value)}
              disabled={draft.status === "approved" || draft.status === "rejected"}
              rows={7}
              className="mt-2.5 w-full resize-none rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-zinc-200 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-60"
            />
            {draft.status === "edited" && draft.body !== draft.originalBody && (
              <div className="mt-2 rounded-lg bg-white/[0.02] p-2.5">
                <p className={SEC_TITLE}>Orijinal Taslak</p>
                <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-zinc-600">
                  {draft.originalBody}
                </p>
              </div>
            )}
            <div className="mt-2.5 flex gap-1.5">
              <Btn
                label="Onayla"
                variant="primary"
                onClick={() => onApproveDraft(draft.missionId)}
                disabled={draft.status === "approved" || draft.status === "rejected"}
              />
              <Btn
                label="Reddet"
                variant="danger"
                onClick={() => onRejectDraft(draft.missionId)}
                disabled={draft.status === "approved" || draft.status === "rejected"}
              />
            </div>
            {draft.status === "approved" && (
              <p className="mt-2 text-[10px] font-semibold text-emerald-400">
                Onaylandı — {NOT_SENT_LABEL}
              </p>
            )}
            <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[9px] leading-relaxed text-zinc-600">
              {NO_SEND_NOTE}
            </p>
          </>
        ) : manualDraftGuard.ok ? (
          <>
            <p className="text-[10px] leading-relaxed text-zinc-500">{FOUNDER_DECISION_NEEDED}</p>
            <Btn label="Taslak Oluştur" onClick={onCreateDraft} />
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-zinc-600">{manualDraftGuard.reason}</p>
        )}
      </div>

      {/* Delivery Gateway (v4.2.0) — validates, resolves provider, queues to
          "ready", then stops. No send button anywhere in this section. */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Delivery Gateway</p>
        {delivery ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] font-semibold text-zinc-300">
                {DELIVERY_STATUS_LABELS[delivery.status]}
              </span>
              <span className="inline-flex items-center rounded-full bg-sky-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-sky-400 ring-1 ring-inset ring-sky-500/20">
                {DELIVERY_PROVIDER_LABELS[delivery.provider]}
              </span>
            </div>
            <div className="mt-2.5 space-y-2">
              <div className={ROW}>
                <span className={LABEL}>Kanal</span>
                <span className={VALUE}>{DRAFT_CHANNEL_LABELS[delivery.channel]}</span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Alıcı</span>
                <span className={VALUE}>{delivery.recipient ?? "—"}</span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Doğrulama Sonucu</span>
                <span
                  className={`text-[11px] font-medium ${deliveryGuard.allowed ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {deliveryGuard.reason}
                </span>
              </div>
            </div>
            <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              Audit Trail
            </p>
            <div className="mt-1.5 max-h-[160px] space-y-1.5 overflow-y-auto">
              {delivery.audit.map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} className="flex items-baseline gap-2">
                  <span className="w-[34px] shrink-0 text-[9px] tabular-nums text-zinc-600">
                    {new Date(entry.timestamp).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="w-[56px] shrink-0 text-[9px] font-semibold text-indigo-300">
                    {entry.actor}
                  </span>
                  <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-zinc-400">
                    {entry.details}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[9px] leading-relaxed text-zinc-600">
              {GATEWAY_STOP_NOTE}
            </p>
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-zinc-600">
            {draft?.status === "approved"
              ? deliveryGuard.reason
              : "Taslak onaylandığında teslimat isteği otomatik olarak oluşturulur."}
          </p>
        )}
        <p className="mt-2.5 text-[9px] text-zinc-600">{NO_SEND_BUTTON_NOTE}</p>
      </div>

      {/* Provider Connector (v4.4.0) — Shadow Send only. No "Gönder"/"Send"
          button anywhere in this section; live send stays disabled. */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Provider Connector</p>
        {delivery ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-sky-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-sky-400 ring-1 ring-inset ring-sky-500/20">
                {DELIVERY_PROVIDER_LABELS[delivery.provider]}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] font-semibold text-zinc-300">
                {SEND_MODE_LABELS.shadow_send}
              </span>
            </div>
            <div className="mt-2.5 space-y-2">
              <div className={ROW}>
                <span className={LABEL}>Alıcı</span>
                <span className={VALUE}>{delivery.recipient ?? "—"}</span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Connector Durumu</span>
                <span className={VALUE}>
                  {receipt ? RECEIPT_STATUS_LABELS[receipt.status] : "Shadow Send Hazır"}
                </span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Guardrail Sonucu</span>
                <span
                  className={`text-[11px] font-medium ${connectorGuard.allowed ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {connectorGuard.reason}
                </span>
              </div>
            </div>

            {receipt ? (
              <>
                <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
                  Sağlayıcı Önizlemesi
                </p>
                <div className="mt-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-300">
                    {receipt.previewBody}
                  </p>
                </div>
                <p className="mt-2 text-[10px] font-semibold text-sky-400">{receipt.resultMessage}</p>
                <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
                  Audit Trail
                </p>
                <div className="mt-1.5 max-h-[160px] space-y-1.5 overflow-y-auto">
                  {receipt.audit.map((entry, i) => (
                    <div key={`${entry.timestamp}-${i}`} className="flex items-baseline gap-2">
                      <span className="w-[34px] shrink-0 text-[9px] tabular-nums text-zinc-600">
                        {new Date(entry.timestamp).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="w-[56px] shrink-0 text-[9px] font-semibold text-indigo-300">
                        {entry.actor}
                      </span>
                      <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-zinc-400">
                        {entry.details}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : connectorGuard.allowed ? (
              <div className="mt-2.5">
                <Btn label="Shadow Send Önizle" variant="primary" onClick={() => onRunShadowSend(mission.missionId)} />
              </div>
            ) : null}

            <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[9px] leading-relaxed text-zinc-600">
              {SHADOW_SEND_DISCLAIMER}
            </p>
            <p className="mt-1.5 text-[9px] text-zinc-600">
              Canlı gönderim kapalı — Canlı gönderim sonraki sprintte bağlanacak.
            </p>
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-zinc-600">
            Teslimat isteği hazır olduğunda Provider Connector burada görünür.
          </p>
        )}
      </div>

      {/* Provider Session (v4.5.0) — readiness projection only. No setup
          form, no connect button; that flow (if it ever exists) belongs to
          a settings screen, not here. */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Provider Oturumu</p>
        {providerSession ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] font-semibold text-zinc-300">
                {SESSION_STATUS_LABELS[providerSession.status]}
              </span>
              <span
                className={[
                  "inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset",
                  providerSession.health === "healthy"
                    ? "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20"
                    : providerSession.health === "warning"
                      ? "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20"
                      : "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
                ].join(" ")}
              >
                {SESSION_HEALTH_LABELS[providerSession.health]}
              </span>
            </div>

            <div className="mt-2.5 space-y-2">
              <div className={ROW}>
                <span className={LABEL}>Yapılandırma</span>
                <span className={VALUE}>{providerSession.configured ? "Var" : NOT_CONFIGURED_LABEL}</span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Bağlantı</span>
                <span className={VALUE}>{providerSession.connected ? "Bağlandı" : NOT_CONNECTED_LABEL}</span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Yetki</span>
                <span className={VALUE}>{providerSession.authorized ? "Yetkili" : NOT_AUTHORIZED_LABEL}</span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Shadow Send</span>
                <span
                  className={`text-[11px] font-medium ${providerSession.canShadowSend ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {providerSession.canShadowSend ? SHADOW_READY_LABEL : "Kullanılamaz"}
                </span>
              </div>
              <div className={ROW}>
                <span className={LABEL}>Canlı Gönderim</span>
                <span className="text-[11px] font-medium text-rose-400">Canlı Gönderim Kapalı</span>
              </div>
            </div>

            {providerSession.requiresSetup && (
              <p className="mt-2.5 text-[10px] leading-relaxed text-amber-400">
                {SETUP_REQUIRED_LABEL} — {providerSession.setupHint}
              </p>
            )}

            <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              Yetenekler
            </p>
            <div className="mt-1.5 space-y-1.5">
              {providerSession.capabilities.map((cap) => (
                <div key={cap.key} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-[10.5px] font-medium ${cap.enabled ? "text-zinc-200" : "text-zinc-500"}`}>
                      {cap.label}
                    </p>
                    <p className="text-[9px] leading-snug text-zinc-600">{cap.reason}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[9px] font-semibold ${cap.enabled ? "text-emerald-400" : "text-zinc-700"}`}
                  >
                    {cap.enabled ? "Aktif" : "Kapalı"}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2.5 border-t border-white/[0.06] pt-2.5">
              <span className={LABEL}>Hazırlık Sonucu (Shadow)</span>
              <p
                className={`mt-1 text-[11px] font-medium ${providerSessionGuard.allowed ? "text-emerald-400" : "text-rose-400"}`}
              >
                {providerSessionGuard.reason}
              </p>
            </div>

            {delivery?.status === "ready" && providerSession.status !== "ready" && (
              <p className="mt-2 text-[10px] leading-relaxed text-amber-400">{PROVIDER_NOT_LIVE_READY_WARNING}</p>
            )}

            <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-600">
              Audit Trail
            </p>
            <div className="mt-1.5 max-h-[160px] space-y-1.5 overflow-y-auto">
              {providerSession.audit.map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} className="flex items-baseline gap-2">
                  <span className="w-[34px] shrink-0 text-[9px] tabular-nums text-zinc-600">
                    {new Date(entry.timestamp).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="w-[56px] shrink-0 text-[9px] font-semibold text-indigo-300">
                    {entry.actor}
                  </span>
                  <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-zinc-400">
                    {entry.details}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-zinc-600">
            Teslimat isteği hazır olduğunda Provider Oturumu burada görünür.
          </p>
        )}
      </div>

      {/* Shadow-mode note */}
      <div className={SEC}>
        <p className="text-[9px] leading-relaxed text-zinc-600">
          Hermes hiçbir aksiyonu kendisi yürütmez. Bu mission, mevcut Execution
          Runtime kararlarının gölge projeksiyonudur ve her yüklemede yeniden
          hesaplanır.
        </p>
      </div>
    </div>
  );
}

/* ── Empty / summary state ──────────────────────────────────────── */

function SummaryView({
  summary,
  hermesSummary,
  missionCount,
}: {
  summary: AutomationSummary;
  hermesSummary: HermesMonitorSummary;
  missionCount: number;
}) {
  const agentEntries = (
    Object.keys(HERMES_AGENT_REGISTRY) as HermesAgentKey[]
  ).map((key) => ({
    meta: HERMES_AGENT_REGISTRY[key],
    count: hermesSummary.agentTaskCounts[key] ?? 0,
  }));

  return (
    <div className={PANEL}>
      <div className={SEC}>
        <p className={SEC_TITLE}>Hermes Workspace</p>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          AI işgücü çalışıyor — sen denetliyorsun. Mission kuyruğundan bir mission seç,
          Karar Merkezi burada açılır.
        </p>
      </div>

      <div className={SEC}>
        <p className={SEC_TITLE}>Hermes Özeti</p>
        <div className="space-y-2">
          {[
            { label: "Değerlendirilen Lead", value: hermesSummary.leadsEvaluated, color: undefined },
            { label: "Aktif Mission", value: missionCount, color: undefined },
            { label: "Onay Bekliyor", value: hermesSummary.approvalCandidates.length, color: "text-amber-400" },
            { label: "Founder Kararı", value: hermesSummary.escalations.length, color: "text-rose-400" },
            { label: "Otomatik (A4)", value: hermesSummary.decisionCounts.RUN, color: "text-emerald-400" },
            { label: "İzlemede", value: hermesSummary.decisionCounts.WAIT, color: "text-sky-400" },
          ].map((row) => (
            <div key={row.label} className={ROW}>
              <span className={LABEL}>{row.label}</span>
              <span className={`text-[14px] font-bold tabular-nums ${row.color ?? "text-zinc-200"}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={SEC}>
        <p className={SEC_TITLE}>Hermes Ajanları</p>
        <div className="space-y-2">
          {agentEntries.map(({ meta, count }) => (
            <div key={meta.key} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-[10.5px] font-semibold ${count > 0 ? "text-zinc-200" : "text-zinc-500"}`}>
                  {meta.label}
                </p>
                <p className="text-[9px] leading-snug text-zinc-600">{meta.shadowIntent}</p>
              </div>
              <span
                className={`shrink-0 text-[12px] font-bold tabular-nums ${count > 0 ? "text-violet-300" : "text-zinc-700"}`}
              >
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={SEC}>
        <p className={SEC_TITLE}>Genel Durum</p>
        <div className="space-y-2">
          {[
            { label: "Toplam Bekleyen", value: summary.total, color: undefined },
            { label: "Hazır", value: summary.ready, color: "text-emerald-400" },
            { label: "Gecikmiş", value: summary.overdue, color: "text-rose-400" },
            { label: "Engellendi", value: summary.blocked, color: "text-zinc-500" },
          ].map((row) => (
            <div key={row.label} className={ROW}>
              <span className={LABEL}>{row.label}</span>
              <span className={`text-[14px] font-bold tabular-nums ${row.color ?? "text-zinc-200"}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={SEC}>
        <p className={SEC_TITLE}>Kuyruk Özeti</p>
        <div className="space-y-2">
          {summary.queues.map((q) => (
            <div key={q.type} className={ROW}>
              <span className={LABEL}>{q.label}</span>
              <div className="flex items-center gap-2">
                {q.overdue > 0 && (
                  <span className="text-[9px] text-rose-400">{q.overdue} gecikti</span>
                )}
                <span className="text-[13px] font-semibold tabular-nums text-zinc-300">
                  {q.total}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={SEC}>
        <p className={SEC_TITLE}>Bağlı Olmayan</p>
        <p className="text-[10px] leading-relaxed text-zinc-600">
          Kalıcı hata kuyruğu mevcut değil — retry geçmişi oturum belleğinde tutulmuyor.
        </p>
      </div>
    </div>
  );
}

/* ── Lead detail + actions ──────────────────────────────────────── */

function DetailView({ card }: { card: AutomationCard }) {
  const { leadState, markContacted, markNoResponse, markDoNotContact, scheduleFollowUp, reactivateLead, undoLastAction, canUndo } =
    useLeadMutations(card.id);

  const [reEnrich, setReEnrich] = useState<ReEnrichApiState>(EMPTY_ENRICH);
  const [cfState, setCfState] = useState<CfApiState>(EMPTY_CF);
  const [msgState, setMsgState] = useState<MsgApiState>(EMPTY_MSG);

  useEffect(() => {
    setReEnrich(EMPTY_ENRICH);
    setCfState(EMPTY_CF);
    setMsgState(EMPTY_MSG);
  }, [card.id]);

  async function runReEnrich() {
    setReEnrich({ loading: true, result: null, error: null });
    try {
      const res = await fetch("/api/re-enrich-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: card.scoredLead }),
      });
      const data = (await res.json()) as { lead?: Record<string, unknown>; error?: string };
      if (!res.ok || data.error) {
        setReEnrich({ loading: false, result: null, error: data.error ?? `Hata: ${res.status}` });
      } else {
        const l = data.lead as Record<string, unknown>;
        const score =
          typeof l.verifiedOpportunityScore === "number"
            ? l.verifiedOpportunityScore
            : typeof l.opportunityScore === "number"
              ? l.opportunityScore
              : "—";
        const tier = typeof l.opportunityTier === "string" ? l.opportunityTier : "—";
        setReEnrich({
          loading: false,
          result: {
            score,
            tier,
            hasWebsite: !!(l.hasOwnWebsite || l.website),
            hasWhatsApp: !!l.phone,
            hasInstagram: !!l.instagram,
            hasReservationCta: !!(l.hasReservationCta),
            icpScore:
              typeof l.icpFitScore === "number"
                ? l.icpFitScore
                : typeof l.leadScore === "number"
                  ? l.leadScore
                  : "—",
            enrichedAt: Date.now(),
          },
          error: null,
        });
      }
    } catch (e) {
      setReEnrich({
        loading: false,
        result: null,
        error: e instanceof Error ? e.message : "Bağlantı hatası",
      });
    }
  }

  async function runContactFinder() {
    setCfState({ loading: true, result: null, error: null, foundAt: null });
    try {
      const res = await fetch("/api/contact-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: card.website ?? "",
          phone: card.phone ?? "",
          instagram: card.instagram ?? "",
        }),
      });
      const data = (await res.json()) as {
        bestContactType?: string;
        bestContactValue?: string;
        confidence?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        setCfState({ loading: false, result: null, error: data.error ?? `Hata: ${res.status}`, foundAt: null });
      } else {
        setCfState({
          loading: false,
          result: {
            bestContactType: data.bestContactType ?? "—",
            bestContactValue: data.bestContactValue ?? "—",
            confidence: data.confidence ?? "—",
          },
          error: null,
          foundAt: Date.now(),
        });
      }
    } catch (e) {
      setCfState({
        loading: false,
        result: null,
        error: e instanceof Error ? e.message : "Bağlantı hatası",
        foundAt: null,
      });
    }
  }

  async function runGenerateMessage() {
    setMsgState({ loading: true, result: null, error: null, generatedAt: null });
    const lead = card.scoredLead;
    try {
      const res = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          name: lead.name,
          type: lead.type,
          location: lead.city,
          leadScore: lead.leadScore,
          hotScore: lead.hotScore,
          hasWhatsAppPath: !!(lead.phone?.trim()),
          hasInstagram: !!(lead.instagram?.trim()),
          hasOwnWebsite: lead.hasOwnWebsite,
          channels: lead.channels ?? [],
          businessSignals: lead.businessSignals ?? [],
          painPointSummary: lead.painPointSummary ?? [],
          outreachAngle: lead.outreachAngle ?? "",
          outreachIntelligence: lead.outreachIntelligence ?? null,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || data.error) {
        setMsgState({ loading: false, result: null, error: data.error ?? `Hata: ${res.status}`, generatedAt: null });
      } else {
        setMsgState({ loading: false, result: data.message ?? "Mesaj oluşturuldu.", error: null, generatedAt: Date.now() });
      }
    } catch (e) {
      setMsgState({
        loading: false,
        result: null,
        error: e instanceof Error ? e.message : "Bağlantı hatası",
        generatedAt: null,
      });
    }
  }

  const canReEnrich = !!card.website || !!card.phone;
  const canContactFinder = !!card.website || !!card.phone || !!card.instagram;
  const canGenerateMessage = !!card.scoredLead.name;

  const isContacted = leadState.status === "contacted";
  const isDnc = Boolean(leadState.doNotContact);
  const canReactivate = isDnc || leadState.status === "lost";

  const [reactivated, setReactivated] = useState(false);
  const [undone, setUndone] = useState(false);

  function handleReactivate() {
    reactivateLead();
    setReactivated(true);
    setUndone(false);
    setTimeout(() => setReactivated(false), 3000);
  }

  function handleUndo() {
    undoLastAction();
    setReactivated(false);
    setUndone(true);
    setTimeout(() => setUndone(false), 3000);
  }

  return (
    <div className={PANEL}>
      {/* Lead header */}
      <div className={SEC}>
        <p className="text-[14px] font-semibold leading-snug text-zinc-100">{card.hotelName}</p>
        <p className="mt-1 text-[11px] text-zinc-500">{card.city} · {card.hotelType}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/[0.06] px-2 py-[2px] text-[9px] text-zinc-400">
            Fırsat: {card.opportunityScore}
          </span>
          <span
            className={[
              "rounded-full px-2 py-[2px] text-[9px] ring-1 ring-inset",
              card.status === "overdue"
                ? "bg-rose-500/[0.12] text-rose-400 ring-rose-500/20"
                : card.status === "ready"
                  ? "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20"
                  : "bg-zinc-700/50 text-zinc-500 ring-zinc-600/20",
            ].join(" ")}
          >
            {card.statusLabel}
          </span>
        </div>
      </div>

      {/* Primary queue & reason */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Birincil Kuyruk</p>
        <p className="text-[12px] font-semibold text-zinc-200">{card.queueLabel}</p>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-500">{card.reason}</p>
        {card.queues.length > 1 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {card.queues
              .filter((q) => q !== card.primaryQueue)
              .map((q) => (
                <span
                  key={q}
                  className="rounded-full bg-white/[0.05] px-1.5 py-[1px] text-[9px] text-zinc-500"
                >
                  {QUEUE_LABELS[q]}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Contact info */}
      <div className={SEC}>
        <p className={SEC_TITLE}>İletişim</p>
        <div className="space-y-1.5">
          {card.website && (
            <div className={ROW}>
              <span className={LABEL}>Web</span>
              <span className="max-w-[155px] truncate text-[10px] text-sky-400">{card.website}</span>
            </div>
          )}
          {card.phone && (
            <div className={ROW}>
              <span className={LABEL}>Telefon</span>
              <span className={VALUE}>{card.phone}</span>
            </div>
          )}
          {card.instagram && (
            <div className={ROW}>
              <span className={LABEL}>Instagram</span>
              <span className={VALUE}>@{card.instagram.replace(/^@/, "")}</span>
            </div>
          )}
          {!card.website && !card.phone && !card.instagram && (
            <p className="text-[10px] text-zinc-600">İletişim bilgisi yok</p>
          )}
        </div>
      </div>

      {/* AI Message */}
      <div className={SEC}>
        <p className={SEC_TITLE}>AI Mesaj Üret</p>
        <Btn
          label="Mesaj Oluştur"
          loading={msgState.loading}
          disabled={!canGenerateMessage}
          onClick={runGenerateMessage}
        />
        {msgState.result && (
          <div className="mt-3">
            <MessageResultCard
              text={msgState.result}
              generatedAt={msgState.generatedAt}
              phone={card.phone}
            />
          </div>
        )}
        {msgState.error && <ErrorBox error={msgState.error} />}
      </div>

      {/* Contact Finder */}
      <div className={SEC}>
        <p className={SEC_TITLE}>İletişim Bul</p>
        <Btn
          label="Çalıştır — Contact Finder"
          loading={cfState.loading}
          disabled={!canContactFinder}
          onClick={runContactFinder}
        />
        {!canContactFinder && (
          <p className="mt-1.5 text-[10px] text-zinc-600">Web sitesi, telefon veya Instagram gerekli</p>
        )}
        {cfState.result && (
          <div className="mt-3">
            <ContactFoundCard card={card} result={cfState.result} foundAt={cfState.foundAt} />
          </div>
        )}
        {cfState.error && <ErrorBox error={cfState.error} />}
      </div>

      {/* Re-Enrich */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Yeniden Zenginleştir</p>
        <Btn
          label="Çalıştır — Re-Enrich"
          variant="primary"
          loading={reEnrich.loading}
          disabled={!canReEnrich}
          onClick={runReEnrich}
        />
        {!canReEnrich && (
          <p className="mt-1.5 text-[10px] text-zinc-600">Web sitesi veya telefon gerekli</p>
        )}
        {reEnrich.result && (
          <div className="mt-3">
            <EnrichResultCard result={reEnrich.result} />
          </div>
        )}
        {reEnrich.error && <ErrorBox error={reEnrich.error} />}
      </div>

      {/* Lead status card */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Durum</p>
        <LeadStatusCard
          status={leadState.status}
          doNotContact={isDnc}
          lastContactedAt={leadState.lastContactedAt ?? null}
          updatedAt={leadState.updatedAt ?? null}
          nextFollowUpAt={leadState.nextFollowUpAt ?? null}
          contactAttempts={leadState.contactAttempts ?? 0}
        />
      </div>

      {/* Action buttons */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Aksiyonlar</p>
        <div className="space-y-1.5">
          <Btn
            label={isContacted ? "Tekrar İletişim Kuruldu" : "İletişim Kuruldu"}
            onClick={markContacted}
            disabled={isDnc}
          />
          <Btn
            label="Takip Zamanla (24s)"
            onClick={() => scheduleFollowUp(Date.now() + 24 * 60 * 60 * 1000)}
            disabled={isDnc}
          />
          <Btn
            label="Yanıt Yok"
            onClick={markNoResponse}
            disabled={isDnc}
          />
          {!isDnc && (
            <Btn
              label="İletişim Kurma (DNC)"
              variant="danger"
              onClick={markDoNotContact}
            />
          )}
          {canReactivate && (
            <button
              type="button"
              onClick={handleReactivate}
              className="flex h-8 w-full items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/[0.08] px-3 text-[11px] font-semibold text-sky-400 transition-colors duration-150 hover:bg-sky-500/[0.14] hover:text-sky-300"
            >
              Yeniden Aktifleştir
            </button>
          )}
        </div>
        {reactivated && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-2.5">
            <span className="text-[10px] font-semibold text-emerald-400">✓</span>
            <span className="text-[10px] text-emerald-400">Lead yeniden aktifleştirildi</span>
          </div>
        )}
        {canUndo && !undone && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <span className="text-[10px] text-zinc-500">Son işlem geri alınabilir</span>
            <button
              type="button"
              onClick={handleUndo}
              className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-zinc-300 transition-colors duration-150 hover:bg-white/[0.08] hover:text-zinc-100"
            >
              Geri Al
            </button>
          </div>
        )}
        {undone && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-2.5">
            <span className="text-[10px] font-semibold text-emerald-400">✓</span>
            <span className="text-[10px] text-emerald-400">Son işlem geri alındı</span>
          </div>
        )}
      </div>

      {/* Scores */}
      <div className={SEC}>
        <p className={SEC_TITLE}>Puanlar</p>
        <div className="space-y-1.5">
          {[
            { label: "Lead Score", value: card.scoredLead.leadScore },
            { label: "Hot Score", value: card.scoredLead.hotScore },
            { label: "ICP Fit", value: card.scoredLead.icpFitScore ?? "—" },
            { label: "Fırsat Skoru", value: card.opportunityScore },
          ].map((r) => (
            <div key={r.label} className={ROW}>
              <span className={LABEL}>{r.label}</span>
              <span className={VALUE}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Last activity */}
      {card.lastActivityLabel !== "—" && (
        <div className={SEC}>
          <p className={SEC_TITLE}>Son Aktivite</p>
          <p className="text-[11px] text-zinc-400">{card.lastActivityLabel}</p>
          {card.scoredLead.lastEnrichedAt && (
            <p className="mt-1 text-[10px] text-zinc-600">
              Zenginleştirme: {new Date(card.scoredLead.lastEnrichedAt).toLocaleDateString("tr-TR")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Export ─────────────────────────────────────────────────────── */

type Props = {
  selectedCard: AutomationCard | null;
  summary: AutomationSummary;
  hermesSummary: HermesMonitorSummary;
  missionCount: number;
  selectedHermesMission: HermesMission | null;
  selectedHermesMomentum: OperationalMomentum | null;
  onApproveMission: (mission: HermesMission) => void;
  onRejectTask: (taskId: string) => void;
  pipeline: HermesPipeline | null;
  onStartPipeline: (mission: HermesMission) => void;
  draft: HermesOutboundDraft | null;
  manualDraftGuard: DraftGuardResult;
  onCreateDraft: () => void;
  onEditDraft: (missionId: string, body: string) => void;
  onApproveDraft: (missionId: string) => void;
  onRejectDraft: (missionId: string) => void;
  delivery: HermesDeliveryRequest | null;
  deliveryGuard: DeliveryGuardResult;
  receipt: HermesProviderReceipt | null;
  connectorGuard: ProviderGuardResult;
  onRunShadowSend: (missionId: string) => void;
  providerSession: HermesProviderSession | null;
  providerSessionGuard: ProviderSessionGuardResult;
};

export default function AutomationCenterContextPanel({
  selectedCard,
  summary,
  hermesSummary,
  missionCount,
  selectedHermesMission,
  selectedHermesMomentum,
  onApproveMission,
  onRejectTask,
  pipeline,
  onStartPipeline,
  draft,
  manualDraftGuard,
  onCreateDraft,
  onEditDraft,
  onApproveDraft,
  onRejectDraft,
  delivery,
  deliveryGuard,
  receipt,
  connectorGuard,
  onRunShadowSend,
  providerSession,
  providerSessionGuard,
}: Props) {
  if (selectedHermesMission) {
    return (
      <MissionDecisionCenter
        key={selectedHermesMission.missionId}
        mission={selectedHermesMission}
        momentum={selectedHermesMomentum}
        pipeline={pipeline}
        onApprove={onApproveMission}
        onReject={onRejectTask}
        onStartPipeline={onStartPipeline}
        draft={draft}
        manualDraftGuard={manualDraftGuard}
        onCreateDraft={onCreateDraft}
        onEditDraft={onEditDraft}
        onApproveDraft={onApproveDraft}
        onRejectDraft={onRejectDraft}
        delivery={delivery}
        deliveryGuard={deliveryGuard}
        receipt={receipt}
        connectorGuard={connectorGuard}
        onRunShadowSend={onRunShadowSend}
        providerSession={providerSession}
        providerSessionGuard={providerSessionGuard}
      />
    );
  }
  if (!selectedCard) {
    return <SummaryView summary={summary} hermesSummary={hermesSummary} missionCount={missionCount} />;
  }
  return <DetailView key={selectedCard.id} card={selectedCard} />;
}
