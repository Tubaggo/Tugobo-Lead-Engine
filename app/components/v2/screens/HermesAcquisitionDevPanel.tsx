"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACQUISITION_NETWORK_ERROR_TR,
  acquisitionResultFieldLabelsTr,
  acquisitionRunStatusLabelTr,
  buildAcquisitionRunRequestBody,
  resolveAcquisitionRunResponse,
  type AcquisitionRunResultLike,
  type AcquisitionRunTriggerKind,
} from "@/app/components/v2/adapters/hermes-acquisition-dev-panel-adapter";

/**
 * Hermes Autonomous Acquisition — Developer panel (Sprint C1 — Scope 7;
 * fixed in Hotfix C1.0.1).
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
 * result with zero external calls). `buildAcquisitionRunRequestBody`
 * (adapter) is the only place the request body is constructed — it can
 * structurally emit nothing but `trigger` + an ON-only `dryRun`.
 *
 * C1.0.1 root cause: the result/error UI used to live entirely inside the
 * `{status && (...)}` block, gated on the UNRELATED config-status GET
 * request. If that fetch was merely slow or failed, a click on either
 * button produced a real request and a real response, but the founder/
 * developer saw nothing — not the result, not the error. The result panel
 * and error line below are now rendered unconditionally on `lastResult` /
 * `runError`, independent of whether `/status` has resolved.
 */

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

const BUSY_LABELS: Record<AcquisitionRunTriggerKind, string> = {
  dry: "Dry-run hazırlanıyor…",
  safe: "Tarama başlatılıyor…",
};

export default function HermesAcquisitionDevPanel({
  onAcquisitionChanged,
}: {
  /** Bumped after any run so V2Shell refetches status + ingests fresh candidates. */
  onAcquisitionChanged?: () => void;
}) {
  const [status, setStatus] = useState<AcquisitionStatusPayload | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState<AcquisitionRunTriggerKind | null>(null);
  const [lastResult, setLastResult] = useState<AcquisitionRunResultLike | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  // Bumped after each run so the status re-fetch effect below re-runs.
  const [statusTick, setStatusTick] = useState(0);
  // Synchronous double-click guard: React state updates from setBusy are not
  // guaranteed to have committed before a second click handler fires in the
  // same tick, so the `disabled` attribute alone cannot be trusted as the
  // only defense. This ref is read-then-set before any `await`.
  const inFlightRef = useRef(false);

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
    async (kind: AcquisitionRunTriggerKind) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setBusy(kind);
      setRunError(null);

      try {
        const res = await fetch("/api/hermes/acquisition/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildAcquisitionRunRequestBody(kind)),
        });
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          data = undefined;
        }
        const outcome = resolveAcquisitionRunResponse({ ok: res.ok, data });
        if (outcome.kind === "error") {
          setRunError(outcome.messageTr);
          setLastResult(null);
        } else {
          setLastResult(outcome.result);
          setRunError(null);
        }
      } catch {
        setRunError(ACQUISITION_NETWORK_ERROR_TR);
        setLastResult(null);
      } finally {
        inFlightRef.current = false;
        setBusy(null);
        setStatusTick((t) => t + 1);
        onAcquisitionChanged?.();
      }
    },
    [onAcquisitionChanged],
  );

  const fieldLabels = lastResult ? acquisitionResultFieldLabelsTr(lastResult.dryRun) : null;

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
            {busy === "dry" ? BUSY_LABELS.dry : "Dry-run Önizle"}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy !== null || !status?.enabled}
            onClick={() => void triggerRun("safe")}
          >
            {busy === "safe" ? BUSY_LABELS.safe : "Güvenli Tarama Çalıştır"}
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

          {/* Config notes — founder-safe: never a raw env name or secret value */}
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
        </>
      )}

      {/*
        C1.0.1 fix: result panel + error line are rendered unconditionally
        on lastResult/runError — NOT gated on `status` (the unrelated config
        fetch above). A click always produces visible feedback, even if the
        config-status GET is slow, failed, or never resolves.
      */}
      {lastResult && fieldLabels && (
        <div className="mt-3 rounded-lg bg-white/[0.02] px-3 py-2">
          <p className={LABEL}>Son Çalıştırma</p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
            <ResultField label="Durum" value={acquisitionRunStatusLabelTr(lastResult.status)} />
            <ResultField
              label="Seçilen Bölge"
              value={lastResult.selectedRegionsSafe.length > 0 ? lastResult.selectedRegionsSafe.join(", ") : "—"}
            />
            <ResultField label={fieldLabels.evaluated} value={String(lastResult.evaluatedCount)} />
            <ResultField label={fieldLabels.externalRequests} value={String(lastResult.externalRequestCount)} />
            <ResultField label={fieldLabels.missionCandidates} value={String(lastResult.missionCandidateCount)} />
          </div>

          {lastResult.blockingReasons.length > 0 && (
            <div className="mt-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-500">Blok Nedenleri</p>
              <ul className="mt-0.5 space-y-0.5">
                {lastResult.blockingReasons.map((reason, i) => (
                  <li key={i} className="text-[10.5px] text-amber-300/90">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-2 border-t border-white/[0.06] pt-1.5 text-[10.5px] leading-relaxed text-zinc-300">
            {lastResult.summaryTr}
          </p>
        </div>
      )}

      {runError && (
        <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-300">
          {runError}
        </p>
      )}
    </div>
  );
}

function ResultField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p className="mt-0.5 truncate text-[11px] text-zinc-200">{value}</p>
    </div>
  );
}
