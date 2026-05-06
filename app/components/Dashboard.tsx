"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  type Channel,
  type ContactQuality,
  type Lead,
  type LeadStatus,
  type LeadStatusUpdate,
  type LeadType,
  normalizePhoneForWhatsApp,
  dedupeLeads,
  type ScoredLead,
  STATUS_LABEL,
  STATUS_ORDER,
  getContactQuality,
  getTurkishPhoneKind,
  instagramLink,
  scoreHot,
  scoreLead,
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
const DAILY_OUTREACH_STORAGE_KEY = "tugobo-lead-engine:daily-outreach-v1";
/** Max leads staged for today's outreach queue (local calendar day). */
const DAILY_OUTREACH_LIMIT = 20;
const AUTO_QUEUE_COOLDOWN_DAYS = 2;
const AUTO_QUEUE_RECENT_CONTACT_DAYS = 7;
const IMPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LEGACY_CREATED_AT_TS = Date.UTC(2024, 0, 1, 0, 0, 0, 0);

type LastImportPayload = {
  batch: ScoredLead[];
  newIds: string[];
  updatedIds: string[];
};

type ImportCacheEntry = {
  importSessionId: string;
  importedAt: number;
  leads: ScoredLead[];
};

type ContactChannelCat = "ready" | "needs_finder" | "none";

/** Lead row as rendered in the UI (workflow state merged from `stateMap`). */
type LeadTableRow = ScoredLead & { _s: LeadStatusUpdate };

type StateMap = Record<string, LeadStatusUpdate>;

const DEFAULT_STATE: LeadStatusUpdate = {
  status: "new",
  note: "",
  updatedAt: null,
  contactedAt: null,
  channel: null,
  doNotContact: false,
  contactAttempts: 0,
  lastContactedAt: null,
  nextFollowUpAt: null,
  pipelineStage: null,
  queuedToday: false,
  lastQueuedAt: null,
  followUpAfterHours: 24,
  repliedAt: null,
  meetingAt: null,
  wonAt: null,
  lostAt: null,
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

/** In-flight / error UI for contact finder, scoped by lead id. Results read only from `contactFinderMap`. */
type ContactFinderRequestState =
  | { status: "idle" }
  | { status: "loading"; leadId: string }
  | { status: "error"; leadId: string; message: string };

type OutreachQueueSessionStats = {
  sent: number;
  skipped: number;
  dnc: number;
};

type QueueMessageStatus = "queued" | "prepared" | "opened" | "contacted" | "skipped";

type DailyQueueItem = {
  queuedAt: number;
  updatedAt: number;
  preparedMessage: string;
  preparedVariants?: { direct: string; soft: string; curiosity: string } | null;
  selectedVariant?: "direct" | "soft" | "curiosity" | null;
  queueStatus: QueueMessageStatus;
};

type OutreachQueueState = {
  open: boolean;
  leadIds: string[];
  index: number;
  messages: Record<string, string>;
  loading: boolean;
  error: string | null;
  followUpById: Record<string, boolean>;
  /** Session finished (no more leads in this run). */
  complete: boolean;
  sessionStats: OutreachQueueSessionStats;
};

type DailyOutreachPersisted = {
  queueDate: string;
  todayQueue: string[];
  todayLog: string[];
  queueItems: Record<string, DailyQueueItem>;
  completedToday: number;
  skippedToday: number;
  dncToday: number;
};

type AllLeadsTimeFilter =
  | "last_import"
  | "today"
  | "all_time"
  | "follow_up"
  | "today_work";

function defaultFollowUpHours(s: LeadStatusUpdate): number {
  return typeof s.followUpAfterHours === "number" && s.followUpAfterHours > 0
    ? s.followUpAfterHours
    : 24;
}

function followUpDeadline(s: LeadStatusUpdate): number | null {
  if (typeof s.nextFollowUpAt === "number" && Number.isFinite(s.nextFollowUpAt)) {
    return s.nextFollowUpAt;
  }
  const base =
    typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
      ? s.lastContactedAt
      : typeof s.contactedAt === "number" && s.contactedAt > 0
        ? s.contactedAt
        : null;
  if (base === null) return null;
  return base + defaultFollowUpHours(s) * 60 * 60 * 1000;
}

function isFollowUpDue(s: LeadStatusUpdate, now: number): boolean {
  if (s.doNotContact) return false;
  if (s.status === "needs_follow_up") return true;
  const d = followUpDeadline(s);
  if (s.status === "contacted" && d !== null && now > d) return true;
  return false;
}

/** Scheduled follow-up instant: persisted `nextFollowUpAt` or derived deadline when in follow-up workflow. */
function followUpTargetTimestamp(s: LeadStatusUpdate): number | null {
  if (
    typeof s.nextFollowUpAt === "number" &&
    Number.isFinite(s.nextFollowUpAt) &&
    s.nextFollowUpAt > 0
  ) {
    return s.nextFollowUpAt;
  }
  if (s.status === "contacted" || s.status === "needs_follow_up") {
    return followUpDeadline(s);
  }
  return null;
}

function nextActionCopy(s: LeadStatusUpdate): string {
  if (s.status === "won" || s.status === "lost") return "Completed";
  if (s.status === "meeting") return "Close deal";
  if (s.status === "replied") return "Move to meeting";
  if (s.status === "needs_follow_up") return "Send follow-up message";
  if (s.status === "contacted") return "Follow up";
  if (s.status === "new") return "Send first message";
  return "Review lead";
}

function followUpTimerLine(s: LeadStatusUpdate, now: number): string | null {
  if (
    s.status === "new" ||
    s.status === "replied" ||
    s.status === "meeting" ||
    s.status === "won" ||
    s.status === "lost"
  ) {
    return null;
  }
  const target = followUpTargetTimestamp(s);
  if (target === null) return null;
  if (now >= target) return "Follow up now";
  const h = Math.max(1, Math.ceil((target - now) / (60 * 60 * 1000)));
  return `Follow up in ${h} hour${h === 1 ? "" : "s"}`;
}

/** Current-state only: if persisted value is an array (legacy / corrupt), use the last element. */
function coerceEpochMs(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw)) {
    for (let i = raw.length - 1; i >= 0; i--) {
      const x = raw[i];
      if (typeof x === "number" && Number.isFinite(x)) return x;
    }
    return null;
  }
  return null;
}

function coerceNonNegInt(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    if (typeof last === "number" && Number.isFinite(last)) return Math.max(0, Math.floor(last));
    return Math.max(0, raw.length);
  }
  return fallback;
}

function coerceNote(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    return typeof last === "string" ? last : "";
  }
  return "";
}

function coerceLastContactedAt(o: Record<string, unknown>): number | null {
  if ("lastContactedAt" in o && o.lastContactedAt === null) return null;
  const fromLast = coerceEpochMs(o.lastContactedAt);
  if (fromLast !== null) return fromLast;
  if (!("lastContactedAt" in o)) return coerceEpochMs(o.contactedAt);
  return coerceEpochMs(o.contactedAt);
}

function isSameLocalCalendarDayEpoch(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function normalizeStateEntry(v: unknown): LeadStatusUpdate {
  if (!v || typeof v !== "object") return { ...DEFAULT_STATE };
  const o = v as Record<string, unknown>;
  const statusRaw = o.status;
  const status: LeadStatus =
    typeof statusRaw === "string" && STATUS_ORDER.includes(statusRaw as LeadStatus)
      ? (statusRaw as LeadStatus)
      : DEFAULT_STATE.status;
  const channelRaw = o.channel;
  const channel: LeadStatusUpdate["channel"] =
    channelRaw === null || channelRaw === undefined
      ? null
      : channelRaw === "whatsapp" ||
          channelRaw === "phone" ||
          channelRaw === "instagram" ||
          channelRaw === "email"
        ? channelRaw
        : DEFAULT_STATE.channel;
  const nextFu = coerceEpochMs(o.nextFollowUpAt);
  const lastQueuedAt = coerceEpochMs(o.lastQueuedAt);
  const queuedToday =
    lastQueuedAt !== null && lastQueuedAt > 0
      ? isSameLocalCalendarDayEpoch(lastQueuedAt, Date.now())
      : Boolean(o.queuedToday);
  return {
    ...DEFAULT_STATE,
    status,
    note: coerceNote(o.note),
    updatedAt: coerceEpochMs(o.updatedAt),
    contactedAt: coerceEpochMs(o.contactedAt),
    channel,
    doNotContact: Boolean(o.doNotContact),
    contactAttempts: coerceNonNegInt(o.contactAttempts, DEFAULT_STATE.contactAttempts ?? 0),
    lastContactedAt: coerceLastContactedAt(o),
    nextFollowUpAt: nextFu,
    pipelineStage:
      typeof o.pipelineStage === "string"
        ? o.pipelineStage
        : o.pipelineStage === null
          ? null
          : DEFAULT_STATE.pipelineStage ?? null,
    queuedToday,
    lastQueuedAt,
    followUpAfterHours:
      typeof o.followUpAfterHours === "number" && o.followUpAfterHours > 0
        ? o.followUpAfterHours
        : DEFAULT_STATE.followUpAfterHours,
    repliedAt: coerceEpochMs(o.repliedAt),
    meetingAt: coerceEpochMs(o.meetingAt),
    wonAt: coerceEpochMs(o.wonAt),
    lostAt: coerceEpochMs(o.lostAt),
  };
}

function loadState(): StateMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: StateMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = normalizeStateEntry(v);
    }
    return out;
  } catch {
    return {};
  }
}

function saveState(state: StateMap) {
  if (typeof window === "undefined") return;
  try {
    const sanitized: StateMap = {};
    for (const [id, v] of Object.entries(state)) {
      sanitized[id] = normalizeStateEntry(v);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // ignore quota errors
  }
}

function ensureLeadCreatedAt(lead: ScoredLead, fallbackTs: number): ScoredLead {
  if (typeof lead.createdAt === "number" && Number.isFinite(lead.createdAt)) return lead;
  return { ...lead, createdAt: fallbackTs };
}

function migrateImportedLeadTimestamps(lead: ScoredLead, fallbackTs: number): ScoredLead {
  const created =
    typeof lead.createdAt === "number" && Number.isFinite(lead.createdAt)
      ? lead.createdAt
      : fallbackTs;
  const first =
    typeof lead.firstImportedAt === "number" && Number.isFinite(lead.firstImportedAt)
      ? lead.firstImportedAt
      : created;
  const last =
    typeof lead.lastImportedAt === "number" && Number.isFinite(lead.lastImportedAt)
      ? lead.lastImportedAt
      : first;
  return {
    ...lead,
    createdAt: created,
    firstImportedAt: first,
    lastImportedAt: last,
  };
}

function ensureLeadsCreatedAt(leads: ScoredLead[], fallbackTs: number): ScoredLead[] {
  return leads.map((lead) => ensureLeadCreatedAt(lead, fallbackTs));
}

function loadImportedLeadsV2(): ScoredLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IMPORTED_LEADS_V2_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? ensureLeadsCreatedAt(parsed as ScoredLead[], LEGACY_CREATED_AT_TS).map((l) =>
            migrateImportedLeadTimestamps(l, LEGACY_CREATED_AT_TS),
          )
        : [];
    }
    const leg = window.localStorage.getItem(EXTRA_LEADS_KEY);
    if (leg) {
      const parsed = JSON.parse(leg);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.localStorage.setItem(IMPORTED_LEADS_V2_KEY, leg);
        return ensureLeadsCreatedAt(parsed as ScoredLead[], LEGACY_CREATED_AT_TS).map((l) =>
          migrateImportedLeadTimestamps(l, LEGACY_CREATED_AT_TS),
        );
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
  if (typeof window === "undefined") return { batch: [], newIds: [], updatedIds: [] };
  try {
    const raw = window.localStorage.getItem(LAST_IMPORT_KEY);
    if (!raw) return { batch: [], newIds: [], updatedIds: [] };
    const p = JSON.parse(raw) as {
      batch?: ScoredLead[];
      newIds?: string[];
    };
    return {
      batch: Array.isArray(p.batch)
        ? ensureLeadsCreatedAt(p.batch, LEGACY_CREATED_AT_TS).map((l) =>
            migrateImportedLeadTimestamps(l, LEGACY_CREATED_AT_TS),
          )
        : [],
      newIds: Array.isArray(p.newIds) ? p.newIds : [],
      updatedIds: Array.isArray((p as { updatedIds?: string[] }).updatedIds)
        ? (p as { updatedIds: string[] }).updatedIds
        : [],
    };
  } catch {
    return { batch: [], newIds: [], updatedIds: [] };
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

function loadImportCache(): Record<string, ImportCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IMPORT_CACHE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === "object" && p !== null && !Array.isArray(p)
      ? (p as Record<string, ImportCacheEntry>)
      : {};
  } catch {
    return {};
  }
}

function saveImportCache(cache: Record<string, ImportCacheEntry>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function isContactFinderResult(v: unknown): v is ContactFinderResult {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as ContactFinderResult).bestContactType === "string" &&
    typeof (v as ContactFinderResult).bestContactValue === "string"
  );
}

/** Flatten nested JSON arrays and drop duplicate strings (order preserved). */
function normalizeStringList(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      const t = v.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
      return;
    }
    if (!Array.isArray(v)) return;
    for (const x of v) walk(x);
  };
  walk(value);
  return out;
}

const ALL_CHANNELS: readonly Channel[] = [
  "Booking",
  "Airbnb",
  "Direct",
  "Tatilsepeti",
];

function normalizeChannelList(value: unknown): Channel[] {
  const out: Channel[] = [];
  const seen = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      const t = v.trim();
      if (!t || seen.has(t)) return;
      if ((ALL_CHANNELS as readonly string[]).includes(t)) {
        seen.add(t);
        out.push(t as Channel);
      }
      return;
    }
    if (!Array.isArray(v)) return;
    for (const x of v) walk(x);
  };
  walk(value);
  return out;
}

function firstFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    for (const x of value) {
      const n = firstFiniteNumber(x, NaN);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }
  if (typeof value === "string") {
    const p = Number.parseFloat(value);
    return Number.isFinite(p) ? p : fallback;
  }
  return fallback;
}

/** Corrupt storage sometimes stores a scalar field as an array of copies. */
function coerceTextField(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const x of value) {
      if (typeof x === "string" && x.trim()) return x;
    }
    return fallback;
  }
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function coerceBool(b: unknown, fallback: boolean): boolean {
  if (typeof b === "boolean") return b;
  if (Array.isArray(b) && b.length > 0) return coerceBool(b[0], fallback);
  return fallback;
}

/** Repair persisted / merged leads so list fields cannot balloon the detail drawer. */
function sanitizeScoredLeadForUi(lead: ScoredLead): ScoredLead {
  return {
    ...lead,
    name: coerceTextField(lead.name, ""),
    type: lead.type,
    city: coerceTextField(lead.city, ""),
    region: coerceTextField(lead.region, ""),
    contactName: coerceTextField(lead.contactName, ""),
    phone: coerceTextField(lead.phone, ""),
    instagram: lead.instagram
      ? coerceTextField(lead.instagram, "")
      : lead.instagram,
    website: lead.website ? coerceTextField(lead.website, "") : lead.website,
    units: Math.max(0, Math.round(firstFiniteNumber(lead.units, 0))),
    pricePerNight: Math.max(0, firstFiniteNumber(lead.pricePerNight, 0)),
    occupancy30d: Math.min(1, Math.max(0, firstFiniteNumber(lead.occupancy30d, 0))),
    rating: firstFiniteNumber(lead.rating, 0),
    reviewsCount: Math.max(0, Math.round(firstFiniteNumber(lead.reviewsCount, 0))),
    daysSinceLastReview: Math.max(0, Math.round(firstFiniteNumber(lead.daysSinceLastReview, 0))),
    daysOnPlatform: Math.max(0, Math.round(firstFiniteNumber(lead.daysOnPlatform, 0))),
    leadScore: Math.round(firstFiniteNumber(lead.leadScore, 0)),
    hotScore: Math.round(firstFiniteNumber(lead.hotScore, 0)),
    hasOwnWebsite: coerceBool(lead.hasOwnWebsite, false),
    hasInstagram: coerceBool(lead.hasInstagram, false),
    signals: normalizeStringList(lead.signals),
    leadReasons: normalizeStringList(lead.leadReasons),
    hotReasons: normalizeStringList(lead.hotReasons),
    channels: normalizeChannelList(lead.channels),
  };
}

function sanitizeContactFinderResult(r: ContactFinderResult): ContactFinderResult {
  return {
    ...r,
    foundPhones: normalizeStringList(r.foundPhones),
    foundEmails: normalizeStringList(r.foundEmails),
    foundInstagram: normalizeStringList(r.foundInstagram),
    foundWhatsapp: normalizeStringList(r.foundWhatsapp),
  };
}

/** One current result per lead; if stored as array, keep only the latest entry. */
function normalizeContactFinderMapEntry(val: unknown): ContactFinderResult | null {
  const single = Array.isArray(val) ? val[val.length - 1] : val;
  if (!isContactFinderResult(single)) return null;
  return sanitizeContactFinderResult(single);
}

function loadContactFinderMap(): Record<string, ContactFinderResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONTACT_FINDER_MAP_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    const out: Record<string, ContactFinderResult> = {};
    for (const [id, val] of Object.entries(p as Record<string, unknown>)) {
      const norm = normalizeContactFinderMapEntry(val);
      if (norm) out[id] = norm;
    }
    return out;
  } catch {
    return {};
  }
}

function saveContactFinderMap(map: Record<string, ContactFinderResult>) {
  if (typeof window === "undefined") return;
  try {
    const out: Record<string, ContactFinderResult> = {};
    for (const [id, val] of Object.entries(map)) {
      const n = normalizeContactFinderMapEntry(val);
      if (n) out[id] = n;
    }
    window.localStorage.setItem(CONTACT_FINDER_MAP_KEY, JSON.stringify(out));
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

function dedupeScoredLeads(leads: ScoredLead[]): ScoredLead[] {
  const deduped = dedupeLeads(leads);
  const idSeen = new Set<string>();
  const out: ScoredLead[] = [];
  for (const lead of deduped) {
    const idKey = lead.id?.trim();
    if (idKey && idSeen.has(idKey)) continue;
    if (idKey) idSeen.add(idKey);
    out.push(lead);
  }
  return out;
}

function dedupeLeadsForAirtableSync(leads: LeadTableRow[]): LeadTableRow[] {
  const byNameCitySeen = new Set<string>();
  const byWhatsappSeen = new Set<string>();
  const out: LeadTableRow[] = [];
  for (const lead of leads) {
    const nameCity = leadDedupeKey(lead.name, lead.city);
    const whatsapp = normalizePhoneDedupe(lead.phone);
    if (byNameCitySeen.has(nameCity)) continue;
    if (whatsapp && byWhatsappSeen.has(whatsapp)) continue;
    byNameCitySeen.add(nameCity);
    if (whatsapp) byWhatsappSeen.add(whatsapp);
    out.push(lead);
  }
  return out;
}

function dedupeLeadIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function renderLeadKey(
  listName: string,
  lead: { id: string; importSessionId?: string | null; lastImportedAt?: number },
  index: number,
) {
  return `${listName}:${lead.id}-${lead.importSessionId ?? lead.lastImportedAt ?? index}`;
}

type ImportMatch =
  | { kind: "imported"; index: number; lead: ScoredLead }
  | { kind: "seed"; lead: ScoredLead };

function findImportMatch(
  incoming: ScoredLead,
  prevImported: ScoredLead[],
  seedLeads: ScoredLead[],
): ImportMatch | null {
  const incPhone = normalizePhoneDedupe(incoming.phone);
  if (incPhone) {
    for (let i = 0; i < prevImported.length; i++) {
      const p = normalizePhoneDedupe(prevImported[i].phone);
      if (p && p === incPhone) return { kind: "imported", index: i, lead: prevImported[i] };
    }
    for (const lead of seedLeads) {
      const p = normalizePhoneDedupe(lead.phone);
      if (p && p === incPhone) return { kind: "seed", lead };
    }
  }
  const incWeb = normalizeWebDedupe(incoming.website);
  if (incWeb) {
    for (let i = 0; i < prevImported.length; i++) {
      const w = normalizeWebDedupe(prevImported[i].website);
      if (w && w === incWeb) return { kind: "imported", index: i, lead: prevImported[i] };
    }
    for (const lead of seedLeads) {
      const w = normalizeWebDedupe(lead.website);
      if (w && w === incWeb) return { kind: "seed", lead };
    }
  }
  const nk = leadDedupeKey(incoming.name, incoming.city);
  for (let i = 0; i < prevImported.length; i++) {
    const l = prevImported[i];
    if (leadDedupeKey(l.name, l.city) === nk) return { kind: "imported", index: i, lead: l };
  }
  for (const l of seedLeads) {
    if (leadDedupeKey(l.name, l.city) === nk) return { kind: "seed", lead: l };
  }
  return null;
}

function upsertScoredFields(
  existing: ScoredLead,
  incoming: ScoredLead,
  importTs: number,
  importSessionId: string,
): ScoredLead {
  const merged: Lead = {
    ...existing,
    ...incoming,
    id: existing.id,
    firstImportedAt:
      typeof existing.firstImportedAt === "number" && Number.isFinite(existing.firstImportedAt)
        ? existing.firstImportedAt
        : typeof existing.createdAt === "number" && Number.isFinite(existing.createdAt)
          ? existing.createdAt
          : importTs,
    lastImportedAt: importTs,
    importSessionId,
    createdAt:
      typeof existing.createdAt === "number" && Number.isFinite(existing.createdAt)
        ? existing.createdAt
        : importTs,
  };
  const ls = scoreLead(merged);
  const hs = scoreHot(merged);
  return {
    ...merged,
    leadScore: ls.score,
    leadReasons: ls.reasons,
    hotScore: hs.score,
    hotReasons: hs.reasons,
    contactQuality: getContactQuality(merged.phone),
  };
}

function mergeImportBatchMaster(
  prevImported: ScoredLead[],
  seedLeads: ScoredLead[],
  batch: ScoredLead[],
  importTs: number,
  importSessionId: string,
): {
  nextImported: ScoredLead[];
  lastSessionBatch: ScoredLead[];
  newIds: string[];
  updatedIds: string[];
  freshNewLeads: ScoredLead[];
} {
  const dedupedBatch = dedupeScoredLeads(batch);
  let imported = [...prevImported];
  const newIds: string[] = [];
  const updatedIds: string[] = [];
  const lastSessionBatch: ScoredLead[] = [];
  const freshNewLeads: ScoredLead[] = [];

  const pushNew = (inc: ScoredLead) => {
    const first = inc.firstImportedAt ?? importTs;
    const novel: ScoredLead = {
      ...inc,
      firstImportedAt: first,
      lastImportedAt: importTs,
      importSessionId,
      createdAt:
        typeof inc.createdAt === "number" && Number.isFinite(inc.createdAt) ? inc.createdAt : importTs,
    };
    imported = [novel, ...imported];
    newIds.push(novel.id);
    lastSessionBatch.push(novel);
    freshNewLeads.push(novel);
  };

  for (const inc of dedupedBatch) {
    const m = findImportMatch(inc, imported, seedLeads);
    if (m?.kind === "imported") {
      const merged = upsertScoredFields(m.lead, inc, importTs, importSessionId);
      const copy = [...imported];
      copy[m.index] = merged;
      imported = copy;
      updatedIds.push(merged.id);
      lastSessionBatch.push(merged);
    } else if (m?.kind === "seed") {
      lastSessionBatch.push(upsertScoredFields(m.lead, inc, importTs, importSessionId));
    } else {
      const keySet = buildDedupeKeySet([...seedLeads, ...imported]);
      if (isDuplicateAgainstSet(inc, keySet)) continue;
      pushNew(inc);
    }
  }

  return {
    nextImported: imported,
    lastSessionBatch,
    newIds,
    updatedIds,
    freshNewLeads,
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

function calendarDayStart(ts: number, d = new Date(ts)) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isSameLocalCalendarDay(a: number, b: number) {
  return calendarDayStart(a) === calendarDayStart(b);
}

function localCalendarDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyOutreachQueueState(): OutreachQueueState {
  return {
    open: false,
    leadIds: [],
    index: 0,
    messages: {},
    loading: false,
    error: null,
    followUpById: {},
    complete: false,
    sessionStats: { sent: 0, skipped: 0, dnc: 0 },
  };
}

function emptyDailyQueueItem(ts = Date.now()): DailyQueueItem {
  return {
    queuedAt: ts,
    updatedAt: ts,
    preparedMessage: "",
    preparedVariants: null,
    selectedVariant: null,
    queueStatus: "queued",
  };
}

function loadDailyOutreachState(): DailyOutreachPersisted {
  if (typeof window === "undefined") {
    return {
      queueDate: "",
      todayQueue: [],
      todayLog: [],
      queueItems: {},
      completedToday: 0,
      skippedToday: 0,
      dncToday: 0,
    };
  }
  const today = localCalendarDayKey();
  try {
    const raw = window.localStorage.getItem(DAILY_OUTREACH_STORAGE_KEY);
    if (!raw) {
      return {
        queueDate: today,
        todayQueue: [],
        todayLog: [],
        queueItems: {},
        completedToday: 0,
        skippedToday: 0,
        dncToday: 0,
      };
    }
    const p = JSON.parse(raw) as Partial<DailyOutreachPersisted>;
    if (p.queueDate !== today) {
      const fresh: DailyOutreachPersisted = {
        queueDate: today,
        todayQueue: [],
        todayLog: [],
        queueItems: {},
        completedToday: 0,
        skippedToday: 0,
        dncToday: 0,
      };
      window.localStorage.setItem(DAILY_OUTREACH_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return {
      queueDate: today,
      todayQueue: Array.isArray(p.todayQueue)
        ? p.todayQueue.filter((id) => typeof id === "string")
        : [],
      todayLog: Array.isArray(p.todayLog)
        ? p.todayLog.filter((id) => typeof id === "string")
        : [],
      queueItems:
        p.queueItems && typeof p.queueItems === "object" && !Array.isArray(p.queueItems)
          ? Object.fromEntries(
              Object.entries(p.queueItems).map(([id, value]) => {
                const v = value as Partial<DailyQueueItem>;
                const queuedAt =
                  typeof v.queuedAt === "number" && Number.isFinite(v.queuedAt)
                    ? v.queuedAt
                    : Date.now();
                const variants =
                  v.preparedVariants &&
                  typeof v.preparedVariants === "object" &&
                  !Array.isArray(v.preparedVariants) &&
                  typeof (v.preparedVariants as { direct?: unknown }).direct === "string" &&
                  typeof (v.preparedVariants as { soft?: unknown }).soft === "string" &&
                  typeof (v.preparedVariants as { curiosity?: unknown }).curiosity === "string"
                    ? (v.preparedVariants as {
                        direct: string;
                        soft: string;
                        curiosity: string;
                      })
                    : null;
                const selected =
                  v.selectedVariant === "direct" ||
                  v.selectedVariant === "soft" ||
                  v.selectedVariant === "curiosity"
                    ? v.selectedVariant
                    : null;
                return [
                  id,
                  {
                    queuedAt,
                    updatedAt:
                      typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt)
                        ? v.updatedAt
                        : queuedAt,
                    preparedMessage:
                      typeof v.preparedMessage === "string" ? v.preparedMessage : "",
                    preparedVariants: variants,
                    selectedVariant: selected,
                    queueStatus:
                      v.queueStatus === "queued" ||
                      v.queueStatus === "prepared" ||
                      v.queueStatus === "opened" ||
                      v.queueStatus === "contacted" ||
                      v.queueStatus === "skipped"
                        ? v.queueStatus
                        : "queued",
                  } satisfies DailyQueueItem,
                ];
              }),
            )
          : {},
      completedToday:
        typeof p.completedToday === "number" && Number.isFinite(p.completedToday)
          ? Math.max(0, Math.floor(p.completedToday))
          : 0,
      skippedToday:
        typeof p.skippedToday === "number" && Number.isFinite(p.skippedToday)
          ? Math.max(0, Math.floor(p.skippedToday))
          : 0,
      dncToday:
        typeof p.dncToday === "number" && Number.isFinite(p.dncToday)
          ? Math.max(0, Math.floor(p.dncToday))
          : 0,
    };
  } catch {
    return {
      queueDate: today,
      todayQueue: [],
      todayLog: [],
      queueItems: {},
      completedToday: 0,
      skippedToday: 0,
      dncToday: 0,
    };
  }
}

function saveDailyOutreachState(next: DailyOutreachPersisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAILY_OUTREACH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function wasContactedToday(s: LeadStatusUpdate, now: number): boolean {
  const ts =
    typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
      ? s.lastContactedAt
      : typeof s.contactedAt === "number" && s.contactedAt > 0
        ? s.contactedAt
        : null;
  if (ts === null) return false;
  return isSameLocalCalendarDay(ts, now);
}

function queueLeadHasOutreachPath(
  lead: ScoredLead,
  finder: ContactFinderResult | undefined,
): boolean {
  return classifyContactChannel(lead, finder) !== "none";
}

function isEligibleForDailyQueue(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
  todayQueue: string[],
  now: number,
): boolean {
  if (row._s.doNotContact) return false;
  if (row._s.status !== "new") return false;
  if (!queueLeadHasOutreachPath(row, finder)) return false;
  if (wasContactedToday(row._s, now)) return false;
  if (todayQueue.includes(row.id)) return false;
  return true;
}

function hasValidOutboundContact(row: LeadTableRow, finder: ContactFinderResult | undefined): {
  any: boolean;
  whatsapp: boolean;
} {
  const waDigits = queueSessionWhatsAppDigits(row, finder);
  const hasWhatsapp = Boolean(waDigits);
  const any =
    hasWhatsapp ||
    Boolean(row.phone?.trim()) ||
    Boolean(row.instagram?.trim()) ||
    Boolean(row.website?.trim());
  return { any, whatsapp: hasWhatsapp };
}

function isEligibleForAutoQueue(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
  daily: DailyOutreachPersisted,
  now: number,
): boolean {
  const s = row._s;
  if (s.doNotContact) return false;
  if (s.status === "won" || s.status === "lost") return false;
  if (s.status === "replied" || s.status === "meeting" || s.status === "needs_follow_up") {
    return false;
  }
  const attempts = s.contactAttempts ?? 0;
  if (attempts >= 3) return false;
  const lastContacted =
    typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
      ? s.lastContactedAt
      : typeof s.contactedAt === "number" && s.contactedAt > 0
        ? s.contactedAt
        : null;
  if (lastContacted !== null) {
    const recentCutoff = now - AUTO_QUEUE_RECENT_CONTACT_DAYS * 24 * 60 * 60 * 1000;
    if (lastContacted >= recentCutoff) return false;
  }
  if (daily.todayQueue.includes(row.id)) return false;
  const queuedToday = Boolean(s.queuedToday);
  if (queuedToday) return false;
  const lastQueuedAt =
    typeof s.lastQueuedAt === "number" && Number.isFinite(s.lastQueuedAt) ? s.lastQueuedAt : null;
  if (lastQueuedAt !== null) {
    const cooldown = AUTO_QUEUE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (now - lastQueuedAt < cooldown) return false;
  }
  const contact = hasValidOutboundContact(row, finder);
  if (!contact.any) return false;
  return true;
}

/** WhatsApp digits for wa.me (Places phone or finder WhatsApp). */
function queueSessionWhatsAppDigits(
  lead: LeadTableRow,
  finder: ContactFinderResult | undefined,
): string | null {
  const t = finder?.bestContactType;
  if (
    finder &&
    (t === "VERIFIED_WHATSAPP" ||
      t === "GENERATED_WHATSAPP" ||
      t === "whatsapp")
  ) {
    const fromFinder = normalizePhoneForWhatsApp(finder.bestContactValue);
    if (fromFinder) return fromFinder;
  }
  return normalizePhoneForWhatsApp(lead.phone);
}

function relativeCalendarLabel(ts?: number | null) {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "-";
  const now = Date.now();
  if (isSameLocalCalendarDay(ts, now)) return "Today";
  if (isSameLocalCalendarDay(ts, now - 24 * 60 * 60 * 1000)) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildImportedLabel(createdAt?: number, firstImportedAt?: number) {
  const ts = firstImportedAt ?? createdAt;
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "Imported: -";
  const now = Date.now();
  if (now - ts <= 24 * 60 * 60 * 1000) return "Imported: Today";
  if (now - ts <= 48 * 60 * 60 * 1000) return "Imported: Yesterday";
  const d = new Date(ts);
  return `Imported: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getImportedBadgeText(createdAt?: number, firstImportedAt?: number) {
  const ts = firstImportedAt ?? createdAt;
  return relativeCalendarLabel(ts);
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 65) return "text-amber-300";
  if (score >= 50) return "text-zinc-200";
  return "text-zinc-400";
}

const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset";

function OutreachBadgesRow({
  row,
  reimported,
  syncedToAirtable = false,
}: {
  row: { id: string; _s: LeadStatusUpdate; hotScore?: number };
  reimported?: boolean;
  syncedToAirtable?: boolean;
}) {
  const s = row._s;
  const now = Date.now();
  const last =
    typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
      ? s.lastContactedAt
      : typeof s.contactedAt === "number" && s.contactedAt > 0
        ? s.contactedAt
        : null;
  const chips: { key: string; cls: string; label: string }[] = [];
  if (s.doNotContact) {
    chips.push({
      key: "dnc",
      cls: `${badgeBase} bg-rose-500/15 text-rose-200 ring-rose-400/35`,
      label: "Do Not Contact",
    });
  }
  if (s.status === "new" && !s.doNotContact) {
    chips.push({
      key: "new",
      cls: `${badgeBase} bg-zinc-500/15 text-zinc-200 ring-zinc-400/30`,
      label: "New",
    });
  }
  if (isFollowUpDue(s, now)) {
    chips.push({
      key: "fudue",
      cls: `${badgeBase} bg-orange-500/15 text-orange-200 ring-orange-400/40`,
      label: "Follow-Up Due",
    });
  }
  if ((s.contactAttempts ?? 0) === 2) {
    chips.push({
      key: "fuonce",
      cls: `${badgeBase} bg-indigo-500/15 text-indigo-200 ring-indigo-400/35`,
      label: "Followed up once",
    });
  }
  if (typeof row.hotScore === "number" && row.hotScore > 70 && s.status === "new") {
    chips.push({
      key: "hipri",
      cls: `${badgeBase} bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/35`,
      label: "⭐ High Priority",
    });
  }
  if (last) {
    if (isSameLocalCalendarDay(last, Date.now())) {
      chips.push({
        key: "ctoday",
        cls: `${badgeBase} bg-sky-500/15 text-sky-200 ring-sky-400/35`,
        label: "Contacted today",
      });
    } else if (
      !isFollowUpDue(s, now) &&
      ["contacted", "needs_follow_up", "replied", "meeting", "won"].includes(s.status)
    ) {
      chips.push({
        key: "cbefore",
        cls: `${badgeBase} bg-indigo-500/15 text-indigo-200 ring-indigo-400/30`,
        label: "Contacted before",
      });
    }
  }
  if ((s.contactAttempts ?? 0) >= 3) {
    chips.push({
      key: "spam",
      cls: `${badgeBase} bg-yellow-500/15 text-yellow-200 ring-yellow-400/35`,
      label: "Max attempts reached",
    });
  }
  if (reimported) {
    chips.push({
      key: "reimp",
      cls: `${badgeBase} bg-amber-500/15 text-amber-200 ring-amber-400/35`,
      label: "Re-imported",
    });
  }
  if (syncedToAirtable) {
    chips.push({
      key: "airtable",
      cls: `${badgeBase} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`,
      label: "Synced to Airtable",
    });
  }
  if (chips.length === 0) return null;
  const chipNodes: ReactNode[] = [];
  for (let i = 0; i < chips.length; i++) {
    const c = chips[i];
    chipNodes.push(
      <span key={c.key} className={c.cls}>
        {c.label}
      </span>,
    );
  }
  return <div className="mt-1 flex flex-wrap gap-1">{chipNodes}</div>;
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
    needs_follow_up: "bg-amber-500/15 text-amber-200 ring-amber-400/35",
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

type ReplyHelperSuggestion = {
  message: string;
  suggestedStatus: LeadStatus | null;
  suggestDoNotContact: boolean;
  nextFollowUpAt: number | null;
  intent: string;
};

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
                Send via WhatsApp
              </button>
            ) : (
              <span
                title="WhatsApp bulunamadı"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-500"
              >
                <IconWhatsapp className="h-4 w-4" />
                Send via WhatsApp
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
  outreachDisabled,
}: {
  phone: string;
  leadId: string;
  onMarkContacted: (id: string) => void;
  outreachDisabled?: boolean;
}) {
  const wa = whatsappLink(phone);
  const square =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition";
  if (outreachDisabled) {
    return (
      <span
        title="Do not contact — outreach disabled"
        aria-disabled="true"
        className={`${square} cursor-not-allowed border-white/10 bg-white/5 text-zinc-500`}
      >
        <IconWhatsapp className="h-4 w-4" />
      </span>
    );
  }
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
  onAddToQueue,
  queueDisabled = false,
  fromLatestImport = false,
}: {
  lead: ScoredLead;
  rank: number;
  status: LeadStatus;
  onAction: (id: string) => void;
  onAddToQueue: (id: string) => void;
  queueDisabled?: boolean;
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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAddToQueue(lead.id)}
            disabled={queueDisabled}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Queue
          </button>
          <button
            onClick={() => onAction(lead.id)}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200 transition hover:bg-white/10"
          >
            Open
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadDetailHeader({
  lead,
  onClose,
}: {
  lead: LeadTableRow;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">
          {lead.type} · {lead.city}
        </div>
        <div className="mt-0.5 text-base font-semibold text-zinc-50">{lead.name}</div>
        <div className="text-xs text-zinc-400">
          {lead.contactName} · {lead.phone}
        </div>
      </div>
      <button
        onClick={onClose}
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
  );
}

function LeadDetailScoreSummary({ lead }: { lead: LeadTableRow }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DetailStat
        label="Lead Score"
        value={lead.leadScore}
        reasons={lead.leadReasons}
        tone="lead"
      />
      <DetailStat
        label="Hot Score"
        value={lead.hotScore}
        reasons={lead.hotReasons}
        tone="hot"
      />
    </div>
  );
}

function LeadDetailMetrics({ lead }: { lead: LeadTableRow }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <KV label="Units" value={lead.units.toString()} />
      <KV label="ADR" value={formatTRY(lead.pricePerNight)} />
      <KV
        label="Occupancy 30d"
        value={`${Math.round(lead.occupancy30d * 100)}%`}
      />
      <KV label="Rating" value={lead.rating.toFixed(1)} />
      <KV label="Reviews" value={lead.reviewsCount.toString()} />
      <KV label="Channels" value={lead.channels.join(", ")} />
    </div>
  );
}

function LeadDetailContactSection({
  lead,
  finderPersisted,
  finderRequest,
  updateLead,
  findBestContact,
}: {
  lead: LeadTableRow;
  finderPersisted: ContactFinderResult | undefined;
  finderRequest: ContactFinderRequestState;
  updateLead: (id: string, patch: Partial<LeadStatusUpdate>) => void;
  findBestContact: (leadId: string, website: string) => Promise<void>;
}) {
  const s = lead._s;
  const loadingHere =
    finderRequest.status === "loading" && finderRequest.leadId === lead.id;
  const finderErrHere =
    finderRequest.status === "error" && finderRequest.leadId === lead.id;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <KV
          label="Contact quality"
          value={CONTACT_QUALITY_LABEL[lead.contactQuality]}
        />
        <KV label="Source" value="Google Maps" />
        <KV
          label="First imported"
          value={relativeCalendarLabel(lead.firstImportedAt ?? lead.createdAt)}
        />
        <KV label="Last imported" value={relativeCalendarLabel(lead.lastImportedAt)} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-zinc-200">
        <input
          type="checkbox"
          className="rounded border-white/20 bg-black/40"
          checked={s.doNotContact}
          onChange={(e) => updateLead(lead.id, { doNotContact: e.target.checked })}
        />
        <span>
          Do not contact{" "}
          <span className="text-zinc-500">
            (disables outreach and hides from Focused / Hot)
          </span>
        </span>
      </label>

      {lead.signals.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
            Signals
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-300">
            {lead.signals.join(" · ")}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {lead.instagram && (
          <a
            href={instagramLink(lead.instagram)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-pink-400/20 bg-pink-500/10 px-3 py-1.5 text-xs font-medium text-pink-200 transition hover:bg-pink-500/20"
          >
            <IconInstagram className="h-4 w-4" />@{lead.instagram}
          </a>
        )}
        {lead.website && (
          <a
            href={`https://${lead.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            {lead.website}
          </a>
        )}
      </div>

      {lead.website && (
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Contact Finder
            </div>
            <button
              type="button"
              onClick={() => void findBestContact(lead.id, lead.website!)}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20"
            >
              Find Best Contact
            </button>
          </div>
          {!loadingHere && !finderErrHere && !finderPersisted && (
            <div className="text-zinc-500">
              Click &quot;Find Best Contact&quot; to analyze homepage contact channels.
            </div>
          )}
          {loadingHere && <div className="text-zinc-300">Analyzing website...</div>}
          {finderRequest.status === "error" && finderRequest.leadId === lead.id && (
            <div className="text-rose-300">{finderRequest.message}</div>
          )}
          {finderPersisted && !loadingHere && !finderErrHere && (
            <div className="space-y-1.5 text-zinc-300">
              <div>
                <span className="text-zinc-500">Best Contact:</span>{" "}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                    finderPersisted.bestContactType === "VERIFIED_WHATSAPP" ||
                    finderPersisted.bestContactType === "whatsapp"
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                      : finderPersisted.bestContactType === "GENERATED_WHATSAPP"
                        ? "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30"
                        : finderPersisted.bestContactType === "PHONE_ONLY" ||
                            finderPersisted.bestContactType === "mobile" ||
                            finderPersisted.bestContactType === "phone"
                          ? "bg-zinc-500/15 text-zinc-300 ring-1 ring-inset ring-zinc-500/30"
                          : "text-zinc-100"
                  }`}
                >
                  {finderPersisted.bestContactType === "VERIFIED_WHATSAPP" ||
                  finderPersisted.bestContactType === "whatsapp"
                    ? "Verified WhatsApp"
                    : finderPersisted.bestContactType === "GENERATED_WHATSAPP"
                      ? "WhatsApp Available"
                      : finderPersisted.bestContactType === "PHONE_ONLY" ||
                          finderPersisted.bestContactType === "mobile" ||
                          finderPersisted.bestContactType === "phone"
                        ? "Phone Only"
                        : finderPersisted.bestContactType.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Value:</span>{" "}
                <span className="font-medium text-zinc-100">
                  {finderPersisted.bestContactValue}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Confidence:</span>{" "}
                <span className="font-medium text-zinc-100">
                  {finderPersisted.confidence}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Source:</span> {finderPersisted.source}
              </div>
              <div>
                <span className="text-zinc-500">Reason:</span> {finderPersisted.reason}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const numberToCopy =
                      finderPersisted.foundPhones[0] ||
                      lead.phone ||
                      finderPersisted.bestContactValue;
                    void navigator.clipboard.writeText(numberToCopy);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10"
                >
                  Copy Number
                </button>
              </div>
              {finderPersisted.bestContactType === "website" && lead.phone && (
                <div>
                  <span className="text-zinc-500">Source:</span> Google Places phone (
                  {lead.phone})
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Follow-up meta + Next Action + Send Message + status (single drawer block, no duplicate sections). */
function pipelineStageLabel(s: LeadStatusUpdate): string {
  if (s.doNotContact) return "do_not_contact";
  return s.status;
}

function LeadDetailWorkflowSection({
  lead,
  setLeadStatus,
  onSendMessage,
  sendMessageBusy,
}: {
  lead: LeadTableRow;
  setLeadStatus: (id: string, status: LeadStatus) => void;
  onSendMessage: () => void;
  sendMessageBusy: boolean;
}) {
  const s = lead._s;
  const terminal = s.status === "won" || s.status === "lost";
  const sendDisabled = s.doNotContact || sendMessageBusy || terminal;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <KV
          label="Last contacted"
          value={relativeCalendarLabel(s.lastContactedAt ?? s.contactedAt)}
        />
        <KV label="Contact attempts" value={String(s.contactAttempts ?? 0)} />
        <KV
          label="Next follow-up"
          value={relativeCalendarLabel(s.nextFollowUpAt)}
        />
        <KV label="Do not contact" value={s.doNotContact ? "Yes" : "No"} />
        <KV label="Pipeline stage" value={pipelineStageLabel(s)} />
      </div>

      <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Next Action</div>
        <p className="mt-1 text-sm text-zinc-100">{nextActionCopy(s)}</p>
        {(() => {
          const timer = followUpTimerLine(s, Date.now());
          if (!timer) return null;
          return <p className="mt-1 text-zinc-400">{timer}</p>;
        })()}
        <button
          type="button"
          disabled={sendDisabled}
          onClick={onSendMessage}
          title={
            s.doNotContact
              ? "Do not contact"
              : terminal
                ? "Pipeline closed"
                : whatsappLink(lead.phone)
                  ? "Generate message and open WhatsApp"
                  : "Generate message (copy or send when ready)"
          }
          className="mt-3 w-full rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendMessageBusy ? "Preparing…" : "Send Message"}
        </button>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Status</div>
            {s.updatedAt && (
              <div className="text-[10px] text-zinc-600">
                Updated {new Date(s.updatedAt).toLocaleString("en-GB")}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const buttons: ReactNode[] = [];
              for (let i = 0; i < STATUS_ORDER.length; i++) {
                const st = STATUS_ORDER[i];
                const active = s.status === st;
                buttons.push(
                  <button
                    key={st}
                    type="button"
                    onClick={() => setLeadStatus(lead.id, st)}
                    className={`rounded-md px-2.5 py-1 text-xs ring-1 ring-inset transition ${
                      active
                        ? "bg-indigo-500/20 text-indigo-200 ring-indigo-400/40"
                        : "bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    {STATUS_LABEL[st]}
                  </button>,
                );
              }
              return buttons;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadDetailReplyHelperSection({
  lead,
  ownerReplyDraft,
  onOwnerReplyChange,
  onGenerate,
  generateBusy,
  generateError,
  suggestion,
  copied,
  onCopyReply,
  onApplySuggestion,
}: {
  lead: LeadTableRow;
  ownerReplyDraft: string;
  onOwnerReplyChange: (v: string) => void;
  onGenerate: () => void;
  generateBusy: boolean;
  generateError: string | null;
  suggestion: ReplyHelperSuggestion | null;
  copied: boolean;
  onCopyReply: () => void;
  onApplySuggestion: () => void;
}) {
  const waLink =
    suggestion && suggestion.message.trim()
      ? whatsappLinkWithText(lead.phone, suggestion.message)
      : null;
  const suggestedLabel = suggestion?.suggestDoNotContact
    ? "Lost + Do Not Contact"
    : suggestion?.suggestedStatus
      ? STATUS_LABEL[suggestion.suggestedStatus]
      : "No status suggestion";

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Reply Helper</div>
      <textarea
        value={ownerReplyDraft}
        onChange={(e) => onOwnerReplyChange(e.target.value)}
        placeholder="Owner reply buraya..."
        rows={3}
        className="w-full resize-none rounded-md border border-white/10 bg-black/30 p-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <button
        type="button"
        disabled={generateBusy || ownerReplyDraft.trim().length === 0}
        onClick={onGenerate}
        className="mt-2 w-full rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generateBusy ? "Generating…" : "Generate Reply"}
      </button>
      {generateError && <p className="mt-2 text-rose-300">{generateError}</p>}
      {suggestion && (
        <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Suggested Reply</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{suggestion.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCopyReply}
              className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10"
            >
              {copied ? "Copied" : "Copy Reply"}
            </button>
            {waLink ? (
              <button
                type="button"
                onClick={() => openExternal(waLink)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-2.5 py-1 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25"
              >
                <IconWhatsapp className="h-3.5 w-3.5" />
                Send via WhatsApp
              </button>
            ) : null}
            {(suggestion.suggestedStatus || suggestion.suggestDoNotContact) && (
              <button
                type="button"
                onClick={onApplySuggestion}
                className="rounded-md border border-indigo-400/35 bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200 hover:bg-indigo-500/25"
              >
                Apply Suggested Status
              </button>
            )}
          </div>
          <div className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
            Suggested next status: {suggestedLabel}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadDetailNotesSection({
  lead,
  draftNote,
  setDraftNote,
  updateLead,
}: {
  lead: LeadTableRow;
  draftNote: string;
  setDraftNote: (v: string) => void;
  updateLead: (id: string, patch: Partial<LeadStatusUpdate>) => void;
}) {
  const s = lead._s;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Notes</div>
        <div className="text-[10px] text-zinc-600">{draftNote.length} chars</div>
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
          onClick={() => setDraftNote(s.note ?? "")}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
        >
          Reset
        </button>
        <button
          onClick={() => updateLead(lead.id, { note: draftNote })}
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400"
        >
          Save note
        </button>
      </div>
    </div>
  );
}

/** Single render tree for the open lead (one selected object, no list iteration). */
function LeadDetailPanel({
  selectedLead,
  onClose,
  finderPersisted,
  contactFinderRequest,
  draftNote,
  setDraftNote,
  updateLead,
  setLeadStatus,
  findBestContact,
  onSendMessage,
  sendMessageBusy,
  ownerReplyDraft,
  setOwnerReplyDraft,
  onGenerateReplyHelper,
  replyHelperBusy,
  replyHelperError,
  replyHelperSuggestion,
  replyCopied,
  onCopyReplyHelper,
  onApplyReplyHelperSuggestion,
}: {
  selectedLead: LeadTableRow;
  onClose: () => void;
  finderPersisted: ContactFinderResult | undefined;
  contactFinderRequest: ContactFinderRequestState;
  draftNote: string;
  setDraftNote: (v: string) => void;
  updateLead: (id: string, patch: Partial<LeadStatusUpdate>) => void;
  setLeadStatus: (id: string, status: LeadStatus) => void;
  findBestContact: (leadId: string, website: string) => Promise<void>;
  onSendMessage: () => void;
  sendMessageBusy: boolean;
  ownerReplyDraft: string;
  setOwnerReplyDraft: (v: string) => void;
  onGenerateReplyHelper: () => void;
  replyHelperBusy: boolean;
  replyHelperError: string | null;
  replyHelperSuggestion: ReplyHelperSuggestion | null;
  replyCopied: boolean;
  onCopyReplyHelper: () => void;
  onApplyReplyHelperSuggestion: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LeadDetailHeader lead={selectedLead} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <LeadDetailScoreSummary lead={selectedLead} />
        <LeadDetailMetrics lead={selectedLead} />
        <LeadDetailContactSection
          lead={selectedLead}
          finderPersisted={finderPersisted}
          finderRequest={contactFinderRequest}
          updateLead={updateLead}
          findBestContact={findBestContact}
        />
        <LeadDetailWorkflowSection
          lead={selectedLead}
          setLeadStatus={setLeadStatus}
          onSendMessage={onSendMessage}
          sendMessageBusy={sendMessageBusy}
        />
        <LeadDetailReplyHelperSection
          lead={selectedLead}
          ownerReplyDraft={ownerReplyDraft}
          onOwnerReplyChange={setOwnerReplyDraft}
          onGenerate={onGenerateReplyHelper}
          generateBusy={replyHelperBusy}
          generateError={replyHelperError}
          suggestion={replyHelperSuggestion}
          copied={replyCopied}
          onCopyReply={onCopyReplyHelper}
          onApplySuggestion={onApplyReplyHelperSuggestion}
        />
        <LeadDetailNotesSection
          lead={selectedLead}
          draftNote={draftNote}
          setDraftNote={setDraftNote}
          updateLead={updateLead}
        />
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
  const [drawerSendBusy, setDrawerSendBusy] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [ownerReplyDraft, setOwnerReplyDraft] = useState("");
  const [replyHelperBusy, setReplyHelperBusy] = useState(false);
  const [replyHelperError, setReplyHelperError] = useState<string | null>(null);
  const [replyHelperSuggestion, setReplyHelperSuggestion] =
    useState<ReplyHelperSuggestion | null>(null);
  const [replyCopied, setReplyCopied] = useState(false);
  const [recentlyImportedLeadIds, setRecentlyImportedLeadIds] = useState<string[]>([]);
  const [latestImportLeads, setLatestImportLeads] = useState<ScoredLead[]>([]);
  const [lastImportNewIds, setLastImportNewIds] = useState<string[]>([]);
  const [lastImportUpdatedIds, setLastImportUpdatedIds] = useState<string[]>([]);
  const [latestImportOnlyDuplicates, setLatestImportOnlyDuplicates] = useState(false);
  const [hasImportRun, setHasImportRun] = useState(false);
  const [sessionLeadIds, setSessionLeadIds] = useState<string[]>([]);
  const [allLeadsOpen, setAllLeadsOpen] = useState(false);
  const [showAllLeadsRows, setShowAllLeadsRows] = useState(false);
  const [focusMode, setFocusMode] = useState(true);
  const [allLeadsTimeFilter, setAllLeadsTimeFilter] =
    useState<AllLeadsTimeFilter>("all_time");
  const [allLeadsTab, setAllLeadsTab] = useState<"focused" | "new" | "hot" | "all">("focused");
  const [aiMessageModal, setAiMessageModal] = useState<AiMessageModalState>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [dailyOutreach, setDailyOutreach] = useState<DailyOutreachPersisted>(() =>
    typeof window === "undefined"
      ? {
          queueDate: "",
          todayQueue: [],
          todayLog: [],
          queueItems: {},
          completedToday: 0,
          skippedToday: 0,
          dncToday: 0,
        }
      : loadDailyOutreachState(),
  );
  const [queueActionNotice, setQueueActionNotice] = useState<string | null>(null);
  const showQueueNotice = (msg: string) => {
    setQueueActionNotice(msg);
    window.setTimeout(() => setQueueActionNotice(null), 6500);
  };
  const [outreachQueue, setOutreachQueue] = useState<OutreachQueueState>(() =>
    emptyOutreachQueueState(),
  );
  const [followUpBusyLeadId, setFollowUpBusyLeadId] = useState<string | null>(null);
  const [contactFinderRequest, setContactFinderRequest] =
    useState<ContactFinderRequestState>({ status: "idle" });
  const [contactFinderMap, setContactFinderMap] = useState<
    Record<string, ContactFinderResult>
  >({});
  const [airtableConnected, setAirtableConnected] = useState<boolean | null>(null);
  const [airtableWarning, setAirtableWarning] = useState("");
  const [airtableSyncStatus, setAirtableSyncStatus] = useState("");
  const [airtableBusy, setAirtableBusy] = useState<"sync" | "load" | null>(null);
  const [airtableSyncedLeadIds, setAirtableSyncedLeadIds] = useState<string[]>([]);

  useEffect(() => {
    setStateMap(loadState());
    const stored = loadImportedLeadsV2();
    setImportedLeads(stored);
    importedLeadsRef.current = stored;
    const lip = loadLastImportPayload();
    setLatestImportLeads(lip.batch);
    setLastImportNewIds(lip.newIds);
    setLastImportUpdatedIds(lip.updatedIds);
    setContactFinderMap(loadContactFinderMap());
    setDailyOutreach(loadDailyOutreachState());
    const meta = loadImportMeta();
    setHasImportRun(
      meta.hasRun ||
        lip.batch.length > 0 ||
        stored.some((l) => l.id.startsWith("gmaps-")),
    );
    setDateLabel(buildTodayLabel());
  }, []);

  useEffect(() => {
    const checkAirtable = async () => {
      try {
        const res = await fetch("/api/airtable/leads", { cache: "no-store" });
        const data = (await res.json()) as { configured?: boolean };
        setAirtableConnected(Boolean(data.configured));
        if (!data.configured) {
          console.warn("Airtable not connected");
          setAirtableWarning("Airtable not connected. Using local storage only.");
        }
      } catch {
        setAirtableConnected(false);
        console.warn("Airtable not connected");
        setAirtableWarning("Airtable not connected. Using local storage only.");
      }
    };
    void checkAirtable();
  }, []);

  const hasCachedImportResults = useCallback(
    (req: Omit<ImportRequest, "forceGoogleRefresh">) => {
      const cityNorm = req.city.trim().toLowerCase();
      const cacheKey = `${cityNorm}|${req.type}|${req.source}`;
      const cache = loadImportCache();
      const hit = cache[cacheKey];
      if (!hit || !Array.isArray(hit.leads) || hit.leads.length === 0) return false;
      if (typeof hit.importedAt !== "number") return false;
      return Date.now() - hit.importedAt <= IMPORT_CACHE_TTL_MS;
    },
    [],
  );

  const handleImport = async (req: ImportRequest): Promise<ImportResult> => {
    const cityNorm = req.city.trim().toLowerCase();
    const cacheKey = `${cityNorm}|${req.type}|${req.source}`;
    let batch: ScoredLead[] = [];
    let source: "cached" | "google" = "google";
    const cache = loadImportCache();

    if (!req.forceGoogleRefresh) {
      const hit = cache[cacheKey];
      if (
        hit &&
        Array.isArray(hit.leads) &&
        hit.leads.length > 0 &&
        typeof hit.importedAt === "number" &&
        Date.now() - hit.importedAt <= IMPORT_CACHE_TTL_MS
      ) {
        batch = hit.leads;
        source = "cached";
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
        const now = Date.now();
        saveImportCache({
          ...cache,
          [cacheKey]: {
            importSessionId:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `cache-${now}`,
            importedAt: now,
            leads: batch,
          },
        });
      }
      source = "google";
    }

    const importTs = Date.now();
    batch = ensureLeadsCreatedAt(batch, importTs);

    saveImportMeta({ hasRun: true });
    const importSessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `imp-${importTs}`;

    const prev = importedLeadsRef.current;
    const { nextImported, lastSessionBatch, newIds, updatedIds, freshNewLeads } =
      mergeImportBatchMaster(prev, leads, batch, importTs, importSessionId);

    setImportedLeads(nextImported);
    importedLeadsRef.current = nextImported;
    saveImportedLeadsV2(nextImported);
    setLatestImportLeads(lastSessionBatch);
    setLastImportNewIds(newIds);
    setLastImportUpdatedIds(updatedIds);
    saveLastImportPayload({ batch: lastSessionBatch, newIds, updatedIds });
    setHasImportRun(true);

    setLatestImportOnlyDuplicates(batch.length > 0 && lastSessionBatch.length === 0);

    if (lastSessionBatch.length > 0) {
      setSessionLeadIds((prev) => {
        const merged = new Set([...prev, ...lastSessionBatch.map((l) => l.id)]);
        return Array.from(merged);
      });
      setRecentlyImportedLeadIds(lastSessionBatch.map((l) => l.id));
    }

    const hot = freshNewLeads.filter((l) => l.hotScore >= 70).length;
    const skipped = batch.length - lastSessionBatch.length;
    return {
      added: freshNewLeads.length,
      updated: updatedIds.length,
      hot,
      skipped,
      source,
    };
  };

  const syncLeadsToAirtable = async () => {
    setAirtableSyncStatus("");
    setAirtableWarning("");
    setAirtableBusy("sync");
    try {
      const dedupedRows = dedupeLeadsForAirtableSync(allRows);
      const valuableRows = dedupedRows.filter((row) => {
        const queueTouched =
          dailyOutreach.todayQueue.includes(row.id) || dailyOutreach.todayLog.includes(row.id);
        const interacted = row._s.status !== "new" || (row._s.contactAttempts ?? 0) > 0;
        return queueTouched || interacted;
      });
      const payload = valuableRows.map((row) => ({
        business_name: row.name,
        whatsapp: row.phone ?? "",
        website: row.website ?? "",
        lead_score: row.leadScore,
        hot_score: row.hotScore,
        status: row._s.status || "new",
        notes: row._s.note ?? "",
        contact_attempts: row._s.contactAttempts ?? 0,
        last_contacted_at:
          typeof row._s.lastContactedAt === "number" && row._s.lastContactedAt > 0
            ? new Date(row._s.lastContactedAt).toISOString()
            : null,
        next_follow_up_at:
          typeof row._s.nextFollowUpAt === "number" && row._s.nextFollowUpAt > 0
            ? new Date(row._s.nextFollowUpAt).toISOString()
            : null,
        do_not_contact: Boolean(row._s.doNotContact),
        pipeline_stage: (() => {
          if (row._s.doNotContact) return "lost";
          if (row._s.status === "won") return "won";
          if (row._s.status === "lost") return "lost";
          if (row._s.status === "new") return "new";
          return "contacted";
        })(),
      }));
      if (payload.length === 0) {
        setAirtableSyncStatus("No valuable leads to sync yet.");
        return;
      }
      const res = await fetch("/api/airtable/sync-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: payload }),
      });
      const data = (await res.json()) as {
        configured?: boolean;
        added?: number;
        updated?: number;
        skipped?: number;
        error?: string;
      };
      if (!data.configured) {
        setAirtableConnected(false);
        console.warn("Airtable not connected");
        setAirtableWarning("Airtable not connected. Using local storage only.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Airtable sync failed");
      setAirtableConnected(true);
      setAirtableSyncedLeadIds(valuableRows.map((row) => row.id));
      setAirtableSyncStatus(
        `Synced to Airtable: ${data.added ?? 0} added, ${data.updated ?? 0} updated, ${data.skipped ?? 0} skipped.`,
      );
    } catch (err) {
      setAirtableSyncStatus(err instanceof Error ? err.message : "Airtable sync failed");
    } finally {
      setAirtableBusy(null);
    }
  };

  const loadLeadsFromAirtable = async () => {
    setAirtableSyncStatus("");
    setAirtableWarning("");
    setAirtableBusy("load");
    try {
      const res = await fetch("/api/airtable/leads", { cache: "no-store" });
      const data = (await res.json()) as {
        configured?: boolean;
        leads?: ScoredLead[];
        error?: string;
      };
      if (!data.configured) {
        setAirtableConnected(false);
        console.warn("Airtable not connected");
        setAirtableWarning("Airtable not connected. Using local storage only.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to load leads from Airtable");
      const incomingLeads = Array.isArray(data.leads) ? data.leads : [];
      if (incomingLeads.length > 0) {
        setStateMap((prev) => {
          const next: StateMap = { ...prev };
          const now = Date.now();
          for (const l of incomingLeads) {
            const id = l.id;
            if (!id) continue;
            const cur = normalizeStateEntry(next[id]);
            const attempts =
              typeof l.contactAttempts === "number" && Number.isFinite(l.contactAttempts)
                ? Math.max(0, Math.floor(l.contactAttempts))
                : cur.contactAttempts ?? 0;
            const lastContactedAt =
              typeof l.lastContactedAt === "number" && Number.isFinite(l.lastContactedAt)
                ? l.lastContactedAt
                : cur.lastContactedAt ?? null;
            const nextFollowUpAt =
              typeof l.nextFollowUpAt === "number" && Number.isFinite(l.nextFollowUpAt)
                ? l.nextFollowUpAt
                : cur.nextFollowUpAt ?? null;
            const doNotContact =
              typeof l.doNotContact === "boolean" ? l.doNotContact : Boolean(cur.doNotContact);
            const pipelineStageRaw = (l as unknown as { pipelineStage?: unknown }).pipelineStage;
            const pipelineStage = typeof pipelineStageRaw === "string" ? pipelineStageRaw : null;

            let status: LeadStatus = cur.status;
            if (pipelineStage === "won") status = "won";
            else if (pipelineStage === "lost" || doNotContact) status = "lost";
            else if (typeof nextFollowUpAt === "number" && nextFollowUpAt > 0) {
              status = nextFollowUpAt <= now ? "needs_follow_up" : "contacted";
            } else if (attempts > 0) {
              status = "contacted";
            } else {
              status = "new";
            }

            next[id] = {
              ...DEFAULT_STATE,
              ...cur,
              status,
              contactAttempts: attempts,
              lastContactedAt,
              nextFollowUpAt,
              doNotContact,
              pipelineStage,
              updatedAt: now,
            };
          }
          saveState(next);
          return next;
        });
      }
      const importTs = Date.now();
      const importSessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sheet-${importTs}`;
      const prev = importedLeadsRef.current;
      const merged = mergeImportBatchMaster(
        prev,
        leads,
        ensureLeadsCreatedAt(incomingLeads, importTs),
        importTs,
        importSessionId,
      );
      setImportedLeads(merged.nextImported);
      importedLeadsRef.current = merged.nextImported;
      saveImportedLeadsV2(merged.nextImported);
      setLatestImportLeads(merged.lastSessionBatch);
      setLastImportNewIds(merged.newIds);
      setLastImportUpdatedIds(merged.updatedIds);
      saveLastImportPayload({
        batch: merged.lastSessionBatch,
        newIds: merged.newIds,
        updatedIds: merged.updatedIds,
      });
      setAirtableConnected(true);
      setAirtableSyncStatus(`Loaded ${incomingLeads.length} leads from Airtable.`);
    } catch (err) {
      setAirtableSyncStatus(err instanceof Error ? err.message : "Failed to load from Airtable");
    } finally {
      setAirtableBusy(null);
    }
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
    const base = [...leads];
    const dedupeSet = buildDedupeKeySet(leads);
    for (const l of importedLeads) {
      if (isDuplicateAgainstSet(l, dedupeSet)) continue;
      base.push(l);
      addLeadToDedupeSet(l, dedupeSet);
    }
    return dedupeScoredLeads(base).map(
      (l): LeadTableRow => ({
        ...sanitizeScoredLeadForUi(l),
        createdAt: l.createdAt ?? LEGACY_CREATED_AT_TS,
        _s: getLeadState(l.id),
        contactQuality: getContactQuality(l.phone),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, importedLeads, stateMap]);

  const allRowsById = useMemo(() => {
    return new Map(allRows.map((r) => [r.id, r]));
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const latestImportIdSet = new Set(latestImportLeads.map((l) => l.id));
    const list = allRows.filter((r) => {
      const createdAt = r.createdAt ?? 0;
      const fu = isFollowUpDue(r._s, now);
      if (allLeadsTimeFilter === "today_work") {
        if (r._s.status !== "new" && !fu) return false;
      }
      if (allLeadsTimeFilter === "follow_up") {
        if (!fu) return false;
      }
      if (allLeadsTimeFilter === "last_import" && !latestImportIdSet.has(r.id)) {
        return false;
      }
      if (allLeadsTimeFilter === "today" && createdAt < dayAgo) {
        return false;
      }
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
      const createdDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (createdDiff !== 0) return createdDiff;
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
    allLeadsTimeFilter,
    latestImportLeads,
    sort,
    recentlyImportedLeadIds,
  ]);

  const useLatestImportHotLeads = latestImportLeads.length > 0;
  const hotLeadsSource = useLatestImportHotLeads ? latestImportLeads : allRows;
  const hot5 = useMemo(() => {
    return dedupeScoredLeads([...hotLeadsSource] as ScoredLead[])
      .filter((l) => {
        const full = allRowsById.get(l.id);
        return full && !full._s.doNotContact;
      })
      .map((l) => {
        const full = allRowsById.get(l.id)!;
        return {
          ...full,
          ...l,
          leadScore: l.leadScore,
          hotScore: l.hotScore,
          leadReasons: l.leadReasons,
          hotReasons: l.hotReasons,
          firstImportedAt: l.firstImportedAt ?? full.firstImportedAt,
          lastImportedAt: l.lastImportedAt ?? full.lastImportedAt,
          importSessionId: l.importSessionId ?? full.importSessionId,
          contactQuality: getContactQuality(l.phone || full.phone),
        };
      })
      .sort((a, b) => b.hotScore - a.hotScore)
      .slice(0, 5);
  }, [hotLeadsSource, allRowsById]);

  const tabFiltered = useMemo(() => {
    if (allLeadsTab === "focused") {
      return filtered.filter(
        (r) => !r._s.doNotContact && r._s.status === "new" && r.hotScore >= 60,
      );
    }
    if (allLeadsTab === "new") {
      return filtered.filter((r) => r._s.status === "new");
    }
    if (allLeadsTab === "hot") {
      return filtered.filter((r) => !r._s.doNotContact && r.hotScore >= 70);
    }
    return filtered;
  }, [filtered, allLeadsTab]);

  const focusFiltered = useMemo(() => {
    if (!focusMode) return tabFiltered;
    return tabFiltered.filter(
      (r) => !r._s.doNotContact && r._s.status === "new" && r.hotScore >= 70,
    );
  }, [tabFiltered, focusMode]);

  const visibleAllLeads = useMemo(() => {
    if (showAllLeadsRows) return focusFiltered;
    return focusFiltered.slice(0, 15);
  }, [focusFiltered, showAllLeadsRows]);

  const latestImportRows = useMemo(() => {
    const rows = latestImportLeads
      .map((snap) => {
        const base = allRowsById.get(snap.id);
        if (!base) {
          return {
            ...snap,
            createdAt: snap.createdAt ?? LEGACY_CREATED_AT_TS,
            _s: normalizeStateEntry(stateMap[snap.id]),
            contactQuality: getContactQuality(snap.phone),
          } as (typeof allRows)[number];
        }
        return {
          ...base,
          ...snap,
          leadScore: snap.leadScore,
          hotScore: snap.hotScore,
          leadReasons: snap.leadReasons,
          hotReasons: snap.hotReasons,
          firstImportedAt: snap.firstImportedAt ?? base.firstImportedAt,
          lastImportedAt: snap.lastImportedAt ?? base.lastImportedAt,
          importSessionId: snap.importSessionId ?? base.importSessionId,
          contactQuality: getContactQuality(snap.phone || base.phone),
          _s: base._s,
        };
      })
      .filter(Boolean);
    return dedupeScoredLeads(rows as ScoredLead[]) as LeadTableRow[];
  }, [latestImportLeads, allRowsById, stateMap]);

  const followUpDueRows = useMemo(() => {
    const now = Date.now();
    return allRows
      .filter((row) => {
        const s = row._s;
        if (s.doNotContact) return false;
        if (s.status !== "contacted") return false;
        const attempts = s.contactAttempts ?? 0;
        if (attempts >= 3) return false;
        const dueAt = followUpTargetTimestamp(s);
        if (dueAt === null) return false;
        return dueAt <= now;
      })
      .sort((a, b) => {
        const ad = followUpTargetTimestamp(a._s) ?? 0;
        const bd = followUpTargetTimestamp(b._s) ?? 0;
        return ad - bd;
      })
      .slice(0, 20);
  }, [allRows]);

  const stats = useMemo(() => {
    const sessionRows = allRows.filter((r) => sessionLeadIds.includes(r.id));
    const sessionLeads = sessionRows.length;
    const hotToday = sessionRows.filter((r) => r.hotScore >= 70).length;
    const contacted = sessionRows.filter((r) =>
      ["contacted", "needs_follow_up", "replied", "meeting", "won"].includes(
        r._s.status,
      ),
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

  const openLead = openId ? allRowsById.get(openId) ?? null : null;

  const lastLoggedDrawerLeadId = useRef<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!openId) {
      lastLoggedDrawerLeadId.current = null;
      return;
    }
    if (lastLoggedDrawerLeadId.current === openId) return;
    lastLoggedDrawerLeadId.current = openId;
    const row = allRowsById.get(openId);
    if (!row) return;
    // One log per drawer open: confirms single object + list shapes (guards against corrupt storage).
    console.info("[LeadDetailPanel] openLead inspection", {
      openId,
      topLevelIsArray: Array.isArray(row),
      id: row.id,
      signals: row.signals,
      leadReasons: row.leadReasons,
      hotReasons: row.hotReasons,
      channels: row.channels,
    });
  }, [openId, allRowsById]);

  useLayoutEffect(() => {
    if (!openLead) return;
    setDraftNote(openLead._s.note ?? "");
    setOwnerReplyDraft("");
    setReplyHelperBusy(false);
    setReplyHelperError(null);
    setReplyHelperSuggestion(null);
    setReplyCopied(false);
    setContactFinderRequest((prev) => {
      if (prev.status === "loading" && prev.leadId !== openLead.id) {
        return { status: "idle" };
      }
      if (prev.status === "error" && prev.leadId !== openLead.id) {
        return { status: "idle" };
      }
      return prev;
    });
  }, [openId, openLead?.id]);

  const syncContactedToAirtable = useCallback(
    async (
      leadId: string,
      payload: {
        contactAttempts: number;
        lastContactedAt: number;
        nextFollowUpAt: number | null;
        doNotContact: boolean;
        notes: string;
        pipelineStage: string;
      },
    ) => {
      const lead = allRowsById.get(leadId);
      if (!lead) return;
      try {
        const res = await fetch("/api/airtable/mark-sent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead: {
              business_name: lead.name,
              whatsapp: lead.phone,
              website: lead.website ?? "",
              leadScore: lead.leadScore,
              hotScore: lead.hotScore,
              status: "contacted",
              notes: payload.notes,
              contactAttempts: payload.contactAttempts,
              lastContactedAt: payload.lastContactedAt,
              nextFollowUpAt: payload.nextFollowUpAt,
              doNotContact: payload.doNotContact,
              pipelineStage: payload.pipelineStage,
            },
          }),
        });
        const data = (await res.json()) as { configured?: boolean; warning?: string };
        if (data.configured && data.warning) {
          console.warn(data.warning);
        }
      } catch {
        console.warn("Airtable outreach update skipped");
      }
    },
    [allRowsById],
  );

  const outreachConfirmationCopy = (newAttempts: number, doNotContact: boolean) => {
    if (doNotContact || newAttempts >= 3) {
      return "Max attempts reached. Lead marked Do Not Contact.";
    }
    if (newAttempts === 1) return "Follow-up scheduled for tomorrow";
    if (newAttempts === 2) return "Next follow-up scheduled in 3 days";
    return "Follow-up updated.";
  };

  const applyOutreachConfirmed = useCallback(
    (leadId: string): { newAttempts: number; doNotContact: boolean } | null => {
      let syncPayload: {
        contactAttempts: number;
        lastContactedAt: number;
        nextFollowUpAt: number | null;
        doNotContact: boolean;
        notes: string;
        pipelineStage: string;
      } | null = null;
      let outcome: { newAttempts: number; doNotContact: boolean } | null = null;
      setStateMap((prev) => {
        const cur = normalizeStateEntry(prev[leadId]);
        if (cur.doNotContact) return prev;
        const ts = Date.now();
        const nextAttempts = (cur.contactAttempts ?? 0) + 1;
        const nextFollowUpAt =
          nextAttempts === 1
            ? ts + 24 * 60 * 60 * 1000
            : nextAttempts === 2
              ? ts + 72 * 60 * 60 * 1000
              : null;
        const doNotContact = nextAttempts >= 3;
        const pipelineStage = doNotContact ? "do_not_contact" : "contacted";
        outcome = { newAttempts: nextAttempts, doNotContact };
        syncPayload = {
          contactAttempts: nextAttempts,
          lastContactedAt: ts,
          nextFollowUpAt,
          doNotContact,
          notes: cur.note ?? "",
          pipelineStage,
        };
        const next: StateMap = {
          ...prev,
          [leadId]: {
            ...DEFAULT_STATE,
            ...cur,
            status: "contacted",
            contactedAt: cur.contactedAt ?? ts,
            lastContactedAt: ts,
            contactAttempts: nextAttempts,
            channel: "whatsapp",
            nextFollowUpAt,
            doNotContact,
            followUpAfterHours: nextAttempts === 1 ? 24 : 72,
            updatedAt: ts,
          },
        };
        saveState(next);
        return next;
      });
      if (syncPayload && outcome) {
        void syncContactedToAirtable(leadId, syncPayload);
      }
      return outcome;
    },
    [syncContactedToAirtable],
  );

  const recordWhatsAppOutreach = useCallback(
    (id: string) => {
      const outcome = applyOutreachConfirmed(id);
      if (outcome) {
        showQueueNotice(
          outreachConfirmationCopy(outcome.newAttempts, outcome.doNotContact),
        );
      }
    },
    [applyOutreachConfirmed],
  );

  useEffect(() => {
    // Follow-up visibility is derived from `nextFollowUpAt`; keep status stable.
    return () => {};
  }, []);

  const setLeadStatus = (id: string, status: LeadStatus) => {
    const current = getLeadState(id);
    const ts = Date.now();

    if (status === "contacted") {
      const outcome = applyOutreachConfirmed(id);
      if (outcome) {
        showQueueNotice(
          outreachConfirmationCopy(outcome.newAttempts, outcome.doNotContact),
        );
      }
      return;
    }

    if (status === "replied") {
      updateLead(id, {
        status,
        repliedAt:
          typeof current.repliedAt === "number" ? current.repliedAt : ts,
        nextFollowUpAt: null,
      });
      return;
    }
    if (status === "meeting") {
      updateLead(id, {
        status,
        meetingAt:
          typeof current.meetingAt === "number" ? current.meetingAt : ts,
        nextFollowUpAt: null,
      });
      return;
    }
    if (status === "won") {
      updateLead(id, {
        status,
        wonAt: typeof current.wonAt === "number" ? current.wonAt : ts,
        nextFollowUpAt: null,
      });
      return;
    }
    if (status === "lost") {
      updateLead(id, {
        status,
        lostAt: typeof current.lostAt === "number" ? current.lostAt : ts,
        nextFollowUpAt: null,
      });
      return;
    }
    if (status === "new") {
      updateLead(id, { status, nextFollowUpAt: null });
      return;
    }
    if (status === "needs_follow_up") {
      updateLead(id, { status });
      return;
    }
  };

  const generateLeadAiMessage = async (
    lead: ScoredLead,
    followUp = false,
  ): Promise<string> => {
    const res = await fetch("/api/generate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: lead.name,
        type: lead.type,
        location: `${lead.city}, ${lead.region}`,
        leadScore: lead.leadScore,
        hotScore: lead.hotScore,
        followUp,
      }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Sunucu hatası (${res.status})`);
    }
    const message = data.message?.trim();
    if (!message) {
      throw new Error("Boş mesaj döndü");
    }
    return message;
  };

  const generateLeadAiStylePack = async (
    lead: ScoredLead,
    followUp = false,
  ): Promise<{ styles: { direct: string; soft: string; curiosity: string }; fallback: string }> => {
    const res = await fetch("/api/generate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: lead.name,
        type: lead.type,
        location: `${lead.city}, ${lead.region}`,
        leadScore: lead.leadScore,
        hotScore: lead.hotScore,
        followUp,
      }),
    });
    const data = (await res.json()) as {
      styles?: { direct?: string; soft?: string; curiosity?: string };
      message?: string;
      error?: string;
      variations?: string[];
    };
    if (!res.ok) {
      throw new Error(data.error || `Sunucu hatası (${res.status})`);
    }
    const styles = data.styles;
    const direct = styles?.direct?.trim() ?? "";
    const soft = styles?.soft?.trim() ?? "";
    const curiosity = styles?.curiosity?.trim() ?? "";
    const fallback =
      (data.message?.trim() ||
        (Array.isArray(data.variations) ? data.variations[0]?.trim() : "") ||
        "") ?? "";
    if (!direct || !soft || !curiosity) {
      throw new Error("AI message styles missing");
    }
    return { styles: { direct, soft, curiosity }, fallback };
  };

  const generateReplyHelperSuggestion = async (lead: LeadTableRow) => {
    const reply = ownerReplyDraft.trim();
    if (!reply) {
      setReplyHelperError("Owner reply gerekli.");
      return;
    }
    setReplyHelperBusy(true);
    setReplyHelperError(null);
    setReplyCopied(false);
    try {
      const res = await fetch("/api/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerReply: reply,
          city: lead.city,
        }),
      });
      const data = (await res.json()) as ReplyHelperSuggestion & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Sunucu hatası (${res.status})`);
      }
      if (!data.message?.trim()) {
        throw new Error("Boş yanıt döndü");
      }
      setReplyHelperSuggestion({
        message: data.message,
        suggestedStatus: data.suggestedStatus ?? null,
        suggestDoNotContact: Boolean(data.suggestDoNotContact),
        nextFollowUpAt:
          typeof data.nextFollowUpAt === "number" ? data.nextFollowUpAt : null,
        intent: data.intent || "unknown",
      });
    } catch (e) {
      setReplyHelperSuggestion(null);
      setReplyHelperError(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setReplyHelperBusy(false);
    }
  };

  const copyReplyHelperSuggestion = async () => {
    if (!replyHelperSuggestion?.message) return;
    try {
      await navigator.clipboard.writeText(replyHelperSuggestion.message);
      setReplyCopied(true);
      window.setTimeout(() => setReplyCopied(false), 2000);
    } catch {
      setReplyCopied(false);
    }
  };

  const applyReplyHelperSuggestion = (lead: LeadTableRow) => {
    const suggestion = replyHelperSuggestion;
    if (!suggestion) return;

    if (suggestion.suggestDoNotContact) {
      setLeadStatus(lead.id, "lost");
      updateLead(lead.id, { doNotContact: true, nextFollowUpAt: null });
      return;
    }

    if (suggestion.suggestedStatus) {
      setLeadStatus(lead.id, suggestion.suggestedStatus);
    }
    if (typeof suggestion.nextFollowUpAt === "number") {
      updateLead(lead.id, {
        status: "needs_follow_up",
        nextFollowUpAt: suggestion.nextFollowUpAt,
      });
    }
  };

  const startAiMessage = async (lead: ScoredLead) => {
    const st = getLeadState(lead.id);
    if (st.doNotContact) {
      setAiMessageModal({
        lead,
        phase: "error",
        error: "This lead is marked Do Not Contact. Outreach is disabled.",
      });
      return;
    }
    if (st.status !== "new" && st.status !== "needs_follow_up") {
      const ok = window.confirm(
        "This lead is not in New status. You may duplicate outreach. Generate an AI message anyway?",
      );
      if (!ok) return;
    }
    const useFollowUpCopy = st.status === "needs_follow_up";
    setAiMessageModal({ lead, phase: "loading" });
    try {
      const message = await generateLeadAiMessage(lead, useFollowUpCopy);
      setAiMessageModal({
        lead,
        phase: "ready",
        message,
      });
    } catch (e) {
      setAiMessageModal({
        lead,
        phase: "error",
        error: e instanceof Error ? e.message : "Bir hata oluştu",
      });
    }
  };

  const drawerSendMessage = async (lead: LeadTableRow) => {
    const st = getLeadState(lead.id);
    if (st.doNotContact) return;
    const wa = whatsappLink(lead.phone);
    const followUp = st.status === "needs_follow_up";
    if (wa) {
      setDrawerSendBusy(true);
      try {
        const message = await generateLeadAiMessage(lead, followUp);
        const link = whatsappLinkWithText(lead.phone, message);
        if (!link) {
          setAiMessageModal({ lead, phase: "ready", message });
          return;
        }
        openExternal(link);
        showQueueNotice(
          "WhatsApp opened. Use Mark Sent in the queue or set status to Contacted after you send.",
        );
      } catch (e) {
        setAiMessageModal({
          lead,
          phase: "error",
          error: e instanceof Error ? e.message : "Bir hata oluştu",
        });
      } finally {
        setDrawerSendBusy(false);
      }
    } else {
      void startAiMessage(lead);
    }
  };

  const startFollowUpOutreach = async (lead: ScoredLead) => {
    const st = getLeadState(lead.id);
    if (st.doNotContact) return;
    if (st.contactAttempts !== undefined && st.contactAttempts >= 3) return;
    if (!isFollowUpDue(st, Date.now()) && st.status !== "needs_follow_up") return;
    const wa = whatsappLink(lead.phone);
    if (!wa) {
      showQueueNotice("No WhatsApp contact");
      return;
    }
    setFollowUpBusyLeadId(lead.id);
    try {
      const aiMessage = await generateLeadAiMessage(lead, true);
      const fallback = `Merhaba ${lead.name}, onceki mesajimi gorup goremediginizi kontrol etmek istedim. Uygunsaniz kisaca bilgi paylasabilir miyim?`;
      const message = aiMessage.trim() || fallback;
      const waWithText = whatsappLinkWithText(lead.phone, message);
      if (!waWithText) {
        showQueueNotice("No WhatsApp contact");
        return;
      }
      openExternal(waWithText);
      showQueueNotice("WhatsApp opened. Mark follow-up sent after you send manually.");
    } catch (e) {
      setAiMessageModal({
        lead,
        phase: "error",
        error: e instanceof Error ? e.message : "Bir hata oluştu",
      });
    } finally {
      setFollowUpBusyLeadId(null);
    }
  };

  const findBestContact = async (leadId: string, website: string) => {
    setContactFinderRequest({ status: "loading", leadId });
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
      if (!isContactFinderResult(data)) {
        throw new Error("Invalid contact finder response");
      }
      const cleaned = sanitizeContactFinderResult(data);
      setContactFinderMap((prev) => {
        const next = { ...prev, [leadId]: cleaned };
        saveContactFinderMap(next);
        return next;
      });
      setContactFinderRequest({ status: "idle" });
    } catch (e) {
      setContactFinderRequest({
        status: "error",
        leadId,
        message: e instanceof Error ? e.message : "Contact finder failed",
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
    const ids = selectedLeadIds.filter((id) => !getLeadState(id).doNotContact);
    if (ids.length === 0) return;
    type SyncP = {
      contactAttempts: number;
      lastContactedAt: number;
      nextFollowUpAt: number | null;
      doNotContact: boolean;
      notes: string;
      pipelineStage: string;
    };

    setStateMap((prev) => {
      const next: StateMap = { ...prev };
      const syncList: { id: string; payload: SyncP }[] = [];
      let lastOutcome: { newAttempts: number; doNotContact: boolean } | null = null;
      for (const leadId of ids) {
        const cur = normalizeStateEntry(next[leadId]);
        if (cur.doNotContact) continue;
        const ts = Date.now();
        const nextAttempts = (cur.contactAttempts ?? 0) + 1;
        const nextFollowUpAt =
          nextAttempts === 1
            ? ts + 24 * 60 * 60 * 1000
            : nextAttempts === 2
              ? ts + 72 * 60 * 60 * 1000
              : null;
        const doNotContact = nextAttempts >= 3;
        const pipelineStage = doNotContact ? "do_not_contact" : "contacted";
        lastOutcome = { newAttempts: nextAttempts, doNotContact };
        const payload: SyncP = {
          contactAttempts: nextAttempts,
          lastContactedAt: ts,
          nextFollowUpAt,
          doNotContact,
          notes: cur.note ?? "",
          pipelineStage,
        };
        syncList.push({ id: leadId, payload });
        next[leadId] = {
          ...DEFAULT_STATE,
          ...cur,
          status: "contacted",
          contactedAt: cur.contactedAt ?? ts,
          lastContactedAt: ts,
          contactAttempts: nextAttempts,
          channel: "whatsapp",
          nextFollowUpAt,
          doNotContact,
          followUpAfterHours: nextAttempts === 1 ? 24 : 72,
          updatedAt: ts,
        };
      }
      saveState(next);
      queueMicrotask(() => {
        for (const { id, payload } of syncList) {
          void syncContactedToAirtable(id, payload);
        }
        if (lastOutcome) {
          showQueueNotice(
            outreachConfirmationCopy(lastOutcome.newAttempts, lastOutcome.doNotContact),
          );
        }
      });
      return next;
    });
  };

  const activeQueueCount = useMemo(() => {
    return dailyOutreach.todayQueue.filter((id) => {
      const item = dailyOutreach.queueItems[id];
      return (
        item &&
        (item.queueStatus === "queued" ||
          item.queueStatus === "prepared" ||
          item.queueStatus === "opened")
      );
    }).length;
  }, [dailyOutreach.todayQueue, dailyOutreach.queueItems]);

  const addLeadIdsToDailyQueue = (ids: string[]) => {
    const now = Date.now();
    const day = localCalendarDayKey();
    const actuallyAdded: string[] = [];
    setDailyOutreach((prev) => {
      const base =
        prev.queueDate === day
          ? prev
          : {
              queueDate: day,
              todayQueue: [],
              todayLog: [],
              queueItems: {},
              completedToday: 0,
              skippedToday: 0,
              dncToday: 0,
            };
      const currentActive = base.todayQueue.filter((qid) => {
        const item = base.queueItems[qid];
        return (
          item &&
          (item.queueStatus === "queued" ||
            item.queueStatus === "prepared" ||
            item.queueStatus === "opened")
        );
      }).length;
      if (currentActive >= DAILY_OUTREACH_LIMIT) {
        window.setTimeout(
          () =>
            showQueueNotice(
              `Daily queue is full (${DAILY_OUTREACH_LIMIT}/${DAILY_OUTREACH_LIMIT}).`,
            ),
          0,
        );
        return base;
      }
      const nextQ = [...base.todayQueue];
      const nextLog = [...base.todayLog];
      const nextItems: Record<string, DailyQueueItem> = { ...base.queueItems };
      let added = 0;
      for (const id of ids) {
        const activeNow = nextQ.filter((qid) => {
          const item = nextItems[qid];
          return (
            item &&
            (item.queueStatus === "queued" ||
              item.queueStatus === "prepared" ||
              item.queueStatus === "opened")
          );
        }).length;
        if (activeNow >= DAILY_OUTREACH_LIMIT) break;
        if (nextQ.includes(id)) continue;
        const row = allRowsById.get(id);
        if (!row) continue;
        if (!isEligibleForDailyQueue(row, contactFinderMap[id], nextQ, now)) continue;
        nextQ.push(id);
        if (!nextLog.includes(id)) nextLog.push(id);
        nextItems[id] = emptyDailyQueueItem(now);
        actuallyAdded.push(id);
        added++;
      }
      const next: DailyOutreachPersisted = {
        ...base,
        queueDate: day,
        todayQueue: dedupeLeadIds(nextQ),
        todayLog: dedupeLeadIds(nextLog),
        queueItems: nextItems,
      };
      saveDailyOutreachState(next);
      if (added === 0 && ids.length > 0) {
        window.setTimeout(
          () =>
            showQueueNotice(
              "No eligible leads added (status New, contact path available, not contacted today, not in queue).",
            ),
          0,
        );
      } else if (ids.length > added && nextQ.length >= DAILY_OUTREACH_LIMIT) {
        window.setTimeout(
          () =>
            showQueueNotice(
              `Added ${added} lead(s); daily limit is ${DAILY_OUTREACH_LIMIT}.`,
            ),
          0,
        );
      }
      return next;
    });
    if (actuallyAdded.length > 0) {
      setStateMap((prev) => {
        const next: StateMap = { ...prev };
        const ts = Date.now();
        for (const id of actuallyAdded) {
          const cur = normalizeStateEntry(next[id]);
          next[id] = {
            ...DEFAULT_STATE,
            ...cur,
            queuedToday: true,
            lastQueuedAt: ts,
            updatedAt: ts,
          };
        }
        saveState(next);
        return next;
      });
    }
  };

  const autoBuildTodayQueue = () => {
    const now = Date.now();
    const day = localCalendarDayKey();
    const baseDaily =
      dailyOutreach.queueDate === day ? dailyOutreach : loadDailyOutreachState();

    const activeNow = baseDaily.todayQueue.filter((id) => {
      const item = baseDaily.queueItems[id];
      return (
        item &&
        (item.queueStatus === "queued" ||
          item.queueStatus === "prepared" ||
          item.queueStatus === "opened")
      );
    }).length;
    const remaining = Math.max(0, DAILY_OUTREACH_LIMIT - activeNow);
    if (remaining <= 0) {
      showQueueNotice(`Queue already full (${DAILY_OUTREACH_LIMIT}/${DAILY_OUTREACH_LIMIT}).`);
      return;
    }

    const candidates = allRows
      .filter((row) =>
        isEligibleForAutoQueue(row, contactFinderMap[row.id], baseDaily, now),
      )
      .map((row) => {
        const contact = hasValidOutboundContact(row, contactFinderMap[row.id]);
        return {
          id: row.id,
          hot: row.hotScore,
          lead: row.leadScore,
          hasWa: contact.whatsapp,
          attempts: row._s.contactAttempts ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.hot !== a.hot) return b.hot - a.hot;
        if (b.lead !== a.lead) return b.lead - a.lead;
        if (a.hasWa !== b.hasWa) return a.hasWa ? -1 : 1;
        return a.attempts - b.attempts;
      })
      .slice(0, remaining);

    if (candidates.length === 0) {
      showQueueNotice("No eligible leads found in Master Lead Pool for auto-queue.");
      return;
    }

    const addIds = candidates.map((c) => c.id);
    const actuallyAdded: string[] = [];
    setDailyOutreach((prev) => {
      const base =
        prev.queueDate === day
          ? prev
          : {
              queueDate: day,
              todayQueue: [],
              todayLog: [],
              queueItems: {},
              completedToday: 0,
              skippedToday: 0,
              dncToday: 0,
            };
      const nextQ = [...base.todayQueue];
      const nextLog = [...base.todayLog];
      const nextItems: Record<string, DailyQueueItem> = { ...base.queueItems };

      for (const id of addIds) {
        if (nextQ.includes(id)) continue;
        if (!allRowsById.has(id)) continue;
        nextQ.push(id);
        if (!nextLog.includes(id)) nextLog.push(id);
        nextItems[id] = emptyDailyQueueItem(now);
        actuallyAdded.push(id);
      }

      const next: DailyOutreachPersisted = {
        ...base,
        queueDate: day,
        todayQueue: dedupeLeadIds(nextQ),
        todayLog: dedupeLeadIds(nextLog),
        queueItems: nextItems,
      };
      saveDailyOutreachState(next);
      return next;
    });

    if (actuallyAdded.length > 0) {
      setStateMap((prev) => {
        const next: StateMap = { ...prev };
        const ts = Date.now();
        for (const id of actuallyAdded) {
          const cur = normalizeStateEntry(next[id]);
          next[id] = {
            ...DEFAULT_STATE,
            ...cur,
            queuedToday: true,
            lastQueuedAt: ts,
            updatedAt: ts,
          };
        }
        saveState(next);
        return next;
      });
      showQueueNotice(`Auto-built queue: added ${actuallyAdded.length} lead(s).`);
    }
  };

  const clearDailyQueue = () => {
    const day = localCalendarDayKey();
    setDailyOutreach((prev) => {
      const next: DailyOutreachPersisted = {
        ...prev,
        queueDate: day,
        todayQueue: [],
        todayLog: [],
        queueItems: {},
      };
      saveDailyOutreachState(next);
      return next;
    });
  };

  const startDailyOutreachSession = () => {
    if (dailyOutreach.todayQueue.length === 0) {
      showQueueNotice("Add leads to the queue first.");
      return;
    }
    const followUpById: Record<string, boolean> = {};
    for (const id of dailyOutreach.todayQueue) {
      followUpById[id] = getLeadState(id).status === "needs_follow_up";
    }
    setOutreachQueue({
      open: true,
      leadIds: dedupeLeadIds([...dailyOutreach.todayQueue]),
      index: 0,
      messages: {},
      loading: false,
      error: null,
      followUpById,
      complete: false,
      sessionStats: { sent: 0, skipped: 0, dnc: 0 },
    });
  };

  const sendBulkAiMessages = async () => {
    if (selectedLeadIds.length === 0) return;
    const queueLeadIds = selectedLeadIds
      .filter((id) => allRowsById.has(id))
      .filter((id) => !getLeadState(id).doNotContact)
      .filter((id) => {
        const st = getLeadState(id).status;
        return st === "new" || st === "needs_follow_up";
      });
    if (queueLeadIds.length === 0) return;
    const capped = dedupeLeadIds(queueLeadIds).slice(0, DAILY_OUTREACH_LIMIT);
    if (queueLeadIds.length > DAILY_OUTREACH_LIMIT) {
      showQueueNotice(
        `Only the first ${DAILY_OUTREACH_LIMIT} selected leads start (daily outreach cap).`,
      );
    }
    const followUpById: Record<string, boolean> = {};
    for (const id of capped) {
      followUpById[id] = getLeadState(id).status === "needs_follow_up";
    }
    setOutreachQueue({
      open: true,
      leadIds: capped,
      index: 0,
      messages: {},
      loading: false,
      error: null,
      followUpById,
      complete: false,
      sessionStats: { sent: 0, skipped: 0, dnc: 0 },
    });
  };

  const queueCurrentId = outreachQueue.leadIds[outreachQueue.index] ?? null;
  const queueCurrentLead = queueCurrentId ? allRowsById.get(queueCurrentId) ?? null : null;
  const queueCurrentFinder = queueCurrentId ? contactFinderMap[queueCurrentId] : undefined;
  const queueCurrentPhone =
    queueCurrentLead && queueCurrentId
      ? queueSessionWhatsAppDigits(queueCurrentLead, queueCurrentFinder)
      : null;
  const queueCurrentMessage = queueCurrentId
    ? dailyOutreach.queueItems[queueCurrentId]?.preparedMessage ??
      outreachQueue.messages[queueCurrentId] ??
      ""
    : "";

  const updateQueueItem = useCallback(
    (id: string, patch: Partial<DailyQueueItem>) => {
      setDailyOutreach((prev) => {
        const day = localCalendarDayKey();
        const base =
          prev.queueDate === day
            ? prev
            : {
                queueDate: day,
                todayQueue: [],
                todayLog: [],
                queueItems: {},
                completedToday: 0,
                skippedToday: 0,
                dncToday: 0,
              };
        const current = base.queueItems[id] ?? emptyDailyQueueItem();
        const next: DailyOutreachPersisted = {
          ...base,
          queueItems: {
            ...base.queueItems,
            [id]: {
              ...current,
              ...patch,
              updatedAt: Date.now(),
            },
          },
        };
        saveDailyOutreachState(next);
        return next;
      });
    },
    [],
  );

  const removeLeadFromQueue = useCallback((id: string) => {
    setDailyOutreach((dprev) => {
      const day = localCalendarDayKey();
      const base = dprev.queueDate === day ? dprev : loadDailyOutreachState();
      const nextItems = { ...base.queueItems };
      delete nextItems[id];
      const nextD: DailyOutreachPersisted = {
        ...base,
        queueDate: day,
        todayQueue: base.todayQueue.filter((x) => x !== id),
        todayLog: base.todayLog.filter((x) => x !== id),
        queueItems: nextItems,
      };
      saveDailyOutreachState(nextD);
      return nextD;
    });
  }, []);

  const prepareQueueLeadMessage = async () => {
    if (!queueCurrentId || !queueCurrentLead) return;
    const followUp = Boolean(outreachQueue.followUpById[queueCurrentId]);
    setOutreachQueue((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const pack = await generateLeadAiStylePack(queueCurrentLead, followUp);
      const message = pack.styles.direct || pack.fallback;
      setOutreachQueue((prev) => ({
        ...prev,
        loading: false,
        messages: { ...prev.messages, [queueCurrentId]: message },
      }));
      updateQueueItem(queueCurrentId, {
        preparedMessage: message,
        preparedVariants: pack.styles,
        selectedVariant: "direct",
        queueStatus: "prepared",
      });
    } catch (e) {
      setOutreachQueue((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Message could not be prepared",
      }));
    }
  };

  const closeOutreachQueue = () => {
    setOutreachQueue(emptyOutreachQueueState());
  };

  const finishQueueSession = (prev: OutreachQueueState): OutreachQueueState => ({
    ...prev,
    open: true,
    complete: true,
    loading: false,
    error: null,
  });

  const goNextInQueue = (countAsSkip: boolean) => {
    setDailyOutreach((dprev) => {
      if (!countAsSkip) return dprev;
      const day = localCalendarDayKey();
      const base = dprev.queueDate === day ? dprev : loadDailyOutreachState();
      const nextD: DailyOutreachPersisted = {
        ...base,
        queueDate: day,
        skippedToday: base.skippedToday + 1,
      };
      saveDailyOutreachState(nextD);
      return nextD;
    });
    setOutreachQueue((prev) => {
      const stats = countAsSkip
        ? {
            ...prev.sessionStats,
            skipped: prev.sessionStats.skipped + 1,
          }
        : prev.sessionStats;
      if (prev.index >= prev.leadIds.length - 1) {
        return finishQueueSession({ ...prev, sessionStats: stats });
      }
      return { ...prev, index: prev.index + 1, error: null, sessionStats: stats };
    });
  };

  const markQueueLeadSent = () => {
    if (!queueCurrentLead || !queueCurrentId) return;
    const id = queueCurrentLead.id;
    const outcome = applyOutreachConfirmed(id);
    if (outcome) {
      showQueueNotice(
        outreachConfirmationCopy(outcome.newAttempts, outcome.doNotContact),
      );
    }
    updateQueueItem(id, { queueStatus: "contacted" });
    setDailyOutreach((dprev) => {
      const day = localCalendarDayKey();
      const base = dprev.queueDate === day ? dprev : loadDailyOutreachState();
      const nextD: DailyOutreachPersisted = {
        ...base,
        queueDate: day,
        todayQueue: base.todayQueue.filter((x) => x !== id),
        todayLog: base.todayLog.includes(id) ? base.todayLog : [...base.todayLog, id],
        completedToday: base.completedToday + 1,
      };
      saveDailyOutreachState(nextD);
      return nextD;
    });
    setOutreachQueue((prev) => {
      const stats = {
        ...prev.sessionStats,
        sent: prev.sessionStats.sent + 1,
      };
      const leadIds = prev.leadIds.filter((x) => x !== id);
      const nextIndex = Math.min(prev.index, Math.max(0, leadIds.length - 1));
      if (leadIds.length === 0) {
        return finishQueueSession({
          ...prev,
          leadIds: [],
          index: 0,
          messages: {},
          sessionStats: stats,
        });
      }
      return {
        ...prev,
        leadIds,
        index: nextIndex,
        sessionStats: stats,
        error: null,
      };
    });
  };

  const markQueueLeadDnc = () => {
    if (!queueCurrentLead || !queueCurrentId) return;
    const id = queueCurrentLead.id;
    updateLead(id, { doNotContact: true });
    setDailyOutreach((dprev) => {
      const day = localCalendarDayKey();
      const base = dprev.queueDate === day ? dprev : loadDailyOutreachState();
      const nextD: DailyOutreachPersisted = {
        ...base,
        queueDate: day,
        todayQueue: base.todayQueue.filter((x) => x !== id),
        todayLog: base.todayLog.includes(id) ? base.todayLog : [...base.todayLog, id],
        dncToday: base.dncToday + 1,
      };
      saveDailyOutreachState(nextD);
      return nextD;
    });
    setOutreachQueue((prev) => {
      const stats = {
        ...prev.sessionStats,
        dnc: prev.sessionStats.dnc + 1,
      };
      const leadIds = prev.leadIds.filter((x) => x !== id);
      const nextIndex = Math.min(prev.index, Math.max(0, leadIds.length - 1));
      if (leadIds.length === 0) {
        return finishQueueSession({
          ...prev,
          leadIds: [],
          index: 0,
          messages: {},
          sessionStats: stats,
        });
      }
      return {
        ...prev,
        leadIds,
        index: nextIndex,
        sessionStats: stats,
        error: null,
      };
    });
  };

  const skipQueueLead = () => {
    if (!queueCurrentId) return;
    updateQueueItem(queueCurrentId, { queueStatus: "skipped" });
    setDailyOutreach((dprev) => {
      const day = localCalendarDayKey();
      const base = dprev.queueDate === day ? dprev : loadDailyOutreachState();
      const nextD: DailyOutreachPersisted = {
        ...base,
        queueDate: day,
        todayQueue: base.todayQueue.filter((x) => x !== queueCurrentId),
        todayLog: base.todayLog.includes(queueCurrentId)
          ? base.todayLog
          : [...base.todayLog, queueCurrentId],
      };
      saveDailyOutreachState(nextD);
      return nextD;
    });
    goNextInQueue(true);
  };

  const markFollowUpSent = (leadId: string) => {
    const outcome = applyOutreachConfirmed(leadId);
    if (outcome) {
      showQueueNotice(
        outreachConfirmationCopy(outcome.newAttempts, outcome.doNotContact),
      );
    }
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
          <a
            href="/dashboard/follow-ups"
            className="rounded-md border border-orange-400/30 bg-orange-500/10 px-2 py-1 text-[11px] text-orange-200 transition hover:bg-orange-500/20"
          >
            Follow-ups
          </a>
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

      {/* Morning Outreach */}
      <section className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4 backdrop-blur ring-1 ring-inset ring-emerald-400/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/20">
                <IconSpark className="h-3.5 w-3.5 text-emerald-200" />
              </div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
                Morning Outreach
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Queue {activeQueueCount}/{DAILY_OUTREACH_LIMIT} · Follow-ups due {followUpDueRows.length} · Contacted today{" "}
              {dailyOutreach.completedToday}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={autoBuildTodayQueue}
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/25"
            >
              Auto Build Today&apos;s Queue
            </button>
            <button
              type="button"
              onClick={startDailyOutreachSession}
              disabled={activeQueueCount === 0}
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Outreach Session
            </button>
            <a
              href="/dashboard/follow-ups"
              className="rounded-md border border-orange-400/30 bg-orange-500/10 px-2.5 py-1.5 text-xs font-medium text-orange-200 transition hover:bg-orange-500/20"
            >
              Open Follow-ups Today
            </a>
            <button
              type="button"
              onClick={() => void syncLeadsToAirtable()}
              disabled={airtableBusy !== null}
              className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sync Airtable
            </button>
          </div>
        </div>
      </section>

      {/* Import */}
      <ImportPanel onImport={handleImport} hasCachedResults={hasCachedImportResults} />

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void syncLeadsToAirtable()}
            disabled={airtableBusy !== null}
            className="inline-flex items-center justify-center rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {airtableBusy === "sync" ? "Syncing..." : "Sync to Airtable"}
          </button>
          <button
            type="button"
            onClick={() => void loadLeadsFromAirtable()}
            disabled={airtableBusy !== null}
            className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {airtableBusy === "load" ? "Loading..." : "Load from Airtable"}
          </button>
          {airtableConnected === true && (
            <span className="text-xs text-emerald-300">Airtable connected</span>
          )}
        </div>
        {airtableWarning && <p className="mt-2 text-xs text-amber-300">{airtableWarning}</p>}
        {airtableSyncStatus && <p className="mt-2 text-xs text-zinc-300">{airtableSyncStatus}</p>}
      </section>

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
        ) : latestImportRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-amber-300">
            No new leads in this import — all results already existed.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">
                    <input
                      type="checkbox"
                      checked={
                        latestImportRows.length > 0 &&
                        latestImportRows.every((row) => selectedLeadIds.includes(row.id))
                      }
                      aria-label="Select latest import leads"
                      onChange={(e) => {
                        const ids = latestImportRows.map((x) => x.id);
                        setSelectedLeadIds((prev) => {
                          if (e.target.checked) {
                            const next = new Set(prev);
                            for (const id of ids) next.add(id);
                            return Array.from(next);
                          }
                          const removeSet = new Set(ids);
                          return prev.filter((id) => !removeSet.has(id));
                        });
                      }}
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Lead</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 font-medium">Imported</th>
                  <th className="px-4 py-2.5 font-medium">Lead Score</th>
                  <th className="px-4 py-2.5 font-medium">Hot Score</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {latestImportRows.map((row, index) => {
                  const ig = row.instagram ? instagramLink(row.instagram) : null;
                  return (
                    <tr
                      key={renderLeadKey("latest-import", row, index)}
                      className="bg-indigo-500/[0.05] shadow-[inset_0_0_0_1px_rgba(129,140,248,0.25)]"
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
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => setOpenId(row.id)}
                              className="text-left font-medium text-zinc-100 hover:text-white"
                            >
                              {row.name}
                            </button>
                            {lastImportNewIds.includes(row.id) && (
                              <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                                New to database
                              </span>
                            )}
                            {lastImportUpdatedIds.includes(row.id) && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200 ring-1 ring-inset ring-amber-400/40">
                                Re-imported
                              </span>
                            )}
                          </div>
                          <OutreachBadgesRow
                            row={row}
                            syncedToAirtable={airtableSyncedLeadIds.includes(row.id)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        {row.type}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-300">
                        <div>{row.city}</div>
                        <div className="text-[11px] text-zinc-500">{row.region}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-400">
                        <div>
                          {relativeCalendarLabel(
                            row.firstImportedAt ?? row.createdAt,
                          )}
                        </div>
                        {(() => {
                          const lc =
                            row._s.lastContactedAt ?? row._s.contactedAt ?? null;
                          return lc ? (
                            <div className="mt-0.5 text-[11px] text-zinc-500">
                              Last contact: {relativeCalendarLabel(lc)}
                            </div>
                          ) : null;
                        })()}
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
                            onMarkContacted={recordWhatsAppOutreach}
                            outreachDisabled={row._s.doNotContact}
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
                            disabled={row._s.doNotContact}
                            onClick={() => void startAiMessage(row)}
                            title="Kişiselleştirilmiş AI mesajı"
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                          >
                            <IconSpark className="h-3.5 w-3.5 shrink-0" />
                            AI Message
                          </button>
                          {!row._s.doNotContact &&
                            (isFollowUpDue(row._s, Date.now()) ||
                              row._s.status === "needs_follow_up") && (
                              <button
                                type="button"
                                onClick={() => void startFollowUpOutreach(row)}
                                title="Kısa hatırlatma mesajı ve WhatsApp"
                                className="inline-flex h-8 shrink-0 items-center rounded-md border border-orange-400/30 bg-orange-500/10 px-2 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/20 sm:text-xs"
                              >
                                Follow Up
                              </button>
                            )}
                          <button
                            type="button"
                            disabled={(() => {
                              const now = Date.now();
                              const inQ = dailyOutreach.todayQueue.includes(row.id);
                              const elig = isEligibleForDailyQueue(
                                row,
                                contactFinderMap[row.id],
                                dailyOutreach.todayQueue,
                                now,
                              );
                              return (
                                inQ ||
                                !elig ||
                                (!inQ &&
                                  activeQueueCount >= DAILY_OUTREACH_LIMIT)
                              );
                            })()}
                            title="Add to today’s outreach queue (max 20)"
                            onClick={() => addLeadIdsToDailyQueue([row.id])}
                            className="inline-flex h-8 shrink-0 items-center rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Add to Queue
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
        {latestImportOnlyDuplicates && latestImportRows.length === 0 && (
          <div className="border-t border-white/5 px-4 py-2 text-[11px] text-zinc-500">
            Latest import returned only duplicates.
          </div>
        )}
      </section>

      {queueActionNotice && (
        <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {queueActionNotice}
        </div>
      )}

      <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3 ring-1 ring-inset ring-emerald-500/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
              Today&apos;s Outreach Queue
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {activeQueueCount} / {DAILY_OUTREACH_LIMIT} active · Sent today{" "}
              {dailyOutreach.completedToday} · Skipped {dailyOutreach.skippedToday} · DNC{" "}
              {dailyOutreach.dncToday}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startDailyOutreachSession}
              disabled={activeQueueCount === 0}
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Session
            </button>
            <button
              type="button"
              onClick={clearDailyQueue}
              disabled={dailyOutreach.todayQueue.length === 0}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear Queue
            </button>
          </div>
        </div>
        {dailyOutreach.todayLog.length > 0 ? (
          <div className="mt-3 max-h-28 overflow-y-auto border-t border-white/5 pt-2">
            <ul className="space-y-1.5 text-[11px] text-zinc-300">
              {dedupeLeadIds(dailyOutreach.todayLog).map((qid, index) => {
                const qrow = allRowsById.get(qid);
                if (!qrow) return null;
                const cat = classifyContactChannel(qrow, contactFinderMap[qid]);
                const qitem = dailyOutreach.queueItems[qid];
                return (
                  <li
                    key={renderLeadKey("daily-queue", qrow, index)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-1"
                  >
                    <span className="font-medium text-zinc-100">{qrow.name}</span>
                    <span className="text-zinc-500">{qrow.city}</span>
                    <span className="tabular-nums text-orange-200">Hot {qrow.hotScore}</span>
                    <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">
                      {qitem?.queueStatus ?? "queued"}
                    </span>
                    <span className="text-zinc-500">
                      {cat === "ready"
                        ? "Contact ready"
                        : cat === "needs_finder"
                          ? "Needs finder"
                          : "No channel"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-500">
            Use &quot;Add to Queue&quot; on import or All Leads rows, or add selected leads in bulk.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] px-4 py-3 ring-1 ring-inset ring-orange-500/10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-200">
              Follow-Up Due
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Contacted leads due now (max 3 attempts)
            </p>
          </div>
          <span className="rounded-md bg-black/20 px-2 py-1 text-[11px] text-orange-200">
            {followUpDueRows.length} due
          </span>
        </div>
        {followUpDueRows.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-500">No follow-up due right now.</p>
        ) : (
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
            {followUpDueRows.map((row, index) => {
              const attempts = row._s.contactAttempts ?? 0;
              const dueAt = followUpTargetTimestamp(row._s);
              return (
                <div
                  key={renderLeadKey("follow-up-due", row, index)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/20 px-2.5 py-2"
                >
                  <div>
                    <div className="text-xs font-medium text-zinc-100">{row.name}</div>
                    <div className="text-[11px] text-zinc-500">
                      {row.city} · Attempts {attempts} · Due {relativeCalendarLabel(dueAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={followUpBusyLeadId === row.id}
                      onClick={() => void startFollowUpOutreach(row)}
                      className="rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-2.5 py-1.5 text-[11px] font-medium text-[#25D366] hover:bg-[#25D366]/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {followUpBusyLeadId === row.id ? "Preparing..." : "Follow Up"}
                    </button>
                    <button
                      type="button"
                      onClick={() => markFollowUpSent(row.id)}
                      className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20"
                    >
                      Mark Follow-Up Sent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedLeadIds.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2">
          <span className="text-xs text-zinc-400">✓ {selectedLeadIds.length} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addLeadIdsToDailyQueue(selectedLeadIds)}
              className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
            >
              Add Selected to Queue
            </button>
            <button
              type="button"
              onClick={() => void sendBulkAiMessages()}
              className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
            >
              Start Outreach Queue
            </button>
            <button
              type="button"
              onClick={markSelectedAsContacted}
              className="rounded-md border border-sky-400/25 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
            >
              Mark Contacted
            </button>
          </div>
          {outreachQueue.open && (
            <span className="text-xs text-zinc-400">
              Queue {Math.min(outreachQueue.index + 1, outreachQueue.leadIds.length)}/
              {outreachQueue.leadIds.length}
            </span>
          )}
        </section>
      )}

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
              key={renderLeadKey("hot", lead, i)}
              rank={i + 1}
              lead={lead}
              status={lead._s.status}
              onAction={(id) => setOpenId(id)}
              onAddToQueue={(id) => addLeadIdsToDailyQueue([id])}
              queueDisabled={activeQueueCount >= DAILY_OUTREACH_LIMIT}
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
                label="Last Import"
                active={allLeadsTimeFilter === "last_import"}
                onClick={() => {
                  setAllLeadsTimeFilter("last_import");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label="Today"
                active={allLeadsTimeFilter === "today"}
                onClick={() => {
                  setAllLeadsTimeFilter("today");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label="All Time"
                active={allLeadsTimeFilter === "all_time"}
                onClick={() => {
                  setAllLeadsTimeFilter("all_time");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label="Follow-Up"
                active={allLeadsTimeFilter === "follow_up"}
                onClick={() => {
                  setAllLeadsTimeFilter("follow_up");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={"Today's Work"}
                active={allLeadsTimeFilter === "today_work"}
                onClick={() => {
                  setAllLeadsTimeFilter("today_work");
                  setShowAllLeadsRows(false);
                }}
              />
              <span className="mx-1 h-4 w-px bg-white/10" />
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
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectVisible(e.target.checked)}
                    aria-label="Select all visible leads"
                  />
                  Select All (visible)
                </label>
                {focusMode && (
                  <span className="text-[11px] text-orange-300">
                    Focused: status New + hot score ≥ 70
                  </span>
                )}
              </div>
            </div>

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
                    <th className="px-4 py-2.5 font-medium">Imported</th>
                    <th className="px-4 py-2.5 font-medium">Lead Score</th>
                    <th className="px-4 py-2.5 font-medium">Hot Score</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleAllLeads.map((row, index) => {
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
                        key={renderLeadKey("all-leads", row, index)}
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
                          <div>
                            <button
                              type="button"
                              onClick={() => setOpenId(row.id)}
                              className="text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium text-zinc-100 hover:text-white">
                                  {row.name}
                                </div>
                                <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/10">
                                  {buildImportedLabel(row.createdAt, row.firstImportedAt)}
                                </span>
                                <span className="inline-flex items-center rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-400/20">
                                  {getImportedBadgeText(row.createdAt, row.firstImportedAt)}
                                </span>
                                {isRecentlyImported && (
                                  <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                                    Session import
                                  </span>
                                )}
                              </div>
                            </button>
                            <OutreachBadgesRow
                              row={row}
                              reimported={lastImportUpdatedIds.includes(row.id)}
                              syncedToAirtable={airtableSyncedLeadIds.includes(row.id)}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-zinc-300">
                          <div>{row.city}</div>
                          <div className="text-[11px] text-zinc-500">{row.region}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-zinc-400">
                          <div>
                            {relativeCalendarLabel(
                              row.firstImportedAt ?? row.createdAt,
                            )}
                          </div>
                          {(() => {
                            const lc =
                              s.lastContactedAt ?? s.contactedAt ?? null;
                            return lc ? (
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                Last contact: {relativeCalendarLabel(lc)}
                              </div>
                            ) : null;
                          })()}
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
                              onMarkContacted={recordWhatsAppOutreach}
                              outreachDisabled={s.doNotContact}
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
                              disabled={s.doNotContact}
                              onClick={() => void startAiMessage(row)}
                              title="Kişiselleştirilmiş AI mesajı"
                              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                            >
                              <IconSpark className="h-3.5 w-3.5 shrink-0" />
                              AI Message
                            </button>
                            {!s.doNotContact &&
                              (isFollowUpDue(s, Date.now()) ||
                                s.status === "needs_follow_up") && (
                                <button
                                  type="button"
                                  onClick={() => void startFollowUpOutreach(row)}
                                  title="Kısa hatırlatma mesajı ve WhatsApp"
                                  className="inline-flex h-8 shrink-0 items-center rounded-md border border-orange-400/30 bg-orange-500/10 px-2 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/20 sm:text-xs"
                                >
                                  Follow Up
                                </button>
                              )}
                            <button
                              type="button"
                              disabled={(() => {
                                const now = Date.now();
                                const inQ = dailyOutreach.todayQueue.includes(row.id);
                                const elig = isEligibleForDailyQueue(
                                  row,
                                  contactFinderMap[row.id],
                                  dailyOutreach.todayQueue,
                                  now,
                                );
                                return (
                                  inQ ||
                                  !elig ||
                                  (!inQ &&
                                    activeQueueCount >= DAILY_OUTREACH_LIMIT)
                                );
                              })()}
                              title="Add to today’s outreach queue"
                              onClick={() => addLeadIdsToDailyQueue([row.id])}
                              className="inline-flex h-8 shrink-0 items-center rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Queue
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
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">
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
        onMarkContacted={recordWhatsAppOutreach}
      />

      {outreachQueue.open && (outreachQueue.complete || queueCurrentLead) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Kapat"
            onClick={closeOutreachQueue}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950 shadow-2xl ring-1 ring-white/5">
            <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  {outreachQueue.complete ? "Session complete" : "Today’s outreach session"}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {outreachQueue.complete
                    ? "Summary for this run"
                    : `${outreachQueue.index + 1} / ${outreachQueue.leadIds.length}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeOutreachQueue}
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
            <div className="space-y-3 px-4 py-4 text-sm">
              {outreachQueue.complete ? (
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-4 text-zinc-200">
                  <p className="text-sm font-medium text-zinc-100">Nice work.</p>
                  <ul className="mt-3 space-y-1.5 text-xs text-zinc-400">
                    <li>Sent: {outreachQueue.sessionStats.sent}</li>
                    <li>Skipped: {outreachQueue.sessionStats.skipped}</li>
                    <li>Do not contact: {outreachQueue.sessionStats.dnc}</li>
                  </ul>
                  <button
                    type="button"
                    onClick={closeOutreachQueue}
                    className="mt-4 rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400"
                  >
                    Close
                  </button>
                </div>
              ) : queueCurrentLead ? (
                <>
                  <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
                    <div className="font-medium text-sm text-zinc-100">{queueCurrentLead.name}</div>
                    <div className="mt-0.5 text-zinc-400">
                      {queueCurrentLead.city}, {queueCurrentLead.region}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-zinc-500">Lead score</span>{" "}
                        <span className="font-medium text-zinc-200">{queueCurrentLead.leadScore}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Hot score</span>{" "}
                        <span className="font-medium text-zinc-200">{queueCurrentLead.hotScore}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Contact quality</span>{" "}
                        <span className="font-medium text-zinc-200">
                          {CONTACT_QUALITY_LABEL[queueCurrentLead.contactQuality]}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Best contact</span>{" "}
                        <span className="font-medium text-zinc-200">
                          {queueCurrentFinder
                            ? `${queueCurrentFinder.bestContactType} · ${queueCurrentFinder.bestContactValue}`
                            : whatsappLink(queueCurrentLead.phone)
                              ? `WhatsApp · ${queueCurrentLead.phone}`
                              : queueCurrentLead.phone || "—"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Pipeline: {STATUS_LABEL[queueCurrentLead._s.status]}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Queue status: {dailyOutreach.queueItems[queueCurrentId!]?.queueStatus ?? "queued"}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                      AI message preview
                    </div>
                    {queueCurrentId &&
                      dailyOutreach.queueItems[queueCurrentId]?.preparedVariants && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {(
                            [
                              { id: "direct", label: "Direct" },
                              { id: "soft", label: "Soft" },
                              { id: "curiosity", label: "Curiosity" },
                            ] as const
                          ).map((opt) => {
                            const item = dailyOutreach.queueItems[queueCurrentId];
                            const variants = item?.preparedVariants;
                            const selected = item?.selectedVariant ?? null;
                            const active = selected === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  if (!queueCurrentId || !variants) return;
                                  const nextMsg = variants[opt.id];
                                  updateQueueItem(queueCurrentId, {
                                    selectedVariant: opt.id,
                                    preparedMessage: nextMsg,
                                    queueStatus: nextMsg.trim() ? "prepared" : "queued",
                                  });
                                }}
                                className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                                  active
                                    ? "border-violet-400/40 bg-violet-500/20 text-violet-100"
                                    : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    {outreachQueue.loading ? (
                      <p className="text-zinc-400">Mesaj oluşturuluyor…</p>
                    ) : outreachQueue.error ? (
                      <p className="text-rose-300">{outreachQueue.error}</p>
                    ) : (
                      <textarea
                        value={queueCurrentMessage}
                        onChange={(e) => {
                          if (!queueCurrentId) return;
                          const nextMessage = e.target.value;
                          updateQueueItem(queueCurrentId, {
                            preparedMessage: nextMessage,
                            queueStatus: nextMessage.trim() ? "prepared" : "queued",
                          });
                        }}
                        placeholder="Prepare Message to generate AI outreach copy"
                        className="min-h-28 w-full rounded-md border border-white/10 bg-black/20 p-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-400/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                      />
                    )}
                  </div>
                  {(queueCurrentLead._s.contactAttempts ?? 0) >= 3 && (
                    <p className="text-[11px] text-amber-300">
                      Already contacted multiple times — proceed carefully.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void prepareQueueLeadMessage()}
                      disabled={outreachQueue.loading}
                      className="rounded-md border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {outreachQueue.loading ? "Preparing..." : "Prepare Message"}
                    </button>
                    <button
                      type="button"
                      disabled={!queueCurrentMessage || !queueCurrentPhone}
                      onClick={() => {
                        if (!queueCurrentMessage || !queueCurrentPhone) return;
                        const link = `https://wa.me/${queueCurrentPhone}?text=${encodeURIComponent(
                          queueCurrentMessage,
                        )}`;
                        openExternal(link);
                        if (queueCurrentId) {
                          updateQueueItem(queueCurrentId, { queueStatus: "opened" });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-3 py-1.5 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {queueCurrentPhone ? "Open WhatsApp" : "No WhatsApp contact"}
                    </button>
                    <button
                      type="button"
                      disabled={!queueCurrentMessage}
                      onClick={() => {
                        if (!queueCurrentMessage) return;
                        void navigator.clipboard.writeText(queueCurrentMessage);
                      }}
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Copy Message
                    </button>
                    <button
                      type="button"
                      onClick={() => markQueueLeadSent()}
                      className="rounded-md border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
                    >
                      Mark Sent
                    </button>
                    <button
                      type="button"
                      onClick={() => skipQueueLead()}
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!queueCurrentId) return;
                        removeLeadFromQueue(queueCurrentId);
                        goNextInQueue(false);
                      }}
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
                    >
                      Remove from Queue
                    </button>
                    <button
                      type="button"
                      onClick={() => markQueueLeadDnc()}
                      className="rounded-md border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                    >
                      Mark Do Not Contact
                    </button>
                    <button
                      type="button"
                      onClick={() => goNextInQueue(false)}
                      className="rounded-md border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
                    >
                      Next Lead
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Drawer: portal keeps overlay out of Dashboard flex subtree (avoids fixed/overflow paint glitches). */}
      {openLead &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-40 flex"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpenId(null)}
              className="flex-1 bg-black/60 backdrop-blur-sm"
            />
            <aside className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-950 shadow-2xl">
              <LeadDetailPanel
                key={openLead.id}
                selectedLead={openLead}
                onClose={() => setOpenId(null)}
                finderPersisted={contactFinderMap[openLead.id]}
                contactFinderRequest={contactFinderRequest}
                draftNote={draftNote}
                setDraftNote={setDraftNote}
                updateLead={updateLead}
                setLeadStatus={setLeadStatus}
                findBestContact={findBestContact}
                onSendMessage={() => void drawerSendMessage(openLead)}
                sendMessageBusy={drawerSendBusy}
                ownerReplyDraft={ownerReplyDraft}
                setOwnerReplyDraft={setOwnerReplyDraft}
                onGenerateReplyHelper={() => void generateReplyHelperSuggestion(openLead)}
                replyHelperBusy={replyHelperBusy}
                replyHelperError={replyHelperError}
                replyHelperSuggestion={replyHelperSuggestion}
                replyCopied={replyCopied}
                onCopyReplyHelper={() => void copyReplyHelperSuggestion()}
                onApplyReplyHelperSuggestion={() => applyReplyHelperSuggestion(openLead)}
              />
            </aside>
          </div>,
          document.body,
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
          {(() => {
            const nodes: ReactNode[] = [];
            for (let i = 0; i < reasons.length; i++) {
              const r = reasons[i];
              nodes.push(
                <span
                  key={`${r}-${i}`}
                  className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 ring-1 ring-inset ring-white/10"
                >
                  {r}
                </span>,
              );
            }
            return nodes;
          })()}
        </div>
      )}
    </div>
  );
}
