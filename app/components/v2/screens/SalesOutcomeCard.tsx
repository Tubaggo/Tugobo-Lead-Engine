"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SALES_LOST_REASONS,
  SALES_LOST_REASON_LABELS_TR,
  SALES_OUTCOME_STATUS_LABELS_TR,
  SALES_PACKAGES,
  SALES_PACKAGE_LABELS_TR,
  type SalesLostReason,
  type SalesOutcomeItem,
  type SalesOutcomeStatus,
  type SalesOutcomeStatusUpdateTarget,
  type SalesPackage,
} from "@/app/lib/sales-outcome-runtime";
import { FOUNDER_EMPTY_STATE_LABELS } from "@/app/components/v2/adapters/founder-revenue-workspace-adapter";

/**
 * Sales Outcome Card (v6.6).
 *
 * Founder-facing, compact, Developer Mode. Self-contained — fetches its
 * own feed from `/api/hermes/sales-outcomes` (GET) and posts status
 * changes to `/api/hermes/sales-outcomes/status` (POST), no props, no
 * mission wiring. Shows open/paused/no_decision items first (undecided),
 * capped at a handful of rows to stay compact.
 *
 * The four buttons ("Kazanıldı" / "Kaybedildi" / "Beklemede" / "Kararsız")
 * are the *only* actions this card exposes — deliberately no payment, no
 * invoice, no CRM sync, no WhatsApp send, no automatic outcome. This is a
 * decision board: Hermes never decides won/lost, only the founder does.
 */

type DraftState = { package: SalesPackage; estimatedMrr: string; lostReason: SalesLostReason; note: string };

const EMPTY_DRAFT: DraftState = { package: "unknown", estimatedMrr: "", lostReason: "unknown", note: "" };

const STATUS_BADGE_CLS: Record<SalesOutcomeStatus, string> = {
  open: "bg-purple-500/[0.10] text-purple-400 ring-purple-500/20",
  won: "bg-emerald-500/[0.10] text-emerald-400 ring-emerald-500/20",
  lost: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  paused: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  no_decision: "bg-zinc-500/[0.10] text-zinc-400 ring-zinc-500/20",
  unknown: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

const selectMicroCls =
  "h-6 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 text-[9px] text-zinc-300 outline-none focus:border-indigo-500/40";
const inputMicroCls =
  "h-6 w-full rounded border border-white/[0.08] bg-white/[0.03] px-1.5 text-[9px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40";

export default function SalesOutcomeCard() {
  const [items, setItems] = useState<SalesOutcomeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/sales-outcomes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: SalesOutcomeItem[] };
      setItems(data.items ?? []);
    } catch {
      setError("Satış sonucu listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const draftFor = (id: string): DraftState => drafts[id] ?? EMPTY_DRAFT;
  const updateDraft = (id: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }));
  };

  const applyStatus = useCallback(
    async (item: SalesOutcomeItem, status: SalesOutcomeStatusUpdateTarget) => {
      const draft = draftFor(item.id);
      setUpdatingId(item.id);
      setError(null);
      try {
        const body: Record<string, unknown> = { id: item.id, status };
        if (status === "won") {
          if (draft.package !== "unknown") body.package = draft.package;
          const mrr = Number(draft.estimatedMrr);
          if (draft.estimatedMrr.trim() && Number.isFinite(mrr) && mrr >= 0) body.estimatedMrr = mrr;
        }
        if (status === "lost") {
          if (draft.lostReason !== "unknown") body.lostReason = draft.lostReason;
          if (draft.note.trim()) body.outcomeNote = draft.note;
        }
        const res = await fetch("/api/hermes/sales-outcomes/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Durum güncellenemedi.");
      } finally {
        setUpdatingId(null);
      }
    },
    [drafts, refresh],
  );

  const visibleItems = items.slice(0, 6);

  return (
    <div className="border-b border-white/[0.06] px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">Satış Sonucu</span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="text-[9px] font-semibold text-zinc-600 transition-colors duration-100 hover:text-zinc-300 disabled:opacity-40"
        >
          {loading ? "Kontrol ediliyor…" : "Yenile"}
        </button>
      </div>

      {error && <p className="mt-2 text-[10px] text-rose-400">{error}</p>}

      {visibleItems.length === 0 && !loading && (
        <p className="mt-2 text-[10px] text-zinc-600">{FOUNDER_EMPTY_STATE_LABELS.noOutcomes}</p>
      )}

      {visibleItems.length > 0 && (
        <div className="mt-2.5 space-y-2">
          {visibleItems.map((item) => {
            const draft = draftFor(item.id);
            return (
              <div key={item.id} className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${STATUS_BADGE_CLS[item.status]}`}
                  >
                    {SALES_OUTCOME_STATUS_LABELS_TR[item.status]}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-300">{item.missionId ?? "Mission eşleşmedi"}</span>
                  {item.package !== "unknown" && (
                    <span className="text-[9px] text-zinc-500">{SALES_PACKAGE_LABELS_TR[item.package]}</span>
                  )}
                  {item.estimatedMrr != null && (
                    <span className="text-[9px] text-emerald-400">₺{item.estimatedMrr.toLocaleString("tr-TR")}/ay</span>
                  )}
                  {item.lostReason && item.lostReason !== "unknown" && (
                    <span className="text-[9px] text-rose-400">{SALES_LOST_REASON_LABELS_TR[item.lostReason]}</span>
                  )}
                </div>

                <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">{item.reason}</p>
                <p className="mt-0.5 text-[10px] font-medium text-purple-300">{item.suggestedAction}</p>
                {item.outcomeNotePreview && <p className="mt-1 text-[9px] italic text-zinc-600">{item.outcomeNotePreview}</p>}

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <select
                    className={selectMicroCls}
                    value={draft.package}
                    onChange={(e) => updateDraft(item.id, { package: e.target.value as SalesPackage })}
                  >
                    <option value="unknown">Paket seç</option>
                    {SALES_PACKAGES.filter((p) => p !== "unknown").map((p) => (
                      <option key={p} value={p}>
                        {SALES_PACKAGE_LABELS_TR[p]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    className={inputMicroCls}
                    placeholder="Tahmini MRR (₺)"
                    value={draft.estimatedMrr}
                    onChange={(e) => updateDraft(item.id, { estimatedMrr: e.target.value })}
                  />
                  <select
                    className={selectMicroCls}
                    value={draft.lostReason}
                    onChange={(e) => updateDraft(item.id, { lostReason: e.target.value as SalesLostReason })}
                  >
                    <option value="unknown">Kayıp nedeni seç</option>
                    {SALES_LOST_REASONS.filter((r) => r !== "unknown").map((r) => (
                      <option key={r} value={r}>
                        {SALES_LOST_REASON_LABELS_TR[r]}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputMicroCls}
                    placeholder="Kısa not"
                    value={draft.note}
                    onChange={(e) => updateDraft(item.id, { note: e.target.value })}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void applyStatus(item, "won")}
                    disabled={updatingId === item.id}
                    className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-1 text-[9px] font-semibold text-emerald-300 transition-colors duration-100 hover:bg-emerald-500/[0.12] disabled:opacity-40"
                  >
                    Kazanıldı
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyStatus(item, "lost")}
                    disabled={updatingId === item.id}
                    className="rounded-md border border-rose-500/20 bg-rose-500/[0.06] px-2 py-1 text-[9px] font-semibold text-rose-300 transition-colors duration-100 hover:bg-rose-500/[0.12] disabled:opacity-40"
                  >
                    Kaybedildi
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyStatus(item, "paused")}
                    disabled={updatingId === item.id}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] font-semibold text-zinc-300 transition-colors duration-100 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40"
                  >
                    Beklemede
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyStatus(item, "no_decision")}
                    disabled={updatingId === item.id}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] font-semibold text-zinc-300 transition-colors duration-100 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40"
                  >
                    Kararsız
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
