"use client";

import { useCallback, useEffect, useState } from "react";
import {
  REPLY_INTENT_LABELS_TR,
  type ReplyConfidence,
  type ReplyIntent,
  type ReplyUrgency,
} from "@/app/lib/reply-intelligence-runtime";

/**
 * Reply Intelligence Card (v6.3).
 *
 * Purely additive to the Hermes Workspace, rendered directly below
 * WhatsAppReplyListenerCard. Self-contained — fetches its own feed from
 * `/api/hermes/reply-intelligence` (GET, read-only), no props, no mission
 * wiring. Shows only the *last* classification — its intent, urgency,
 * confidence, and Turkish action hint. Never a conversation view, never
 * the full message body, never a reply/send action. The classification
 * itself is a deterministic keyword rule, not an AI call.
 */

type LatestIntelligence = {
  providerMessageId: string;
  missionId: string | null;
  intent: ReplyIntent;
  confidence: ReplyConfidence;
  urgency: ReplyUrgency;
  founderActionHint: string;
  textPreview: string | null;
  analyzedAt: number;
};

const URGENCY_DOT: Record<ReplyUrgency, string> = {
  high: "bg-orange-400",
  medium: "bg-amber-400",
  low: "bg-zinc-500",
};

const INTENT_BADGE_CLS: Record<ReplyIntent, string> = {
  demo_requested: "bg-orange-500/[0.10] text-orange-400 ring-orange-500/20",
  pricing_question: "bg-orange-500/[0.10] text-orange-400 ring-orange-500/20",
  interested: "bg-amber-500/[0.10] text-amber-400 ring-amber-500/20",
  call_requested: "bg-orange-500/[0.10] text-orange-400 ring-orange-500/20",
  later: "bg-sky-500/[0.10] text-sky-400 ring-sky-500/20",
  not_interested: "bg-zinc-500/[0.10] text-zinc-400 ring-zinc-500/20",
  wrong_number: "bg-rose-500/[0.10] text-rose-400 ring-rose-500/20",
  human_review_required: "bg-zinc-500/[0.10] text-zinc-300 ring-zinc-500/20",
  unknown: "bg-white/[0.04] text-zinc-500 ring-white/[0.06]",
};

const CONFIDENCE_LABEL_TR: Record<ReplyConfidence, string> = {
  high: "Yüksek Güven",
  medium: "Orta Güven",
  low: "Düşük Güven",
};

export default function ReplyIntelligenceCard() {
  const [latest, setLatest] = useState<LatestIntelligence | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hermes/reply-intelligence");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { latest: LatestIntelligence | null };
      setLatest(data.latest);
    } catch {
      setError("Cevap analizi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="border-b border-white/[0.06] px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            Cevap Zekası
          </span>
          {latest && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${URGENCY_DOT[latest.urgency]}`} />}
        </div>
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

      {latest === null && <p className="mt-2 text-[10px] text-zinc-600">Henüz analiz edilmiş bir cevap yok.</p>}

      {latest && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ring-1 ring-inset ${INTENT_BADGE_CLS[latest.intent]}`}>
              {REPLY_INTENT_LABELS_TR[latest.intent]}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/[0.04] px-2 py-[2px] text-[9px] font-semibold text-zinc-400 ring-1 ring-inset ring-white/[0.06]">
              {CONFIDENCE_LABEL_TR[latest.confidence]}
            </span>
            {!latest.missionId && (
              <span className="inline-flex items-center rounded-full bg-amber-500/[0.10] px-2 py-[2px] text-[9px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                Mission eşleşmedi
              </span>
            )}
          </div>

          <p className="text-[10px] font-medium leading-relaxed text-indigo-300">{latest.founderActionHint}</p>

          {latest.textPreview && (
            <p className="rounded bg-white/[0.02] px-2 py-1.5 text-[10px] leading-relaxed text-zinc-400">
              {latest.textPreview}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">Zaman</span>
            <span className="text-[10px] font-medium text-zinc-400">
              {new Date(latest.analyzedAt).toLocaleTimeString("tr-TR")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
