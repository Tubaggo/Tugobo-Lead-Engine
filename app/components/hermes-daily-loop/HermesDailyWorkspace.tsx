"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  const [currentMessage, setCurrentMessage] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [channel, setChannel] = useState<"whatsapp" | "phone" | "instagram" | "email">("whatsapp");
  const [followUpPreset, setFollowUpPreset] = useState<1 | 3>(1);
  const [replyIntent, setReplyIntent] = useState("interested");
  const [replyUrgency, setReplyUrgency] = useState("medium");
  const [outcomeStatus, setOutcomeStatus] = useState("won");
  const [outcomePackage, setOutcomePackage] = useState("professional");
  const [outcomeMrr, setOutcomeMrr] = useState("");
  const [outcomeLostReason, setOutcomeLostReason] = useState("budget");
  const [outcomeNote, setOutcomeNote] = useState("");

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

  useEffect(() => {
    if (!selectedLeadId) {
      // Clearing the draft when the selection is cleared, not a state
      // derived from a render — there is no external system to defer this to.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentMessage("");
      return;
    }
    let cancelled = false;
    setDraftLoading(true);
    fetch(`/api/operational-state/${encodeURIComponent(selectedLeadId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setCurrentMessage("");
          return;
        }
        const state = await parseJsonSafe(res);
        const workspace = state?.messageWorkspace as
          | { activeTone?: string; drafts?: Record<string, { message?: string }> }
          | undefined;
        const tone = workspace?.activeTone ?? "soft";
        const message = workspace?.drafts?.[tone]?.message ?? "";
        setCurrentMessage(message);
      })
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
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
                      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300">
                        {item.stageLabel}
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

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Mevcut mesaj {draftLoading ? "(yükleniyor…)" : ""}
                </label>
                <textarea
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
                  placeholder="Bu lead için henüz bir taslak yok — lead detayından üretin."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!currentMessage || loading}
                    onClick={() =>
                      void doAction("APPROVE_CURRENT_DRAFT", {
                        missionId: selectedItem.missionId,
                        leadId: selectedItem.leadId,
                        currentMessage,
                      })
                    }
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Taslağı Onayla
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(currentMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5"
                  >
                    WhatsApp&apos;ta Aç
                  </a>
                  <select
                    value={channel}
                    onChange={(e) =>
                      setChannel(e.target.value as "whatsapp" | "phone" | "instagram" | "email")
                    }
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
                    disabled={!currentMessage || loading}
                    onClick={() =>
                      void doAction("MARK_CONTACTED", {
                        missionId: selectedItem.missionId,
                        leadId: selectedItem.leadId,
                        currentMessage,
                        channel,
                        followUpPresetDays: followUpPreset,
                      })
                    }
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Gönderdim
                  </button>
                </div>
              </div>

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
