"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LocaleToggle, useLocale } from "@/app/components/LocaleProvider";
import { t } from "@/app/lib/i18n";
import * as operationalState from "@/app/lib/operational-state/client";

type OutreachEventType =
  | "message_prepared"
  | "message_draft_saved"
  | "message_copied"
  | "whatsapp_opened"
  | "contacted"
  | "follow_up_due";

type OutreachEvent = {
  id: string;
  leadId: string;
  type: OutreachEventType;
  createdAt: string;
  followUpAt?: string;
};

type LocalLead = {
  id: string;
  name: string;
  phone: string;
  leadScore: number;
  hotScore: number;
};

type LocalLeadState = {
  status?: string;
  doNotContact?: boolean;
  contactAttempts?: number;
  contactedAt?: number | null;
  lastContactedAt?: number | null;
  nextFollowUpAt?: number | null;
};

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
  last_outreach_action?: string;
  source?: "airtable" | "local";
  /** Present for locally derived rows — used for TR/EN UI labels. */
  lastOutreachEventType?: OutreachEventType;
  /**
   * The dashboard lead id, for rows derived from operational state.
   *
   * Airtable-only rows have no counterpart in the roster, so they cannot open a
   * message workspace and do not get the action.
   */
  leadId?: string;
};

function eventLabel(type: OutreachEventType, locale: "tr" | "en"): string {
  if (type === "message_prepared") return t("message_prepared", locale);
  if (type === "message_draft_saved") return t("message_draft_saved", locale);
  if (type === "message_copied") return t("message_copied", locale);
  if (type === "whatsapp_opened") return t("whatsapp_opened", locale);
  if (type === "contacted") return t("contacted_activity", locale);
  return t("follow_up_due", locale);
}

function followUpStatus(lead: FollowUpLead, locale: "tr" | "en"): string {
  if (lead.do_not_contact) return t("follow_up_status_dnc", locale);
  if (lead.next_follow_up_at) {
    const ts = Date.parse(lead.next_follow_up_at);
    if (Number.isFinite(ts) && ts <= Date.now()) return t("follow_up_status_due", locale);
  }
  if (lead.lastOutreachEventType) return eventLabel(lead.lastOutreachEventType, locale);
  return lead.last_outreach_action || t("not_contacted", locale);
}

/**
 * Follow-ups derived from server operational state.
 *
 * Reads the same store the dashboard writes, so this page shows the same
 * pipeline on every device instead of whatever happened to be in this
 * browser's localStorage.
 */
async function loadLocalFollowUps(): Promise<FollowUpLead[]> {
  if (typeof window === "undefined") return [];
  try {
    await operationalState.hydrate();
    const leads = operationalState.readRoster() as unknown as LocalLead[];
    const state = operationalState.readStateMap() as Record<string, LocalLeadState>;
    const activity = operationalState.readActivity();
    const eventsByLead: Record<string, OutreachEvent[]> = {};
    for (const [leadId, entries] of Object.entries(activity)) {
      eventsByLead[leadId] = entries.map((entry) => ({
        id: entry.id,
        leadId,
        type: entry.type as OutreachEventType,
        createdAt: entry.createdAt,
        followUpAt: entry.followUpAt,
      }));
    }

    const out: FollowUpLead[] = [];
    for (const lead of leads) {
      const events = Array.isArray(eventsByLead[lead.id]) ? eventsByLead[lead.id] : [];
      if (events.length === 0) continue;
      const latest = events[events.length - 1];
      const s = state[lead.id] ?? {};
      const lastContactedMs =
        typeof s.lastContactedAt === "number"
          ? s.lastContactedAt
          : typeof s.contactedAt === "number"
            ? s.contactedAt
            : null;
      const followUpIso =
        typeof s.nextFollowUpAt === "number" && Number.isFinite(s.nextFollowUpAt)
          ? new Date(s.nextFollowUpAt).toISOString()
          : typeof latest.followUpAt === "string"
            ? latest.followUpAt
            : null;
      out.push({
        recordId: `local-${lead.id}`,
        business_name: lead.name,
        whatsapp: lead.phone,
        lead_score: Number.isFinite(lead.leadScore) ? lead.leadScore : 0,
        hot_score: Number.isFinite(lead.hotScore) ? lead.hotScore : 0,
        contact_attempts:
          typeof s.contactAttempts === "number" && Number.isFinite(s.contactAttempts)
            ? s.contactAttempts
            : 0,
        last_contacted_at: lastContactedMs ? new Date(lastContactedMs).toISOString() : null,
        next_follow_up_at: followUpIso,
        do_not_contact: Boolean(s.doNotContact),
        pipeline_stage: typeof s.status === "string" ? s.status : "new",
        last_outreach_action: eventLabel(latest.type, "en"),
        lastOutreachEventType: latest.type,
        leadId: lead.id,
        source: "local",
      });
    }
    return out.sort((a, b) => {
      const at = Date.parse(a.next_follow_up_at ?? "") || 0;
      const bt = Date.parse(b.next_follow_up_at ?? "") || 0;
      return bt - at;
    });
  } catch {
    return [];
  }
}

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
  const { locale } = useLocale();
  const [leads, setLeads] = useState<FollowUpLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const localLeads = await loadLocalFollowUps();
    try {
      const res = await fetch("/api/airtable/follow-ups", { cache: "no-store" });
      const data = (await res.json()) as {
        configured?: boolean;
        leads?: FollowUpLead[];
        error?: string;
      };
      if (!data.configured) {
        setNotice(t("airtable_not_connected", locale));
        setLeads(localLeads);
        return;
      }
      if (!res.ok) throw new Error(data.error || t("failed_load_followups", locale));
      const airtableLeads = (Array.isArray(data.leads) ? data.leads : []).map((l) => ({
        ...l,
        source: "airtable" as const,
      }));
      const existingKeys = new Set(
        airtableLeads.map(
          (l) => `${(l.business_name || "").trim().toLowerCase()}|${waDigits(l.whatsapp) || ""}`,
        ),
      );
      const merged: FollowUpLead[] = [...airtableLeads];
      for (const local of localLeads) {
        const key = `${(local.business_name || "").trim().toLowerCase()}|${waDigits(local.whatsapp) || ""}`;
        if (existingKeys.has(key)) continue;
        merged.push(local);
      }
      setLeads(merged);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t("failed_load_followups", locale),
      );
      setLeads(localLeads);
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
      if (!res.ok || !data.updated) throw new Error(data.error || t("update_failed", locale));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("update_failed", locale));
    } finally {
      setBusyId(null);
    }
  };

  const hotCount = useMemo(() => leads.filter((l) => l.hot_score > 70).length, [leads]);

  /*
   * Bulk test-data cleanup.
   *
   * Selection is entirely manual. No name pattern, date window or score
   * heuristic picks leads here — "this one was only a test" is a judgement the
   * founder makes, and a wrong guess deletes real pipeline history.
   *
   * Only locally derived rows can be selected: an Airtable-only row has no
   * counterpart in the operational store to reset.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const resettableLeads = useMemo(
    () => leads.filter((l): l is FollowUpLead & { leadId: string } => Boolean(l.leadId)),
    [leads],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelected = (leadId: string) => {
    setSelectedIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId],
    );
  };

  const allSelected =
    resettableLeads.length > 0 && selectedIds.length === resettableLeads.length;

  const runBulkReset = async (profile: "followup_only" | "untouched") => {
    if (bulkBusy || selectedIds.length === 0) return;
    const message =
      profile === "untouched"
        ? `${selectedIds.length} lead dokunulmamış duruma getirilecek.\n\n` +
          "Korunacak: işletme bilgileri, skorlar, analizler, kanal doğrulamaları.\n" +
          "Temizlenecek: kuyruk, takip, satış aşaması, aktivite geçmişi, notlar, " +
          "mesaj taslakları ve demo / kazanıldı / kaybedildi / DNC test durumları.\n\n" +
          "Lead silinmez. İşlem öncesi otomatik yedek alınır."
        : `${selectedIds.length} lead takip listesinden çıkarılacak.\n\n` +
          "Geçmiş satış durumu, aktiviteler ve mesaj taslakları korunacak.";
    if (!window.confirm(message)) return;

    setBulkBusy(true);
    setNotice("");
    try {
      const result = await operationalState.resetLeads(selectedIds, profile);
      setSelectedIds([]);
      setNotice(
        profile === "untouched"
          ? `${result.changed} lead dokunulmamış duruma getirildi. ` +
            "İşletme verileri ve analizler korundu." +
            (result.backupCreated ? " Otomatik backup oluşturuldu." : "")
          : `${result.changed} lead takip listesinden çıkarıldı.`,
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("update_failed", locale));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-4 lg:grid-cols-[180px_1fr]">
        <aside className="rounded-xl border border-white/10 bg-white/[0.02] p-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              {t("navigation", locale)}
            </div>
            <LocaleToggle />
          </div>
          <nav className="mt-2 space-y-1.5 text-sm">
            <Link href="/" className="block rounded-md px-2 py-1.5 text-zinc-300 hover:bg-white/5">
              {t("dashboard", locale)}
            </Link>
            <Link href="/dashboard/follow-ups" className="block rounded-md bg-orange-500/15 px-2 py-1.5 text-orange-200">
              {t("follow_ups", locale)}
            </Link>
          </nav>
        </aside>
        <section className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-4 ring-1 ring-inset ring-orange-500/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">
                {t("follow_ups_today_title", locale)}
              </h1>
              <p className="mt-1 text-xs text-zinc-400">
                {count} {t("follow_ups_today_sub", locale)}
              </p>
              <p className="text-[11px] text-zinc-500">
                {t("hot_leads_count", locale)}: {hotCount}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
            >
              {t("refresh", locale)}
            </button>
          </div>
          {notice && <p className="mt-3 text-xs text-amber-200">{notice}</p>}

          {/* Test-data cleanup. Manual selection only. */}
          {resettableLeads.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelectedIds(
                      allSelected ? [] : resettableLeads.map((l) => l.leadId),
                    )
                  }
                  className="h-3.5 w-3.5 accent-orange-400"
                />
                Bu sayfadakileri seç
              </label>
              <span className="text-[11px] text-zinc-500">
                {selectedIds.length} seçili
              </span>
              <button
                type="button"
                disabled={bulkBusy || selectedIds.length === 0}
                onClick={() => void runBulkReset("followup_only")}
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {bulkBusy ? "Uygulanıyor…" : "Seçilenleri Takipten Çıkar"}
              </button>
              <button
                type="button"
                disabled={bulkBusy || selectedIds.length === 0}
                onClick={() => void runBulkReset("untouched")}
                className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {bulkBusy ? "Uygulanıyor…" : "Seçilenleri Dokunulmamış Yap"}
              </button>
            </div>
          )}
          {loading ? (
            <p className="mt-4 text-sm text-zinc-400">{t("loading", locale)}</p>
          ) : leads.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">{t("no_outreach_yet", locale)}</p>
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
                      <div className="flex items-start gap-2">
                        {lead.leadId ? (
                          <input
                            type="checkbox"
                            aria-label={lead.business_name || t("unknown", locale)}
                            checked={selectedSet.has(lead.leadId)}
                            onChange={() => toggleSelected(lead.leadId!)}
                            className="mt-1 h-3.5 w-3.5 accent-orange-400"
                          />
                        ) : null}
                        <div>
                        <div className="text-sm font-medium text-zinc-100">
                          {lead.business_name || t("unknown", locale)}
                        </div>
                        <a
                          href={wa ? `https://wa.me/${wa}` : "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-xs ${wa ? "text-emerald-300 hover:underline" : "text-zinc-500"}`}
                        >
                          {lead.whatsapp || t("no_whatsapp", locale)}
                        </a>
                        </div>
                      </div>
                      {lead.hot_score > 70 && (
                        <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-medium text-orange-200">
                          HOT
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-300 sm:grid-cols-3 lg:grid-cols-6">
                      <div>
                        {t("lead_score", locale)}: {lead.lead_score}
                      </div>
                      <div>
                        {t("hot_score", locale)}: {lead.hot_score}
                      </div>
                      <div>
                        {t("attempts", locale)}: {lead.contact_attempts}
                      </div>
                      <div>
                        {t("last_short", locale)}: {relDate(lead.last_contacted_at)}
                      </div>
                      <div>
                        {t("next_short", locale)}: {relDate(lead.next_follow_up_at)}
                      </div>
                      <div>
                        {t("stage", locale)}: {lead.pipeline_stage || "-"}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400">
                      {t("last_action_status", locale)}:{" "}
                      {lead.lastOutreachEventType
                        ? eventLabel(lead.lastOutreachEventType, locale)
                        : lead.last_outreach_action || "-"}{" "}
                      · {t("status_word", locale)}: {followUpStatus(lead, locale)}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {/*
                        Opens the lead's own message workspace on the dashboard
                        instead of duplicating a draft editor here. One lead,
                        one place its drafts live.
                      */}
                      {lead.leadId ? (
                        <Link
                          href={`/?lead=${encodeURIComponent(lead.leadId)}&panel=message`}
                          className="w-full rounded-md border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-center text-sm font-medium text-violet-100 hover:bg-violet-500/20 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
                        >
                          {t("open_lead_message", locale)}
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        disabled={!wa || busyId === lead.recordId}
                        onClick={() => {
                          if (!wa) return;
                          window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer");
                        }}
                        className="w-full rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
                      >
                        {t("send_whatsapp", locale)}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === lead.recordId}
                        onClick={() => void runAction(lead.recordId, "mark_contacted")}
                        className="w-full rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
                      >
                        {t("mark_contacted", locale)}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === lead.recordId}
                        onClick={() => void runAction(lead.recordId, "no_response")}
                        className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
                      >
                        {t("no_response", locale)}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === lead.recordId}
                        onClick={() => void runAction(lead.recordId, "do_not_contact")}
                        className="w-full rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs"
                      >
                        {t("do_not_contact", locale)}
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
