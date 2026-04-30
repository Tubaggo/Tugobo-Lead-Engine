"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type LeadStatus,
  type LeadStatusUpdate,
  type LeadType,
  type ScoredLead,
  STATUS_LABEL,
  STATUS_ORDER,
  instagramLink,
  whatsappLink,
} from "@/app/lib/leads";
import {
  leadDedupeKey,
} from "@/app/lib/generate";
import ImportPanel, {
  type ImportRequest,
  type ImportResult,
} from "@/app/components/ImportPanel";

const STORAGE_KEY = "tugobo-lead-engine:state-v1";
const EXTRA_LEADS_KEY = "tugobo-lead-engine:extra-leads-v1";

type StateMap = Record<string, LeadStatusUpdate>;

const DEFAULT_STATE: LeadStatusUpdate = {
  status: "new",
  note: "",
  updatedAt: null,
};

const TYPES: LeadType[] = [
  "Hotel",
  "Boutique Hotel",
  "Bungalow",
  "Villa",
  "Pension",
];

function loadState(): StateMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveState(state: StateMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function loadExtraLeads(): ScoredLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXTRA_LEADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScoredLead[]) : [];
  } catch {
    return [];
  }
}

function saveExtraLeads(leads: ScoredLead[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXTRA_LEADS_KEY, JSON.stringify(leads));
  } catch {
    // ignore quota errors
  }
}

// Deterministic Turkish currency formatter.
// We intentionally avoid Intl here: Node and embedded Chromium can differ in
// the space character (NBSP / NNBSP) between number and ₺, which causes
// hydration warnings even though the visible string looks the same.
function formatTRY(n: number) {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded).toString();
  const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped} \u20BA`;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Deterministic date label, computed only on the client (callers gate on mount)
// so SSR markup never depends on `new Date()`.
function buildTodayLabel(d = new Date()) {
  return `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} ${
    MONTHS[d.getMonth()]
  } ${d.getFullYear()}`;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 65) return "text-amber-300";
  if (score >= 50) return "text-zinc-200";
  return "text-zinc-400";
}

function ScoreBar({ score, tone }: { score: number; tone: "lead" | "hot" }) {
  const color =
    tone === "hot"
      ? score >= 70
        ? "bg-orange-400"
        : score >= 55
        ? "bg-amber-400"
        : "bg-zinc-500"
      : score >= 75
      ? "bg-emerald-400"
      : score >= 60
      ? "bg-indigo-400"
      : "bg-zinc-500";
  return (
    <div className="flex items-center gap-2">
      <span
        className={`tabular-nums text-sm font-semibold ${scoreColor(score)}`}
      >
        {score}
      </span>
      <div className="h-1.5 w-16 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all`}
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: LeadStatus }) {
  const styles: Record<LeadStatus, string> = {
    new: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
    contacted: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
    replied: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    meeting: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    won: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    lost: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: LeadStatus;
  onChange: (s: LeadStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as LeadStatus)}
      className="bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s} className="bg-zinc-900">
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function IconWhatsapp({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M19.11 17.36c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.62.14-.18.27-.71.88-.87 1.06-.16.18-.32.2-.59.07-.27-.14-1.13-.42-2.16-1.33-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.41.12-.55.13-.13.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.62-1.49-.85-2.04-.22-.53-.45-.46-.62-.47l-.53-.01c-.18 0-.48.07-.74.34-.25.27-.97.95-.97 2.32 0 1.36.99 2.68 1.13 2.86.14.18 1.95 2.97 4.72 4.16.66.29 1.18.46 1.58.59.66.21 1.27.18 1.74.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32zM12.05 21.5h-.04c-1.66 0-3.29-.45-4.71-1.29l-.34-.2-3.5.92.93-3.42-.22-.35a8.45 8.45 0 0 1-1.3-4.5c0-4.67 3.81-8.48 8.49-8.48 2.27 0 4.4.88 6 2.49a8.45 8.45 0 0 1 2.49 6c0 4.67-3.81 8.48-8.49 8.48zM20.52 3.51A10.49 10.49 0 0 0 12.05 0C6.46 0 1.91 4.55 1.91 10.13c0 1.78.46 3.52 1.34 5.05L1.83 21l5.97-1.56a10.13 10.13 0 0 0 4.25.94h.01c5.59 0 10.14-4.55 10.14-10.13 0-2.71-1.06-5.25-2.98-7.16z" />
    </svg>
  );
}

function IconInstagram({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconNote({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M9 14h6M9 18h4" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "indigo",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "indigo" | "orange" | "emerald" | "sky" | "rose" | "zinc";
}) {
  const accentRing: Record<string, string> = {
    indigo: "from-indigo-500/30 to-transparent",
    orange: "from-orange-500/30 to-transparent",
    emerald: "from-emerald-500/30 to-transparent",
    sky: "from-sky-500/30 to-transparent",
    rose: "from-rose-500/30 to-transparent",
    zinc: "from-zinc-500/20 to-transparent",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accentRing[accent]}`}
      />
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function HotCard({
  lead,
  rank,
  status,
  onAction,
  fromLatestImport = false,
}: {
  lead: ScoredLead;
  rank: number;
  status: LeadStatus;
  onAction: (id: string) => void;
  fromLatestImport?: boolean;
}) {
  return (
    <div className="group relative flex h-full min-w-[260px] flex-col rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 transition hover:border-orange-400/30 hover:from-orange-500/[0.05]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/15 text-[11px] font-semibold text-orange-300 ring-1 ring-orange-500/30">
            {rank}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {lead.type}
          </span>
        </div>
        <div className="flex items-center gap-1 text-orange-300">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            HOT
          </span>
          <span className="tabular-nums text-base font-semibold">
            {lead.hotScore}
          </span>
        </div>
      </div>
      <div className="mt-3 truncate text-sm font-semibold text-zinc-100">
        {lead.name}
      </div>
      <div className="text-xs text-zinc-400">
        {lead.city} · {lead.region}
      </div>
      {fromLatestImport && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
            From Latest Import
          </span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {lead.hotReasons.slice(0, 3).map((r) => (
          <span
            key={r}
            className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 ring-1 ring-inset ring-white/10"
          >
            {r}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-4">
        <StatusPill status={status} />
        <button
          onClick={() => onAction(lead.id)}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200 transition hover:bg-white/10"
        >
          Open
          <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}

export default function Dashboard({ leads }: { leads: ScoredLead[] }) {
  const [stateMap, setStateMap] = useState<StateMap>({});
  const [extraLeads, setExtraLeads] = useState<ScoredLead[]>([]);
  const [dateLabel, setDateLabel] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LeadType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [sort, setSort] = useState<"hot" | "lead" | "name">("hot");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [recentlyImportedLeadIds, setRecentlyImportedLeadIds] = useState<string[]>([]);
  const [latestImportLeads, setLatestImportLeads] = useState<ScoredLead[]>([]);
  const [latestImportOnlyDuplicates, setLatestImportOnlyDuplicates] = useState(false);
  const [hasImportRun, setHasImportRun] = useState(false);
  const [sessionLeadIds, setSessionLeadIds] = useState<string[]>([]);
  const [allLeadsOpen, setAllLeadsOpen] = useState(false);
  const [showAllLeadsRows, setShowAllLeadsRows] = useState(false);
  const [focusMode, setFocusMode] = useState(true);
  const [allLeadsTab, setAllLeadsTab] = useState<"focused" | "new" | "hot" | "all">("focused");

  useEffect(() => {
    setStateMap(loadState());
    setExtraLeads(loadExtraLeads());
    setDateLabel(buildTodayLabel());
  }, []);

  const handleImport = async (req: ImportRequest): Promise<ImportResult> => {
    const res = await fetch("/api/import-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: req.city, type: req.type }),
    });
    const data = (await res.json()) as {
      leads?: ScoredLead[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || `Import failed (${res.status})`);
    }
    const imported = data.leads ?? [];

    const existingKeys = new Set<string>(
      [...leads, ...extraLeads].map((l) => leadDedupeKey(l.name, l.city))
    );

    const fresh = imported.filter(
      (l) => !existingKeys.has(leadDedupeKey(l.name, l.city))
    );
    const skipped = imported.length - fresh.length;
    const hot = fresh.filter((l) => l.hotScore >= 70).length;
    setHasImportRun(true);
    setLatestImportLeads(fresh);
    setLatestImportOnlyDuplicates(imported.length > 0 && fresh.length === 0);

    if (fresh.length > 0) {
      setSessionLeadIds((prev) => {
        const merged = new Set([...prev, ...fresh.map((l) => l.id)]);
        return Array.from(merged);
      });
      setRecentlyImportedLeadIds(fresh.map((l) => l.id));
      setExtraLeads((prev) => {
        const next = [...fresh, ...prev];
        saveExtraLeads(next);
        return next;
      });
    }

    return { added: fresh.length, hot, skipped };
  };

  useEffect(() => {
    if (recentlyImportedLeadIds.length === 0) return;
    const t = window.setTimeout(() => setRecentlyImportedLeadIds([]), 8000);
    return () => window.clearTimeout(t);
  }, [recentlyImportedLeadIds]);

  const updateLead = (id: string, patch: Partial<LeadStatusUpdate>) => {
    setStateMap((prev) => {
      const next: StateMap = {
        ...prev,
        [id]: {
          ...DEFAULT_STATE,
          ...prev[id],
          ...patch,
          updatedAt: Date.now(),
        },
      };
      saveState(next);
      return next;
    });
  };

  const getLeadState = (id: string): LeadStatusUpdate =>
    stateMap[id] ?? DEFAULT_STATE;

  const allRows = useMemo(() => {
    return [...extraLeads, ...leads].map((l) => ({ ...l, _s: getLeadState(l.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, extraLeads, stateMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allRows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter !== "all" && r._s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q) ||
        r.contactName.toLowerCase().includes(q) ||
        (r.instagram?.toLowerCase().includes(q) ?? false)
      );
    });
    list.sort((a, b) => {
      const aIsRecent = recentlyImportedLeadIds.includes(a.id);
      const bIsRecent = recentlyImportedLeadIds.includes(b.id);
      if (aIsRecent && !bIsRecent) return -1;
      if (!aIsRecent && bIsRecent) return 1;
      if (sort === "hot") return b.hotScore - a.hotScore;
      if (sort === "lead") return b.leadScore - a.leadScore;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [allRows, query, typeFilter, statusFilter, sort, recentlyImportedLeadIds]);

  const useLatestImportHotLeads = latestImportLeads.length > 0;
  const hotLeadsSource = useLatestImportHotLeads ? latestImportLeads : allRows;
  const hot5 = useMemo(
    () => [...hotLeadsSource].sort((a, b) => b.hotScore - a.hotScore).slice(0, 5),
    [hotLeadsSource]
  );

  const tabFiltered = useMemo(() => {
    if (allLeadsTab === "focused") {
      return filtered.filter((r) => r._s.status === "new" && r.hotScore >= 60);
    }
    if (allLeadsTab === "new") {
      return filtered.filter((r) => r._s.status === "new");
    }
    if (allLeadsTab === "hot") {
      return filtered.filter((r) => r.hotScore >= 70);
    }
    return filtered;
  }, [filtered, allLeadsTab]);

  const focusFiltered = useMemo(() => {
    if (!focusMode) return tabFiltered;
    return tabFiltered.filter((r) => r._s.status === "new" && r.hotScore >= 70);
  }, [tabFiltered, focusMode]);

  const visibleAllLeads = useMemo(() => {
    if (showAllLeadsRows) return focusFiltered;
    return focusFiltered.slice(0, 15);
  }, [focusFiltered, showAllLeadsRows]);

  const stats = useMemo(() => {
    const sessionRows = allRows.filter((r) => sessionLeadIds.includes(r.id));
    const sessionLeads = sessionRows.length;
    const hotToday = sessionRows.filter((r) => r.hotScore >= 70).length;
    const contacted = sessionRows.filter((r) =>
      ["contacted", "replied", "meeting", "won"].includes(r._s.status)
    ).length;
    const replied = sessionRows.filter((r) =>
      ["replied", "meeting", "won"].includes(r._s.status)
    ).length;
    const won = sessionRows.filter((r) => r._s.status === "won").length;
    const totalRevenuePotential = sessionRows.reduce(
      (acc, r) => acc + r.units * r.pricePerNight * 30 * 0.3,
      0
    );
    return { sessionLeads, hotToday, contacted, replied, won, totalRevenuePotential };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, stateMap, sessionLeadIds]);

  const openLead = openId ? allRows.find((r) => r.id === openId) : null;

  useEffect(() => {
    if (openLead) {
      setDraftNote(openLead._s.note ?? "");
    }
  }, [openId, openLead]);

  const handleQuickContacted = (id: string) => {
    const cur = getLeadState(id).status;
    if (cur === "new") updateLead(id, { status: "contacted" });
  };

  return (
    <div className="relative mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1 border-b border-white/5 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-orange-500 text-xs font-bold text-white shadow-lg shadow-indigo-500/20">
              T
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
              Tugobo <span className="text-zinc-400">Lead Engine</span>
            </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Find and contact high-probability tourism & accommodation leads
            every morning.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="hidden sm:inline">Today</span>
          <span
            className="rounded-md bg-white/5 px-2.5 py-1 font-medium text-zinc-200 ring-1 ring-inset ring-white/10 tabular-nums"
            suppressHydrationWarning
          >
            {dateLabel || "\u00A0"}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="tabular-nums">{stats.sessionLeads} session leads</span>
          <button
            onClick={() => setSessionLeadIds([])}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-white/10"
          >
            Start New Session
          </button>
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label="Session Leads"
          value={stats.sessionLeads}
          hint="Added this session"
          accent="indigo"
        />
        <StatCard
          label="Hot Leads"
          value={stats.hotToday}
          hint="Hot score ≥ 70 in session"
          accent="orange"
        />
        <StatCard
          label="Contacted"
          value={stats.contacted}
          hint="Session"
          accent="sky"
        />
        <StatCard
          label="Replied"
          value={stats.replied}
          hint="Session"
          accent="emerald"
        />
        <StatCard
          label="Won"
          value={stats.won}
          hint={`${formatTRY(stats.totalRevenuePotential)} session pipeline / mo`}
          accent="emerald"
        />
      </section>

      {/* Import */}
      <ImportPanel onImport={handleImport} />

      {/* Last Import Results */}
      <section className="overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] backdrop-blur ring-1 ring-inset ring-indigo-500/10">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-200">
            Last Import Results
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Only leads from your latest import
          </p>
        </div>

        {!hasImportRun ? (
          <div className="px-4 py-6 text-xs text-zinc-500">
            Run an import to see newly added leads here.
          </div>
        ) : latestImportLeads.length === 0 ? (
          <div className="px-4 py-6 text-sm text-amber-300">
            No new leads in this import — all results already existed.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Lead</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 font-medium">Lead Score</th>
                  <th className="px-4 py-2.5 font-medium">Hot Score</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {latestImportLeads.map((row) => {
                  const wa = whatsappLink(row.phone, row.name, row.contactName);
                  const ig = row.instagram ? instagramLink(row.instagram) : null;
                  return (
                    <tr
                      key={row.id}
                      className="bg-indigo-500/[0.05] shadow-[inset_0_0_0_1px_rgba(129,140,248,0.25)]"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setOpenId(row.id)}
                            className="text-left font-medium text-zinc-100 hover:text-white"
                          >
                            {row.name}
                          </button>
                          <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                            New Import
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        {row.type}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        <div>{row.city}</div>
                        <div className="text-[11px] text-zinc-500">{row.region}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ScoreBar score={row.leadScore} tone="lead" />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ScoreBar score={row.hotScore} tone="hot" />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleQuickContacted(row.id)}
                            title={`WhatsApp · ${row.phone}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            <IconWhatsapp className="h-4 w-4" />
                          </a>
                          <a
                            href={ig ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              if (!ig) e.preventDefault();
                            }}
                            aria-disabled={!ig}
                            title={
                              ig
                                ? `Instagram · @${row.instagram}`
                                : "No Instagram on file"
                            }
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                              ig
                                ? "border-pink-400/20 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20"
                                : "border-white/10 bg-white/5 text-zinc-500 cursor-not-allowed"
                            }`}
                          >
                            <IconInstagram className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => setOpenId(row.id)}
                            title="Open details"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 transition hover:bg-white/10"
                          >
                            Open
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {latestImportOnlyDuplicates && latestImportLeads.length === 0 && (
          <div className="border-t border-white/5 px-4 py-2 text-[11px] text-zinc-500">
            Latest import returned only duplicates.
          </div>
        )}
      </section>

      {/* Hot 10 */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-300">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
              {useLatestImportHotLeads
                ? "Hot Leads from Last Import"
                : "Today&apos;s Hot Leads"}
            </h2>
            <p className="text-xs text-zinc-500">
              Showing top opportunities from your latest search
            </p>
          </div>
        </div>
        <div className="-mx-1 grid grid-flow-col auto-cols-[260px] gap-3 overflow-x-auto px-1 pb-2 sm:auto-cols-[280px]">
          {hot5.map((lead, i) => (
            <HotCard
              key={lead.id}
              rank={i + 1}
              lead={lead}
              status={getLeadState(lead.id).status}
              onAction={(id) => setOpenId(id)}
              fromLatestImport={useLatestImportHotLeads}
            />
          ))}
        </div>
      </section>

      {/* All Leads (collapsible) */}
      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              All Leads
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Full database for browsing and follow-up
            </p>
          </div>
          <button
            onClick={() => setAllLeadsOpen((v) => !v)}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 transition hover:bg-white/10"
          >
            {allLeadsOpen ? "Hide" : "Show"}
          </button>
        </div>

        {allLeadsOpen && (
          <>
            <section className="flex flex-col gap-3 border-b border-white/5 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search lead, city, contact, or @instagram"
                    className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) =>
                    setSort(e.target.value as "hot" | "lead" | "name")
                  }
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="hot">Sort: Hot Score</option>
                  <option value="lead">Sort: Lead Score</option>
                  <option value="name">Sort: Name</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => {
                    setFocusMode((v) => !v);
                    setShowAllLeadsRows(false);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition ${
                    focusMode
                      ? "bg-orange-500/20 text-orange-200 ring-orange-400/40"
                      : "bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10"
                  }`}
                >
                  Focus Mode: {focusMode ? "On" : "Off"}
                </button>
                <FilterChip
                  label="All types"
                  active={typeFilter === "all"}
                  onClick={() => setTypeFilter("all")}
                />
                {TYPES.map((t) => (
                  <FilterChip
                    key={t}
                    label={t}
                    active={typeFilter === t}
                    onClick={() => setTypeFilter(t)}
                  />
                ))}
                <span className="mx-1 h-4 w-px bg-white/10" />
                <FilterChip
                  label="All status"
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                />
                {STATUS_ORDER.map((s) => (
                  <FilterChip
                    key={s}
                    label={STATUS_LABEL[s]}
                    active={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                  />
                ))}
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-4 py-2">
              <FilterChip
                label="Focused"
                active={allLeadsTab === "focused"}
                onClick={() => {
                  setAllLeadsTab("focused");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label="New"
                active={allLeadsTab === "new"}
                onClick={() => {
                  setAllLeadsTab("new");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label="Hot"
                active={allLeadsTab === "hot"}
                onClick={() => {
                  setAllLeadsTab("hot");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label="All"
                active={allLeadsTab === "all"}
                onClick={() => {
                  setAllLeadsTab("all");
                  setShowAllLeadsRows(false);
                }}
              />
            </div>

            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
              <span className="text-xs text-zinc-500 tabular-nums">
                Showing {visibleAllLeads.length} of {focusFiltered.length} leads
              </span>
              {focusMode && (
                <span className="text-[11px] text-orange-300">
                  Focused: status New + hot score ≥ 70
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Lead</th>
                    <th className="px-4 py-2.5 font-medium">Location</th>
                    <th className="px-4 py-2.5 font-medium">Lead Score</th>
                    <th className="px-4 py-2.5 font-medium">Hot Score</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleAllLeads.map((row) => {
                    const s = row._s;
                    const wa = whatsappLink(row.phone, row.name, row.contactName);
                    const ig = row.instagram ? instagramLink(row.instagram) : null;
                    const isRecentlyImported = recentlyImportedLeadIds.includes(row.id);
                    const hotStyle =
                      row.hotScore > 80
                        ? "text-orange-200"
                        : row.hotScore >= 70
                        ? "text-zinc-200"
                        : "text-zinc-500";
                    return (
                      <tr
                        key={row.id}
                        className={`group transition hover:bg-white/[0.025] ${
                          row.hotScore > 80
                            ? "bg-orange-500/[0.05]"
                            : row.hotScore >= 70
                            ? "bg-white/[0.02]"
                            : "opacity-75"
                        } ${
                          isRecentlyImported
                            ? "shadow-[inset_0_0_0_1px_rgba(129,140,248,0.35)]"
                            : ""
                        } ${openId === row.id ? "bg-white/[0.03]" : ""}`}
                      >
                        <td className="px-4 py-3 align-top">
                          <button
                            onClick={() => setOpenId(row.id)}
                            className="text-left"
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-zinc-100 hover:text-white">
                                {row.name}
                              </div>
                              {isRecentlyImported && (
                                <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                                  New Import
                                </span>
                              )}
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-zinc-300">
                          <div>{row.city}</div>
                          <div className="text-[11px] text-zinc-500">{row.region}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <ScoreBar score={row.leadScore} tone="lead" />
                        </td>
                        <td className={`px-4 py-3 align-top ${hotStyle}`}>
                          <ScoreBar score={row.hotScore} tone="hot" />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleQuickContacted(row.id)}
                              title={`WhatsApp · ${row.phone}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/20"
                            >
                              <IconWhatsapp className="h-4 w-4" />
                            </a>
                            <a
                              href={ig ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                if (!ig) e.preventDefault();
                              }}
                              aria-disabled={!ig}
                              title={
                                ig
                                  ? `Instagram · @${row.instagram}`
                                  : "No Instagram on file"
                              }
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                                ig
                                  ? "border-pink-400/20 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20"
                                  : "border-white/10 bg-white/5 text-zinc-500 cursor-not-allowed"
                              }`}
                            >
                              <IconInstagram className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => setOpenId(row.id)}
                              title="Open notes"
                              className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                                s.note
                                  ? "border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                              }`}
                            >
                              <IconNote className="h-4 w-4" />
                              {s.note && (
                                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {focusFiltered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                        No leads match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {focusFiltered.length > 15 && (
              <div className="flex justify-center border-t border-white/5 px-4 py-3">
                <button
                  onClick={() => setShowAllLeadsRows((v) => !v)}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/10"
                >
                  {showAllLeadsRows ? "Show less" : "Show more"}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <footer className="pb-8 pt-2 text-center text-[11px] text-zinc-600">
        Tugobo Lead Engine · founder MVP · data is local to this browser
      </footer>

      {/* Drawer */}
      {openLead && (
        <div
          className="fixed inset-0 z-40 flex"
          role="dialog"
          aria-modal="true"
        >
          <button
            aria-label="Close"
            onClick={() => setOpenId(null)}
            className="flex-1 bg-black/60 backdrop-blur-sm"
          />
          <aside className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {openLead.type} · {openLead.city}
                </div>
                <div className="mt-0.5 text-base font-semibold text-zinc-50">
                  {openLead.name}
                </div>
                <div className="text-xs text-zinc-400">
                  {openLead.contactName} · {openLead.phone}
                </div>
              </div>
              <button
                onClick={() => setOpenId(null)}
                className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                aria-label="Close panel"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <DetailStat
                  label="Lead Score"
                  value={openLead.leadScore}
                  reasons={openLead.leadReasons}
                  tone="lead"
                />
                <DetailStat
                  label="Hot Score"
                  value={openLead.hotScore}
                  reasons={openLead.hotReasons}
                  tone="hot"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <KV label="Units" value={openLead.units.toString()} />
                <KV label="ADR" value={formatTRY(openLead.pricePerNight)} />
                <KV
                  label="Occupancy 30d"
                  value={`${Math.round(openLead.occupancy30d * 100)}%`}
                />
                <KV label="Rating" value={openLead.rating.toFixed(1)} />
                <KV
                  label="Reviews"
                  value={openLead.reviewsCount.toString()}
                />
                <KV
                  label="Channels"
                  value={openLead.channels.join(", ")}
                />
              </div>

              {openLead.signals.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                    Signals
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {openLead.signals.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 ring-1 ring-inset ring-white/10"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <a
                  href={whatsappLink(
                    openLead.phone,
                    openLead.name,
                    openLead.contactName
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleQuickContacted(openLead.id)}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  <IconWhatsapp className="h-4 w-4" />
                  WhatsApp
                </a>
                {openLead.instagram && (
                  <a
                    href={instagramLink(openLead.instagram)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-pink-400/20 bg-pink-500/10 px-3 py-1.5 text-xs font-medium text-pink-200 transition hover:bg-pink-500/20"
                  >
                    <IconInstagram className="h-4 w-4" />@{openLead.instagram}
                  </a>
                )}
                {openLead.website && (
                  <a
                    href={`https://${openLead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                  >
                    {openLead.website}
                  </a>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                    Status
                  </div>
                  {openLead._s.updatedAt && (
                    <div className="text-[10px] text-zinc-600">
                      Updated{" "}
                      {new Date(openLead._s.updatedAt).toLocaleString("en-GB")}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s) => {
                    const active = openLead._s.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => updateLead(openLead.id, { status: s })}
                        className={`rounded-md px-2.5 py-1 text-xs ring-1 ring-inset transition ${
                          active
                            ? "bg-indigo-500/20 text-indigo-200 ring-indigo-400/40"
                            : "bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                    Notes
                  </div>
                  <div className="text-[10px] text-zinc-600">
                    {draftNote.length} chars
                  </div>
                </div>
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="Owner picks up calls in the afternoon. Interested in direct booking site. Follow up Tuesday."
                  rows={6}
                  className="w-full resize-none rounded-md border border-white/10 bg-black/30 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setDraftNote(openLead._s.note ?? "")}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() =>
                      updateLead(openLead.id, { note: draftNote })
                    }
                    className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400"
                  >
                    Save note
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition ${
        active
          ? "bg-indigo-500/20 text-indigo-200 ring-indigo-400/40"
          : "bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-zinc-100">{value}</div>
    </div>
  );
}

function DetailStat({
  label,
  value,
  reasons,
  tone,
}: {
  label: string;
  value: number;
  reasons: string[];
  tone: "lead" | "hot";
}) {
  const accent =
    tone === "hot"
      ? "from-orange-500/20 to-orange-500/0 ring-orange-400/30"
      : "from-indigo-500/20 to-indigo-500/0 ring-indigo-400/30";
  return (
    <div
      className={`rounded-lg border border-white/10 bg-gradient-to-b ${accent} p-3 ring-1 ring-inset`}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold ${scoreColor(value)}`}>
          {value}
        </span>
        <span className="text-xs text-zinc-500">/ 100</span>
      </div>
      {reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {reasons.map((r) => (
            <span
              key={r}
              className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 ring-1 ring-inset ring-white/10"
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
