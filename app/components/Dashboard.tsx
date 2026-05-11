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
  enrichScoredLeadIntelligence,
  type ScoredLead,
  STATUS_ORDER,
  getContactQuality,
  computeContactReadinessScore,
  getTurkishPhoneKind,
  instagramLink,
  type OutreachPriorityBucket,
  type RecommendedAction,
  type AcquisitionIntelligenceProfile,
  scoreHot,
  scoreLead,
  conversionLeakUiChipHints,
  whatsappLink,
  whatsappLinkWithText,
} from "@/app/lib/leads";
import {
  leadDedupeKey,
} from "@/app/lib/generate";
import type {
  LeadAiInsight,
  OpportunityLevel,
  OutreachMessageStyle,
} from "@/app/lib/intelligence/ai-insight";
import {
  type LeadTemperature,
  type OutreachIntelligenceProfile,
  type OutreachStyle,
  type OutreachUrgency,
  type RecommendedChannel,
  type SalesApproach,
} from "@/app/lib/intelligence/outreach-intelligence";
import {
  getWhyThisLeadReasons,
  type WhyThisLeadEnrichment,
  type WhyThisLeadReason,
} from "@/app/lib/intelligence/why-this-lead";
import ImportPanel, {
  type ImportRequest,
  type ImportResult,
} from "@/app/components/ImportPanel";
import { LocaleToggle, useLocale } from "@/app/components/LocaleProvider";
import {
  acquisitionSignalUiLine,
  acquisitionWeaknessUiLine,
  aiInsightParagraphUiText,
  businessSignalUiLabel,
  contactFinderConfidenceUiLabel,
  contactFinderSourceUiLabel,
  contactQualityUiLabel,
  conversionLeakChipDisplay,
  fillTemplate,
  followUpTimerUiLabel,
  getWhyThisLeadReasonLabel,
  leadSignalUiLine,
  leadTemperatureUiLabel,
  nextActionUiCopy,
  opportunityLevelUiLabel,
  outreachAngleUiLine,
  outreachPriorityChipLabel,
  outreachRationaleUiLine,
  outreachStyleUiLabel,
  painPointUiLine,
  pipelineStageUiLabel,
  queueMessageStatusUiLabel,
  queueSourceUiLabel,
  recommendedActionUiLabel,
  recommendedChannelUiLabel,
  salesApproachUiLabel,
  scoringChipReasonUiLabel,
  statusUiLabel,
  urgencyUiLabel,
  t,
  type Locale,
} from "@/app/lib/i18n";

const STORAGE_KEY = "tugobo-lead-engine:state-v1";
const EXTRA_LEADS_KEY = "tugobo-lead-engine:extra-leads-v1";
const IMPORTED_LEADS_V2_KEY = "tugobo-lead-engine:imported-leads-v2";
const LAST_IMPORT_KEY = "tugobo-lead-engine:last-import-v1";
const IMPORT_CACHE_KEY = "tugobo-lead-engine:import-cache-v1";
const CONTACT_FINDER_MAP_KEY = "tugobo-lead-engine:contact-finder-map-v1";
const IMPORT_META_KEY = "tugobo-lead-engine:import-meta-v1";
const DAILY_OUTREACH_STORAGE_KEY = "tugobo-lead-engine:daily-outreach-v1";
const OUTREACH_LOG_KEY = "tugobo-lead-engine:outreach-log-v1";
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
  whatsappInvalid: false,
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
type QueueLeadSource = "latest_import" | "airtable" | "local_pool";

type OutreachEventType =
  | "message_prepared"
  | "message_copied"
  | "whatsapp_opened"
  | "contacted"
  | "follow_up_due";

type OutreachMessageVariant = "soft" | "direct" | "consultative";

type OutreachEvent = {
  id: string;
  leadId: string;
  type: OutreachEventType;
  messageVariant?: OutreachMessageVariant;
  messagePreview?: string;
  createdAt: string;
  followUpAt?: string;
};

type DailyQueueItem = {
  queuedAt: number;
  updatedAt: number;
  preparedMessage: string;
  preparedVariants?: { direct: string; soft: string; premium: string } | null;
  selectedVariant?: OutreachMessageStyle | null;
  source?: QueueLeadSource;
  readinessScore?: number;
  queueRankScore?: number;
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

function nextActionCopy(s: LeadStatusUpdate, locale: Locale): string {
  return nextActionUiCopy(s.status, locale);
}

function followUpTimerLine(
  s: LeadStatusUpdate,
  now: number,
  locale: Locale,
): string | null {
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
  if (now >= target) return followUpTimerUiLabel(0, locale);
  const h = Math.max(1, Math.ceil((target - now) / (60 * 60 * 1000)));
  return followUpTimerUiLabel(h, locale);
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
    whatsappInvalid: Boolean(o.whatsappInvalid),
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
  const cleaned: ScoredLead = {
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
  return enrichScoredLeadIntelligence(cleaned);
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
  const deduped = dedupeLeads(leads) as ScoredLead[];
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
  return enrichScoredLeadIntelligence({
    ...merged,
    leadScore: ls.score,
    leadReasons: ls.reasons,
    hotScore: hs.score,
    hotReasons: hs.reasons,
    contactQuality: getContactQuality(merged.phone),
  });
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
  const sessionSeenLeadIds = new Set<string>();

  const pushSessionLead = (lead: ScoredLead) => {
    if (!lead.id || sessionSeenLeadIds.has(lead.id)) return;
    sessionSeenLeadIds.add(lead.id);
    lastSessionBatch.push(lead);
  };

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
    pushSessionLead(novel);
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
      pushSessionLead(merged);
    } else if (m?.kind === "seed") {
      pushSessionLead(upsertScoredFields(m.lead, inc, importTs, importSessionId));
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
                  (typeof (v.preparedVariants as { premium?: unknown }).premium === "string" ||
                    typeof (v.preparedVariants as { curiosity?: unknown }).curiosity ===
                      "string")
                    ? {
                        direct: (v.preparedVariants as { direct: string }).direct,
                        soft: (v.preparedVariants as { soft: string }).soft,
                        premium:
                          (v.preparedVariants as { premium?: string; curiosity?: string })
                            .premium ??
                          (v.preparedVariants as { premium?: string; curiosity?: string })
                            .curiosity ??
                          "",
                      }
                    : null;
                const rawSelected = (v as { selectedVariant?: unknown }).selectedVariant;
                const selected =
                  rawSelected === "direct" ||
                  rawSelected === "soft" ||
                  rawSelected === "premium" ||
                  rawSelected === "curiosity"
                    ? rawSelected
                    : null;
                const source =
                  v.source === "latest_import" ||
                  v.source === "airtable" ||
                  v.source === "local_pool"
                    ? v.source
                    : undefined;
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
                    selectedVariant: selected === "curiosity" ? "premium" : selected,
                    source,
                    readinessScore:
                      typeof v.readinessScore === "number" && Number.isFinite(v.readinessScore)
                        ? v.readinessScore
                        : undefined,
                    queueRankScore:
                      typeof v.queueRankScore === "number" && Number.isFinite(v.queueRankScore)
                        ? v.queueRankScore
                        : undefined,
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

function loadOutreachEvents(): Record<string, OutreachEvent[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OUTREACH_LOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, OutreachEvent[]> = {};
    for (const [leadId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const events: OutreachEvent[] = value
        .map((row) => row as Partial<OutreachEvent>)
        .filter(
          (row) =>
            typeof row.id === "string" &&
            typeof row.leadId === "string" &&
            typeof row.type === "string" &&
            typeof row.createdAt === "string",
        )
        .map((row) => ({
          id: row.id as string,
          leadId: row.leadId as string,
          type: row.type as OutreachEventType,
          messageVariant:
            row.messageVariant === "soft" ||
            row.messageVariant === "direct" ||
            row.messageVariant === "consultative"
              ? row.messageVariant
              : undefined,
          messagePreview:
            typeof row.messagePreview === "string" ? row.messagePreview : undefined,
          createdAt: row.createdAt as string,
          followUpAt: typeof row.followUpAt === "string" ? row.followUpAt : undefined,
        }));
      if (events.length > 0) out[leadId] = events;
    }
    return out;
  } catch {
    return {};
  }
}

function saveOutreachEvents(eventsByLead: Record<string, OutreachEvent[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OUTREACH_LOG_KEY, JSON.stringify(eventsByLead));
  } catch {
    // ignore quota/serialization edge cases; UI stays functional in-memory.
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
  if (row._s.whatsappInvalid) return false;
  if (row._s.status !== "new") return false;
  const readiness = rowReadinessWithFinder(row, finder);
  if (readiness.score < 60) return false;
  if (readinessCategory(row, finder) === "no_contact") return false;
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
  const readiness = rowReadinessWithFinder(row, finder);
  if (readiness.score <= 0) return false;
  if (s.doNotContact) return false;
  if (s.whatsappInvalid) return false;
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

function rowReadiness(row: LeadTableRow): { score: number; reasons: string[] } {
  return computeContactReadinessScore(
    {
      phone: row.phone,
      website: row.website,
      instagram: row.instagram,
      daysSinceLastReview: row.daysSinceLastReview,
      hotScore: row.hotScore,
      whatsappInvalid: row._s.whatsappInvalid,
    },
    row.contactQuality,
  );
}

function rowReadinessWithFinder(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
): { score: number; reasons: string[] } {
  const hasEmail = Boolean(finder?.foundEmails?.length);
  const hasPhoneFromFinder = Boolean(finder?.foundPhones?.length);
  const verified = finder?.bestContactType === "VERIFIED_WHATSAPP";
  return computeContactReadinessScore(
    {
      phone: row.phone,
      website: row.website,
      instagram: row.instagram,
      daysSinceLastReview: row.daysSinceLastReview,
      hotScore: row.hotScore,
      whatsappInvalid: row._s.whatsappInvalid,
    },
    row.contactQuality,
    {
      hasPhone: Boolean(row.phone?.trim()) || hasPhoneFromFinder,
      hasEmail,
      contactVerified: verified,
    },
  );
}

type ReadinessCategory =
  | "ready_now"
  | "good_contact"
  | "needs_finder"
  | "weak_contact"
  | "no_contact";

function readinessCategory(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
): ReadinessCategory {
  const readiness = rowReadinessWithFinder(row, finder).score;
  const cat = classifyContactChannel(row, finder);
  if (cat === "none") return "no_contact";
  if (readiness >= 80) return "ready_now";
  if (readiness >= 60) return "good_contact";
  if (cat === "needs_finder") return "needs_finder";
  if (readiness >= 30) return "weak_contact";
  return "no_contact";
}

function readinessCategoryUiLabel(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
  locale: Locale,
): string {
  const rc = readinessCategory(row, finder);
  if (rc === "ready_now") return t("readiness_ready_now", locale);
  if (rc === "good_contact") return t("readiness_good_contact", locale);
  if (rc === "needs_finder") return t("readiness_needs_finder", locale);
  if (rc === "weak_contact") return t("readiness_weak_contact", locale);
  return t("readiness_no_contact", locale);
}

function sourceBonus(source: QueueLeadSource): number {
  if (source === "latest_import") return 100;
  if (source === "airtable") return 80;
  return 60;
}

function queueSourceBadgeClass(source?: QueueLeadSource): string {
  if (source === "latest_import") {
    return "bg-indigo-500/15 text-indigo-200 ring-indigo-400/35";
  }
  if (source === "airtable") {
    return "bg-sky-500/15 text-sky-200 ring-sky-400/35";
  }
  return "bg-zinc-500/15 text-zinc-200 ring-zinc-400/30";
}

function sourceForRow(
  row: LeadTableRow,
  latestImportIdSet: Set<string>,
): QueueLeadSource {
  if (latestImportIdSet.has(row.id)) return "latest_import";
  if (row.id.startsWith("airtable-")) return "airtable";
  return "local_pool";
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

function relativeCalendarLabel(ts?: number | null, now = Date.now(), locale: Locale = "tr") {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "-";
  if (isSameLocalCalendarDay(ts, now)) return t("cal_today", locale);
  if (isSameLocalCalendarDay(ts, now - 24 * 60 * 60 * 1000)) return t("cal_yesterday", locale);
  return new Date(ts).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildImportedLabel(
  createdAt?: number,
  firstImportedAt?: number,
  now = Date.now(),
  locale: Locale = "tr",
) {
  const ts = firstImportedAt ?? createdAt;
  if (!ts || !Number.isFinite(ts) || ts <= 0) return `${t("imported_prefix", locale)} -`;
  if (now - ts <= 24 * 60 * 60 * 1000)
    return `${t("imported_prefix", locale)} ${t("cal_today", locale)}`;
  if (now - ts <= 48 * 60 * 60 * 1000)
    return `${t("imported_prefix", locale)} ${t("cal_yesterday", locale)}`;
  const d = new Date(ts);
  return `${t("imported_prefix", locale)} ${d.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { month: "short", day: "numeric" })}`;
}

function getImportedBadgeText(
  createdAt?: number,
  firstImportedAt?: number,
  now = Date.now(),
  locale: Locale = "tr",
) {
  const ts = firstImportedAt ?? createdAt;
  return relativeCalendarLabel(ts, now, locale);
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 65) return "text-amber-300";
  if (score >= 50) return "text-zinc-200";
  return "text-zinc-400";
}

function priorityBucketPillClass(bucket: OutreachPriorityBucket): string {
  if (bucket === "today") return `${badgeBase} bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40`;
  if (bucket === "high") return `${badgeBase} bg-orange-500/15 text-orange-200 ring-orange-400/40`;
  if (bucket === "medium") return `${badgeBase} bg-sky-500/15 text-sky-200 ring-sky-400/35`;
  if (bucket === "low") return `${badgeBase} bg-zinc-500/15 text-zinc-200 ring-zinc-400/30`;
  return `${badgeBase} bg-rose-500/15 text-rose-200 ring-rose-400/35`;
}

function actionPillClass(action: RecommendedAction): string {
  if (action === "send_whatsapp") return `${badgeBase} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`;
  if (action === "follow_up") return `${badgeBase} bg-orange-500/15 text-orange-200 ring-orange-400/40`;
  if (action === "research_more") return `${badgeBase} bg-indigo-500/15 text-indigo-200 ring-indigo-400/35`;
  if (action === "wait") return `${badgeBase} bg-amber-500/15 text-amber-200 ring-amber-400/35`;
  return `${badgeBase} bg-rose-500/15 text-rose-200 ring-rose-400/35`;
}

const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset";

type AcquisitionUiChip = {
  key: string;
  cls: string;
  label: string;
  title?: string;
};

function isAcquisitionUiMinimal(acq: AcquisitionIntelligenceProfile | undefined): boolean {
  if (!acq?.acquisition) return true;
  const { acquisitionIntentLevel, isAcquisitionActive } = acq.acquisition;
  return acquisitionIntentLevel === "low" && !isAcquisitionActive;
}

function buildAcquisitionIntelligenceChips(
  acq: AcquisitionIntelligenceProfile | undefined,
  bookingFlowStrength: number | undefined,
  maxChips: number,
  locale: Locale,
): AcquisitionUiChip[] {
  if (!acq?.acquisition) return [];
  const minimal = isAcquisitionUiMinimal(acq);
  const a = acq.acquisition;
  const channels = a.acquisitionChannels ?? [];

  if (minimal) {
    if (
      typeof acq.paidTrafficLikelihood === "number" &&
      Number.isFinite(acq.paidTrafficLikelihood) &&
      acq.paidTrafficLikelihood >= 78
    ) {
      return [
        {
          key: "acq-paid-strong",
          cls: `${badgeBase} bg-cyan-500/15 text-cyan-200 ring-cyan-400/35`,
          label: t("paid_traffic_possible", locale),
          title: t("paid_traffic_possible_title", locale),
        },
      ];
    }
    return [];
  }

  const out: AcquisitionUiChip[] = [];

  if (a.acquisitionIntentLevel === "very_high" || a.acquisitionIntentLevel === "high") {
    out.push({
      key: "acq-intent-high",
      cls: `${badgeBase} bg-teal-500/15 text-teal-200 ring-teal-400/40`,
      label: t("high_acquisition_intent", locale),
    });
  } else if (a.isAcquisitionActive) {
    out.push({
      key: "acq-active",
      cls: `${badgeBase} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`,
      label: t("acquisition_active", locale),
    });
  }

  if (out.length < maxChips && channels.length >= 3) {
    out.push({
      key: "acq-multi",
      cls: `${badgeBase} bg-indigo-500/15 text-indigo-200 ring-indigo-400/35`,
      label: t("multi_channel_demand", locale),
    });
  }

  if (out.length >= maxChips) return out.slice(0, maxChips);

  const hasOta = channels.includes("ota");
  const hasIgChannel = channels.includes("instagram");
  const paidPossible =
    channels.includes("meta_ads_possible") ||
    channels.includes("google_ads_possible") ||
    (typeof acq.paidTrafficLikelihood === "number" &&
      Number.isFinite(acq.paidTrafficLikelihood) &&
      acq.paidTrafficLikelihood >= 62);

  const tertiary: AcquisitionUiChip[] = [];

  if (hasOta && (hasIgChannel || acq.socialDemandIntent === "high")) {
    tertiary.push({
      key: "acq-conv-opp",
      cls: `${badgeBase} bg-violet-500/15 text-violet-200 ring-violet-400/35`,
      label: t("strong_conversion_opportunity", locale),
      title: t("strong_conversion_opportunity_title", locale),
    });
  }

  if (paidPossible) {
    tertiary.push({
      key: "acq-paid",
      cls: `${badgeBase} bg-cyan-500/15 text-cyan-200 ring-cyan-400/35`,
      label: t("paid_traffic_possible", locale),
      title: t("acq_paid_signals_title", locale),
    });
  }

  const gapLike =
    acq.socialConversionGap === "high" ||
    (a.acquisitionWeaknesses?.some((w) =>
      /booking capture|outpace|conversion path|booking flow/i.test(w),
    ) ??
      false);
  const bookingWeak =
    typeof bookingFlowStrength === "number" &&
    Number.isFinite(bookingFlowStrength) &&
    bookingFlowStrength < 45;
  if (
    gapLike &&
    bookingWeak &&
    (a.isAcquisitionActive ||
      a.acquisitionIntentLevel === "medium" ||
      a.acquisitionIntentLevel === "high" ||
      a.acquisitionIntentLevel === "very_high")
  ) {
    tertiary.push({
      key: "acq-tb-gap",
      cls: `${badgeBase} bg-amber-500/15 text-amber-200 ring-amber-400/40`,
      label: t("traffic_booking_gap", locale),
      title: t("traffic_booking_gap_title", locale),
    });
  }

  if (
    typeof acq.acquisitionPressureScore === "number" &&
    Number.isFinite(acq.acquisitionPressureScore) &&
    acq.acquisitionPressureScore >= 72 &&
    a.acquisitionIntentLevel !== "high" &&
    a.acquisitionIntentLevel !== "very_high"
  ) {
    tertiary.push({
      key: "acq-pressure",
      cls: `${badgeBase} bg-rose-500/15 text-rose-200 ring-rose-400/35`,
      label: t("acquisition_pressure", locale),
      title: t("acquisition_pressure_title", locale),
    });
  }

  for (const chip of tertiary) {
    if (out.length >= maxChips) break;
    if (!out.some((c) => c.key === chip.key)) out.push(chip);
  }

  return out.slice(0, maxChips);
}

function acquisitionSummaryLine(
  acq: AcquisitionIntelligenceProfile | undefined,
  locale: Locale,
): string | null {
  if (!acq?.acquisition || isAcquisitionUiMinimal(acq)) return null;
  const a = acq.acquisition;
  const channels = a.acquisitionChannels ?? [];
  const multi = channels.length >= 3;
  const hasOta = channels.includes("ota");
  const hasIg = channels.includes("instagram");
  const socialStrong = acq.socialDemandIntent === "high";
  const convGap = acq.socialConversionGap === "high";
  const paidHint =
    channels.includes("meta_ads_possible") ||
    channels.includes("google_ads_possible") ||
    (typeof acq.paidTrafficLikelihood === "number" &&
      Number.isFinite(acq.paidTrafficLikelihood) &&
      acq.paidTrafficLikelihood >= 62);

  if (a.isAcquisitionActive && multi) {
    return t("acq_summary_active_multi", locale);
  }
  if ((hasOta || hasIg || socialStrong) && convGap) {
    return t("acq_summary_social_gap", locale);
  }
  if (paidHint || a.isAcquisitionActive) {
    return t("acq_summary_investing", locale);
  }
  if (a.acquisitionIntentLevel === "high" || a.acquisitionIntentLevel === "very_high") {
    return t("acq_summary_elevated", locale);
  }
  return null;
}

function leadRowAcquisitionHighlightClass(row: LeadTableRow): string {
  const a = row.acquisitionIntelligence?.acquisition;
  if (!a) return "";
  if (
    a.isAcquisitionActive &&
    (a.acquisitionIntentLevel === "high" || a.acquisitionIntentLevel === "very_high")
  ) {
    return "shadow-[inset_3px_0_0_0_rgba(45,212,191,0.42)]";
  }
  return "";
}

function OutreachBadgesRow({
  row,
  newImport,
  reimported,
  inQueue,
  syncedToAirtable = false,
  now,
}: {
  row: LeadTableRow;
  newImport?: boolean;
  reimported?: boolean;
  inQueue?: boolean;
  syncedToAirtable?: boolean;
  now: number;
}) {
  const { locale } = useLocale();
  const s = row._s;
  const readiness = rowReadiness(row);
  const last =
    typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
      ? s.lastContactedAt
      : typeof s.contactedAt === "number" && s.contactedAt > 0
        ? s.contactedAt
        : null;
  const chips: { key: string; cls: string; label: string; href?: string; title?: string }[] = [];
  if (s.doNotContact) {
    chips.push({
      key: "dnc",
      cls: `${badgeBase} bg-rose-500/15 text-rose-200 ring-rose-400/35`,
      label: t("do_not_contact", locale),
    });
  }
  if (s.status === "new" && !s.doNotContact) {
    chips.push({
      key: "new",
      cls: `${badgeBase} bg-zinc-500/15 text-zinc-200 ring-zinc-400/30`,
      label: t("chip_new", locale),
    });
  }
  if (newImport) {
    chips.push({
      key: "newimp",
      cls: `${badgeBase} bg-indigo-500/15 text-indigo-200 ring-indigo-400/35`,
      label: t("chip_new_import", locale),
    });
  }
  if (isFollowUpDue(s, now)) {
    chips.push({
      key: "fudue",
      cls: `${badgeBase} bg-orange-500/15 text-orange-200 ring-orange-400/40`,
      label: t("follow_up_due", locale),
    });
  }
  if ((s.contactAttempts ?? 0) >= 2) {
    chips.push({
      key: "fuonce",
      cls: `${badgeBase} bg-indigo-500/15 text-indigo-200 ring-indigo-400/35`,
      label: t("followed_up_before", locale),
    });
  }
  if (typeof row.hotScore === "number" && row.hotScore > 70 && s.status === "new") {
    chips.push({
      key: "hipri",
      cls: `${badgeBase} bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/35`,
      label: t("high_priority", locale),
    });
  }
  if (typeof row.hotScore === "number" && row.hotScore > 70 && readiness.score < 40) {
    chips.push({
      key: "risk",
      cls: `${badgeBase} bg-amber-500/15 text-amber-200 ring-amber-400/40`,
      label: t("outreach_risk", locale),
    });
  }
  if (row.priorityBucket) {
    chips.push({
      key: "priority-bucket",
      cls: priorityBucketPillClass(row.priorityBucket),
      label: outreachPriorityChipLabel(row.priorityBucket, locale),
    });
  }
  if (row.recommendedAction) {
    chips.push({
      key: "recommended-action",
      cls: actionPillClass(row.recommendedAction),
      label: recommendedActionUiLabel(row.recommendedAction, locale),
    });
  }
  if (row.opportunityLevel === "very_high") {
    chips.push({
      key: "opp-vhigh",
      cls: `${badgeBase} bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40`,
      label: t("very_high_opportunity", locale),
    });
  } else if (row.opportunityLevel === "high") {
    chips.push({
      key: "opp-high",
      cls: `${badgeBase} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`,
      label: t("high_opportunity", locale),
    });
  }
  chips.push({
    key: "readiness",
    cls:
      readiness.score >= 80
        ? `${badgeBase} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`
        : readiness.score >= 60
          ? `${badgeBase} bg-sky-500/15 text-sky-200 ring-sky-400/35`
          : `${badgeBase} bg-rose-500/15 text-rose-200 ring-rose-400/35`,
    label: `${t("readiness_prefix", locale)} ${readiness.score}`,
  });
  chips.push({
    key: "quality",
    cls: `${badgeBase} bg-white/5 text-zinc-200 ring-white/15`,
    label: `${t("contact_quality_prefix", locale)} ${contactQualityUiLabel(row.contactQuality, locale)}`,
  });
  if (
    typeof row.bookingFlowStrength === "number" &&
    Number.isFinite(row.bookingFlowStrength) &&
    row.bookingFlowStrength < 45
  ) {
    chips.push({
      key: "booking-gap-v2",
      cls: `${badgeBase} bg-amber-500/15 text-amber-200 ring-amber-400/35`,
      label: t("weak_booking_flow", locale),
    });
  }
  if (
    typeof row.otaDependencyLikelihood === "number" &&
    Number.isFinite(row.otaDependencyLikelihood) &&
    row.otaDependencyLikelihood >= 72
  ) {
    chips.push({
      key: "ota-high-v2",
      cls: `${badgeBase} bg-sky-500/15 text-sky-200 ring-sky-400/35`,
      label: t("ota_dependent", locale),
    });
  }
  const acq = row.acquisitionIntelligence;
  const discovery = acq?.instagramDiscoveryStatus;
  const firstSuggested = acq?.suggestedInstagramHandles?.[0];
  const igVerifyHref = firstSuggested
    ? `https://www.instagram.com/${encodeURIComponent(firstSuggested.replace(/^@/, ""))}/`
    : undefined;

  if (discovery === "verified" && acq?.instagramActivityLevel !== "inactive") {
    chips.push({
      key: "ig-act",
      cls: `${badgeBase} bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/35`,
      label: t("active_instagram", locale),
    });
  } else if (discovery === "verified") {
    chips.push({
      key: "ig-verified",
      cls: `${badgeBase} bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/35`,
      label: t("instagram_verified", locale),
    });
  }
  if (discovery === "broken") {
    chips.push({
      key: "ig-broken",
      cls: `${badgeBase} bg-zinc-500/15 text-zinc-200 ring-zinc-400/30`,
      label: t("broken_ig_link", locale),
      title: acq?.instagramInvalidReasons?.join(", "),
    });
  }
  if (discovery === "possible") {
    chips.push({
      key: "ig-possible",
      cls: `${badgeBase} bg-violet-500/15 text-violet-200 ring-violet-400/35 hover:opacity-90`,
      label: t("possible_instagram", locale),
      href: igVerifyHref,
      title: acq?.suggestedInstagramHandles?.length
        ? `${t("ig_try_handles", locale)}: ${acq.suggestedInstagramHandles.slice(0, 4).join(", ")}`
        : undefined,
    });
  }
  if (acq?.instagramNeedsManualCheck && discovery === "broken") {
    chips.push({
      key: "ig-manual",
      cls: `${badgeBase} bg-amber-500/15 text-amber-200 ring-amber-400/40 hover:opacity-90`,
      label: t("manual_ig_check", locale),
      href: igVerifyHref,
    });
  }
  for (const c of buildAcquisitionIntelligenceChips(acq, row.bookingFlowStrength, 3, locale)) {
    chips.push({
      key: c.key,
      cls: c.cls,
      label: c.label,
      title: c.title,
    });
  }
  const hasWeakFlowChipEarly =
    typeof row.bookingFlowStrength === "number" &&
    Number.isFinite(row.bookingFlowStrength) &&
    row.bookingFlowStrength < 45;
  const hasOtaDependentChipEarly =
    typeof row.otaDependencyLikelihood === "number" &&
    Number.isFinite(row.otaDependencyLikelihood) &&
    row.otaDependencyLikelihood >= 72;
  for (const c of conversionLeakUiChipHints(row.conversionLeak)) {
    if (c.key === "clk-book" && hasWeakFlowChipEarly) continue;
    if (c.key === "clk-ota" && hasOtaDependentChipEarly) continue;
    const clk = conversionLeakChipDisplay(c.key, locale);
    chips.push({
      key: c.key,
      cls: `${badgeBase} bg-white/[0.06] text-zinc-300 ring-zinc-500/25`,
      label: clk.label,
      title: clk.title,
    });
  }
  if (last) {
    if (isSameLocalCalendarDay(last, now)) {
      chips.push({
        key: "ctoday",
        cls: `${badgeBase} bg-sky-500/15 text-sky-200 ring-sky-400/35`,
        label: t("chip_contacted_today", locale),
      });
    } else if (
      !isFollowUpDue(s, now) &&
      ["contacted", "needs_follow_up", "replied", "meeting", "won"].includes(s.status)
    ) {
      chips.push({
        key: "cbefore",
        cls: `${badgeBase} bg-indigo-500/15 text-indigo-200 ring-indigo-400/30`,
        label: t("chip_contacted_before", locale),
      });
    }
  }
  if ((s.contactAttempts ?? 0) >= 3) {
    chips.push({
      key: "spam",
      cls: `${badgeBase} bg-yellow-500/15 text-yellow-200 ring-yellow-400/35`,
      label: t("chip_max_attempts", locale),
    });
  }
  if (reimported) {
    chips.push({
      key: "reimp",
      cls: `${badgeBase} bg-amber-500/15 text-amber-200 ring-amber-400/35`,
      label: t("chip_reimported", locale),
    });
  }
  if (inQueue) {
    chips.push({
      key: "inq",
      cls: `${badgeBase} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`,
      label: t("chip_in_queue", locale),
    });
  }
  if (syncedToAirtable) {
    chips.push({
      key: "airtable",
      cls: `${badgeBase} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`,
      label: t("chip_synced_airtable", locale),
    });
  }
  if (chips.length === 0) return null;
  const chipNodes: ReactNode[] = [];
  for (let i = 0; i < chips.length; i++) {
    const c = chips[i];
    chipNodes.push(
      c.href ? (
        <a
          key={c.key}
          className={c.cls}
          href={c.href}
          title={c.title}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {c.label}
        </a>
      ) : (
        <span key={c.key} className={c.cls} title={c.title}>
          {c.label}
        </span>
      ),
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
  const { locale } = useLocale();
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
      {statusUiLabel(status, locale)}
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

/**
 * Single source of truth for the IG icon action — adapts to {@link AcquisitionIntelligenceProfile.instagramDiscoveryStatus}.
 *
 *  - verified : pink (existing behavior)
 *  - possible : violet, opens the top suggested handle (Search IG)
 *  - broken   : amber, opens the top suggestion as a manual-check fallback
 *  - else     : disabled
 */
function LeadInstagramAction({
  instagram,
  acquisition,
}: {
  instagram?: string;
  acquisition?: AcquisitionIntelligenceProfile;
}) {
  const { locale } = useLocale();
  const square =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition sm:h-8 sm:w-8";
  const igHref = instagram ? instagramLink(instagram) : null;
  const discovery = acquisition?.instagramDiscoveryStatus;
  const verified = discovery === "verified" && Boolean(igHref);
  const broken = discovery === "broken";
  const possible = discovery === "possible";
  const firstSuggested = acquisition?.suggestedInstagramHandles?.[0];
  const suggestedHref = firstSuggested
    ? `https://www.instagram.com/${encodeURIComponent(firstSuggested.replace(/^@/, ""))}/`
    : null;

  if (verified) {
    return (
      <a
        href={igHref!}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t("instagram_verified", locale)} · @${instagram}`}
        onClick={(e) => e.stopPropagation()}
        className={`${square} border-pink-400/20 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20`}
      >
        <IconInstagram className="h-4 w-4" />
      </a>
    );
  }
  if (broken && suggestedHref) {
    return (
      <a
        href={suggestedHref}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t("ig_discovery_broken_title", locale)} · @${firstSuggested}`}
        onClick={(e) => e.stopPropagation()}
        className={`${square} border-amber-400/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20`}
      >
        <IconInstagram className="h-4 w-4" />
      </a>
    );
  }
  if (possible && suggestedHref) {
    return (
      <a
        href={suggestedHref}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t("search_ig", locale)} · @${firstSuggested}`}
        onClick={(e) => e.stopPropagation()}
        className={`${square} border-violet-400/25 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20`}
      >
        <IconInstagram className="h-4 w-4" />
      </a>
    );
  }
  return (
    <a
      href="#"
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.preventDefault()}
      aria-disabled
      title={
        broken ? t("instagram_link_broken_long", locale) : t("instagram_none_on_file", locale)
      }
      className={`${square} border-white/10 bg-white/5 text-zinc-500 cursor-not-allowed`}
    >
      <IconInstagram className="h-4 w-4" />
    </a>
  );
}

/**
 * Subtle, premium-looking strip in the lead detail view that surfaces the
 * Instagram discovery confidence level + a Search IG action when applicable.
 *
 * Hides itself for `verified` (already represented by the IG link/chip) and
 * for `unknown` (no aggressive claim).
 */
function InstagramDiscoveryPanel({
  acquisition,
}: {
  acquisition?: AcquisitionIntelligenceProfile;
}) {
  const { locale } = useLocale();
  if (!acquisition) return null;
  const status = acquisition.instagramDiscoveryStatus;
  if (status === "verified" || status === "unknown" || status === "not_found") {
    return null;
  }
  const firstSuggested = acquisition.suggestedInstagramHandles?.[0];
  const suggestedHref = firstSuggested
    ? `https://www.instagram.com/${encodeURIComponent(firstSuggested.replace(/^@/, ""))}/`
    : null;

  let title: string;
  let toneRing: string;
  let toneText: string;
  if (status === "broken") {
    title = t("ig_discovery_broken_title", locale);
    toneRing = "ring-amber-400/30 bg-amber-500/[0.06]";
    toneText = "text-amber-200";
  } else {
    title = t("ig_discovery_possible_title", locale);
    toneRing = "ring-violet-400/25 bg-violet-500/[0.06]";
    toneText = "text-violet-200";
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-[11px] ring-1 ring-inset ${toneRing}`}
    >
      <span className={`font-medium uppercase tracking-wider ${toneText}`}>
        {title}
      </span>
      {firstSuggested && (
        <span className="text-zinc-300">
          {t("suggested_prefix", locale)}:{" "}
          <span className="font-medium text-zinc-100">@{firstSuggested}</span>
        </span>
      )}
      {acquisition.suggestedInstagramHandles &&
        acquisition.suggestedInstagramHandles.length > 1 && (
          <span className="text-zinc-500">
            · {t("also_handles", locale)}{" "}
            {acquisition.suggestedInstagramHandles
              .slice(1, 4)
              .map((h) => `@${h}`)
              .join(", ")}
          </span>
        )}
      {suggestedHref && (
        <a
          href={suggestedHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20"
        >
          <IconInstagram className="h-3.5 w-3.5" />
          {status === "broken" ? t("manual_ig_check", locale) : t("search_ig", locale)}
        </a>
      )}
    </div>
  );
}

/**
 * One-line acquisition summary plus optional expansion for structured signals
 * (kept compact when {@link isAcquisitionUiMinimal}).
 */
function AcquisitionIntelligencePanel({
  acquisition,
}: {
  acquisition?: AcquisitionIntelligenceProfile;
}) {
  const { locale } = useLocale();
  const [detailOpen, setDetailOpen] = useState(false);
  if (!acquisition?.acquisition) return null;
  const a = acquisition.acquisition;
  const summary = acquisitionSummaryLine(acquisition, locale);
  const signalLines = a.acquisitionSignals ?? [];
  const weaknessLines = a.acquisitionWeaknesses ?? [];
  const hasDetail = signalLines.length > 0 || weaknessLines.length > 0;
  const minimal = isAcquisitionUiMinimal(acquisition);

  if (minimal && !hasDetail) return null;
  if (!summary && !hasDetail) return null;

  return (
    <div className="rounded-md border border-teal-400/20 bg-teal-950/40 px-3 py-2 text-[11px] ring-1 ring-inset ring-teal-500/15">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium uppercase tracking-wider text-teal-200/90">
            {t("acq_intel_title", locale)}
          </div>
          {summary ? (
            <p className="mt-1 leading-relaxed text-zinc-300">{summary}</p>
          ) : minimal ? (
            <p className="mt-1 text-zinc-500">{t("acq_intel_limited", locale)}</p>
          ) : null}
        </div>
        {hasDetail ? (
          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/10"
          >
            {detailOpen ? t("less", locale) : t("detail", locale)}
          </button>
        ) : null}
      </div>
      {detailOpen && hasDetail ? (
        <div className="mt-2 space-y-2 border-t border-white/10 pt-2 text-zinc-400">
          {signalLines.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                {t("signals", locale)}
              </div>
              <ul className="list-inside list-disc space-y-0.5">
                {signalLines.map((line) => (
                  <li key={line} className="text-zinc-300">
                    {acquisitionSignalUiLine(line, locale)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {weaknessLines.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                {t("gaps", locale)}
              </div>
              <ul className="list-inside list-disc space-y-0.5">
                {weaknessLines.map((line) => (
                  <li key={line} className="text-zinc-300">
                    {acquisitionWeaknessUiLine(line, locale)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LeadWebsiteAction({ website }: { website?: string }) {
  const host = website?.trim();
  if (!host) return null;
  const href = `https://${host.replace(/^https?:\/\//i, "")}`;
  const square =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky-400/20 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20 sm:h-8 sm:w-8";
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
  | {
      lead: ScoredLead;
      phase: "ready";
      message: string;
      styles: Record<OutreachMessageStyle, string>;
      draftByStyle: Record<OutreachMessageStyle, string>;
      selectedStyle: OutreachMessageStyle;
      rationaleNote?: string;
      llmRefined?: boolean;
      provider?: string | null;
      regenerateNonce: number;
    }
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
  queuedForOutreach = false,
  queueStatus = null,
  onMarkPrepared,
  onMarkOpened,
  onMessageCopied,
  onWhatsappOpened,
}: {
  state: AiMessageModalState;
  onClose: () => void;
  onRetry: (lead: ScoredLead) => void;
  onMarkContacted: (id: string) => void;
  queuedForOutreach?: boolean;
  queueStatus?: QueueMessageStatus | null;
  onMarkPrepared: (id: string) => void;
  onMarkOpened: (id: string) => void;
  onMessageCopied: (
    leadId: string,
    messageVariant: OutreachMessageVariant,
    messagePreview: string,
  ) => void;
  onWhatsappOpened: (
    leadId: string,
    messageVariant: OutreachMessageVariant,
    messagePreview: string,
  ) => void;
}) {
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<OutreachMessageStyle>("soft");
  const [draftByStyle, setDraftByStyle] = useState<Record<OutreachMessageStyle, string>>({
    soft: "",
    direct: "",
    premium: "",
  });

  useEffect(() => {
    setCopied(false);
  }, [state]);

  useEffect(() => {
    if (state?.phase === "ready") {
      setSelectedStyle(state.selectedStyle);
      setDraftByStyle(state.draftByStyle ?? state.styles);
    }
  }, [state]);

  if (!state) return null;

  const { lead } = state;
  const displayMessage =
    state.phase === "ready"
      ? draftByStyle[selectedStyle] || state.styles[selectedStyle] || state.message
      : "";
  const messageVariantForLog: OutreachMessageVariant =
    selectedStyle === "premium" ? "consultative" : selectedStyle;
  const waReady =
    state.phase === "ready" ? whatsappLinkWithText(lead.phone, displayMessage) : null;

  const handleCopy = async () => {
    if (state.phase !== "ready") return;
    try {
      await navigator.clipboard.writeText(displayMessage);
      setCopied(true);
      onMarkPrepared(lead.id);
      onMessageCopied(lead.id, messageVariantForLog, displayMessage);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-message-title"
    >
      <button
        type="button"
        aria-label={t("close_aria", locale)}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-white/10 bg-zinc-950 shadow-2xl ring-1 ring-white/5">
        <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0 pr-2">
            <h2
              id="ai-message-title"
              className="text-sm font-semibold text-zinc-100"
            >
              {t("ai_message_title", locale)}
            </h2>
            <p className="mt-0.5 break-words text-xs text-zinc-500">{lead.name}</p>
            {queuedForOutreach ? (
              <div className="mt-1 inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                {t("in_outreach_queue", locale)}
                {queueStatus ? ` · ${queueMessageStatusUiLabel(String(queueStatus), locale)}` : ""}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            aria-label={t("close_aria", locale)}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:max-h-[min(60vh,28rem)]">
          {state.phase === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400"
                aria-hidden
              />
              <p className="text-sm text-zinc-400">{t("generating_message", locale)}</p>
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
                {t("retry", locale)}
              </button>
            </div>
          )}
          {state.phase === "ready" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "soft", label: t("style_soft", locale) },
                    { id: "direct", label: t("style_direct", locale) },
                    { id: "premium", label: t("style_consultative", locale) },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedStyle(opt.id)}
                    className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
                      selectedStyle === opt.id
                        ? "border-violet-400/40 bg-violet-500/20 text-violet-100"
                        : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {state.rationaleNote ? (
                <p className="text-[11px] text-zinc-500">{state.rationaleNote}</p>
              ) : null}
              <textarea
                value={displayMessage}
                onChange={(e) => {
                  const next = e.target.value ?? "";
                  setDraftByStyle((cur) => ({ ...cur, [selectedStyle]: next }));
                }}
                className="min-h-[160px] w-full resize-y rounded-lg border border-white/10 bg-white/5 p-3 text-[15px] leading-relaxed text-zinc-200 outline-none focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/20 sm:text-sm"
              />
              <p className="text-[11px] text-zinc-500">{t("manual_outreach_note", locale)}</p>
            </div>
          )}
        </div>

        {state.phase === "ready" && (
          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-white/10 bg-zinc-950/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => onRetry(lead)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 sm:w-auto sm:py-1.5 sm:text-xs"
            >
              Yeniden üret
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 sm:w-auto sm:py-1.5 sm:text-xs"
            >
              {copied ? t("copied", locale) : t("copy", locale)}
            </button>
            {waReady ? (
              <button
                type="button"
                onClick={() => {
                  openExternal(waReady);
                  onMarkOpened(lead.id);
                  onWhatsappOpened(lead.id, messageVariantForLog, displayMessage);
                  if (!queuedForOutreach) {
                    onMarkContacted(lead.id);
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-3 py-2 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/25 sm:w-auto sm:py-1.5 sm:text-xs"
              >
                <IconWhatsapp className="h-4 w-4" />
                {t("send_via_whatsapp", locale)}
              </button>
            ) : (
              <span
                title="WhatsApp bulunamadı"
                className="inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-500 sm:w-auto sm:py-1.5 sm:text-xs"
              >
                <IconWhatsapp className="h-4 w-4" />
                {t("send_via_whatsapp", locale)}
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
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition sm:h-8 sm:w-8";
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
  outreachActivityLabel = "Not contacted",
}: {
  lead: ScoredLead;
  rank: number;
  status: LeadStatus;
  onAction: (id: string) => void;
  onAddToQueue: (id: string) => void;
  queueDisabled?: boolean;
  fromLatestImport?: boolean;
  outreachActivityLabel?: string;
}) {
  const { locale } = useLocale();
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
            {t("hot_badge", locale)}
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
      <div className="mt-1 text-[11px] text-zinc-500">
        {t("outreach_prefix", locale)}: {outreachActivityLabel}
      </div>
      {(lead.priorityBucket || lead.recommendedAction) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.priorityBucket ? (
            <span className={priorityBucketPillClass(lead.priorityBucket)}>
              {outreachPriorityChipLabel(lead.priorityBucket, locale)}
            </span>
          ) : null}
          {lead.recommendedAction ? (
            <span className={actionPillClass(lead.recommendedAction)}>
              {recommendedActionUiLabel(lead.recommendedAction, locale)}
            </span>
          ) : null}
        </div>
      )}
      {fromLatestImport && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
            {t("from_latest_import", locale)}
          </span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {lead.hotReasons.slice(0, 3).map((r) => (
          <span
            key={r}
            className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 ring-1 ring-inset ring-white/10"
          >
            {scoringChipReasonUiLabel(r, locale)}
          </span>
        ))}
      </div>
      {(() => {
        const acqChips = buildAcquisitionIntelligenceChips(
          lead.acquisitionIntelligence,
          lead.bookingFlowStrength,
          2,
          locale,
        );
        if (acqChips.length === 0) return null;
        return (
          <div className="mt-2 flex flex-wrap gap-1">
            {acqChips.map((c) => (
              <span key={c.key} className={c.cls} title={c.title}>
                {c.label}
              </span>
            ))}
          </div>
        );
      })()}
      <WhyThisLeadChips lead={lead} limit={3} />
      <div className="mt-2 rounded-md border border-cyan-400/20 bg-cyan-500/[0.06] px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-200/90">
            {t("outreach_angle", locale)}
          </span>
          <span className={aiSourceBadgeClass(lead.aiInsightSource ?? "rules")}>
            {lead.aiInsightSource === "llm" ? t("model_rules", locale) : t("rules", locale)}
          </span>
        </div>
        <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-300">
          {outreachAngleUiLine(
            pickOutreachAngleText(lead.outreachAngle, lead.painPointSummary),
            locale,
          )}
        </p>
      </div>
      {lead.opportunityLevel ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={opportunityPillClass(lead.opportunityLevel)}>
            {t("opportunity", locale)} · {opportunityLevelUiLabel(lead.opportunityLevel, locale)}
          </span>
          {lead.outreachIntelligence ? (
            <span
              className={temperaturePillClass(lead.outreachIntelligence.leadTemperature)}
              title={`${t("lead_temperature_header", locale)}: ${leadTemperatureUiLabel(lead.outreachIntelligence.leadTemperature, locale)}`}
            >
              <span className="text-[9px] uppercase tracking-wider opacity-70">
                {t("temp", locale)}
              </span>
              <span>{leadTemperatureUiLabel(lead.outreachIntelligence.leadTemperature, locale)}</span>
            </span>
          ) : null}
          {lead.outreachIntelligence ? (
            <span
              className={salesApproachPillClass(lead.outreachIntelligence.salesApproach)}
              title={`${t("best_approach_header", locale)}: ${salesApproachUiLabel(lead.outreachIntelligence.salesApproach, locale)}`}
            >
              <span className="text-[9px] uppercase tracking-wider opacity-70">
                {t("approach", locale)}
              </span>
              <span>{salesApproachUiLabel(lead.outreachIntelligence.salesApproach, locale)}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-auto flex items-center justify-between pt-4">
        <StatusPill status={status} />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAddToQueue(lead.id)}
            disabled={queueDisabled}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("queue_short", locale)}
          </button>
          <button
            onClick={() => onAction(lead.id)}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200 transition hover:bg-white/10"
          >
            {t("open", locale)}
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
  const { locale } = useLocale();
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
        aria-label={t("lead_detail_close", locale)}
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
  const { locale } = useLocale();
  return (
    <div className="grid grid-cols-2 gap-3">
      <DetailStat
        label={t("lead_score", locale)}
        value={lead.leadScore}
        reasons={lead.leadReasons}
        tone="lead"
        locale={locale}
      />
      <DetailStat
        label={t("hot_score", locale)}
        value={lead.hotScore}
        reasons={lead.hotReasons}
        tone="hot"
        locale={locale}
      />
    </div>
  );
}

const OUTREACH_ANGLE_FALLBACK = "No strong outreach angle detected yet.";
const WEAK_OUTREACH_ANGLES = new Set([
  "Offer a lightweight way to handle reservation inquiries faster.",
  "Explore whether inquiry handling and direct booking match guest expectations.",
]);

function pickOutreachAngleText(
  outreachAngle?: string,
  painPointSummary?: readonly string[],
): string {
  const normalized = outreachAngle?.trim() ?? "";
  if (normalized && !WEAK_OUTREACH_ANGLES.has(normalized)) {
    return normalized;
  }
  const topPain = (painPointSummary ?? [])[0]?.toLowerCase() ?? "";
  if (topPain.includes("response") || topPain.includes("communication")) {
    return "Reduce response delays during peak inquiry hours.";
  }
  if (topPain.includes("booking") || topPain.includes("reservation")) {
    return "Improve direct booking conversion flow.";
  }
  if (topPain.includes("instagram")) {
    return "Capture more Instagram-driven reservations.";
  }
  return OUTREACH_ANGLE_FALLBACK;
}

function aiSourceBadgeClass(source: LeadAiInsight["source"]): string {
  if (source === "llm") {
    return "inline-flex items-center rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-100 ring-1 ring-inset ring-cyan-400/35";
  }
  return "inline-flex items-center rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300 ring-1 ring-inset ring-zinc-400/25";
}

function opportunityPillClass(level: OpportunityLevel): string {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset";
  if (level === "very_high") {
    return `${base} bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40`;
  }
  if (level === "high") {
    return `${base} bg-emerald-500/15 text-emerald-200 ring-emerald-400/35`;
  }
  if (level === "medium") {
    return `${base} bg-amber-500/15 text-amber-200 ring-amber-400/35`;
  }
  return `${base} bg-zinc-500/15 text-zinc-300 ring-zinc-400/25`;
}

const OUTREACH_PILL_BASE =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset";

function temperaturePillClass(t: LeadTemperature): string {
  if (t === "hot") {
    return `${OUTREACH_PILL_BASE} bg-rose-500/12 text-rose-200 ring-rose-400/35`;
  }
  if (t === "warm") {
    return `${OUTREACH_PILL_BASE} bg-amber-500/12 text-amber-200 ring-amber-400/30`;
  }
  return `${OUTREACH_PILL_BASE} bg-sky-500/10 text-sky-200 ring-sky-400/25`;
}

function outreachStylePillClass(s: OutreachStyle): string {
  if (s === "consultative") {
    return `${OUTREACH_PILL_BASE} bg-indigo-500/10 text-indigo-200 ring-indigo-400/25`;
  }
  if (s === "conversion-focused") {
    return `${OUTREACH_PILL_BASE} bg-emerald-500/10 text-emerald-200 ring-emerald-400/25`;
  }
  if (s === "direct") {
    return `${OUTREACH_PILL_BASE} bg-cyan-500/10 text-cyan-200 ring-cyan-400/25`;
  }
  if (s === "relationship") {
    return `${OUTREACH_PILL_BASE} bg-pink-500/10 text-pink-200 ring-pink-400/25`;
  }
  return `${OUTREACH_PILL_BASE} bg-zinc-500/12 text-zinc-200 ring-zinc-400/25`;
}

function salesApproachPillClass(approach: SalesApproach): string {
  if (approach === "whatsapp-speed") {
    return `${OUTREACH_PILL_BASE} bg-emerald-500/10 text-emerald-200 ring-emerald-400/25`;
  }
  if (approach === "direct-booking") {
    return `${OUTREACH_PILL_BASE} bg-indigo-500/10 text-indigo-200 ring-indigo-400/25`;
  }
  if (approach === "conversion-gap") {
    return `${OUTREACH_PILL_BASE} bg-amber-500/10 text-amber-200 ring-amber-400/25`;
  }
  if (approach === "social-demand") {
    return `${OUTREACH_PILL_BASE} bg-pink-500/10 text-pink-200 ring-pink-400/25`;
  }
  if (approach === "guest-experience") {
    return `${OUTREACH_PILL_BASE} bg-cyan-500/10 text-cyan-200 ring-cyan-400/25`;
  }
  return `${OUTREACH_PILL_BASE} bg-violet-500/10 text-violet-200 ring-violet-400/25`;
}

function recommendedChannelPillClass(c: RecommendedChannel): string {
  if (c === "whatsapp") {
    return `${OUTREACH_PILL_BASE} bg-emerald-500/10 text-emerald-200 ring-emerald-400/25`;
  }
  if (c === "instagram") {
    return `${OUTREACH_PILL_BASE} bg-pink-500/10 text-pink-200 ring-pink-400/25`;
  }
  if (c === "phone") {
    return `${OUTREACH_PILL_BASE} bg-sky-500/10 text-sky-200 ring-sky-400/25`;
  }
  return `${OUTREACH_PILL_BASE} bg-zinc-500/12 text-zinc-200 ring-zinc-400/25`;
}

function urgencyPillClass(u: OutreachUrgency): string {
  if (u === "high") {
    return `${OUTREACH_PILL_BASE} bg-rose-500/12 text-rose-200 ring-rose-400/30`;
  }
  if (u === "medium") {
    return `${OUTREACH_PILL_BASE} bg-amber-500/10 text-amber-200 ring-amber-400/25`;
  }
  return `${OUTREACH_PILL_BASE} bg-zinc-500/10 text-zinc-300 ring-zinc-400/25`;
}

/** Full four-pill block for the lead detail drawer. */
function OutreachIntelligencePanel({
  profile,
}: {
  profile?: OutreachIntelligenceProfile;
}) {
  const { locale } = useLocale();
  if (!profile) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {t("outreach_intel_section", locale)}
        </span>
        <span className={urgencyPillClass(profile.urgencyLevel)}>
          <span className="text-[9px] uppercase tracking-wider opacity-70">
            {t("urgency_label_header", locale)}
          </span>
          <span>{urgencyUiLabel(profile.urgencyLevel, locale)}</span>
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {t("best_approach_header", locale)}
          </span>
          <span className={salesApproachPillClass(profile.salesApproach)}>
            {salesApproachUiLabel(profile.salesApproach, locale)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {t("style_header", locale)}
          </span>
          <span className={outreachStylePillClass(profile.outreachStyle)}>
            {outreachStyleUiLabel(profile.outreachStyle, locale)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {t("best_channel_header", locale)}
          </span>
          <span className={recommendedChannelPillClass(profile.recommendedChannel)}>
            {recommendedChannelUiLabel(profile.recommendedChannel, locale)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {t("lead_temperature_header", locale)}
          </span>
          <span className={temperaturePillClass(profile.leadTemperature)}>
            {leadTemperatureUiLabel(profile.leadTemperature, locale)}
          </span>
        </div>
      </div>
      {profile.rationale.length > 0 ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
          {profile.rationale
            .filter(Boolean)
            .slice(0, 3)
            .map((line) => outreachRationaleUiLine(line, locale))
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function LeadDetailAiInsightSection({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const [llmAvailable, setLlmAvailable] = useState(false);
  const [refined, setRefined] = useState<LeadAiInsight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai-insight")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => {
        if (!cancelled) setLlmAvailable(Boolean(d.configured));
      })
      .catch(() => {
        if (!cancelled) setLlmAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setRefined(null);
    setError(null);
  }, [lead.id]);

  const base: LeadAiInsight = {
    aiInsight: lead.aiInsight ?? "",
    outreachAngle: lead.outreachAngle ?? "",
    painPointSummary: lead.painPointSummary ?? [],
    opportunityLevel: lead.opportunityLevel ?? "low",
    source: lead.aiInsightSource ?? "rules",
  };

  const active = refined ?? base;

  const hasBody =
    active.aiInsight.trim().length > 0 ||
    active.painPointSummary.length > 0 ||
    active.outreachAngle.trim().length > 0;

  async function refineWithLlm() {
    if (!llmAvailable || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead }),
      });
      const data = (await res.json()) as LeadAiInsight & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRefined({
        aiInsight: data.aiInsight,
        outreachAngle: data.outreachAngle,
        painPointSummary: Array.isArray(data.painPointSummary)
          ? data.painPointSummary
          : [],
        opportunityLevel:
          data.opportunityLevel === "low" ||
          data.opportunityLevel === "medium" ||
          data.opportunityLevel === "high" ||
          data.opportunityLevel === "very_high"
            ? data.opportunityLevel
            : "medium",
        source: data.source === "llm" ? "llm" : "rules",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("detail_refine_failed", locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-cyan-200/90">
          {t("ai_insight_section", locale)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={aiSourceBadgeClass(active.source)}>
            {active.source === "llm" ? t("model_rules", locale) : t("rules", locale)}
          </span>
          {llmAvailable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refineWithLlm()}
              className="inline-flex items-center rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t("detail_refining_with_ai", locale) : t("detail_polish_with_ai", locale)}
            </button>
          ) : null}
        </div>
      </div>

      {!hasBody ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed text-zinc-500">
          {t("ai_insight_fallback", locale)}
        </div>
      ) : (
        <>
          {active.aiInsight.trim() ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                {t("insight_summary_header", locale)}
              </div>
              <p className="text-xs leading-relaxed text-zinc-200">
                {active.source === "llm"
                  ? active.aiInsight
                  : aiInsightParagraphUiText(active.aiInsight, locale)}
              </p>
            </div>
          ) : null}

          {active.painPointSummary.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                {t("pain_points_header", locale)}
              </div>
              <ul className="space-y-1 text-xs text-zinc-300">
                {active.painPointSummary.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-cyan-400" aria-hidden>
                      •
                    </span>
                    <span>{painPointUiLine(line, locale)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-cyan-200/90">
              {t("outreach_angle", locale)}
            </div>
            <p className="text-xs leading-relaxed text-zinc-200">
              {outreachAngleUiLine(
                pickOutreachAngleText(active.outreachAngle, active.painPointSummary),
                locale,
              )}
            </p>
          </div>

        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {t("opportunity", locale)}
        </span>
        <span className={opportunityPillClass(active.opportunityLevel)}>
          {opportunityLevelUiLabel(active.opportunityLevel, locale)}
        </span>
        {lead.outreachIntelligence ? (
          <span
            className={outreachStylePillClass(lead.outreachIntelligence.outreachStyle)}
            title={`${t("style_header", locale)}: ${outreachStyleUiLabel(lead.outreachIntelligence.outreachStyle, locale)}`}
          >
            <span className="text-[9px] uppercase tracking-wider opacity-70">
              {t("style_header", locale)}
            </span>
            <span>{outreachStyleUiLabel(lead.outreachIntelligence.outreachStyle, locale)}</span>
          </span>
        ) : null}
        {lead.outreachIntelligence ? (
          <span
            className={recommendedChannelPillClass(lead.outreachIntelligence.recommendedChannel)}
            title={`${t("best_channel_header", locale)}: ${recommendedChannelUiLabel(lead.outreachIntelligence.recommendedChannel, locale)}`}
          >
            <span className="text-[9px] uppercase tracking-wider opacity-70">
              {t("channel_pill_header", locale)}
            </span>
            <span>{recommendedChannelUiLabel(lead.outreachIntelligence.recommendedChannel, locale)}</span>
          </span>
        ) : null}
      </div>

      {error ? <div className="text-[11px] text-rose-300">{error}</div> : null}
    </div>
  );
}

function whyThisLeadToneClass(tone: WhyThisLeadReason["tone"]) {
  if (tone === "review") return "text-amber-200 ring-amber-400/30 bg-amber-500/10";
  if (tone === "contact") return "text-emerald-200 ring-emerald-400/30 bg-emerald-500/10";
  if (tone === "digital") return "text-sky-200 ring-sky-400/30 bg-sky-500/10";
  if (tone === "priority") return "text-violet-200 ring-violet-400/30 bg-violet-500/10";
  return "text-zinc-200 ring-white/10 bg-white/5";
}

function WhyThisLeadChips({
  lead,
  enrichment,
  limit = 3,
  showFallback = false,
}: {
  lead: ScoredLead;
  enrichment?: WhyThisLeadEnrichment;
  limit?: number;
  showFallback?: boolean;
}) {
  const { locale } = useLocale();
  const reasons = getWhyThisLeadReasons(lead, { enrichment, limit });
  if (reasons.length === 0) {
    return showFallback ? (
      <div className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        {t("why_this_lead_fallback", locale)}
      </div>
    ) : null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <span
          key={reason.id}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ring-1 ring-inset ${whyThisLeadToneClass(reason.tone)}`}
          title={t("why_this_lead_chip_title", locale)}
        >
          {getWhyThisLeadReasonLabel(reason.id, reason.label, locale)}
        </span>
      ))}
    </div>
  );
}

function WhyThisLeadReasonList({
  lead,
  enrichment,
}: {
  lead: ScoredLead;
  enrichment?: WhyThisLeadEnrichment;
}) {
  const { locale } = useLocale();
  const reasons = getWhyThisLeadReasons(lead, { enrichment, limit: 5 });
  if (reasons.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed text-zinc-500">
        {t("why_this_lead_fallback", locale)}
      </div>
    );
  }

  return (
    <ul className="space-y-1.5 text-xs text-zinc-200">
      {reasons.map((reason) => (
        <li key={reason.id} className="flex gap-2">
          <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>
            ✓
          </span>
          <span>{getWhyThisLeadReasonLabel(reason.id, reason.label, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

function LeadDetailIntelligenceSection({
  lead,
  finderPersisted,
}: {
  lead: LeadTableRow;
  finderPersisted?: ContactFinderResult;
}) {
  const { locale } = useLocale();
  const angle = lead.heuristicOutreachAngle?.trim() ?? "";
  const intel = lead.intelligenceScore ?? 0;
  const badges = lead.businessSignals ?? [];

  return (
    <div className="space-y-3 rounded-xl border border-violet-400/20 bg-violet-500/[0.04] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-violet-200/90">
          {t("lead_intelligence_section", locale)}
        </div>
        <div
          className="tabular-nums text-sm font-semibold text-violet-100"
          title={t("intelligence_score_title", locale)}
        >
          {intel}
        </div>
      </div>
      <OutreachIntelligencePanel profile={lead.outreachIntelligence} />
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
          {t("why_this_lead_heading", locale)}
        </div>
        <WhyThisLeadReasonList lead={lead} enrichment={finderPersisted} />
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.slice(0, 8).map((b) => (
            <span
              key={b}
              className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/10"
            >
              {businessSignalUiLabel(b, locale)}
            </span>
          ))}
        </div>
      )}
      {angle ? (
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed text-zinc-300">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {t("consultative_angle_prefix", locale)}{" "}
          </span>
          {angle}
        </div>
      ) : null}
    </div>
  );
}

function LeadDetailMetrics({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <KV label={t("detail_units", locale)} value={lead.units.toString()} />
      <KV label={t("detail_adr", locale)} value={formatTRY(lead.pricePerNight)} />
      <KV
        label={t("detail_occupancy_30d", locale)}
        value={`${Math.round(lead.occupancy30d * 100)}%`}
      />
      <KV label={t("detail_rating", locale)} value={lead.rating.toFixed(1)} />
      <KV label={t("detail_reviews", locale)} value={lead.reviewsCount.toString()} />
      <KV label={t("detail_channels", locale)} value={lead.channels.join(", ")} />
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
  const { locale } = useLocale();
  const s = lead._s;
  const loadingHere =
    finderRequest.status === "loading" && finderRequest.leadId === lead.id;
  const finderErrHere =
    finderRequest.status === "error" && finderRequest.leadId === lead.id;
  const nowTs = Date.now();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <KV
          label={t("contact_quality", locale)}
          value={contactQualityUiLabel(lead.contactQuality, locale)}
        />
        <KV
          label={t("detail_source", locale)}
          value={t("detail_source_google_maps", locale)}
        />
        <KV
          label={t("first_imported_label", locale)}
          value={relativeCalendarLabel(lead.firstImportedAt ?? lead.createdAt, nowTs, locale)}
        />
        <KV
          label={t("last_imported_label", locale)}
          value={relativeCalendarLabel(lead.lastImportedAt, nowTs, locale)}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-zinc-200">
        <input
          type="checkbox"
          className="rounded border-white/20 bg-black/40"
          checked={s.doNotContact}
          onChange={(e) => updateLead(lead.id, { doNotContact: e.target.checked })}
        />
        <span>
          {t("do_not_contact", locale)}{" "}
          <span className="text-zinc-500">{t("detail_dnc_helper", locale)}</span>
        </span>
      </label>

      {lead.signals.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
            {t("detail_signals_header", locale)}
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-300">
            {lead.signals.map((s) => leadSignalUiLine(s, locale)).join(" · ")}
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

      <InstagramDiscoveryPanel acquisition={lead.acquisitionIntelligence} />
      <AcquisitionIntelligencePanel acquisition={lead.acquisitionIntelligence} />

      {lead.website && (
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              {t("detail_contact_finder_header", locale)}
            </div>
            <button
              type="button"
              onClick={() => void findBestContact(lead.id, lead.website!)}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20"
            >
              {t("detail_find_best_contact", locale)}
            </button>
          </div>
          {!loadingHere && !finderErrHere && !finderPersisted && (
            <div className="text-zinc-500">
              {t("detail_find_best_contact_hint", locale)}
            </div>
          )}
          {loadingHere && (
            <div className="text-zinc-300">{t("detail_analyzing_website", locale)}</div>
          )}
          {finderRequest.status === "error" && finderRequest.leadId === lead.id && (
            <div className="text-rose-300">{finderRequest.message}</div>
          )}
          {finderPersisted && !loadingHere && !finderErrHere && (
            <div className="space-y-1.5 text-zinc-300">
              <div>
                <span className="text-zinc-500">{t("detail_best_contact_label", locale)}</span>{" "}
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
                    ? t("detail_verified_whatsapp", locale)
                    : finderPersisted.bestContactType === "GENERATED_WHATSAPP"
                      ? t("detail_whatsapp_available", locale)
                      : finderPersisted.bestContactType === "PHONE_ONLY" ||
                          finderPersisted.bestContactType === "mobile" ||
                          finderPersisted.bestContactType === "phone"
                        ? t("detail_phone_only", locale)
                        : finderPersisted.bestContactType.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">{t("detail_value_label", locale)}</span>{" "}
                <span className="font-medium text-zinc-100">
                  {finderPersisted.bestContactValue}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">{t("detail_confidence_label", locale)}</span>{" "}
                <span className="font-medium text-zinc-100">
                  {contactFinderConfidenceUiLabel(finderPersisted.confidence, locale)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">{t("detail_source", locale)}:</span>{" "}
                {contactFinderSourceUiLabel(finderPersisted.source, locale)}
              </div>
              <div>
                <span className="text-zinc-500">{t("detail_reason_label", locale)}</span>{" "}
                {finderPersisted.reason}
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
                  {t("detail_copy_number", locale)}
                </button>
              </div>
              {finderPersisted.bestContactType === "website" && lead.phone && (
                <div>
                  <span className="text-zinc-500">{t("detail_source", locale)}:</span>{" "}
                  {t("detail_google_places_phone", locale)} ({lead.phone})
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
function pipelineStageLabel(s: LeadStatusUpdate, locale: Locale): string {
  return pipelineStageUiLabel(s.status, Boolean(s.doNotContact), locale);
}

function LeadDetailWorkflowSection({
  lead,
  setLeadStatus,
  onSendMessage,
  sendMessageBusy,
  now,
  outreachActivityLabel,
  importIntelligenceLabels,
}: {
  lead: LeadTableRow;
  setLeadStatus: (id: string, status: LeadStatus) => void;
  onSendMessage: () => void;
  sendMessageBusy: boolean;
  now: number;
  outreachActivityLabel: string;
  importIntelligenceLabels: string[];
}) {
  const { locale } = useLocale();
  const s = lead._s;
  const terminal = s.status === "won" || s.status === "lost";
  const sendDisabled = s.doNotContact || sendMessageBusy || terminal;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <KV
          label={t("last_contact", locale)}
          value={relativeCalendarLabel(s.lastContactedAt ?? s.contactedAt, now, locale)}
        />
        <KV label={t("attempts", locale)} value={String(s.contactAttempts ?? 0)} />
        <KV
          label={t("next_follow_up_label", locale)}
          value={relativeCalendarLabel(s.nextFollowUpAt, now, locale)}
        />
        <KV
          label={t("do_not_contact", locale)}
          value={s.doNotContact ? t("yes_word", locale) : t("no_word", locale)}
        />
        <KV
          label={t("pipeline_stage_label", locale)}
          value={pipelineStageLabel(s, locale)}
        />
      </div>

      <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          {t("next_action_header", locale)}
        </div>
        <p className="mt-1 text-sm text-zinc-100">{nextActionCopy(s, locale)}</p>
        {(() => {
          const timer = followUpTimerLine(s, now, locale);
          if (!timer) return null;
          return <p className="mt-1 text-zinc-400">{timer}</p>;
        })()}
        <p className="mt-1 text-[11px] text-zinc-500">
          {t("outreach_prefix", locale)}: {outreachActivityLabel}
        </p>
        {importIntelligenceLabels.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {importIntelligenceLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          disabled={sendDisabled}
          onClick={onSendMessage}
          title={
            s.doNotContact
              ? t("detail_send_title_dnc", locale)
              : terminal
                ? t("detail_send_title_pipeline_closed", locale)
                : whatsappLink(lead.phone)
                  ? t("detail_send_title_open_wa", locale)
                  : t("detail_send_title_prepare", locale)
          }
          className="mt-3 w-full rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendMessageBusy ? t("detail_preparing_message", locale) : t("detail_send_message", locale)}
        </button>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              {t("detail_status_header", locale)}
            </div>
            {s.updatedAt && (
              <div className="text-[10px] text-zinc-600">
                {t("detail_status_updated_prefix", locale)}{" "}
                {new Date(s.updatedAt).toLocaleString(locale === "tr" ? "tr-TR" : "en-GB")}
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
                    {statusUiLabel(st, locale)}
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
  const { locale } = useLocale();
  const waLink =
    suggestion && suggestion.message.trim()
      ? whatsappLinkWithText(lead.phone, suggestion.message)
      : null;
  const suggestedLabel = suggestion?.suggestDoNotContact
    ? t("detail_lost_plus_dnc", locale)
    : suggestion?.suggestedStatus
      ? statusUiLabel(suggestion.suggestedStatus, locale)
      : t("detail_no_status_suggestion", locale);

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
        {t("detail_reply_helper_header", locale)}
      </div>
      <textarea
        value={ownerReplyDraft}
        onChange={(e) => onOwnerReplyChange(e.target.value)}
        placeholder={t("detail_owner_reply_placeholder", locale)}
        rows={3}
        className="w-full resize-none rounded-md border border-white/10 bg-black/30 p-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <button
        type="button"
        disabled={generateBusy || ownerReplyDraft.trim().length === 0}
        onClick={onGenerate}
        className="mt-2 w-full rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generateBusy ? t("detail_generating_reply", locale) : t("detail_generate_reply", locale)}
      </button>
      {generateError && <p className="mt-2 text-rose-300">{generateError}</p>}
      {suggestion && (
        <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {t("detail_suggested_reply_header", locale)}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{suggestion.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCopyReply}
              className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10"
            >
              {copied ? t("detail_copied", locale) : t("detail_copy_reply", locale)}
            </button>
            {waLink ? (
              <button
                type="button"
                onClick={() => openExternal(waLink)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-2.5 py-1 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25"
              >
                <IconWhatsapp className="h-3.5 w-3.5" />
                {t("detail_send_via_whatsapp", locale)}
              </button>
            ) : null}
            {(suggestion.suggestedStatus || suggestion.suggestDoNotContact) && (
              <button
                type="button"
                onClick={onApplySuggestion}
                className="rounded-md border border-indigo-400/35 bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200 hover:bg-indigo-500/25"
              >
                {t("detail_apply_suggested_status", locale)}
              </button>
            )}
          </div>
          <div className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
            {t("detail_suggested_next_status", locale)} {suggestedLabel}
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
  const { locale } = useLocale();
  const s = lead._s;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">
          {t("detail_notes_header", locale)}
        </div>
        <div className="text-[10px] text-zinc-600">
          {draftNote.length} {t("detail_notes_chars_suffix", locale)}
        </div>
      </div>
      <textarea
        value={draftNote}
        onChange={(e) => setDraftNote(e.target.value)}
        placeholder={t("detail_notes_placeholder", locale)}
        rows={6}
        className="w-full resize-none rounded-md border border-white/10 bg-black/30 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={() => setDraftNote(s.note ?? "")}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
        >
          {t("detail_notes_reset", locale)}
        </button>
        <button
          onClick={() => updateLead(lead.id, { note: draftNote })}
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400"
        >
          {t("detail_notes_save", locale)}
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
  outreachActivityLabel,
  importIntelligenceLabels,
  now,
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
  outreachActivityLabel: string;
  importIntelligenceLabels: string[];
  now: number;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LeadDetailHeader lead={selectedLead} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <LeadDetailScoreSummary lead={selectedLead} />
        <LeadDetailIntelligenceSection
          lead={selectedLead}
          finderPersisted={finderPersisted}
        />
        <LeadDetailAiInsightSection lead={selectedLead} />
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
          now={now}
          outreachActivityLabel={outreachActivityLabel}
          importIntelligenceLabels={importIntelligenceLabels}
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
  const { locale } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [renderNow, setRenderNow] = useState(0);
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
  const [sort, setSort] = useState<"priority" | "readiness" | "hot" | "lead" | "name">("priority");
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
  const [dailyOutreach, setDailyOutreach] = useState<DailyOutreachPersisted>({
    queueDate: "",
    todayQueue: [],
    todayLog: [],
    queueItems: {},
    completedToday: 0,
    skippedToday: 0,
    dncToday: 0,
  });
  const [outreachEventsByLead, setOutreachEventsByLead] = useState<
    Record<string, OutreachEvent[]>
  >({});
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
    setMounted(true);
    setRenderNow(Date.now());
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
    setOutreachEventsByLead(loadOutreachEvents());
    const meta = loadImportMeta();
    setHasImportRun(
      meta.hasRun ||
        lip.batch.length > 0 ||
        stored.some((l) => l.id.startsWith("gmaps-")),
    );
    setDateLabel(buildTodayLabel());
  }, []);

  const appendOutreachEvent = useCallback(
    (
      leadId: string,
      type: OutreachEventType,
      options?: {
        messageVariant?: OutreachMessageVariant;
        messagePreview?: string;
        followUpAt?: string;
      },
    ) => {
      const createdAt = new Date().toISOString();
      const event: OutreachEvent = {
        id: `${leadId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        leadId,
        type,
        createdAt,
        messageVariant: options?.messageVariant,
        messagePreview: options?.messagePreview
          ? options.messagePreview.slice(0, 180)
          : undefined,
        followUpAt: options?.followUpAt,
      };
      setOutreachEventsByLead((prev) => {
        const current = prev[leadId] ?? [];
        const next = { ...prev, [leadId]: [...current, event].slice(-40) };
        saveOutreachEvents(next);
        return next;
      });
    },
    [],
  );

  const getLastOutreachActivityLabel = useCallback(
    (leadId: string, s: LeadStatusUpdate, now: number): string => {
      const stateDueAt =
        typeof s.nextFollowUpAt === "number" && Number.isFinite(s.nextFollowUpAt)
          ? s.nextFollowUpAt
          : null;
      const events = outreachEventsByLead[leadId] ?? [];
      const latest = events[events.length - 1];
      const eventDueAt = (() => {
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const ts = Date.parse(events[i].followUpAt ?? "");
          if (Number.isFinite(ts) && ts > 0) return ts;
        }
        return null;
      })();
      const dueAt = stateDueAt ?? eventDueAt;
      if (dueAt && dueAt <= now) return t("follow_up_due", locale);
      if (!latest) return t("not_contacted", locale);
      if (latest.type === "message_prepared") return t("message_prepared", locale);
      if (latest.type === "message_copied") return t("message_copied", locale);
      if (latest.type === "whatsapp_opened") return t("whatsapp_opened", locale);
      if (latest.type === "contacted") return t("contacted_activity", locale);
      if (latest.type === "follow_up_due") return t("follow_up_due", locale);
      return t("not_contacted", locale);
    },
    [outreachEventsByLead, locale],
  );

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
        contact_readiness_score: rowReadiness(row).score,
        outreach_priority:
          typeof row.outreachPriority === "number" && Number.isFinite(row.outreachPriority)
            ? row.outreachPriority
            : 0,
        priority_bucket: row.priorityBucket ?? "",
        recommended_action: row.recommendedAction ?? "",
        whatsapp_invalid: Boolean(row._s.whatsappInvalid),
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
            const whatsappInvalid =
              typeof l.whatsappInvalid === "boolean"
                ? l.whatsappInvalid
                : Boolean(cur.whatsappInvalid);
            const pipelineStageRaw = (l as unknown as { pipelineStage?: unknown }).pipelineStage;
            const pipelineStage = typeof pipelineStageRaw === "string" ? pipelineStageRaw : null;

            let status: LeadStatus = cur.status;
            if (pipelineStage === "won") status = "won";
            else if (pipelineStage === "lost" || doNotContact || whatsappInvalid) status = "lost";
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
              doNotContact: doNotContact || whatsappInvalid,
              whatsappInvalid,
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
    const now = renderNow;
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
      if (sort === "readiness") {
        const ar = rowReadinessWithFinder(a, contactFinderMap[a.id]).score;
        const br = rowReadinessWithFinder(b, contactFinderMap[b.id]).score;
        return br - ar;
      }
      if (sort === "priority") {
        const ar = typeof a.outreachPriority === "number" ? a.outreachPriority : 0;
        const br = typeof b.outreachPriority === "number" ? b.outreachPriority : 0;
        if (br !== ar) return br - ar;
      }
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
    renderNow,
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
      .sort((a, b) => {
        const ap = typeof a.outreachPriority === "number" ? a.outreachPriority : 0;
        const bp = typeof b.outreachPriority === "number" ? b.outreachPriority : 0;
        if (bp !== ap) return bp - ap;
        return b.hotScore - a.hotScore;
      })
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
    const now = renderNow;
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
  }, [allRows, renderNow]);

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
        whatsappInvalid?: boolean;
        contactReadinessScore?: number;
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
              whatsappInvalid: Boolean(payload.whatsappInvalid),
              contactReadinessScore: payload.contactReadinessScore ?? 0,
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
        whatsappInvalid?: boolean;
        contactReadinessScore?: number;
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
        const readiness = allRowsById.get(leadId);
        outcome = { newAttempts: nextAttempts, doNotContact };
        syncPayload = {
          contactAttempts: nextAttempts,
          lastContactedAt: ts,
          nextFollowUpAt,
          doNotContact,
          whatsappInvalid: Boolean(cur.whatsappInvalid),
          contactReadinessScore: readiness ? rowReadiness(readiness).score : 0,
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
        appendOutreachEvent(leadId, "contacted", {
          followUpAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        });
        void syncContactedToAirtable(leadId, syncPayload);
      }
      return outcome;
    },
    [allRowsById, appendOutreachEvent, syncContactedToAirtable],
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

  useEffect(() => {
    if (!mounted) return;
    const now = Date.now();
    const dueSignals: Array<{ leadId: string; followUpAt: string }> = [];
    for (const [leadId, s] of Object.entries(stateMap)) {
      if (typeof s.nextFollowUpAt === "number" && s.nextFollowUpAt <= now) {
        dueSignals.push({ leadId, followUpAt: new Date(s.nextFollowUpAt).toISOString() });
      }
    }
    for (const [leadId, events] of Object.entries(outreachEventsByLead)) {
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const iso = events[i].followUpAt;
        if (!iso) continue;
        const ts = Date.parse(iso);
        if (Number.isFinite(ts) && ts <= now) {
          dueSignals.push({ leadId, followUpAt: iso });
          break;
        }
      }
    }
    if (dueSignals.length === 0) return;
    const seenDue = new Set<string>();
    for (const item of dueSignals) {
      const k = `${item.leadId}|${item.followUpAt}`;
      if (seenDue.has(k)) continue;
      seenDue.add(k);
      const exists = (outreachEventsByLead[item.leadId] ?? []).some(
        (e) => e.type === "follow_up_due" && e.followUpAt === item.followUpAt,
      );
      if (!exists) {
        appendOutreachEvent(item.leadId, "follow_up_due", {
          followUpAt: item.followUpAt,
        });
      }
    }
  }, [appendOutreachEvent, mounted, outreachEventsByLead, stateMap]);

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
    const hasWhatsAppPath = Boolean(whatsappLink(lead.phone));
    const res = await fetch("/api/generate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        name: lead.name,
        type: lead.type,
        location: `${lead.city}, ${lead.region}`,
        leadScore: lead.leadScore,
        hotScore: lead.hotScore,
        followUp,
        regenerateNonce: 0,
        intelligenceScore: lead.intelligenceScore ?? 0,
        smartLeadScoreV2: lead.smartLeadScoreV2,
        reviewIntelligenceScore: lead.reviewIntelligenceScore ?? 0,
        contactQuality: lead.contactQuality,
        hasWhatsAppPath,
        hasInstagram: lead.hasInstagram,
        hasOwnWebsite: lead.hasOwnWebsite,
        channels: lead.channels,
        businessSignals: lead.businessSignals ?? [],
        painPointSummary: lead.painPointSummary ?? [],
        outreachAngle: lead.outreachAngle ?? "",
        outreachIntelligence: lead.outreachIntelligence,
        whyThisLead: lead.whyThisLead ?? [],
        websiteIntelligence: lead.websiteIntelligence ?? null,
        acquisitionIntelligence: lead.acquisitionIntelligence ?? null,
        conversionLeak: lead.conversionLeak ?? null,
        commercialReadiness: lead.commercialReadiness ?? null,
        opportunityProfile: lead.opportunityProfile ?? null,
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
    regenerateNonce = 0,
  ): Promise<{
    styles: { direct: string; soft: string; premium: string };
    fallback: string;
    rationaleNote?: string;
    llmRefined?: boolean;
    provider?: string | null;
  }> => {
    const hasWhatsAppPath = Boolean(whatsappLink(lead.phone));
    const res = await fetch("/api/generate-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        name: lead.name,
        type: lead.type,
        location: `${lead.city}, ${lead.region}`,
        leadScore: lead.leadScore,
        hotScore: lead.hotScore,
        followUp,
        regenerateNonce,
        intelligenceScore: lead.intelligenceScore ?? 0,
        smartLeadScoreV2: lead.smartLeadScoreV2,
        reviewIntelligenceScore: lead.reviewIntelligenceScore ?? 0,
        reviewsCount: lead.reviewsCount,
        daysSinceLastReview: lead.daysSinceLastReview,
        bookingFlowStrength: lead.bookingFlowStrength,
        otaDependencyLikelihood: lead.otaDependencyLikelihood,
        socialDemandStrength: lead.socialDemandStrength,
        communicationRisk: lead.communicationRisk,
        contactReadinessScore: lead.contactReadinessScore,
        contactQuality: lead.contactQuality,
        hasWhatsAppPath,
        hasInstagram: lead.hasInstagram,
        hasOwnWebsite: lead.hasOwnWebsite,
        channels: lead.channels,
        businessSignals: lead.businessSignals ?? [],
        painPointSummary: lead.painPointSummary ?? [],
        outreachAngle: lead.outreachAngle ?? "",
        outreachIntelligence: lead.outreachIntelligence,
        whyThisLead: lead.whyThisLead ?? [],
        websiteIntelligence: lead.websiteIntelligence ?? null,
        acquisitionIntelligence: lead.acquisitionIntelligence ?? null,
        conversionLeak: lead.conversionLeak ?? null,
        commercialReadiness: lead.commercialReadiness ?? null,
        opportunityProfile: lead.opportunityProfile ?? null,
      }),
    });
    const data = (await res.json()) as {
      styles?: { direct?: string; soft?: string; premium?: string; curiosity?: string };
      message?: string;
      error?: string;
      variations?: string[];
      rationaleNote?: string;
      llm_refined?: boolean;
      meta?: { provider?: string | null };
    };
    if (!res.ok) {
      throw new Error(data.error || `Sunucu hatası (${res.status})`);
    }
    const styles = data.styles;
    const direct = styles?.direct?.trim() ?? "";
    const soft = styles?.soft?.trim() ?? "";
    const premium = (styles?.premium?.trim() ?? styles?.curiosity?.trim() ?? "").trim();
    const fallback =
      (data.message?.trim() ||
        (Array.isArray(data.variations) ? data.variations[0]?.trim() : "") ||
        "") ?? "";
    if (!direct || !soft || !premium) {
      throw new Error("AI message styles missing");
    }
    return {
      styles: { direct, soft, premium },
      fallback,
      rationaleNote: typeof data.rationaleNote === "string" ? data.rationaleNote : undefined,
      llmRefined: Boolean(data.llm_refined),
      provider: data.meta?.provider ?? null,
    };
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
      const pack = await generateLeadAiStylePack(lead, useFollowUpCopy, 0);
      const message = pack.styles.soft || pack.fallback;
      appendOutreachEvent(lead.id, "message_prepared", {
        messageVariant: "soft",
        messagePreview: message,
      });
      setAiMessageModal({
        lead,
        phase: "ready",
        message,
        styles: pack.styles,
        draftByStyle: { ...pack.styles },
        selectedStyle: "soft",
        rationaleNote: pack.rationaleNote,
        llmRefined: pack.llmRefined,
        provider: pack.provider ?? null,
        regenerateNonce: 0,
      });
    } catch (e) {
      setAiMessageModal({
        lead,
        phase: "error",
        error: e instanceof Error ? e.message : "Bir hata oluştu",
      });
    }
  };

  const regenerateAiMessage = async (lead: ScoredLead) => {
    const st = getLeadState(lead.id);
    if (st.doNotContact) return;
    const useFollowUpCopy = st.status === "needs_follow_up";
    const nextNonce =
      aiMessageModal?.phase === "ready" && aiMessageModal.lead.id === lead.id
        ? aiMessageModal.regenerateNonce + 1
        : 1;
    setAiMessageModal({ lead, phase: "loading" });
    try {
      const pack = await generateLeadAiStylePack(lead, useFollowUpCopy, nextNonce);
      const message = pack.styles.soft || pack.fallback;
      setAiMessageModal({
        lead,
        phase: "ready",
        message,
        styles: pack.styles,
        draftByStyle: { ...pack.styles },
        selectedStyle: "soft",
        rationaleNote: pack.rationaleNote,
        llmRefined: pack.llmRefined,
        provider: pack.provider ?? null,
        regenerateNonce: nextNonce,
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
    const followUp = st.status === "needs_follow_up";
    setDrawerSendBusy(true);
    try {
      const pack = await generateLeadAiStylePack(lead, followUp, 0);
      const message = pack.styles.soft || pack.fallback;
      appendOutreachEvent(lead.id, "message_prepared", {
        messageVariant: "soft",
        messagePreview: message,
      });
      setAiMessageModal({
        lead,
        phase: "ready",
        message,
        styles: pack.styles,
        draftByStyle: { ...pack.styles },
        selectedStyle: "soft",
        rationaleNote: pack.rationaleNote,
        llmRefined: pack.llmRefined,
        provider: pack.provider ?? null,
        regenerateNonce: 0,
      });
    } catch (e) {
      setAiMessageModal({
        lead,
        phase: "error",
        error: e instanceof Error ? e.message : "Bir hata oluştu",
      });
    } finally {
      setDrawerSendBusy(false);
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
  const safeActiveQueueCount = mounted ? activeQueueCount : 0;
  const safeFollowUpDueCount = mounted ? followUpDueRows.length : 0;
  const safeCompletedToday = mounted ? dailyOutreach.completedToday : 0;
  const safeSkippedToday = mounted ? dailyOutreach.skippedToday : 0;
  const safeDncToday = mounted ? dailyOutreach.dncToday : 0;

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

    const latestImportIdSet = new Set(latestImportLeads.map((l) => l.id));
    const localMasterRows = importedLeads
      .map((l) => allRowsById.get(l.id))
      .filter((r): r is LeadTableRow => Boolean(r));
    const latestImportRowsSource = latestImportLeads
      .map((l) => allRowsById.get(l.id))
      .filter((r): r is LeadTableRow => Boolean(r));
    const airtableRows = allRows.filter((r) => r.id.startsWith("airtable-"));
    const combined = [...latestImportRowsSource, ...localMasterRows, ...airtableRows];

    const dedupedByKey = new Map<
      string,
      { row: LeadTableRow; source: QueueLeadSource; readiness: { score: number; reasons: string[] } }
    >();
    for (const row of combined) {
      const source = sourceForRow(row, latestImportIdSet);
      const phoneKey = normalizePhoneDedupe(row.phone);
      const dedupeKey = phoneKey ? `p:${phoneKey}` : `n:${leadDedupeKey(row.name, row.city)}`;
      const readiness = rowReadinessWithFinder(row, contactFinderMap[row.id]);
      const current = dedupedByKey.get(dedupeKey);
      if (!current) {
        dedupedByKey.set(dedupeKey, { row, source, readiness });
        continue;
      }
      const currentPriority = sourceBonus(current.source);
      const nextPriority = sourceBonus(source);
      if (nextPriority > currentPriority) {
        dedupedByKey.set(dedupeKey, { row, source, readiness });
        continue;
      }
      if (nextPriority === currentPriority) {
        if (readiness.score > current.readiness.score) {
          dedupedByKey.set(dedupeKey, { row, source, readiness });
        }
      }
    }

    const scanned = dedupedByKey.size;
    let skippedLowReadiness = 0;
    let skippedAlreadyQueued = 0;
    let skippedContactedRecently = 0;

    const eligible: Array<{
      row: LeadTableRow;
      source: QueueLeadSource;
      readiness: { score: number; reasons: string[] };
      category: ReadinessCategory;
      rank: number;
    }> = [];
    for (const c of dedupedByKey.values()) {
      const row = c.row;
      const s = row._s;
      if (s.doNotContact || s.whatsappInvalid) continue;
      const stage = s.pipelineStage ?? "";
      if (stage === "won" || stage === "lost") continue;
      const attempts = s.contactAttempts ?? 0;
      if (attempts >= 3) continue;
      const lastContacted =
        typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
          ? s.lastContactedAt
          : typeof s.contactedAt === "number" && s.contactedAt > 0
            ? s.contactedAt
            : null;
      if (lastContacted !== null && now - lastContacted < 7 * 24 * 60 * 60 * 1000) {
        skippedContactedRecently += 1;
        continue;
      }
      if (baseDaily.todayQueue.includes(row.id)) {
        skippedAlreadyQueued += 1;
        continue;
      }
      const contact = hasValidOutboundContact(row, contactFinderMap[row.id]);
      if (!contact.any) continue;
      const finder = contactFinderMap[row.id];
      const readiness = rowReadinessWithFinder(row, finder);
      if (readiness.score < 30) {
        skippedLowReadiness += 1;
      }
      const category = readinessCategory(row, finder);
      const weakPenalty =
        category === "weak_contact" ? 18 : category === "needs_finder" ? 10 : 0;
      const noContactPenalty = category === "no_contact" ? 35 : 0;
      const readyBoost = category === "ready_now" ? 8 : category === "good_contact" ? 4 : 0;
      const intel =
        typeof row.intelligenceScore === "number" && Number.isFinite(row.intelligenceScore)
          ? row.intelligenceScore
          : 0;
      const outreachPriority =
        typeof row.outreachPriority === "number" && Number.isFinite(row.outreachPriority)
          ? row.outreachPriority
          : 0;
      const rank =
        readiness.score * 0.55 +
        outreachPriority * 0.28 +
        row.hotScore * 0.12 +
        row.leadScore * 0.15 +
        sourceBonus(c.source) * 0.05 +
        intel * 0.06 +
        readyBoost -
        weakPenalty -
        noContactPenalty;
      eligible.push({ row, source: c.source, readiness, category, rank });
    }

    const nonNoContact = eligible.filter((x) => x.category !== "no_contact");
    const poolToRank = nonNoContact.length > 0 ? nonNoContact : eligible;
    poolToRank.sort((a, b) => b.rank - a.rank);
    const selected = poolToRank.slice(0, DAILY_OUTREACH_LIMIT);
    if (selected.length === 0) {
      showQueueNotice("Auto Build: no eligible leads found after global ranking.");
      return;
    }

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
      const nextQ: string[] = [];
      const nextLog = [...base.todayLog];
      const nextItems: Record<string, DailyQueueItem> = { ...base.queueItems };
      for (const s of selected) {
        const id = s.row.id;
        nextQ.push(id);
        if (!nextLog.includes(id)) nextLog.push(id);
        const prevItem = nextItems[id] ?? emptyDailyQueueItem(now);
        nextItems[id] = {
          ...prevItem,
          source: s.source,
          readinessScore: s.readiness.score,
          queueRankScore: Number(s.rank.toFixed(2)),
          queueStatus:
            prevItem.queueStatus === "contacted" || prevItem.queueStatus === "skipped"
              ? "queued"
              : prevItem.queueStatus,
          updatedAt: now,
        };
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
    setStateMap((prev) => {
      const next: StateMap = { ...prev };
      const ts = Date.now();
      for (const id of selected.map((s) => s.row.id)) {
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

    const sourceBreakdown = {
      latest_import: selected.filter((s) => s.source === "latest_import").length,
      airtable: selected.filter((s) => s.source === "airtable").length,
      local_pool: selected.filter((s) => s.source === "local_pool").length,
    };
    showQueueNotice(
      `Auto Build debug · scanned:${scanned} · eligible:${eligible.length} · selected:${selected.length} · low readiness:${skippedLowReadiness} · already queued:${skippedAlreadyQueued} · contacted<7d:${skippedContactedRecently} · sources[L:${sourceBreakdown.latest_import}/A:${sourceBreakdown.airtable}/P:${sourceBreakdown.local_pool}]`,
    );
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
  const queueCurrentReadiness =
    queueCurrentLead ? rowReadinessWithFinder(queueCurrentLead, queueCurrentFinder) : null;
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

  const markAiMessagePrepared = (leadId: string) => {
    appendOutreachEvent(leadId, "message_prepared");
    if (!dailyOutreach.todayQueue.includes(leadId)) return;
    const item = dailyOutreach.queueItems[leadId];
    if (item?.queueStatus === "contacted" || item?.queueStatus === "skipped") return;
    updateQueueItem(leadId, { queueStatus: "prepared" });
  };

  const markAiMessageOpened = (leadId: string) => {
    if (!dailyOutreach.todayQueue.includes(leadId)) return;
    const item = dailyOutreach.queueItems[leadId];
    if (item?.queueStatus === "contacted" || item?.queueStatus === "skipped") return;
    updateQueueItem(leadId, { queueStatus: "opened" });
  };

  const logAiMessageCopied = (
    leadId: string,
    messageVariant: OutreachMessageVariant,
    messagePreview: string,
  ) => {
    appendOutreachEvent(leadId, "message_copied", { messageVariant, messagePreview });
  };

  const logWhatsappOpened = (
    leadId: string,
    messageVariant: OutreachMessageVariant,
    messagePreview: string,
  ) => {
    appendOutreachEvent(leadId, "whatsapp_opened", {
      messageVariant,
      messagePreview,
      followUpAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
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

  const markQueueLeadInvalidWhatsapp = () => {
    if (!queueCurrentLead || !queueCurrentId) return;
    const id = queueCurrentLead.id;
    const now = Date.now();
    const readiness = rowReadiness(queueCurrentLead).score;
    updateLead(id, {
      doNotContact: true,
      whatsappInvalid: true,
      status: "lost",
      pipelineStage: "lost",
      updatedAt: now,
    });
    void syncContactedToAirtable(id, {
      contactAttempts: queueCurrentLead._s.contactAttempts ?? 0,
      lastContactedAt: queueCurrentLead._s.lastContactedAt ?? now,
      nextFollowUpAt: null,
      doNotContact: true,
      whatsappInvalid: true,
      contactReadinessScore: readiness,
      notes: queueCurrentLead._s.note ?? "",
      pipelineStage: "lost",
    });
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
    showQueueNotice("Marked as invalid WhatsApp, moved to Do Not Contact, and synced.");
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
          <p className="mt-1 text-xs text-zinc-500">{t("app_tagline", locale)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
          <LocaleToggle />
          <span className="hidden sm:inline">{t("today", locale)}</span>
          <span
            className="rounded-md bg-white/5 px-2.5 py-1 font-medium text-zinc-200 ring-1 ring-inset ring-white/10 tabular-nums"
            suppressHydrationWarning
          >
            {dateLabel || "\u00A0"}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="tabular-nums">
            {stats.sessionLeads} {t("session_leads_suffix", locale)}
          </span>
          <button
            onClick={() => setSessionLeadIds([])}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-white/10"
          >
            {t("start_new_session", locale)}
          </button>
          <a
            href="/dashboard/follow-ups"
            className="rounded-md border border-orange-400/30 bg-orange-500/10 px-2 py-1 text-[11px] text-orange-200 transition hover:bg-orange-500/20"
          >
            {t("follow_ups", locale)}
          </a>
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label={t("stat_session_leads", locale)}
          value={stats.sessionLeads}
          hint={t("stat_session_leads_hint", locale)}
          accent="indigo"
        />
        <StatCard
          label={t("stat_hot_leads", locale)}
          value={stats.hotToday}
          hint={t("stat_hot_leads_hint", locale)}
          accent="orange"
        />
        <StatCard
          label={t("stat_contacted", locale)}
          value={stats.contacted}
          hint={t("stat_session", locale)}
          accent="sky"
        />
        <StatCard
          label={t("stat_replied", locale)}
          value={stats.replied}
          hint={t("stat_session", locale)}
          accent="emerald"
        />
        <StatCard
          label={t("stat_won", locale)}
          value={stats.won}
          hint={fillTemplate(t("stat_won_hint", locale), {
            amount: formatTRY(stats.totalRevenuePotential),
          })}
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
                {t("morning_outreach", locale)}
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              {t("queue_word", locale)} {safeActiveQueueCount}/{DAILY_OUTREACH_LIMIT} ·{" "}
              {t("follow_ups_due_label", locale)} {safeFollowUpDueCount} ·{" "}
              {t("contacted_today_label", locale)} {safeCompletedToday}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={autoBuildTodayQueue}
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/25"
            >
              {t("auto_build_queue", locale)}
            </button>
            <button
              type="button"
              onClick={startDailyOutreachSession}
              disabled={safeActiveQueueCount === 0}
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("start_outreach_session", locale)}
            </button>
            <a
              href="/dashboard/follow-ups"
              className="rounded-md border border-orange-400/30 bg-orange-500/10 px-2.5 py-1.5 text-xs font-medium text-orange-200 transition hover:bg-orange-500/20"
            >
              {t("open_follow_ups_today", locale)}
            </a>
            <button
              type="button"
              onClick={() => void syncLeadsToAirtable()}
              disabled={airtableBusy !== null}
              className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("sync_airtable_short", locale)}
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
            {airtableBusy === "sync" ? t("syncing", locale) : t("sync_to_airtable", locale)}
          </button>
          <button
            type="button"
            onClick={() => void loadLeadsFromAirtable()}
            disabled={airtableBusy !== null}
            className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {airtableBusy === "load" ? t("loading", locale) : t("load_from_airtable", locale)}
          </button>
          {airtableConnected === true && (
            <span className="text-xs text-emerald-300">{t("airtable_connected", locale)}</span>
          )}
        </div>
        {airtableWarning && <p className="mt-2 text-xs text-amber-300">{airtableWarning}</p>}
        {airtableSyncStatus && <p className="mt-2 text-xs text-zinc-300">{airtableSyncStatus}</p>}
      </section>

      {/* Last Import Results */}
      <section className="overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] backdrop-blur ring-1 ring-inset ring-indigo-500/10">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-200">
            {t("last_import_results", locale)}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">{t("last_import_sub", locale)}</p>
        </div>

        {!hasImportRun ? (
          <div className="px-4 py-6 text-xs text-zinc-500">{t("run_import_prompt", locale)}</div>
        ) : latestImportRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-amber-300">{t("no_new_leads_import", locale)}</div>
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
                  <th className="px-4 py-2.5 font-medium">{t("col_lead", locale)}</th>
                  <th className="px-4 py-2.5 font-medium">{t("col_type", locale)}</th>
                  <th className="px-4 py-2.5 font-medium">{t("col_location", locale)}</th>
                  <th className="px-4 py-2.5 font-medium">{t("col_imported", locale)}</th>
                  <th
                    className="px-4 py-2.5 font-medium"
                    title={t("contact_readiness_title", locale)}
                  >
                    {t("contact_readiness", locale)}
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium"
                    title={t("hot_score_title", locale)}
                  >
                    {t("hot_score", locale)}
                  </th>
                  <th className="px-4 py-2.5 font-medium">{t("lead_score", locale)}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("actions", locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {latestImportRows.map((row, index) => {
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
                                {t("new_to_database", locale)}
                              </span>
                            )}
                            {lastImportUpdatedIds.includes(row.id) && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200 ring-1 ring-inset ring-amber-400/40">
                                {t("reimported", locale)}
                              </span>
                            )}
                          </div>
                          <OutreachBadgesRow
                            row={row}
                            newImport={lastImportNewIds.includes(row.id)}
                            reimported={lastImportUpdatedIds.includes(row.id)}
                            inQueue={dailyOutreach.todayQueue.includes(row.id)}
                            syncedToAirtable={airtableSyncedLeadIds.includes(row.id)}
                            now={renderNow}
                          />
                          <WhyThisLeadChips
                            lead={row}
                            enrichment={contactFinderMap[row.id]}
                            limit={3}
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
                            renderNow,
                            locale,
                          )}
                        </div>
                        {(() => {
                          const lc =
                            row._s.lastContactedAt ?? row._s.contactedAt ?? null;
                          return lc ? (
                            <div className="mt-0.5 text-[11px] text-zinc-500">
                              {t("last_contact", locale)}:{" "}
                              {relativeCalendarLabel(lc, renderNow, locale)}
                            </div>
                          ) : null;
                        })()}
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {t("outreach_prefix", locale)}:{" "}
                          {getLastOutreachActivityLabel(row.id, row._s, renderNow)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <ScoreBar
                            score={rowReadinessWithFinder(row, contactFinderMap[row.id]).score}
                            tone="lead"
                          />
                          <span className="text-[10px] text-zinc-400">
                            {readinessCategoryUiLabel(row, contactFinderMap[row.id], locale)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ScoreBar score={row.hotScore} tone="hot" />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ScoreBar score={row.leadScore} tone="lead" />
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
                          <LeadInstagramAction
                            instagram={row.instagram}
                            acquisition={row.acquisitionIntelligence}
                          />
                          <button
                            type="button"
                            disabled={row._s.doNotContact}
                            onClick={() => void startAiMessage(row)}
                            title="Kişiselleştirilmiş AI mesajı"
                            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:text-xs"
                          >
                            <IconSpark className="h-3.5 w-3.5 shrink-0" />
                            {t("ai_message", locale)}
                          </button>
                          {!row._s.doNotContact &&
                            (isFollowUpDue(row._s, renderNow) ||
                              row._s.status === "needs_follow_up") && (
                              <button
                                type="button"
                                onClick={() => void startFollowUpOutreach(row)}
                                title="Kısa hatırlatma mesajı ve WhatsApp"
                                className="inline-flex h-10 shrink-0 items-center rounded-md border border-orange-400/30 bg-orange-500/10 px-2 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/20 sm:h-8 sm:text-xs"
                              >
                                {t("follow_up", locale)}
                              </button>
                            )}
                          <button
                            type="button"
                            disabled={(() => {
                              const now = renderNow;
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
                                  safeActiveQueueCount >= DAILY_OUTREACH_LIMIT)
                              );
                            })()}
                            title="Add to today’s outreach queue (max 20)"
                            onClick={() => addLeadIdsToDailyQueue([row.id])}
                            className="inline-flex h-10 shrink-0 items-center rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8"
                          >
                            {t("add_to_queue", locale)}
                          </button>
                          <button
                            onClick={() => setOpenId(row.id)}
                            title="Open details"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 transition hover:bg-white/10"
                          >
                            {t("open", locale)}
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
            {t("latest_import_dupes_only", locale)}
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
              {t("todays_queue", locale)}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {fillTemplate(t("queue_section_summary", locale), {
                active: safeActiveQueueCount,
                limit: DAILY_OUTREACH_LIMIT,
                sent: safeCompletedToday,
                skip: safeSkippedToday,
                dnc: safeDncToday,
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startDailyOutreachSession}
              disabled={safeActiveQueueCount === 0}
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("start_session", locale)}
            </button>
            <button
              type="button"
              onClick={clearDailyQueue}
              disabled={dailyOutreach.todayQueue.length === 0}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("clear_queue", locale)}
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
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${queueSourceBadgeClass(
                        qitem?.source,
                      )}`}
                    >
                      {queueSourceUiLabel(qitem?.source, locale)}
                    </span>
                    <span className="tabular-nums text-emerald-200">
                      {t("ready_label", locale)}{" "}
                      {qitem?.readinessScore ?? rowReadiness(qrow).score}
                    </span>
                    <span className="tabular-nums text-sky-200">
                      {t("rank_label", locale)}{" "}
                      {typeof qitem?.queueRankScore === "number"
                        ? qitem.queueRankScore.toFixed(2)
                        : "—"}
                    </span>
                    <span className="tabular-nums text-orange-200">
                      {t("hot_score", locale)} {qrow.hotScore}
                    </span>
                    <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">
                      {queueMessageStatusUiLabel(qitem?.queueStatus ?? "queued", locale)}
                    </span>
                    <span className="text-zinc-500">
                      {cat === "ready"
                        ? t("contact_ready", locale)
                        : cat === "needs_finder"
                          ? t("needs_finder_lower", locale)
                          : t("no_channel", locale)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-500">{t("queue_empty_hint", locale)}</p>
        )}
      </section>

      <section className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] px-4 py-3 ring-1 ring-inset ring-orange-500/10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-200">
              {t("follow_up_due_section", locale)}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">{t("follow_up_due_sub", locale)}</p>
          </div>
          <span className="rounded-md bg-black/20 px-2 py-1 text-[11px] text-orange-200">
            {safeFollowUpDueCount} {t("due_count", locale)}
          </span>
        </div>
        {safeFollowUpDueCount === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-500">{t("no_follow_up_due", locale)}</p>
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
                      {row.city} · {t("attempts_label", locale)} {attempts} · {t("due_label", locale)}{" "}
                      {relativeCalendarLabel(dueAt, renderNow, locale)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={followUpBusyLeadId === row.id}
                      onClick={() => void startFollowUpOutreach(row)}
                      className="rounded-md border border-[#25D366]/35 bg-[#25D366]/15 px-2.5 py-1.5 text-[11px] font-medium text-[#25D366] hover:bg-[#25D366]/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {followUpBusyLeadId === row.id
                        ? t("preparing", locale)
                        : t("follow_up", locale)}
                    </button>
                    <button
                      type="button"
                      onClick={() => markFollowUpSent(row.id)}
                      className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20"
                    >
                      {t("mark_follow_up_sent", locale)}
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
          <span className="text-xs text-zinc-400">
            ✓ {selectedLeadIds.length} {t("selected_count", locale)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addLeadIdsToDailyQueue(selectedLeadIds)}
              className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
            >
              {t("add_selected_to_queue", locale)}
            </button>
            <button
              type="button"
              onClick={() => void sendBulkAiMessages()}
              className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
            >
              {t("start_outreach_queue", locale)}
            </button>
            <button
              type="button"
              onClick={markSelectedAsContacted}
              className="rounded-md border border-sky-400/25 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
            >
              {t("mark_contacted", locale)}
            </button>
          </div>
          {outreachQueue.open && (
            <span className="text-xs text-zinc-400">
              {t("queue_word", locale)}{" "}
              {Math.min(outreachQueue.index + 1, outreachQueue.leadIds.length)}/
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
                ? t("hot_targets_import", locale)
                : t("hot_targets", locale)}
            </h2>
            <p className="text-xs text-zinc-500">{t("hot_targets_sub", locale)}</p>
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
              queueDisabled={safeActiveQueueCount >= DAILY_OUTREACH_LIMIT}
              fromLatestImport={useLatestImportHotLeads}
              outreachActivityLabel={getLastOutreachActivityLabel(lead.id, lead._s, renderNow)}
            />
          ))}
        </div>
      </section>

      {/* All Leads (collapsible) */}
      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              {t("all_leads", locale)}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">{t("all_leads_sub", locale)}</p>
            <p className="mt-1 text-[11px] text-zinc-500">{t("all_leads_explainer", locale)}</p>
          </div>
          <button
            onClick={() => setAllLeadsOpen((v) => !v)}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-200 transition hover:bg-white/10"
          >
            {allLeadsOpen ? t("hide", locale) : t("show", locale)}
          </button>
        </div>

        {allLeadsOpen && (
          <>
            <section className="flex flex-col gap-3 border-b border-white/5 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("search_placeholder", locale)}
                    className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) =>
                    setSort(e.target.value as "priority" | "readiness" | "hot" | "lead" | "name")
                  }
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 sm:w-auto"
                >
                  <option value="priority">{t("sort_outreach_priority", locale)}</option>
                  <option value="readiness">{t("sort_contact_readiness", locale)}</option>
                  <option value="hot">{t("sort_hot_score", locale)}</option>
                  <option value="lead">{t("sort_lead_score", locale)}</option>
                  <option value="name">{t("sort_name", locale)}</option>
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
                  {t("focus_mode", locale)}: {focusMode ? t("on", locale) : t("off", locale)}
                </button>
                <FilterChip
                  label={t("filter_all_types", locale)}
                  active={typeFilter === "all"}
                  onClick={() => setTypeFilter("all")}
                />
                {TYPES.map((ty) => (
                  <FilterChip
                    key={ty}
                    label={ty}
                    active={typeFilter === ty}
                    onClick={() => setTypeFilter(ty)}
                  />
                ))}
                <span className="mx-1 h-4 w-px bg-white/10" />
                <FilterChip
                  label={t("filter_all_status", locale)}
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                />
                {STATUS_ORDER.map((s) => (
                  <FilterChip
                    key={s}
                    label={statusUiLabel(s, locale)}
                    active={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                  />
                ))}
                <span className="mx-1 h-4 w-px bg-white/10" />
                <FilterChip
                  label={t("filter_contact_all", locale)}
                  active={contactChannelFilter === "all"}
                  onClick={() => setContactChannelFilter("all")}
                />
                <FilterChip
                  label={t("filter_contact_ready", locale)}
                  active={contactChannelFilter === "ready"}
                  onClick={() => setContactChannelFilter("ready")}
                />
                <FilterChip
                  label={t("filter_needs_finder", locale)}
                  active={contactChannelFilter === "needs_finder"}
                  onClick={() => setContactChannelFilter("needs_finder")}
                />
                <FilterChip
                  label={t("filter_no_contact", locale)}
                  active={contactChannelFilter === "none"}
                  onClick={() => setContactChannelFilter("none")}
                />
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-4 py-2">
              <FilterChip
                label={t("filter_last_import", locale)}
                active={allLeadsTimeFilter === "last_import"}
                onClick={() => {
                  setAllLeadsTimeFilter("last_import");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={t("today", locale)}
                active={allLeadsTimeFilter === "today"}
                onClick={() => {
                  setAllLeadsTimeFilter("today");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={t("filter_all_time", locale)}
                active={allLeadsTimeFilter === "all_time"}
                onClick={() => {
                  setAllLeadsTimeFilter("all_time");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={t("filter_follow_up_time", locale)}
                active={allLeadsTimeFilter === "follow_up"}
                onClick={() => {
                  setAllLeadsTimeFilter("follow_up");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={t("filter_todays_work", locale)}
                active={allLeadsTimeFilter === "today_work"}
                onClick={() => {
                  setAllLeadsTimeFilter("today_work");
                  setShowAllLeadsRows(false);
                }}
              />
              <span className="mx-1 h-4 w-px bg-white/10" />
              <FilterChip
                label={t("filter_focused", locale)}
                active={allLeadsTab === "focused"}
                onClick={() => {
                  setAllLeadsTab("focused");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={t("filter_new_tab", locale)}
                active={allLeadsTab === "new"}
                onClick={() => {
                  setAllLeadsTab("new");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={t("filter_hot", locale)}
                active={allLeadsTab === "hot"}
                onClick={() => {
                  setAllLeadsTab("hot");
                  setShowAllLeadsRows(false);
                }}
              />
              <FilterChip
                label={t("filter_all_tab", locale)}
                active={allLeadsTab === "all"}
                onClick={() => {
                  setAllLeadsTab("all");
                  setShowAllLeadsRows(false);
                }}
              />
            </div>

            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
              <span className="text-xs text-zinc-500 tabular-nums">
                {t("showing_leads", locale)} {visibleAllLeads.length} {t("of", locale)}{" "}
                {focusFiltered.length} {t("leads_word", locale)}
              </span>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectVisible(e.target.checked)}
                    aria-label="Select all visible leads"
                  />
                  {t("select_all_visible", locale)}
                </label>
                {focusMode && (
                  <span className="text-[11px] text-orange-300">{t("focus_hint", locale)}</span>
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
                    <th className="px-4 py-2.5 font-medium">{t("col_lead", locale)}</th>
                    <th className="px-4 py-2.5 font-medium">{t("col_location", locale)}</th>
                    <th className="px-4 py-2.5 font-medium">{t("col_imported", locale)}</th>
                    <th
                      className="px-4 py-2.5 font-medium"
                      title={t("contact_readiness_title", locale)}
                    >
                      {t("contact_readiness", locale)}
                    </th>
                    <th
                      className="px-4 py-2.5 font-medium"
                      title={t("hot_score_title", locale)}
                    >
                      {t("hot_score", locale)}
                    </th>
                    <th className="px-4 py-2.5 font-medium">{t("lead_score", locale)}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t("actions", locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleAllLeads.map((row, index) => {
                    const s = row._s;
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
                        } ${leadRowAcquisitionHighlightClass(row)} ${
                          openId === row.id ? "bg-white/[0.03]" : ""
                        }`}
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
                                  {buildImportedLabel(row.createdAt, row.firstImportedAt, renderNow, locale)}
                                </span>
                                <span className="inline-flex items-center rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-400/20">
                                  {getImportedBadgeText(row.createdAt, row.firstImportedAt, renderNow, locale)}
                                </span>
                                {isRecentlyImported && (
                                  <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                                    {t("session_import_badge", locale)}
                                  </span>
                                )}
                              </div>
                            </button>
                            <OutreachBadgesRow
                              row={row}
                              newImport={lastImportNewIds.includes(row.id)}
                              reimported={lastImportUpdatedIds.includes(row.id)}
                              inQueue={dailyOutreach.todayQueue.includes(row.id)}
                              syncedToAirtable={airtableSyncedLeadIds.includes(row.id)}
                              now={renderNow}
                            />
                            <WhyThisLeadChips
                              lead={row}
                              enrichment={contactFinderMap[row.id]}
                              limit={3}
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
                              renderNow,
                              locale,
                            )}
                          </div>
                          {(() => {
                            const lc =
                              s.lastContactedAt ?? s.contactedAt ?? null;
                            return lc ? (
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                {t("last_contact", locale)}:{" "}
                                {relativeCalendarLabel(lc, renderNow, locale)}
                              </div>
                            ) : null;
                          })()}
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {t("outreach_prefix", locale)}:{" "}
                            {getLastOutreachActivityLabel(row.id, s, renderNow)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <ScoreBar
                              score={rowReadinessWithFinder(row, contactFinderMap[row.id]).score}
                              tone="lead"
                            />
                            <span className="text-[10px] text-zinc-400">
                              {readinessCategoryUiLabel(row, contactFinderMap[row.id], locale)}
                            </span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 align-top ${hotStyle}`}>
                          <ScoreBar score={row.hotScore} tone="hot" />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <ScoreBar score={row.leadScore} tone="lead" />
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
                            <LeadInstagramAction
                              instagram={row.instagram}
                              acquisition={row.acquisitionIntelligence}
                            />
                            <button
                              type="button"
                              disabled={s.doNotContact}
                              onClick={() => void startAiMessage(row)}
                              title="Kişiselleştirilmiş AI mesajı"
                              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:text-xs"
                            >
                              <IconSpark className="h-3.5 w-3.5 shrink-0" />
                              {t("ai_message", locale)}
                            </button>
                            {!s.doNotContact &&
                              (isFollowUpDue(s, renderNow) ||
                                s.status === "needs_follow_up") && (
                                <button
                                  type="button"
                                  onClick={() => void startFollowUpOutreach(row)}
                                  title="Kısa hatırlatma mesajı ve WhatsApp"
                                  className="inline-flex h-10 shrink-0 items-center rounded-md border border-orange-400/30 bg-orange-500/10 px-2 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/20 sm:h-8 sm:text-xs"
                                >
                                  {t("follow_up", locale)}
                                </button>
                              )}
                            <button
                              type="button"
                              disabled={(() => {
                                const now = renderNow;
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
                                    safeActiveQueueCount >= DAILY_OUTREACH_LIMIT)
                                );
                              })()}
                              title="Add to today’s outreach queue"
                              onClick={() => addLeadIdsToDailyQueue([row.id])}
                              className="inline-flex h-10 shrink-0 items-center rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8"
                            >
                              {t("queue_short", locale)}
                            </button>
                            <button
                              onClick={() => setOpenId(row.id)}
                              title="Open notes"
                              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-md border transition sm:h-8 sm:w-8 ${
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
                        {t("no_leads_filters", locale)}
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
                  {showAllLeadsRows ? t("show_less", locale) : t("show_more", locale)}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <footer className="pb-8 pt-2 text-center text-[11px] text-zinc-600">
        {t("footer_mvp", locale)}
      </footer>

      <AiMessageModal
        state={aiMessageModal}
        onClose={() => setAiMessageModal(null)}
        onRetry={(l) => void regenerateAiMessage(l)}
        onMarkContacted={recordWhatsAppOutreach}
        queuedForOutreach={
          aiMessageModal ? dailyOutreach.todayQueue.includes(aiMessageModal.lead.id) : false
        }
        queueStatus={
          aiMessageModal ? (dailyOutreach.queueItems[aiMessageModal.lead.id]?.queueStatus ?? null) : null
        }
        onMarkPrepared={markAiMessagePrepared}
        onMarkOpened={markAiMessageOpened}
        onMessageCopied={logAiMessageCopied}
        onWhatsappOpened={logWhatsappOpened}
      />

      {outreachQueue.open && (outreachQueue.complete || queueCurrentLead) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={t("close_aria", locale)}
            onClick={closeOutreachQueue}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950 shadow-2xl ring-1 ring-white/5">
            <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  {outreachQueue.complete
                    ? t("session_complete", locale)
                    : t("todays_outreach_session", locale)}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {outreachQueue.complete
                    ? t("summary_for_run", locale)
                    : `${outreachQueue.index + 1} / ${outreachQueue.leadIds.length}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeOutreachQueue}
                className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                aria-label={t("close_aria", locale)}
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
                  <p className="text-sm font-medium text-zinc-100">{t("nice_work", locale)}</p>
                  <ul className="mt-3 space-y-1.5 text-xs text-zinc-400">
                    <li>
                      {t("sent_label", locale)}: {outreachQueue.sessionStats.sent}
                    </li>
                    <li>
                      {t("skipped", locale)}: {outreachQueue.sessionStats.skipped}
                    </li>
                    <li>
                      {t("dnc_label", locale)}: {outreachQueue.sessionStats.dnc}
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={closeOutreachQueue}
                    className="mt-4 rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400"
                  >
                    {t("close", locale)}
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
                        <span className="text-zinc-500">{t("lead_score_lower", locale)}</span>{" "}
                        <span className="font-medium text-zinc-200">{queueCurrentLead.leadScore}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">{t("hot_score_lower", locale)}</span>{" "}
                        <span className="font-medium text-zinc-200">{queueCurrentLead.hotScore}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">{t("readiness_lower", locale)}</span>{" "}
                        <span className="font-medium text-zinc-200">
                          {queueCurrentReadiness?.score ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">{t("contact_quality", locale)}</span>{" "}
                        <span className="font-medium text-zinc-200">
                          {contactQualityUiLabel(queueCurrentLead.contactQuality, locale)}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">{t("best_contact", locale)}</span>{" "}
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
                      {t("pipeline", locale)}: {statusUiLabel(queueCurrentLead._s.status, locale)}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {t("queue_status", locale)}:{" "}
                      {queueMessageStatusUiLabel(
                        dailyOutreach.queueItems[queueCurrentId!]?.queueStatus ?? "queued",
                        locale,
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-400">
                      {t("selected_because", locale)}
                      <ul className="mt-1 space-y-0.5 text-zinc-300">
                        {(queueCurrentReadiness?.reasons.slice(0, 3) ?? []).map((reason) => (
                          <li key={reason}>✓ {reason}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                      {t("ai_message_preview", locale)}
                    </div>
                    {queueCurrentId &&
                      dailyOutreach.queueItems[queueCurrentId]?.preparedVariants && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {(
                            [
                              { id: "direct", label: t("style_direct", locale) },
                              { id: "soft", label: t("style_soft", locale) },
                              { id: "premium", label: t("style_consultative", locale) },
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
                      <p className="text-zinc-400">{t("generating_message", locale)}</p>
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
                        placeholder={t("prepare_placeholder", locale)}
                        className="min-h-28 w-full rounded-md border border-white/10 bg-black/20 p-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-400/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                      />
                    )}
                  </div>
                  {(queueCurrentLead._s.contactAttempts ?? 0) >= 3 && (
                    <p className="text-[11px] text-amber-300">{t("max_contact_warning", locale)}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void prepareQueueLeadMessage()}
                      disabled={outreachQueue.loading}
                      className="rounded-md border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {outreachQueue.loading ? t("preparing", locale) : t("prepare_message", locale)}
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
                      {queueCurrentPhone
                        ? t("open_whatsapp", locale)
                        : t("no_whatsapp_contact", locale)}
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
                      {t("copy_message", locale)}
                    </button>
                    <button
                      type="button"
                      onClick={() => markQueueLeadSent()}
                      className="rounded-md border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
                    >
                      {t("mark_sent", locale)}
                    </button>
                    <button
                      type="button"
                      onClick={() => skipQueueLead()}
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
                    >
                      {t("action_skip", locale)}
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
                      {t("remove_from_queue", locale)}
                    </button>
                    <button
                      type="button"
                      onClick={() => markQueueLeadDnc()}
                      className="rounded-md border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                    >
                      {t("mark_dnc_long", locale)}
                    </button>
                    <button
                      type="button"
                      onClick={() => markQueueLeadInvalidWhatsapp()}
                      className="rounded-md border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                    >
                      {t("invalid_whatsapp", locale)}
                    </button>
                    <button
                      type="button"
                      onClick={() => goNextInQueue(false)}
                      className="rounded-md border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20"
                    >
                      {t("next_lead", locale)}
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
              aria-label={t("drawer_close_aria", locale)}
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
                outreachActivityLabel={getLastOutreachActivityLabel(
                  openLead.id,
                  openLead._s,
                  renderNow,
                )}
                importIntelligenceLabels={[
                  ...(lastImportNewIds.includes(openLead.id)
                    ? [t("import_label_new_import", locale)]
                    : []),
                  ...(lastImportUpdatedIds.includes(openLead.id)
                    ? [t("import_label_reimported", locale)]
                    : []),
                  ...((openLead._s.contactAttempts ?? 0) > 0
                    ? [t("import_label_contacted_before", locale)]
                    : []),
                  ...((openLead._s.contactAttempts ?? 0) >= 2
                    ? [t("import_label_followed_up_before", locale)]
                    : []),
                  ...(dailyOutreach.todayQueue.includes(openLead.id)
                    ? [t("import_label_in_queue", locale)]
                    : []),
                ]}
                now={renderNow}
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
  locale,
}: {
  label: string;
  value: number;
  reasons: string[];
  tone: "lead" | "hot";
  locale: Locale;
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
                  {scoringChipReasonUiLabel(r, locale)}
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
