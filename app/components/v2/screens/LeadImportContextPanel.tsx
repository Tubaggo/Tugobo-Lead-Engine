import type { UseLeadImportReturn, ImportHistoryEntry } from "@/app/components/v2/hooks/useLeadImport";

/* ── primitives ─────────────────────────────────────────────── */

const SECTION_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className={SECTION_LABEL}>{children}</p>;
}

function StatRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[11.5px] text-zinc-500">{label}</span>
      <span className={`text-[12px] font-semibold tabular-nums ${valueColor ?? "text-zinc-300"}`}>
        {value}
      </span>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={[
        "inline-block h-1.5 w-1.5 rounded-full shrink-0",
        ok ? "bg-emerald-400" : "bg-zinc-600",
      ].join(" ")}
    />
  );
}

/* ── history entry ───────────────────────────────────────────── */

function HistoryRow({ entry }: { entry: ImportHistoryEntry }) {
  const d = new Date(entry.importedAt);
  const date = d.toLocaleDateString("tr-TR", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-zinc-300 truncate">
          {entry.city}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-600 tabular-nums">
          {date} {time}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10.5px] text-zinc-600">
        <span className="text-emerald-400 font-medium">+{entry.added}</span>
        {entry.updated > 0 && (
          <span className="text-amber-400">~{entry.updated}</span>
        )}
        {entry.skipped > 0 && (
          <span>{entry.skipped} atlandı</span>
        )}
        <span className="ml-auto truncate">{entry.type}</span>
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────── */

type Props = {
  importState: UseLeadImportReturn;
};

export default function LeadImportContextPanel({ importState }: Props) {
  const {
    importedLeads,
    lastBatch,
    lastResult,
    importHistory,
    loading,
  } = importState;

  const totalImported = importedLeads.length;
  const hotLeads = importedLeads.filter((l) => (l.hotScore ?? 0) >= 70).length;
  const withPhone = importedLeads.filter((l) => Boolean(l.phone?.trim())).length;
  const withWebsite = importedLeads.filter((l) => Boolean(l.website?.trim())).length;

  const lastSkipped = lastResult?.skipped ?? 0;
  const lastAdded = lastResult?.added ?? 0;
  const lastUpdated = lastResult?.updated ?? 0;

  const googleOk = lastResult !== null && (lastAdded > 0 || lastUpdated > 0 || lastSkipped > 0);

  return (
    <div className="w-[280px] shrink-0 overflow-y-auto rounded-xl border border-white/[0.06] bg-[var(--background-elev)] flex flex-col">

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-px border-b border-white/[0.06] shrink-0">
        {[
          { label: "Toplam Lead", value: totalImported, color: "text-zinc-200" },
          { label: "Sıcak Lead", value: hotLeads, color: hotLeads > 0 ? "text-orange-400" : "text-zinc-500" },
          { label: "Telefonlu", value: withPhone, color: "text-zinc-300" },
          { label: "Websiteli", value: withWebsite, color: "text-zinc-300" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col gap-0.5 px-3 py-3">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              {label}
            </span>
            <span className={`text-[20px] font-bold tabular-nums leading-none ${color}`}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 p-3 flex-1">

        {/* Source status */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Kaynak Durumu</SectionLabel>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot ok={googleOk || !loading} />
                <span className="text-[11.5px] text-zinc-400">Google Places API</span>
              </div>
              <span className={`text-[10.5px] font-medium ${googleOk ? "text-emerald-400" : "text-zinc-600"}`}>
                {loading ? "Sorgulaniyor..." : googleOk ? "Aktif" : "Bekleniyor"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot ok={false} />
                <span className="text-[11.5px] text-zinc-400">Airtable Sync</span>
              </div>
              <span className="text-[10.5px] font-medium text-zinc-600">
                Ayrı panel
              </span>
            </div>
          </div>
        </div>

        {/* Duplicate protection */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Tekrar Koruması</SectionLabel>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <StatRow label="Son import — yeni" value={lastAdded} valueColor="text-emerald-400" />
            <StatRow label="Son import — güncellendi" value={lastUpdated} valueColor="text-amber-400" />
            <StatRow label="Son import — atlandı" value={lastSkipped} valueColor="text-zinc-500" />
            <div className="mt-2 flex flex-col gap-1 pt-2 border-t border-white/[0.04]">
              {["Telefon eşleşmesi", "Website eşleşmesi", "Ad + Şehir"].map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-indigo-500/60 shrink-0" />
                  <span className="text-[10.5px] text-zinc-600">{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Last batch preview */}
        {lastBatch.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Son Batch ({lastBatch.length} lead)</SectionLabel>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 flex flex-col gap-1">
              {lastBatch.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between py-0.5">
                  <span className="text-[11px] text-zinc-400 truncate flex-1">{l.name}</span>
                  <span
                    className={`shrink-0 text-[10px] font-semibold tabular-nums ml-2 ${
                      (l.leadScore ?? 0) >= 70
                        ? "text-emerald-400"
                        : (l.leadScore ?? 0) >= 50
                        ? "text-amber-400"
                        : "text-zinc-600"
                    }`}
                  >
                    {l.leadScore ?? 0}
                  </span>
                </div>
              ))}
              {lastBatch.length > 5 && (
                <p className="text-[10px] text-zinc-700 pt-1">
                  +{lastBatch.length - 5} daha...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Import history */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Import Geçmişi</SectionLabel>
          {importHistory.length === 0 ? (
            <p className="text-[11px] text-zinc-700 px-1">
              Bu oturumda henüz import yapılmadı.
            </p>
          ) : (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3">
              {importHistory.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
