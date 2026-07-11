"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hermes Autonomous Acquisition — Developer panel (Sprint C1 — Scope 7).
 *
 * Lives at the top of the Developer-only Lead Import screen. Exposes exactly
 * the two safe triggers the sprint allows — "Dry-run Önizle" and "Güvenli
 * Tarama Çalıştır" — plus read-only config status, today's counters, the
 * last run summary, and blocking reasons. Deliberately absent, forever:
 * unlimited import, nationwide scan, or any send action.
 *
 * Both buttons call the same POST /api/hermes/acquisition/run the external
 * scheduler uses (trigger "developer"; no secret needed — the server-side
 * policy gates are the barrier, and a disabled policy returns a blocked
 * result with zero external calls). The client body carries nothing but
 * `trigger` + `dryRun: true` for previews — the route structurally ignores
 * everything else.
 */

type AcquisitionRunLike = {
  id: string;
  status: string;
  dryRun: boolean;
  trigger: string;
  startedAt: number;
  completedAt: number | null;
  summaryTr: string;
  blockingReasons: string[];
  safeErrors: string[];
  evaluatedCount: number;
  importedCount: number;
  duplicateCount: number;
  missionCandidateCount: number;
  externalRequestCount: number;
};

type AcquisitionStatusPayload = {
  configOk: boolean;
  configNotes: string[];
  enabled: boolean;
  mode: string;
  dryRun: boolean;
  limits: {
    dailyLeadLimit: number;
    dailyExternalRequestLimit: number;
    maxRegionsPerRun: number;
    maxResultsPerRegion: number;
    maxMissionCandidatesPerRun: number;
    minVerifiedOpportunityScore: number;
  };
  regionCount: number;
  enabledRegionCount: number;
  running: boolean;
  lastScanAt: number | null;
  today: {
    importedToday: number;
    externalRequestsToday: number;
    runsToday: number;
    evaluatedToday: number;
    duplicatesToday: number;
    missionCandidatesToday: number;
  };
  recentRuns: AcquisitionRunLike[];
};

type RunResultLike = {
  status: string;
  dryRun: boolean;
  summaryTr: string;
  blockingReasons: string[];
  evaluatedCount: number;
  missionCandidateCount: number;
  externalRequestCount: number;
};

function fmtTime(at: number | null): string {
  if (!at) return "Henüz yok";
  return new Date(at).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CARD = "rounded-xl border border-white/[0.06] bg-white/[0.02] p-4";
const LABEL = "text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600";
const BTN =
  "flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY =
  "flex h-8 items-center gap-2 rounded-lg bg-indigo-500 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";

export default function HermesAcquisitionDevPanel({
  onAcquisitionChanged,
}: {
  /** Bumped after any run so V2Shell refetches status + ingests fresh candidates. */
  onAcquisitionChanged?: () => void;
}) {
  const [status, setStatus] = useState<AcquisitionStatusPayload | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState<"dry" | "safe" | null>(null);
  const [lastResult, setLastResult] = useState<RunResultLike | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  // Bumped after each run so the status re-fetch effect below re-runs.
  const [statusTick, setStatusTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/hermes/acquisition/status", { cache: "no-store" });
        if (!res.ok) throw new Error("status");
        const data = (await res.json()) as AcquisitionStatusPayload;
        if (!cancelled) {
          setStatus(data);
          setStatusError(false);
        }
      } catch {
        if (!cancelled) setStatusError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusTick]);

  const triggerRun = useCallback(
    async (kind: "dry" | "safe") => {
      setBusy(kind);
      setRunError(null);
      try {
        const res = await fetch("/api/hermes/acquisition/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "dry" ? { trigger: "developer", dryRun: true } : { trigger: "developer" },
          ),
        });
        const data = (await res.json()) as RunResultLike & { error?: string };
        if (!res.ok) {
          setRunError(data.error ?? "Çalıştırma başarısız oldu.");
        } else {
          setLastResult(data);
        }
      } catch {
        setRunError("Çalıştırma isteği tamamlanamadı.");
      } finally {
        setBusy(null);
        setStatusTick((t) => t + 1);
        onAcquisitionChanged?.();
      }
    },
    [onAcquisitionChanged],
  );

  const lastRun = status?.recentRuns?.[0] ?? null;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-zinc-200">Hermes Otonom Tarama</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Zamanlanmış lead keşfi — policy sınırları server tarafında uygulanır.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className={BTN}
            disabled={busy !== null}
            onClick={() => void triggerRun("dry")}
          >
            {busy === "dry" ? "Önizleniyor…" : "Dry-run Önizle"}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy !== null || !status?.enabled}
            onClick={() => void triggerRun("safe")}
          >
            {busy === "safe" ? "Taranıyor…" : "Güvenli Tarama Çalıştır"}
          </button>
        </div>
      </div>

      {statusError && (
        <p className="mt-3 text-[11px] text-amber-400">Tarama durumu şu anda okunamadı.</p>
      )}

      {status && (
        <>
          {/* Config status */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <p className={LABEL}>Durum</p>
              <p className={`mt-0.5 text-[11px] font-medium ${status.enabled ? "text-emerald-400" : "text-zinc-400"}`}>
                {status.enabled ? `Etkin (${status.mode})` : "Devre dışı"}
                {status.dryRun ? " · dry-run" : ""}
              </p>
            </div>
            <div>
              <p className={LABEL}>Bölgeler</p>
              <p className="mt-0.5 text-[11px] text-zinc-300">
                {status.enabledRegionCount}/{status.regionCount} etkin
              </p>
            </div>
            <div>
              <p className={LABEL}>Günlük Limit</p>
              <p className="mt-0.5 text-[11px] text-zinc-300">
                {status.today.importedToday}/{status.limits.dailyLeadLimit} lead ·{" "}
                {status.today.externalRequestsToday}/{status.limits.dailyExternalRequestLimit} istek
              </p>
            </div>
            <div>
              <p className={LABEL}>Son Tarama</p>
              <p className="mt-0.5 text-[11px] text-zinc-300">{fmtTime(status.lastScanAt)}</p>
            </div>
          </div>

          {/* Config notes / blocking reasons */}
          {!status.configOk && status.configNotes.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
              <p className="text-[10px] font-semibold text-amber-400">Yapılandırma notları</p>
              <ul className="mt-1 space-y-0.5">
                {status.configNotes.map((note, i) => (
                  <li key={i} className="text-[10.5px] text-amber-200/80">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Last run summary */}
          {(lastResult || lastRun) && (
            <div className="mt-3 rounded-lg bg-white/[0.02] px-3 py-2">
              <p className={LABEL}>Son Çalıştırma</p>
              <p className="mt-1 text-[11px] text-zinc-300">
                {(lastResult ?? lastRun)?.summaryTr || "—"}
              </p>
              {(lastResult ?? lastRun) && (lastResult ?? lastRun)!.blockingReasons.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {(lastResult ?? lastRun)!.blockingReasons.map((reason, i) => (
                    <li key={i} className="text-[10.5px] text-amber-300/90">
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[10px] tabular-nums text-zinc-600">
                Değerlendirilen {(lastResult ?? lastRun)?.evaluatedCount ?? 0} · Satış işi adayı{" "}
                {(lastResult ?? lastRun)?.missionCandidateCount ?? 0} · Dış istek{" "}
                {(lastResult ?? lastRun)?.externalRequestCount ?? 0}
              </p>
            </div>
          )}

          {runError && <p className="mt-2 text-[11px] text-rose-400">{runError}</p>}
        </>
      )}
    </div>
  );
}
