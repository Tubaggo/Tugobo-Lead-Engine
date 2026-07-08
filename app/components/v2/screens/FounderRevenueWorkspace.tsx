"use client";

import { useEffect, useState } from "react";
import type { HermesMission } from "@/app/components/v2/adapters/hermes-mission-adapter";
import {
  computeActionQueue,
  computeHermesHealth,
  computeHermesTimeline,
  computeMissionFocus,
  computeRevenueSummary,
  type ActionStage,
} from "@/app/components/v2/adapters/founder-revenue-workspace-adapter";
import type { ProcessedWhatsAppDeliveryReceipt } from "@/app/lib/whatsapp-delivery-receipt-processor";
import type { WhatsAppReadinessStatus } from "@/app/lib/whatsapp-provider-runtime";
import type { StoredWhatsAppReply } from "@/app/lib/whatsapp-reply-registry";
import type { ReplyIntelligenceItem } from "@/app/lib/reply-intelligence-runtime";
import type { DemoScheduleItem } from "@/app/lib/demo-scheduling-runtime";
import { kpiLabelCls, kpiStripCls, kpiSubCls, kpiValueCls, sectionLabelCls } from "@/app/components/v2/design-system";

/**
 * Founder Revenue Workspace (v6.1, replies added in v6.2, reply
 * intelligence added in v6.3, demo scheduling added in v6.4).
 *
 * The default view of the Hermes screen — a pure, read-only aggregation of
 * runtime state that already exists (missions, founder decisions, WhatsApp
 * delivery receipts, inbound WhatsApp replies, deterministic reply
 * classifications, demo scheduling opportunities). It never mutates
 * anything itself — selecting a mission reuses the screen's existing
 * `onSelectHermesMission`, the same callback the Developer Mode mission
 * queue already uses. Demo status changes happen only through
 * `DemoSchedulingCard`'s buttons (Developer Mode), never from this view.
 * Five self-contained fetches (`/api/hermes/providers/whatsapp/status`,
 * `/api/hermes/providers/whatsapp/delivery-receipts`,
 * `/api/hermes/providers/whatsapp/replies`,
 * `/api/hermes/reply-intelligence`, `/api/hermes/demo-scheduling`) reuse
 * existing GET routes — no new mutation logic here. Classification only
 * ever surfaces as an intent badge and a Turkish action hint — no reply
 * body, no auto-response, no send, no calendar integration.
 *
 * `demoPendingCount` (the "Demo Bekleyen" tile) was redefined in v6.4: it
 * used to be a heuristic over mission stage/task-type (v6.1); now it counts
 * real `demo_requested`/`scheduling_needed` items from the Demo Scheduling
 * Registry — the same tile, a more accurate source.
 *
 * Deliberately does not render Mission Runtime cards, the Provider
 * Registry, Policy Runtime, Courier Runtime, or Delivery Gateway objects —
 * those stay in Developer Mode. Everything here is operational language.
 */

type Props = {
  missions: HermesMission[];
  selectedHermesMissionId: string | null;
  onSelectHermesMission: (mission: HermesMission) => void;
};

const ACTION_STAGE_BADGE_CLS: Record<ActionStage, string> = {
  failed: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  hot_reply: "bg-orange-500/[0.10] text-orange-400 ring-orange-500/20",
  demo_pending: "bg-teal-500/[0.10] text-teal-400 ring-teal-500/20",
  reply_needs_review: "bg-zinc-500/[0.10] text-zinc-300 ring-zinc-500/20",
  reply_received: "bg-fuchsia-500/[0.10] text-fuchsia-400 ring-fuchsia-500/20",
  approval_required: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  read: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  delivered: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  sent: "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20",
  ready: "bg-violet-500/[0.10] text-violet-300 ring-violet-500/20",
  unknown: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

function formatTime(at: number): string {
  return at > 0 ? new Date(at).toLocaleString("tr-TR") : "—";
}

export default function FounderRevenueWorkspace({ missions, selectedHermesMissionId, onSelectHermesMission }: Props) {
  const [recentReceipts, setRecentReceipts] = useState<ProcessedWhatsAppDeliveryReceipt[]>([]);
  const [receiptsReachable, setReceiptsReachable] = useState<boolean | null>(null);
  const [whatsappReadinessStatus, setWhatsappReadinessStatus] = useState<WhatsAppReadinessStatus | null>(null);
  const [recentReplies, setRecentReplies] = useState<StoredWhatsAppReply[]>([]);
  const [recentIntelligence, setRecentIntelligence] = useState<ReplyIntelligenceItem[]>([]);
  const [recentDemoItems, setRecentDemoItems] = useState<DemoScheduleItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/delivery-receipts");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { receipts?: ProcessedWhatsAppDeliveryReceipt[] };
        if (!cancelled) {
          setRecentReceipts(data.receipts ?? []);
          setReceiptsReachable(true);
        }
      } catch {
        if (!cancelled) setReceiptsReachable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/replies");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { replies?: StoredWhatsAppReply[] };
        if (!cancelled) setRecentReplies(data.replies ?? []);
      } catch {
        // leave empty — "Cevap Geldi" summary reports 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/reply-intelligence");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: ReplyIntelligenceItem[] };
        if (!cancelled) setRecentIntelligence(data.items ?? []);
      } catch {
        // leave empty — "Sıcak Cevap" summary reports 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/demo-scheduling");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items?: DemoScheduleItem[] };
        if (!cancelled) setRecentDemoItems(data.items ?? []);
      } catch {
        // leave empty — "Demo Bekleyen" summary reports 0 rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hermes/providers/whatsapp/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { readinessStatus?: WhatsAppReadinessStatus };
        if (!cancelled && data.readinessStatus) setWhatsappReadinessStatus(data.readinessStatus);
      } catch {
        // leave null — health card reports "Bilinmiyor" rather than guessing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = computeRevenueSummary(missions, recentReceipts, recentReplies, recentIntelligence, recentDemoItems);
  const queue = computeActionQueue(missions, recentReceipts, recentReplies, recentIntelligence, recentDemoItems);
  const timeline = computeHermesTimeline(missions, recentReceipts);
  const health = computeHermesHealth({
    hermesRuntimeAvailable: true,
    whatsappReadinessStatus,
    deliveryFeedReachable: receiptsReachable,
  });

  const selectedMission = missions.find((m) => m.missionId === selectedHermesMissionId) ?? null;
  const focus = selectedMission
    ? computeMissionFocus(selectedMission, recentReceipts, recentReplies, recentIntelligence, recentDemoItems)
    : null;

  return (
    <div>
      {/* Section 1 — Revenue Summary */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Gelir Özeti</p>
        <div className={kpiStripCls}>
          <SummaryTile label="Toplam Aktif Mission" value={summary.totalActiveMissions} />
          <SummaryTile label="Founder Onayı Bekleyen" value={summary.founderApprovalPending} />
          <SummaryTile label="Sıcak Cevap" value={summary.hotReplyCount} accent="text-orange-400" />
          <SummaryTile label="Cevap Geldi" value={summary.replyReceivedCount} accent="text-fuchsia-400" />
          <SummaryTile label="Gönderildi" value={summary.sentCount} />
          <SummaryTile label="Teslim Edildi" value={summary.deliveredCount} />
          <SummaryTile label="Okundu" value={summary.readCount} />
          <SummaryTile label="Başarısız" value={summary.failedCount} accent="text-rose-400" />
          <SummaryTile label="Demo Bekleyen" value={summary.demoPendingCount} />
          <SummaryTile label="Needs Attention" value={summary.needsAttentionCount} accent="text-amber-400" />
        </div>
      </div>

      {/* Section 2 — Action Queue */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>İş Kuyruğu</p>
        {queue.length === 0 ? (
          <p className="text-[11px] text-zinc-600">Şu anda dikkat gerektiren bir mission yok.</p>
        ) : (
          <div className="space-y-1.5">
            {queue.map((item) => (
              <button
                key={item.missionId}
                type="button"
                onClick={() => {
                  const mission = missions.find((m) => m.missionId === item.missionId);
                  if (mission) onSelectHermesMission(mission);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                  item.missionId === selectedHermesMissionId
                    ? "border-indigo-500/40 bg-indigo-500/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[11px] font-semibold text-zinc-200">{item.hotelName}</span>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${ACTION_STAGE_BADGE_CLS[item.stage]}`}
                    >
                      {item.stageLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-zinc-500">{item.suggestedAction}</p>
                </div>
                <span className="shrink-0 text-[9px] text-zinc-600">{item.currentStageLabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Section 3 — Mission Focus */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Mission Odağı</p>
        {!focus ? (
          <p className="text-[11px] text-zinc-600">İncelemek için yukarıdaki kuyruktan bir mission seçin.</p>
        ) : (
          <div className="space-y-1.5 rounded-lg bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Otel</span>
              <span className="text-[11px] font-semibold text-zinc-200">{focus.hotelName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Mevcut Mission</span>
              <span className="text-[10px] text-zinc-300">{focus.currentMissionLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Aşama</span>
              <span className="text-[10px] text-zinc-300">{focus.currentStageLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">WhatsApp Durumu</span>
              <span className="text-[10px] text-zinc-300">{focus.whatsappStatusLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Teslimat Durumu</span>
              <span className="text-[10px] text-zinc-300">{focus.deliveryStateLabel}</span>
            </div>
            {focus.latestReceiptLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Son Makbuz</span>
                <span className="text-[10px] text-zinc-300">{focus.latestReceiptLabel}</span>
              </div>
            )}
            {focus.demoStatusLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Demo Durumu</span>
                <span className="text-[10px] text-teal-300">{focus.demoStatusLabel}</span>
              </div>
            )}
            {focus.demoScheduledAtLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">Planlanan Zaman</span>
                <span className="text-[10px] text-zinc-300">{focus.demoScheduledAtLabel}</span>
              </div>
            )}
            {focus.demoSuggestedAction && (
              <p className="text-[10px] font-medium text-teal-300">{focus.demoSuggestedAction}</p>
            )}
            <p className="border-t border-white/[0.06] pt-2 text-[10px] font-medium text-indigo-300">
              {focus.suggestedNextAction}
            </p>
          </div>
        )}
      </div>

      {/* Section 4 — Hermes Timeline */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Hermes Zaman Akışı</p>
        {timeline.length === 0 ? (
          <p className="text-[11px] text-zinc-600">Henüz kayıtlı bir aktivite yok.</p>
        ) : (
          <ul className="space-y-1.5">
            {timeline.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-zinc-400">{event.label}</span>
                <span className="shrink-0 text-[9px] text-zinc-600">{formatTime(event.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Section 5 — Hermes Health */}
      <div className="px-5 py-3">
        <p className={`${sectionLabelCls} mb-2`}>Hermes Sağlığı</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HealthTile label="Hermes Runtime" value={health.hermesRuntimeLabel} />
          <HealthTile label="WhatsApp" value={health.whatsappLabel} />
          <HealthTile label="Teslimat" value={health.deliveryLabel} />
          <HealthTile label="Mission Bridge" value={health.missionBridgeLabel} />
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className={kpiLabelCls}>{label}</p>
      <p className={`${kpiValueCls} ${accent ?? "text-zinc-100"} mt-1`}>{value}</p>
      <p className={kpiSubCls}>&nbsp;</p>
    </div>
  );
}

function HealthTile({ label, value }: { label: string; value: string }) {
  const healthy = value === "Sağlıklı" || value === "Bağlı" || value === "Çalışıyor";
  return (
    <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthy ? "bg-emerald-400" : "bg-zinc-500"}`} />
        <span className="text-[11px] font-medium text-zinc-200">{value}</span>
      </div>
    </div>
  );
}

