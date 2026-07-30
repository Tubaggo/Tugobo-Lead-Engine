"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ScoredLead } from "@/app/lib/leads";
import { whatsappLinkWithText } from "@/app/lib/leads";
import * as operationalState from "@/app/lib/operational-state/client";
import type { OutreachStance } from "@/app/lib/outreach/lifecycle";
import { isStaleCopyDraft, messageWorkspaceGuard } from "@/app/lib/outreach/workspace";
import { useLeadMessageWorkspace } from "@/app/components/LeadMessageEditor";
import {
  computeLeadPreparationAction,
  PREPARATION_ACTION_LABELS_TR,
  type PreparationAction,
} from "@/app/lib/hermes-runtime/lead-preparation";

/**
 * Minimal Founder workspace for the Hermes daily loop (v3.8.1).
 *
 * Deliberately not a redesign and not a port of `main`'s `/v2` shell: this is
 * the smallest usable surface over the new durable daily-run API — a queue,
 * a selected lead, why-today reasons, and the founder actions that mutate
 * durable state through `POST /api/hermes/daily-run/action`. Every number and
 * label rendered here comes from the server response; nothing is computed
 * client-side.
 */

type ActionStage =
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

type MessageReadiness = "ready" | "needs_research" | "missing_channel" | "not_required";

type FounderActionReason = {
  code: string;
  priority: number;
  explanationTr: string;
  evidenceRefs: string[];
};

type LeadPreparationStatus =
  | "review_required"
  | "needs_channel"
  | "needs_research"
  | "needs_draft"
  | "draft_stale"
  | "ready";

type LeadPreparationBlocker = {
  code: string;
  severity: "blocking" | "warning";
  explanationTr: string;
  sourceRefs: string[];
  repairAction: "REENRICH" | "GENERATE_DRAFT" | "REGENERATE_DRAFT" | "REVIEW_DRAFT" | "NONE";
};

type LeadPreparationChecks = {
  websiteEvidence: boolean;
  verifiedWhatsApp: boolean;
  instagramKnown: boolean;
  otaKnown: boolean;
  usableEvidence: boolean;
  draftExists: boolean;
  draftCurrentVersion: boolean;
  draftEvidenceCurrent: boolean;
};

type LeadPreparationAssessment = {
  status: LeadPreparationStatus;
  blockers: LeadPreparationBlocker[];
  checks: LeadPreparationChecks;
  recommendedAction: string;
  evidenceFingerprint: string;
};

type DailyActionItem = {
  id: string;
  leadId: string;
  missionId: string;
  hotelName: string;
  actionState: ActionStage;
  stageLabel: string;
  rank: number;
  recommendedAction: string;
  reasonCodes: FounderActionReason[];
  messageReadiness: MessageReadiness;
  preparation: LeadPreparationAssessment;
  dueAt: string | null;
  updatedAt: string;
};

type DailyRunSummary = {
  scanned: number;
  actionable: number;
  waitingFounder: number;
  followUpDue: number;
  replyAttention: number;
  demoPending: number;
  completed: number;
};

type DailyRun = {
  id: string;
  localDate: string;
  status: "idle" | "running" | "waiting_founder" | "completed";
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  queueRevision: number;
  currentItemId: string | null;
  itemIds: string[];
  skippedItemIds: string[];
  summary: DailyRunSummary;
};

type DailyRunResponse = {
  run: DailyRun | null;
  items: DailyActionItem[];
  summary: DailyRunSummary;
};

const RUN_STATUS_LABELS: Record<DailyRun["status"], string> = {
  idle: "Başlamadı",
  running: "Taranıyor",
  waiting_founder: "Karar Bekliyor",
  completed: "Tamamlandı",
};

const READINESS_LABELS: Record<MessageReadiness, string> = {
  ready: "Mesaj hazır",
  needs_research: "Araştırma gerekiyor",
  missing_channel: "Kanal doğrulanmadı",
  not_required: "Gerekli değil",
};

const PREPARATION_STATUS_LABELS: Record<LeadPreparationStatus, string> = {
  review_required: "İnceleme Gerekiyor",
  needs_channel: "Kanal Gerekiyor",
  needs_research: "Araştırma Gerekiyor",
  needs_draft: "Taslak Gerekiyor",
  draft_stale: "Taslak Eski",
  ready: "Hazır",
};

const PREPARATION_STATUS_TONE: Record<LeadPreparationStatus, string> = {
  review_required: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  needs_channel: "border-red-500/30 bg-red-500/10 text-red-200",
  needs_research: "border-red-500/30 bg-red-500/10 text-red-200",
  needs_draft: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  draft_stale: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

/**
 * Which `actionState` values can only be reached once a mission has already
 * passed its approval gate (`mission.stage` is `execution-ready` or later —
 * see `action-stage.ts`'s `actionStageOf`). Everything not in this set
 * (`approval_required`, and `unknown` for a mission still in an earlier
 * stage) is treated as "not yet approved" — the safe direction, since
 * re-approving an already-approved draft is a harmless no-op but skipping
 * approval is not.
 */
const APPROVED_OR_BEYOND_STATES = new Set<ActionStage>([
  "ready",
  "sent",
  "delivered",
  "read",
  "hot_reply",
  "demo_pending",
  "follow_up_required",
  "outcome_required",
  "reply_needs_review",
  "reply_received",
  "won",
  "lost",
  "failed",
]);

/** First-contact unless the ladder itself already says otherwise — no new business logic, just reading `actionState`. */
function stanceForActionState(actionState: ActionStage): OutreachStance {
  if (actionState === "demo_pending") return "demo_confirm";
  if (actionState === "follow_up_required") return "follow_up";
  return "first_contact";
}

function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function HermesDailyWorkspace() {
  const localDate = useMemo(() => todayLocalDate(), []);
  const [run, setRun] = useState<DailyRun | null>(null);
  const [items, setItems] = useState<DailyActionItem[]>([]);
  const [summary, setSummary] = useState<DailyRunSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Full roster lead for whichever item is selected — the message engine
   * (`generateOutreachStylePack`) needs the whole `ScoredLead`, not the thin
   * queue-item projection. Read-only GET of the same canonical roster
   * `runReenrichment` already reads; never a provider call.
   */
  const [roster, setRoster] = useState<ScoredLead[]>([]);
  /** The leadId the operational-state mirror has been freshly hydrated for, so the message workspace hook never mounts against stale or empty mirror state. */
  const [leadWorkspaceReady, setLeadWorkspaceReady] = useState<string | null>(null);
  const [channel, setChannel] = useState<"whatsapp" | "phone" | "instagram" | "email">("whatsapp");
  const [followUpPreset, setFollowUpPreset] = useState<1 | 3>(1);
  const [replyIntent, setReplyIntent] = useState("interested");
  const [replyUrgency, setReplyUrgency] = useState("medium");
  const [outcomeStatus, setOutcomeStatus] = useState("won");
  const [outcomePackage, setOutcomePackage] = useState("professional");
  const [outcomeMrr, setOutcomeMrr] = useState("");
  const [outcomeLostReason, setOutcomeLostReason] = useState("budget");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [reenrichLoading, setReenrichLoading] = useState(false);
  const [reenrichError, setReenrichError] = useState<string | null>(null);
  const [reenrichNotice, setReenrichNotice] = useState<string | null>(null);

  const applyResponse = useCallback((data: DailyRunResponse) => {
    setRun(data.run);
    setItems(data.items ?? []);
    setSummary(data.summary ?? data.run?.summary ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hermes/daily-run?localDate=${localDate}`, {
        cache: "no-store",
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        setError((data?.error as string) ?? "Yüklenemedi");
        return;
      }
      applyResponse(data as unknown as DailyRunResponse);
    } finally {
      setLoading(false);
    }
  }, [localDate, applyResponse]);

  useEffect(() => {
    // Fetching on mount is the point of this effect; the state `load` sets
    // arrives from the network after an await, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === run?.currentItemId) ?? null,
    [items, run],
  );
  // A primitive, not the item object: `items` is a fresh array on every
  // queue refresh (i.e. after every founder action), so `selectedItem` would
  // otherwise be a new reference each time even when the same lead is still
  // selected — which would re-fetch the draft below and silently discard
  // whatever the founder had just typed into `currentMessage`.
  const selectedLeadId = selectedItem?.leadId ?? null;
  const selectedRosterLead = useMemo(
    () => roster.find((lead) => lead.id === selectedLeadId) ?? null,
    [roster, selectedLeadId],
  );

  /**
   * Roster read — once on mount. A read of already-persisted canonical state
   * (the same GET `runReenrichment` below already uses), never a provider
   * call: nothing here crawls a website, calls an LLM, or reaches WhatsApp.
   */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/operational-workspace/roster", { cache: "no-store" })
      .then(parseJsonSafe)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.roster) ? (data.roster as ScoredLead[]) : [];
        setRoster(list);
      })
      .catch(() => {
        // A failed roster read leaves the message workspace panel showing its
        // own "lead not found" state; the queue itself is unaffected.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Hydrates the shared operational-state mirror for the selected lead
   * before the message-workspace hook mounts against it — otherwise its
   * first read would see an empty mirror entry and default `activeTone`
   * to "soft" even when the server has something else on file. A GET of
   * already-persisted state, not a provider call.
   */
  useEffect(() => {
    if (!selectedLeadId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeadWorkspaceReady(null);
      return;
    }
    let cancelled = false;
    setLeadWorkspaceReady(null);
    void operationalState.refreshLead(selectedLeadId).finally(() => {
      if (!cancelled) setLeadWorkspaceReady(selectedLeadId);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedLeadId]);

  const startHermes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/daily-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        setError((data?.error as string) ?? "Başlatılamadı");
        return;
      }
      applyResponse(data as unknown as DailyRunResponse);
    } finally {
      setLoading(false);
    }
  }, [localDate, applyResponse]);

  const refreshQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/daily-run/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        setError((data?.error as string) ?? "Yenilenemedi");
        return;
      }
      applyResponse(data as unknown as DailyRunResponse);
    } finally {
      setLoading(false);
    }
  }, [localDate, applyResponse]);

  const doAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/hermes/daily-run/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ localDate, action, ...payload }),
        });
        const data = await parseJsonSafe(res);
        if (!res.ok) {
          setError((data?.error as string) ?? "Aksiyon başarısız");
          return;
        }
        applyResponse(data as unknown as DailyRunResponse);
      } finally {
        setLoading(false);
      }
    },
    [localDate, applyResponse],
  );

  /**
   * "Yeniden Zenginleştir" — the only network/provider-calling action this
   * component makes, and only ever from an explicit click. Reuses the
   * existing `/api/re-enrich-lead` route and the existing whole-roster
   * persistence path (`/api/operational-workspace/roster`) — the same one
   * `Dashboard.tsx`'s own re-enrich flow uses — rather than inventing a
   * second write path for the same canonical data. Ends with `refreshQueue`
   * so `preparation` on every item reflects the fresh roster immediately.
   */
  const runReenrichment = useCallback(async () => {
    if (!selectedItem) return;
    setReenrichLoading(true);
    setReenrichError(null);
    setReenrichNotice(null);
    try {
      const rosterRes = await fetch("/api/operational-workspace/roster", { cache: "no-store" });
      const rosterData = await parseJsonSafe(rosterRes);
      if (!rosterRes.ok) {
        setReenrichError((rosterData?.error as string) ?? "Roster okunamadı");
        return;
      }
      const freshRoster = Array.isArray(rosterData?.roster)
        ? (rosterData.roster as ScoredLead[])
        : [];
      const index = freshRoster.findIndex((lead) => lead.id === selectedItem.leadId);
      if (index === -1) {
        setReenrichError("Bu lead roster'da bulunamadı.");
        return;
      }

      const enrichRes = await fetch("/api/re-enrich-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: freshRoster[index] }),
      });
      const enrichData = await parseJsonSafe(enrichRes);
      if (!enrichRes.ok) {
        setReenrichError((enrichData?.error as string) ?? "Zenginleştirme başarısız");
        return;
      }
      const enrichedLead = enrichData?.lead;
      if (!enrichedLead || typeof enrichedLead !== "object") {
        setReenrichError("Zenginleştirme sonucu boş döndü.");
        return;
      }

      const updatedRoster = [...freshRoster];
      updatedRoster[index] = enrichedLead as ScoredLead;
      const putRes = await fetch("/api/operational-workspace/roster", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roster: updatedRoster }),
      });
      if (!putRes.ok) {
        const putData = await parseJsonSafe(putRes);
        setReenrichError((putData?.error as string) ?? "Roster güncellenemedi");
        return;
      }

      // The panel's message-generation/stance logic reads `roster` from
      // component state, not from a fresh fetch — without this, a founder
      // who just re-enriched would still see the pre-enrichment lead fields
      // until a full page reload.
      setRoster(updatedRoster);
      setReenrichNotice("Zenginleştirme tamamlandı — hazırlık durumu güncellendi.");
      await refreshQueue();
    } finally {
      setReenrichLoading(false);
    }
  }, [selectedItem, refreshQueue]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/60 px-4 py-3.5">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50">Hermes Günlük Döngü</h1>
          <p className="text-xs text-zinc-400">
            {localDate} · {run ? RUN_STATUS_LABELS[run.status] : "Başlamadı"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void startHermes()}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {run ? "Devam Et" : "Hermes'i Çalıştır"}
          </button>
          <button
            type="button"
            onClick={() => void refreshQueue()}
            disabled={loading || !run}
            className="rounded-lg border border-white/10 px-3.5 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
          >
            Bugünkü Kuyruğu Yenile
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(
            [
              ["Tarandı", summary.scanned],
              ["Aksiyon Bekliyor", summary.actionable],
              ["Karar Bekliyor", summary.waitingFounder],
              ["Takip Geldi", summary.followUpDue],
              ["Cevap İlgisi", summary.replyAttention],
              ["Demo Bekliyor", summary.demoPending],
              ["Tamamlandı", summary.completed],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-white/[0.06] bg-zinc-900/50 px-3 py-2.5"
            >
              <p className="text-[11px] text-zinc-400">{label}</p>
              <p className="text-lg font-semibold text-zinc-50">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_5fr]">
        <section className="rounded-xl border border-white/[0.06] bg-zinc-900/40">
          <ul className="divide-y divide-white/[0.06]">
            {items.length === 0 ? (
              <li className="px-4 py-6 text-sm text-zinc-500">
                {run ? "Kuyrukta aksiyon yok." : "Henüz başlatılmadı."}
              </li>
            ) : (
              items.map((item) => {
                const isCurrent = item.id === run?.currentItemId;
                const isSkipped = run?.skippedItemIds.includes(item.id) ?? false;
                // A quick-action label only — it selects this row via the
                // existing `SELECT_ITEM` action and nothing else; the actual
                // handoff logic lives entirely in `LeadOutreachHandoffPanel`
                // once selected. No rank/preparation is computed here.
                const quickAction = computeLeadPreparationAction({
                  status: item.preparation.status,
                  approvalPending: !APPROVED_OR_BEYOND_STATES.has(item.actionState),
                });
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void doAction("SELECT_ITEM", { itemId: item.id })}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-white/[0.03] ${
                        isCurrent ? "bg-indigo-500/10" : ""
                      } ${isSkipped ? "opacity-50" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-zinc-100">
                          {item.hotelName || item.leadId}
                        </span>
                        <span className="block truncate text-xs text-zinc-400">
                          {item.recommendedAction}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">
                          {PREPARATION_ACTION_LABELS_TR[quickAction]}
                        </span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300">
                          {item.stageLabel}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4">
          {!selectedItem ? (
            <p className="text-sm text-zinc-500">Kuyruktan bir lead seçin.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-50">
                  {selectedItem.hotelName || selectedItem.leadId}
                </h2>
                <p className="text-xs text-zinc-400">
                  {selectedItem.stageLabel} · {READINESS_LABELS[selectedItem.messageReadiness]}
                  {selectedItem.dueAt
                    ? ` · Takip: ${new Date(selectedItem.dueAt).toLocaleString("tr-TR")}`
                    : ""}
                </p>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-zinc-950/40 p-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Neden bugün?
                </p>
                <ul className="flex flex-col gap-1">
                  {selectedItem.reasonCodes.length === 0 ? (
                    <li className="text-xs text-zinc-500">Belirgin bir sebep yok.</li>
                  ) : (
                    selectedItem.reasonCodes.map((reason) => (
                      <li key={reason.code} className="text-xs text-zinc-300">
                        {reason.explanationTr}
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-zinc-950/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Hazırlık Durumu
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${PREPARATION_STATUS_TONE[selectedItem.preparation.status]}`}
                  >
                    {PREPARATION_STATUS_LABELS[selectedItem.preparation.status]}
                  </span>
                </div>

                <p className="mb-2 text-xs text-zinc-300">
                  {selectedItem.preparation.recommendedAction}
                </p>

                <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                  {(
                    [
                      ["websiteEvidence", "Website kanıtı"],
                      ["verifiedWhatsApp", "WhatsApp doğrulandı"],
                      ["instagramKnown", "Instagram biliniyor"],
                      ["otaKnown", "OTA biliniyor"],
                      ["usableEvidence", "Kullanılabilir kanıt"],
                      ["draftExists", "Taslak var"],
                      ["draftCurrentVersion", "Taslak sürümü güncel"],
                      ["draftEvidenceCurrent", "Kanıt güncel"],
                    ] as const
                  ).map(([key, label]) => (
                    <li key={key} className="flex items-center gap-1">
                      <span
                        className={
                          selectedItem.preparation.checks[key] ? "text-emerald-400" : "text-zinc-600"
                        }
                      >
                        {selectedItem.preparation.checks[key] ? "✓" : "○"}
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>

                {selectedItem.preparation.blockers.length > 0 ? (
                  <ul className="mb-3 flex flex-col gap-1">
                    {selectedItem.preparation.blockers.map((blocker) => (
                      <li
                        key={blocker.code}
                        className={`text-xs ${blocker.severity === "blocking" ? "text-red-300" : "text-amber-300"}`}
                      >
                        {blocker.explanationTr}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {reenrichError ? (
                  <p className="mb-2 text-xs text-red-300">{reenrichError}</p>
                ) : null}
                {reenrichNotice ? (
                  <p className="mb-2 text-xs text-emerald-300">{reenrichNotice}</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void runReenrichment()}
                  disabled={reenrichLoading}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                    selectedItem.preparation.status === "needs_research" ||
                    selectedItem.preparation.status === "needs_channel"
                      ? "bg-indigo-600 hover:bg-indigo-500 ring-2 ring-indigo-400/40"
                      : "bg-zinc-700 hover:bg-zinc-600"
                  }`}
                >
                  {reenrichLoading ? "Zenginleştiriliyor…" : "Yeniden Zenginleştir"}
                </button>
              </div>

              {selectedRosterLead && leadWorkspaceReady === selectedItem.leadId ? (
                <LeadOutreachHandoffPanel
                  key={selectedItem.leadId}
                  item={selectedItem}
                  lead={selectedRosterLead}
                  channel={channel}
                  setChannel={setChannel}
                  followUpPreset={followUpPreset}
                  setFollowUpPreset={setFollowUpPreset}
                  doAction={doAction}
                  refreshQueue={refreshQueue}
                  globalLoading={loading}
                />
              ) : (
                <p className="text-xs text-zinc-500">Mesaj çalışma alanı yükleniyor…</p>
              )}

              <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  onClick={() => void doAction("SKIP_ITEM", { itemId: selectedItem.id })}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                >
                  Atla
                </button>
                <button
                  type="button"
                  onClick={() => void doAction("SNOOZE_ITEM", { itemId: selectedItem.id })}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                >
                  Ertele
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void doAction("PLAN_FOLLOW_UP", {
                      missionId: selectedItem.missionId,
                      leadId: selectedItem.leadId,
                      reason: "manual",
                      presetDays: followUpPreset,
                    })
                  }
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                >
                  Takip Planla ({followUpPreset}g)
                </button>
                <button
                  type="button"
                  onClick={() => void doAction("COMPLETE_ITEM", { itemId: selectedItem.id })}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                >
                  Tamamlandı İşaretle
                </button>
              </div>

              <details className="rounded-lg border border-white/[0.06] bg-zinc-950/30 p-3">
                <summary className="cursor-pointer text-xs font-medium text-zinc-300">
                  Cevap kaydet
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={replyIntent}
                    onChange={(e) => setReplyIntent(e.target.value)}
                    className="rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    {["demo_requested", "pricing_question", "interested", "call_requested", "later", "not_interested", "wrong_number", "human_review_required"].map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ),
                    )}
                  </select>
                  <select
                    value={replyUrgency}
                    onChange={(e) => setReplyUrgency(e.target.value)}
                    className="rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    {["high", "medium", "low"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      void doAction("RECORD_REPLY", {
                        missionId: selectedItem.missionId,
                        leadId: selectedItem.leadId,
                        intent: replyIntent,
                        urgency: replyUrgency,
                      })
                    }
                    className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-600"
                  >
                    Kaydet
                  </button>
                </div>
              </details>

              <details className="rounded-lg border border-white/[0.06] bg-zinc-950/30 p-3">
                <summary className="cursor-pointer text-xs font-medium text-zinc-300">
                  Demo planla
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void doAction("PLAN_DEMO", {
                        missionId: selectedItem.missionId,
                        leadId: selectedItem.leadId,
                        status: "scheduling_needed",
                      })
                    }
                    className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-600"
                  >
                    Planlama Gerekiyor
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void doAction("PLAN_DEMO", {
                        missionId: selectedItem.missionId,
                        leadId: selectedItem.leadId,
                        status: "scheduled",
                        scheduledAt: Date.now() + 24 * 60 * 60 * 1000,
                      })
                    }
                    className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-600"
                  >
                    Yarına Planlandı
                  </button>
                </div>
              </details>

              <details className="rounded-lg border border-white/[0.06] bg-zinc-950/30 p-3">
                <summary className="cursor-pointer text-xs font-medium text-zinc-300">
                  Satış sonucu kaydet
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={outcomeStatus}
                    onChange={(e) => setOutcomeStatus(e.target.value)}
                    className="rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    {["won", "lost", "paused", "no_decision"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {outcomeStatus === "won" ? (
                    <>
                      <select
                        value={outcomePackage}
                        onChange={(e) => setOutcomePackage(e.target.value)}
                        className="rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
                      >
                        {["starter", "professional", "growth", "enterprise"].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <input
                        value={outcomeMrr}
                        onChange={(e) => setOutcomeMrr(e.target.value)}
                        placeholder="MRR"
                        className="w-24 rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
                      />
                    </>
                  ) : null}
                  {outcomeStatus === "lost" ? (
                    <select
                      value={outcomeLostReason}
                      onChange={(e) => setOutcomeLostReason(e.target.value)}
                      className="rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
                    >
                      {["budget", "timing", "competitor", "no_response", "wrong_fit", "price_objection", "other"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ),
                      )}
                    </select>
                  ) : null}
                  <input
                    value={outcomeNote}
                    onChange={(e) => setOutcomeNote(e.target.value)}
                    placeholder="Not"
                    className="min-w-[140px] flex-1 rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void doAction("RECORD_OUTCOME", {
                        missionId: selectedItem.missionId,
                        leadId: selectedItem.leadId,
                        status: outcomeStatus,
                        package: outcomeStatus === "won" ? outcomePackage : undefined,
                        estimatedMrr:
                          outcomeStatus === "won" && outcomeMrr ? Number(outcomeMrr) : undefined,
                        lostReason: outcomeStatus === "lost" ? outcomeLostReason : undefined,
                        note: outcomeNote || undefined,
                      })
                    }
                    className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-600"
                  >
                    Kaydet
                  </button>
                </div>
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* preparation -> outreach handoff panel (v3.8.3)                            */
/* -------------------------------------------------------------------------- */

const TONE_LABELS_TR: Record<string, string> = {
  soft: "Yumuşak",
  direct: "Direkt",
  consultative: "Danışman",
};

type LeadOutreachHandoffPanelProps = {
  item: DailyActionItem;
  lead: ScoredLead;
  channel: "whatsapp" | "phone" | "instagram" | "email";
  setChannel: (channel: "whatsapp" | "phone" | "instagram" | "email") => void;
  followUpPreset: 1 | 3;
  setFollowUpPreset: (preset: 1 | 3) => void;
  doAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  refreshQueue: () => Promise<void>;
  globalLoading: boolean;
};

/**
 * The one place a selected lead's preparation status turns into the correct
 * outreach action, without leaving `/v2`.
 *
 * Reuses `useLeadMessageWorkspace` (`LeadMessageEditor.tsx`) verbatim for
 * generate/regenerate/manual-save/persist — no second message engine, no
 * second evidence read, no second draft-persistence policy. What this panel
 * adds is Hermes-specific: the single recommended action banner
 * (`computeLeadPreparationAction`), and the approve → WhatsApp → contacted
 * handoff, which is mission/approval state `LeadMessageEditor` does not know
 * about and never should.
 *
 * Keyed by `lead.id` at the call site — a different lead is a fresh mount,
 * exactly like `LeadMessageEditor` itself, so no unsaved text or ephemeral
 * "WhatsApp opened" flag can leak from one lead to another.
 */
function LeadOutreachHandoffPanel({
  item,
  lead,
  channel,
  setChannel,
  followUpPreset,
  setFollowUpPreset,
  doAction,
  refreshQueue,
  globalLoading,
}: LeadOutreachHandoffPanelProps) {
  const stance: OutreachStance = stanceForActionState(item.actionState);
  const guard = useMemo(
    () =>
      messageWorkspaceGuard({
        doNotContact: false,
        hasWhatsAppChannel: item.preparation.checks.verifiedWhatsApp,
      }),
    [item.preparation.checks.verifiedWhatsApp],
  );

  const handleDraftSaved = useCallback(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const ws = useLeadMessageWorkspace({
    lead,
    guard,
    stance,
    autoGenerate: false,
    onDraftSaved: handleDraftSaved,
  });

  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const approvalPending = !APPROVED_OR_BEYOND_STATES.has(item.actionState);
  const recommendedAction: PreparationAction = computeLeadPreparationAction({
    status: item.preparation.status,
    approvalPending,
    whatsappOpened,
  });

  // A generation/regeneration that lands is exactly the moment the daily
  // queue's own `preparation` snapshot (baked in from the last daily-run
  // read) has gone stale — `useLeadMessageWorkspace` persists through its
  // own path (`operational-state` PATCH), not through `doAction`, so nothing
  // else would trigger this recompute.
  const generateAndRefresh = useCallback(
    async (mode: "generate" | "regenerate" | "refresh") => {
      await ws.generate(mode);
      await refreshQueue();
    },
    [ws, refreshQueue],
  );

  const handleApprove = useCallback(async () => {
    if (!ws.savedDraft || ws.dirty) return;
    setApproveError(null);
    try {
      await doAction("APPROVE_CURRENT_DRAFT", {
        missionId: item.missionId,
        leadId: item.leadId,
        currentMessage: ws.draftText,
      });
      setWhatsappOpened(false);
    } catch {
      setApproveError("Onay kaydedilemedi. Tekrar deneyin.");
    }
  }, [doAction, item.leadId, item.missionId, ws.draftText, ws.dirty, ws.savedDraft]);

  const waLink = guard.canOpenWhatsApp ? whatsappLinkWithText(lead.phone, ws.draftText) : null;

  const handleOpenWhatsApp = useCallback(() => {
    if (!waLink) return;
    window.open(waLink, "_blank");
    setWhatsappOpened(true);
  }, [waLink]);

  const handleMarkContacted = useCallback(async () => {
    setContactError(null);
    try {
      await doAction("MARK_CONTACTED", {
        missionId: item.missionId,
        leadId: item.leadId,
        currentMessage: ws.draftText,
        channel,
        followUpPresetDays: followUpPreset,
      });
      setWhatsappOpened(false);
    } catch {
      setContactError("Gönderildi olarak işaretlenemedi. Tekrar deneyin.");
    }
  }, [channel, doAction, followUpPreset, item.leadId, item.missionId, ws.draftText]);

  const busy = ws.busy !== null || globalLoading;
  const generateLabel =
    item.preparation.status === "draft_stale"
      ? PREPARATION_ACTION_LABELS_TR.REGENERATE_DRAFT
      : ws.savedDraft
        ? "Yeniden Üret"
        : PREPARATION_ACTION_LABELS_TR.GENERATE_DRAFT;
  const generateMode = ws.savedDraft ? "regenerate" : "generate";
  const generateEmphasized =
    recommendedAction === "GENERATE_DRAFT" || recommendedAction === "REGENERATE_DRAFT";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-zinc-500">
        Önerilen aksiyon: <span className="text-zinc-300">{PREPARATION_ACTION_LABELS_TR[recommendedAction]}</span>
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Ton</span>
          {(["soft", "direct", "consultative"] as const).map((tone) => (
            <button
              key={tone}
              type="button"
              onClick={() => ws.setActiveTone(tone)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                ws.activeTone === tone
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {TONE_LABELS_TR[tone]}
              {ws.persisted.drafts[tone] ? <span className="ml-1 text-[9px] text-emerald-300">●</span> : null}
            </button>
          ))}
        </div>

        {isStaleCopyDraft(ws.savedDraft) && !ws.dirty && guard.canGenerate ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5">
            <p className="text-[11px] text-amber-200">Bu taslak eski mesaj tonuyla yazıldı.</p>
            <button
              type="button"
              onClick={() => void generateAndRefresh("refresh")}
              disabled={busy}
              className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
            >
              Yeni tonla güncelle
            </button>
          </div>
        ) : null}

        <textarea
          value={ws.draftText}
          onChange={(e) => ws.setDraftText(e.target.value ?? "")}
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
          placeholder={
            guard.canGenerate
              ? `Bu ton için henüz mesaj yok. "${TONE_LABELS_TR[ws.activeTone]}" tonunda mesaj oluşturun veya kendiniz yazın.`
              : "Bu ton için kayıtlı mesaj yok."
          }
        />

        {ws.generateError ? <p className="text-[11px] text-rose-300">{ws.generateError}</p> : null}
        {ws.researchNotice ? (
          <p className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
            {ws.researchNotice}
          </p>
        ) : null}
        {ws.saveError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-rose-300">{ws.saveError}</p>
            {ws.hasPendingGeneration ? (
              <button
                type="button"
                onClick={() => void ws.retryPendingSave()}
                disabled={busy}
                className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
              >
                {ws.busy === "saving" ? "Kaydediliyor…" : "Kaydetmeyi yeniden dene"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generateAndRefresh(generateMode)}
            disabled={!guard.canGenerate || busy}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
              generateEmphasized
                ? "bg-sky-600 hover:bg-sky-500 ring-2 ring-sky-400/40"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {ws.busy === "generating" ? "Üretiliyor…" : generateLabel}
          </button>
          <button
            type="button"
            onClick={() => void ws.saveManual()}
            disabled={!ws.dirty || busy}
            className="rounded-lg border border-zinc-700/40 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50"
          >
            {ws.busy === "saving" ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {ws.savedFlash ? <span className="self-center text-[11px] text-emerald-300">Kaydedildi</span> : null}
          {ws.dirty ? <span className="self-center text-[11px] text-amber-200">Kaydedilmedi</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!ws.savedDraft || ws.dirty || busy}
            title={ws.dirty ? "Onaylamadan önce taslağı kaydedin" : undefined}
            onClick={() => void handleApprove()}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
              recommendedAction === "APPROVE"
                ? "bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-400/40"
                : "bg-zinc-700 hover:bg-zinc-600"
            }`}
          >
            {PREPARATION_ACTION_LABELS_TR.APPROVE}
          </button>
          {waLink ? (
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${
                recommendedAction === "OPEN_WHATSAPP"
                  ? "bg-green-600 hover:bg-green-500 ring-2 ring-green-400/40"
                  : "bg-zinc-700 hover:bg-zinc-600"
              }`}
            >
              {PREPARATION_ACTION_LABELS_TR.OPEN_WHATSAPP}
            </button>
          ) : (
            <span
              title={guard.whatsAppBlockedReason ?? "Mesaj boş"}
              className="cursor-not-allowed rounded-lg border border-zinc-700/40 px-3 py-1.5 text-xs text-zinc-600"
            >
              {PREPARATION_ACTION_LABELS_TR.OPEN_WHATSAPP}
            </span>
          )}
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "whatsapp" | "phone" | "instagram" | "email")}
            className="rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="phone">Telefon</option>
            <option value="instagram">Instagram</option>
            <option value="email">E-posta</option>
          </select>
          <select
            value={followUpPreset}
            onChange={(e) => setFollowUpPreset(Number(e.target.value) === 3 ? 3 : 1)}
            className="rounded-lg border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value={1}>+1 gün takip</option>
            <option value={3}>+3 gün takip</option>
          </select>
          <button
            type="button"
            disabled={!ws.savedDraft || busy || item.preparation.status === "review_required"}
            title={
              item.preparation.status === "review_required"
                ? "Kanıtlar değişti — göndermeden önce taslağı incele/yeniden üret"
                : undefined
            }
            onClick={() => void handleMarkContacted()}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
              recommendedAction === "MARK_CONTACTED"
                ? "bg-indigo-600 hover:bg-indigo-500 ring-2 ring-indigo-400/40"
                : "bg-zinc-700 hover:bg-zinc-600"
            }`}
          >
            {PREPARATION_ACTION_LABELS_TR.MARK_CONTACTED}
          </button>
        </div>
        {approveError ? <p className="text-[11px] text-rose-300">{approveError}</p> : null}
        {contactError ? <p className="text-[11px] text-rose-300">{contactError}</p> : null}
        {item.preparation.status === "review_required" ? (
          <p className="text-xs text-amber-300">
            Kanıtlar değişti — göndermeden önce taslağı inceleyin, gerekiyorsa yeniden üretip yeniden
            onaylayın.
          </p>
        ) : null}
      </div>
    </div>
  );
}
