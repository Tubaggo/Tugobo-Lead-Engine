"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ContactQuality,
  type LeadStatus,
  type LeadStatusUpdate,
  type LeadType,
  type ScoredLead,
  STATUS_LABEL,
  STATUS_ORDER,
  getContactQuality,
  getTurkishPhoneKind,
  instagramLink,
  whatsappLink,
  whatsappLinkWithText,
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
const IMPORTED_LEADS_V2_KEY = "tugobo-lead-engine:imported-leads-v2";
const LAST_IMPORT_KEY = "tugobo-lead-engine:last-import-v1";
const IMPORT_CACHE_KEY = "tugobo-lead-engine:import-cache-v1";
const CONTACT_FINDER_MAP_KEY = "tugobo-lead-engine:contact-finder-map-v1";
const IMPORT_META_KEY = "tugobo-lead-engine:import-meta-v1";

type LastImportPayload = { batch: ScoredLead[]; newIds: string[] };

type ContactChannelCat = "ready" | "needs_finder" | "none";

type StateMap = Record<string, LeadStatusUpdate>;

const DEFAULT_STATE: LeadStatusUpdate = {
  status: "new",
  note: "",
  updatedAt: null,
  contactedAt: null,
  channel: null,
};

const TYPES: LeadType[] = [
  "Hotel",
  "Boutique Hotel",
  "Bungalow",
  "Villa",
  "Pension",
];

const CONTACT_QUALITY_LABEL: Record<ContactQuality, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

type ContactFinderType =
  | "VERIFIED_WHATSAPP"
  | "GENERATED_WHATSAPP"
  | "PHONE_ONLY"
  | "whatsapp"
  | "mobile"
  | "phone"
  | "instagram"
  | "email"
  | "website";

type ContactFinderConfidence = "high" | "medium" | "low";

type ContactFinderResult = {
  bestContactType: ContactFinderType;
  bestContactValue: string;
  confidence: ContactFinderConfidence;
  foundPhones: string[];
  foundEmails: string[];
  foundInstagram: string[];
  foundWhatsapp: string[];
  source:
    | "Website WhatsApp link"
    | "Website phone number"
    | "Website Instagram link"
    | "Website email"
    | "Website homepage";
  reason: string;
};

type ContactFinderState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; error: string }
  | { phase: "ready"; result: ContactFinderResult };

type OutreachProgressState =
  | { phase: "idle" }
  | { phase: "running"; current: number; total: number }
  | { phase: "done"; sent: number; skipped: number };

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

function loadImportedLeadsV2(): ScoredLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IMPORTED_LEADS_V2_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ScoredLead[]) : [];
    }
    const leg = window.localStorage.getItem(EXTRA_LEADS_KEY);
    if (leg) {
      const parsed = JSON.parse(leg);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.localStorage.setItem(IMPORTED_LEADS_V2_KEY, leg);
        return parsed as ScoredLead[];
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveImportedLeadsV2(leads: ScoredLead[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORTED_LEADS_V2_KEY, JSON.stringify(leads));
  } catch {
    // ignore quota errors
  }
}

function loadLastImportPayload(): LastImportPayload {
  if (typeof window === "undefined") return { batch: [], newIds: [] };
  try {
    const raw = window.localStorage.getItem(LAST_IMPORT_KEY);
    if (!raw) return { batch: [], newIds: [] };
    const p = JSON.parse(raw) as {
      batch?: ScoredLead[];
      newIds?: string[];
    };
    return {
      batch: Array.isArray(p.batch) ? p.batch : [],
      newIds: Array.isArray(p.newIds) ? p.newIds : [],
    };
  } catch {
    return { batch: [], newIds: [] };
  }
}

function saveLastImportPayload(payload: LastImportPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function loadImportCache(): Record<string, ScoredLead[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IMPORT_CACHE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === "object" && p !== null && !Array.isArray(p)
      ? (p as Record<string, ScoredLead[]>)
      : {};
  } catch {
    return {};
  }
}

function saveImportCache(cache: Record<string, ScoredLead[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function loadContactFinderMap(): Record<string, ContactFinderResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONTACT_FINDER_MAP_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === "object" && p !== null && !Array.isArray(p)
      ? (p as Record<string, ContactFinderResult>)
      : {};
  } catch {
    return {};
  }
}

function saveContactFinderMap(map: Record<string, ContactFinderResult>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTACT_FINDER_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function loadImportMeta(): { hasRun: boolean } {
  if (typeof window === "undefined") return { hasRun: false };
  try {
    const raw = window.localStorage.getItem(IMPORT_META_KEY);
    if (!raw) return { hasRun: false };
    const p = JSON.parse(raw) as { hasRun?: boolean };
    return { hasRun: Boolean(p?.hasRun) };
  } catch {
    return { hasRun: false };
  }
}

function saveImportMeta(meta: { hasRun: boolean }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORT_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

function normalizePhoneDedupe(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  while (d.startsWith("00") && d.length > 2) d = d.slice(2);
  if (d.startsWith("90") && d.length > 2) d = d.slice(2);
  return d.length >= 10 ? d : null;
}

function normalizeWebDedupe(web?: string): string | null {
  if (!web?.trim()) return null;
  const h = web
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return h || null;
}

function dedupeKeysForLead(lead: ScoredLead): string[] {
  const keys: string[] = [leadDedupeKey(lead.name, lead.city)];
  const pk = normalizePhoneDedupe(lead.phone);
  if (pk) keys.push(`phone:${pk}`);
  const wk = normalizeWebDedupe(lead.website);
  if (wk) keys.push(`web:${wk}`);
  return keys;
}

function buildDedupeKeySet(base: ScoredLead[]): Set<string> {
  const s = new Set<string>();
  for (const l of base) {
    for (const k of dedupeKeysForLead(l)) s.add(k);
  }
  return s;
}

function isDuplicateAgainstSet(lead: ScoredLead, keys: Set<string>): boolean {
  for (const k of dedupeKeysForLead(lead)) {
    if (keys.has(k)) return true;
  }
  return false;
}

function addLeadToDedupeSet(lead: ScoredLead, keys: Set<string>) {
  for (const k of dedupeKeysForLead(lead)) keys.add(k);
}

function mergeImportBatch(
  prevImported: ScoredLead[],
  seedLeads: ScoredLead[],
  batch: ScoredLead[],
): { next: ScoredLead[]; fresh: ScoredLead[]; newIds: string[] } {
  const base = prevImported.length > 0 ? prevImported : seedLeads;
  const keySet = buildDedupeKeySet(base);
  const fresh: ScoredLead[] = [];
  for (const l of batch) {
    if (isDuplicateAgainstSet(l, keySet)) continue;
    fresh.push(l);
    addLeadToDedupeSet(l, keySet);
  }
  if (fresh.length === 0) {
    return { next: prevImported, fresh, newIds: [] };
  }
  return {
    next: [...fresh, ...prevImported],
    fresh,
    newIds: fresh.map((x) => x.id),
  };
}

function classifyContactChannel(
  lead: ScoredLead,
  finder: ContactFinderResult | undefined,
): ContactChannelCat {
  const finderDirect =
    finder &&
    [
      "VERIFIED_WHATSAPP",
      "GENERATED_WHATSAPP",
      "whatsapp",
      "mobile",
      "instagram",
      "email",
    ].includes(finder.bestContactType);

  const leadDirect =
    Boolean(lead.instagram?.trim()) ||
    whatsappLink(lead.phone) !== null ||
    (getTurkishPhoneKind(lead.phone) === "mobile" &&
      normalizePhoneDedupe(lead.phone) !== null);

  if (leadDirect || finderDirect) return "ready";

  if (lead.website?.trim()) {
    if (!finder) return "needs_finder";
    return "none";
  }
  return "none";
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

function openExternal(url: string) {
  window.open(url, "_blank");
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

function IconGlobe({ className = "" }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LeadWebsiteAction({ website }: { website?: string }) {
  const host = website?.trim();
  if (!host) return null;
  const href = `https://${host.replace(/^https?:\/\//i, "")}`;
  const square =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-sky-400/20 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Web sitesi"
      className={square}
    >
      <IconGlobe className="h-4 w-4" />
    </a>
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

function IconSpark({ className = "" }: { className?: string }) {
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
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.25-6.25a2 2 0 0 1 0-2.828l6.25-6.25a2 2 0 0 1 2.828 0l6.25 6.25a2 2 0 0 1 0 2.828l-6.25 6.25a2 2 0 0 0-1.437 1.437z" />
      <path d="m14 6 3.535 3.536" />
      <path d="M12.061 16.5 16.06 12.5" />
      <path d="m17 10 2 2" />
      <path d="M19.061 6.5 20 5.5" />
    </svg>
  );
}

type AiMessageModalState =
  | null
  | { lead: ScoredLead; phase: "loading" }
  | { lead: ScoredLead; phase: "ready"; message: string }
  | { lead: ScoredLead; phase: "error"; error: string };

function AiMessageModal({
  state,
  onClose,
  onRetry,
  onMarkContacted,
}: {
  state: AiMessageModalState;
  onClose: () => void;
  onRetry: (lead: ScoredLead) => void;
  onMarkContacted: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [state]);

  if (!state) return null;

  const { lead } = state;
  const waReady =
    state.phase === "ready"
      ? whatsappLinkWithText(lead.phone, state.message)
      : null;

  const handleCopy = async () => {
    if (state.phase !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-message-title"
    >
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-white/10 bg-zinc-950 shadow-2xl ring-1 ring-white/5">
        <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2
              id="ai-message-title"
              className="text-sm font-semibold text-zinc-100"
            >
              AI Message
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">{lead.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            aria-label="Kapat"
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

        <div className="max-h-[min(60vh,28rem)] overflow-y-auto px-4 py-3">
          {state.phase === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400"
                aria-hidden
              />
              <p className="text-sm text-zinc-400">Mesaj oluşturuluyor…</p>
            </div>
          )}
          {state.phase === "error" && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-rose-300">{state.error}</p>
              <button
                type="button"
                onClick={() => onRetry(lead)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
              >
                Tekrar dene
              </button>
            </div>
          )}
          {state.phase === "ready" && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
              {state.message}
            </p>
          )}
        </div>

        {state.phase === "ready" && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            {waReady ? (
              <button
                type="button"
                onClick={() => {
                  openExternal(waReady);
                  onMarkContacted(lead.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-3 py-1.5 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25"
              >
                <IconWhatsapp className="h-4 w-4" />
                Open WhatsApp 🚀
              </button>
            ) : (
              <span
                title="WhatsApp bulunamadı"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-500"
              >
                <IconWhatsapp className="h-4 w-4" />
                Open WhatsApp 🚀
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadWhatsAppAction({
  phone,
  leadId,
  onMarkContacted,
}: {
  phone: string;
  leadId: string;
  onMarkContacted: (id: string) => void;
}) {
  const wa = whatsappLink(phone);
  const square =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition";
  if (wa) {
    return (
      <button
        type="button"
        onClick={() => {
          openExternal(wa);
          onMarkContacted(leadId);
        }}
        title="WhatsApp ile ulaş"
        className={`${square} border-[#25D366]/35 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25`}
      >
        <IconWhatsapp className="h-4 w-4" />
      </button>
    );
  }
  return (
    <span
      title="WhatsApp bulunamadı"
      aria-disabled="true"
      className={`${square} cursor-not-allowed border-white/10 bg-white/5 text-zinc-500`}
    >
      <IconWhatsapp className="h-4 w-4" />
    </span>
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
  const [importedLeads, setImportedLeads] = useState<ScoredLead[]>([]);
  const importedLeadsRef = useRef<ScoredLead[]>([]);
  importedLeadsRef.current = importedLeads;

  const [dateLabel, setDateLabel] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LeadType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [contactChannelFilter, setContactChannelFilter] = useState<
    "all" | ContactChannelCat
  >("all");
  const [sort, setSort] = useState<"hot" | "lead" | "name">("hot");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [recentlyImportedLeadIds, setRecentlyImportedLeadIds] = useState<string[]>([]);
  const [latestImportLeads, setLatestImportLeads] = useState<ScoredLead[]>([]);
  const [lastImportNewIds, setLastImportNewIds] = useState<string[]>([]);
  const [latestImportOnlyDuplicates, setLatestImportOnlyDuplicates] = useState(false);
  const [hasImportRun, setHasImportRun] = useState(false);
  const [sessionLeadIds, setSessionLeadIds] = useState<string[]>([]);
  const [allLeadsOpen, setAllLeadsOpen] = useState(false);
  const [showAllLeadsRows, setShowAllLeadsRows] = useState(false);
  const [focusMode, setFocusMode] = useState(true);
  const [allLeadsTab, setAllLeadsTab] = useState<"focused" | "new" | "hot" | "all">("focused");
  const [aiMessageModal, setAiMessageModal] = useState<AiMessageModalState>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [outreachProgress, setOutreachProgress] = useState<OutreachProgressState>({
    phase: "idle",
  });
  const [contactFinder, setContactFinder] = useState<ContactFinderState>({
    phase: "idle",
  });
  const [contactFinderMap, setContactFinderMap] = useState<
    Record<string, ContactFinderResult>
  >({});

  useEffect(() => {
    setStateMap(loadState());
    const stored = loadImportedLeadsV2();
    setImportedLeads(stored);
    importedLeadsRef.current = stored;
    const lip = loadLastImportPayload();
    setLatestImportLeads(lip.batch);
    setLastImportNewIds(lip.newIds);
    setContactFinderMap(loadContactFinderMap());
    const meta = loadImportMeta();
    setHasImportRun(
      meta.hasRun ||
        lip.batch.length > 0 ||
        stored.some((l) => l.id.startsWith("gmaps-")),
    );
    setDateLabel(buildTodayLabel());
  }, []);

  const handleImport = async (req: ImportRequest): Promise<ImportResult> => {
    const cityNorm = req.city.trim().toLowerCase();
    const cacheKey = `${cityNorm}|${req.type}|${req.source}`;
    let batch: ScoredLead[] = [];
    const cache = loadImportCache();

    if (!req.forceGoogleRefresh) {
      const hit = cache[cacheKey];
      if (Array.isArray(hit) && hit.length > 0) {
        batch = hit;
      }
    }

    if (batch.length === 0 || req.forceGoogleRefresh) {
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
      batch = data.leads ?? [];
      if (batch.length > 0) {
        saveImportCache({ ...cache, [cacheKey]: batch });
      }
    }

    saveImportMeta({ hasRun: true });
    setHasImportRun(true);
    setLatestImportLeads(batch);

    const prev = importedLeadsRef.current;
    const { next, fresh, newIds } = mergeImportBatch(prev, leads, batch);
    setImportedLeads(next);
    importedLeadsRef.current = next;
    saveImportedLeadsV2(next);
    setLastImportNewIds(newIds);
    saveLastImportPayload({ batch, newIds });

    setLatestImportOnlyDuplicates(batch.length > 0 && fresh.length === 0);

    if (fresh.length > 0) {
      setSessionLeadIds((prev) => {
        const merged = new Set([...prev, ...fresh.map((l) => l.id)]);
        return Array.from(merged);
      });
      setRecentlyImportedLeadIds(fresh.map((l) => l.id));
    }

    const hot = fresh.filter((l) => l.hotScore >= 70).length;
    const skipped = batch.length - fresh.length;
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
    const base = importedLeads.length > 0 ? importedLeads : leads;
    return base.map((l) => ({
      ...l,
      _s: getLeadState(l.id),
      contactQuality: getContactQuality(l.phone),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, importedLeads, stateMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allRows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter !== "all" && r._s.status !== statusFilter) return false;
      if (contactChannelFilter !== "all") {
        const cat = classifyContactChannel(r, contactFinderMap[r.id]);
        if (contactChannelFilter !== cat) return false;
      }
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
  }, [
    allRows,
    query,
    typeFilter,
    statusFilter,
    contactChannelFilter,
    contactFinderMap,
    sort,
    recentlyImportedLeadIds,
  ]);

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

  const allRowsById = useMemo(() => {
    return new Map(allRows.map((r) => [r.id, r]));
  }, [allRows]);

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
  const drawerWaLink = openLead ? whatsappLink(openLead.phone) : null;

  useEffect(() => {
    if (!openLead) return;
    setDraftNote(openLead._s.note ?? "");
    const saved = contactFinderMap[openLead.id];
    if (saved) setContactFinder({ phase: "ready", result: saved });
    else setContactFinder({ phase: "idle" });
  }, [openId, openLead?.id, contactFinderMap]);

  const handleQuickContacted = (id: string) => {
    const cur = getLeadState(id).status;
    if (cur === "new") {
      updateLead(id, {
        status: "contacted",
        contactedAt: Date.now(),
        channel: "whatsapp",
      });
    }
  };

  const startAiMessage = async (lead: ScoredLead) => {
    setAiMessageModal({ lead, phase: "loading" });
    try {
      const res = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name,
          type: lead.type,
          location: `${lead.city}, ${lead.region}`,
          leadScore: lead.leadScore,
          hotScore: lead.hotScore,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Sunucu hatası (${res.status})`);
      }
      if (typeof data.message !== "string" || !data.message.trim()) {
        throw new Error("Boş mesaj döndü");
      }
      setAiMessageModal({
        lead,
        phase: "ready",
        message: data.message.trim(),
      });
    } catch (e) {
      setAiMessageModal({
        lead,
        phase: "error",
        error: e instanceof Error ? e.message : "Bir hata oluştu",
      });
    }
  };

  const findBestContact = async (leadId: string, website: string) => {
    setContactFinder({ phase: "loading" });
    try {
      const res = await fetch("/api/contact-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const data = (await res.json()) as ContactFinderResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Contact finder failed (${res.status})`);
      }
      setContactFinder({ phase: "ready", result: data });
      setContactFinderMap((prev) => {
        const next = { ...prev, [leadId]: data };
        saveContactFinderMap(next);
        return next;
      });
    } catch (e) {
      setContactFinder({
        phase: "error",
        error: e instanceof Error ? e.message : "Contact finder failed",
      });
    }
  };

  const visibleLeadIdSet = useMemo(
    () => new Set(visibleAllLeads.map((r) => r.id)),
    [visibleAllLeads],
  );
  const selectedVisibleCount = selectedLeadIds.filter((id) =>
    visibleLeadIdSet.has(id),
  ).length;
  const allVisibleSelected =
    visibleAllLeads.length > 0 && selectedVisibleCount === visibleAllLeads.length;

  const toggleLeadSelection = (leadId: string, checked: boolean) => {
    setSelectedLeadIds((prev) => {
      if (checked) {
        if (prev.includes(leadId)) return prev;
        return [...prev, leadId];
      }
      return prev.filter((id) => id !== leadId);
    });
  };

  const toggleSelectVisible = (checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const visibleIds = visibleAllLeads.map((r) => r.id);
      if (checked) {
        const next = new Set(prev);
        for (const id of visibleIds) next.add(id);
        return Array.from(next);
      }
      const visibleSet = new Set(visibleIds);
      return prev.filter((id) => !visibleSet.has(id));
    });
  };

  const markSelectedAsContacted = () => {
    const ts = Date.now();
    for (const id of selectedLeadIds) {
      updateLead(id, { status: "contacted", contactedAt: ts, channel: "whatsapp" });
    }
  };

  const sendBulkAiMessages = async () => {
    if (selectedLeadIds.length === 0) return;

    let sent = 0;
    let skipped = 0;
    const total = selectedLeadIds.length;
    const ts = Date.now();

    for (let i = 0; i < selectedLeadIds.length; i++) {
      const id = selectedLeadIds[i];
      setOutreachProgress({ phase: "running", current: i + 1, total });

      const lead = allRowsById.get(id);
      if (!lead) {
        skipped += 1;
        continue;
      }

      const finder = contactFinderMap[id];
      const finderType = finder?.bestContactType;
      const isWhatsAppContact =
        finderType === "VERIFIED_WHATSAPP" || finderType === "GENERATED_WHATSAPP";
      if (!isWhatsAppContact) {
        skipped += 1;
        continue;
      }

      let baseLink = finder?.bestContactValue ?? "";
      if (!/^https?:\/\//i.test(baseLink)) {
        skipped += 1;
        continue;
      }

      try {
        const res = await fetch("/api/generate-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: lead.name,
            type: lead.type,
            location: `${lead.city}, ${lead.region}`,
            leadScore: lead.leadScore,
            hotScore: lead.hotScore,
          }),
        });
        const data = (await res.json()) as { message?: string; error?: string };
        if (!res.ok || !data.message?.trim()) {
          skipped += 1;
          continue;
        }

        const link = new URL(baseLink);
        link.searchParams.set("text", data.message.trim());
        window.open(link.toString(), "_blank");
        updateLead(id, { status: "contacted", contactedAt: ts, channel: "whatsapp" });
        sent += 1;
      } catch {
        skipped += 1;
      }
    }

    setOutreachProgress({ phase: "done", sent, skipped });
    setSelectedLeadIds([]);
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
                          {lastImportNewIds.includes(row.id) && (
                            <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                              New Import
                            </span>
                          )}
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
                          <LeadWhatsAppAction
                            phone={row.phone}
                            leadId={row.id}
                            onMarkContacted={handleQuickContacted}
                          />
                          <LeadWebsiteAction website={row.website} />
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
                            type="button"
                            onClick={() => void startAiMessage(row)}
                            title="Kişiselleştirilmiş AI mesajı"
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 sm:text-xs"
                          >
                            <IconSpark className="h-3.5 w-3.5 shrink-0" />
                            AI Message
                          </button>
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
                <span className="mx-1 h-4 w-px bg-white/10" />
                <FilterChip
                  label="Contact: all"
                  active={contactChannelFilter === "all"}
                  onClick={() => setContactChannelFilter("all")}
                />
                <FilterChip
                  label="Contact Ready"
                  active={contactChannelFilter === "ready"}
                  onClick={() => setContactChannelFilter("ready")}
                />
                <FilterChip
                  label="Needs Finder"
                  active={contactChannelFilter === "needs_finder"}
                  onClick={() => setContactChannelFilter("needs_finder")}
                />
                <FilterChip
                  label="No Contact"
                  active={contactChannelFilter === "none"}
                  onClick={() => setContactChannelFilter("none")}
                />
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

            {selectedLeadIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-2">
                <span className="text-xs text-zinc-400">
                  {selectedLeadIds.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void sendBulkAiMessages()}
                    className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
                  >
                    Send AI Message
                  </button>
                  <button
                    type="button"
                    onClick={markSelectedAsContacted}
                    className="rounded-md border border-sky-400/25 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
                  >
                    Mark as Contacted
                  </button>
                </div>
                {outreachProgress.phase === "running" && (
                  <span className="text-xs text-zinc-400">
                    Sending {outreachProgress.current}/{outreachProgress.total}...
                  </span>
                )}
                {outreachProgress.phase === "done" && (
                  <span className="text-xs text-zinc-400">
                    {outreachProgress.sent} sent, {outreachProgress.skipped} skipped
                  </span>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        aria-label="Select visible leads"
                        onChange={(e) => toggleSelectVisible(e.target.checked)}
                      />
                    </th>
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
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(row.id)}
                            aria-label={`Select ${row.name}`}
                            onChange={(e) =>
                              toggleLeadSelection(row.id, e.target.checked)
                            }
                          />
                        </td>
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
                            <LeadWhatsAppAction
                              phone={row.phone}
                              leadId={row.id}
                              onMarkContacted={handleQuickContacted}
                            />
                            <LeadWebsiteAction website={row.website} />
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
                              type="button"
                              onClick={() => void startAiMessage(row)}
                              title="Kişiselleştirilmiş AI mesajı"
                              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 sm:text-xs"
                            >
                              <IconSpark className="h-3.5 w-3.5 shrink-0" />
                              AI Message
                            </button>
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
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
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

      <AiMessageModal
        state={aiMessageModal}
        onClose={() => setAiMessageModal(null)}
        onRetry={(l) => void startAiMessage(l)}
        onMarkContacted={handleQuickContacted}
      />

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
                <KV
                  label="Contact quality"
                  value={CONTACT_QUALITY_LABEL[openLead.contactQuality]}
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
                {drawerWaLink ? (
                  <button
                    type="button"
                    onClick={() => {
                      openExternal(drawerWaLink);
                      handleQuickContacted(openLead.id);
                    }}
                    title="WhatsApp ile ulaş"
                    className="inline-flex items-center gap-2 rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-3 py-1.5 text-xs font-medium text-[#25D366] transition hover:bg-[#25D366]/25"
                  >
                    <IconWhatsapp className="h-4 w-4" />
                    Open WhatsApp 🚀
                  </button>
                ) : (
                  <span
                    title="WhatsApp bulunamadı"
                    aria-disabled="true"
                    className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-500"
                  >
                    <IconWhatsapp className="h-4 w-4" />
                    WhatsApp
                  </span>
                )}
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
                {openLead.website && (
                  <button
                    type="button"
                    onClick={() =>
                      void findBestContact(openLead.id, openLead.website!)
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
                  >
                    Find Best Contact
                  </button>
                )}
              </div>

              {openLead.website && (
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
                    Contact Finder
                  </div>
                  {contactFinder.phase === "idle" && (
                    <div className="text-zinc-500">
                      Click "Find Best Contact" to analyze homepage contact channels.
                    </div>
                  )}
                  {contactFinder.phase === "loading" && (
                    <div className="text-zinc-300">Analyzing website...</div>
                  )}
                  {contactFinder.phase === "error" && (
                    <div className="text-rose-300">{contactFinder.error}</div>
                  )}
                  {contactFinder.phase === "ready" && (
                    <div className="space-y-1.5 text-zinc-300">
                      <div>
                        <span className="text-zinc-500">Best Contact:</span>{" "}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                            contactFinder.result.bestContactType === "VERIFIED_WHATSAPP" ||
                            contactFinder.result.bestContactType === "whatsapp"
                              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                              : contactFinder.result.bestContactType ===
                                    "GENERATED_WHATSAPP"
                                ? "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30"
                                : contactFinder.result.bestContactType === "PHONE_ONLY" ||
                                    contactFinder.result.bestContactType === "mobile" ||
                                    contactFinder.result.bestContactType === "phone"
                                  ? "bg-zinc-500/15 text-zinc-300 ring-1 ring-inset ring-zinc-500/30"
                                  : "text-zinc-100"
                          }`}
                        >
                          {contactFinder.result.bestContactType === "VERIFIED_WHATSAPP" ||
                          contactFinder.result.bestContactType === "whatsapp"
                            ? "Verified WhatsApp"
                            : contactFinder.result.bestContactType ===
                                  "GENERATED_WHATSAPP"
                              ? "WhatsApp Available"
                              : contactFinder.result.bestContactType === "PHONE_ONLY" ||
                                  contactFinder.result.bestContactType === "mobile" ||
                                  contactFinder.result.bestContactType === "phone"
                                ? "Phone Only"
                                : contactFinder.result.bestContactType.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Value:</span>{" "}
                        <span className="font-medium text-zinc-100">
                          {contactFinder.result.bestContactValue}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Confidence:</span>{" "}
                        <span className="font-medium text-zinc-100">
                          {contactFinder.result.confidence}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Source:</span>{" "}
                        {contactFinder.result.source}
                      </div>
                      <div>
                        <span className="text-zinc-500">Reason:</span>{" "}
                        {contactFinder.result.reason}
                      </div>
                      {(() => {
                        const type = contactFinder.result.bestContactType;
                        const isVerified = type === "VERIFIED_WHATSAPP" || type === "whatsapp";
                        const generatedFromPhone = whatsappLink(
                          contactFinder.result.bestContactValue,
                        );
                        const waLink = isVerified
                          ? contactFinder.result.bestContactValue
                          : generatedFromPhone;
                        const numberToCopy =
                          contactFinder.result.foundPhones[0] ||
                          openLead.phone ||
                          contactFinder.result.bestContactValue;
                        return (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {waLink ? (
                              <button
                                type="button"
                                onClick={() => openExternal(waLink)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-2.5 py-1 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25"
                              >
                                Open WhatsApp 🚀
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(numberToCopy);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10"
                            >
                              Copy Number
                            </button>
                          </div>
                        );
                      })()}
                      {contactFinder.result.bestContactType === "website" &&
                        openLead.phone && (
                          <div>
                            <span className="text-zinc-500">Source:</span>{" "}
                            Google Places phone ({openLead.phone})
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}

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
