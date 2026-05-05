"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type FollowUpLead = {
  recordId: string;
  business_name: string;
  whatsapp: string;
  lead_score: number;
  hot_score: number;
  contact_attempts: number;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  do_not_contact: boolean;
  pipeline_stage: string;
};

function relDate(iso: string | null): string {
  if (!iso) return "-";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function waDigits(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) return `90${d}`;
  if (d.length === 11 && d.startsWith("0")) return `9${d}`;
  return d;
}

export default function FollowUpsPage() {
  const [leads, setLeads] = useState<FollowUpLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/airtable/follow-ups", { cache: "no-store" });
      const data = (await res.json()) as {
        configured?: boolean;
        leads?: FollowUpLead[];
        error?: string;
      };
      if (!data.configured) {
        setNotice("Airtable not connected");
        setLeads([]);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to load follow-ups");
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to load follow-ups");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const count = leads.length;

  const runAction = async (recordId: string, action: "mark_contacted" | "no_response" | "do_not_contact") => {
    setBusyId(recordId);
    try {
      const res = await fetch("/api/airtable/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, action }),
      });
      const data = (await res.json()) as { updated?: boolean; error?: string };
      if (!res.ok || !data.updated) throw new Error(data.error || "Update failed");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const hotCount = useMemo(() => leads.filter((l) => l.hot_score > 70).length, [leads]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-4 lg:grid-cols-[180px_1fr]">
        <aside className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Navigation</div>
          <nav className="mt-2 space-y-1.5 text-sm">
            <Link href="/" className="block rounded-md px-2 py-1.5 text-zinc-300 hover:bg-white/5">
              Dashboard
            </Link>
            <Link href="/dashboard/follow-ups" className="block rounded-md bg-orange-500/15 px-2 py-1.5 text-orange-200">
              Follow-ups
            </Link>
          </nav>
        </aside>
        <section className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-4 ring-1 ring-inset ring-orange-500/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">🔥 Follow-ups Today</h1>
              <p className="mt-1 text-xs text-zinc-400">{count} leads need follow-up today</p>
              <p className="text-[11px] text-zinc-500">Hot leads: {hotCount}</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
          {notice && <p className="mt-3 text-xs text-amber-200">{notice}</p>}
          {loading ? (
            <p className="mt-4 text-sm text-zinc-400">Loading...</p>
          ) : leads.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-200">Bugün follow-up yok 🎉</p>
          ) : (
            <div className="mt-4 space-y-2">
              {leads.map((lead) => {
                const wa = waDigits(lead.whatsapp);
                return (
                  <div
                    key={lead.recordId}
                    className={`rounded-lg border p-3 ${
                      lead.hot_score > 70
                        ? "border-orange-400/35 bg-orange-500/[0.08]"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{lead.business_name || "Unknown"}</div>
                        <a
                          href={wa ? `https://wa.me/${wa}` : "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-xs ${wa ? "text-emerald-300 hover:underline" : "text-zinc-500"}`}
                        >
                          {lead.whatsapp || "No WhatsApp"}
                        </a>
                      </div>
                      {lead.hot_score > 70 && (
                        <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-medium text-orange-200">
                          HOT
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-300 sm:grid-cols-3 lg:grid-cols-6">
                      <div>Lead: {lead.lead_score}</div>
                      <div>Hot: {lead.hot_score}</div>
                      <div>Attempts: {lead.contact_attempts}</div>
                      <div>Last: {relDate(lead.last_contacted_at)}</div>
                      <div>Next: {relDate(lead.next_follow_up_at)}</div>
                      <div>Stage: {lead.pipeline_stage || "-"}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!wa || busyId === lead.recordId}
                        onClick={() => {
                          if (!wa) return;
                          window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer");
                        }}
                        className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Send WhatsApp
                      </button>
                      <button
                        type="button"
                        disabled={busyId === lead.recordId}
                        onClick={() => void runAction(lead.recordId, "mark_contacted")}
                        className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Mark Contacted
                      </button>
                      <button
                        type="button"
                        disabled={busyId === lead.recordId}
                        onClick={() => void runAction(lead.recordId, "no_response")}
                        className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        No Response
                      </button>
                      <button
                        type="button"
                        disabled={busyId === lead.recordId}
                        onClick={() => void runAction(lead.recordId, "do_not_contact")}
                        className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Do Not Contact
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
