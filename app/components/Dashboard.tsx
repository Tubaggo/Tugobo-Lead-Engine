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
  type IcpAlignmentProfile,
  appendLeadActivity,
  type LeadActivity,
  type OpportunityTier,
  OPPORTUNITY_TIER_LABELS,
  OPPORTUNITY_REASON_LABELS,
  computeLeadLifecycleStatus,
  type LeadLifecycleStatus,
  computeTodayActionStatus,
  type TodayActionStatus,
} from "@/app/lib/leads";
import type { SignalSourceKey } from "@/app/lib/signal-verification";
import { normalizePhoneNumber } from "@/app/lib/intelligence/whatsapp-verification";
import { extractDigitsFromWhatsAppUrl } from "@/app/lib/whatsapp-link-validation";
import {
  makePlacesImportSessionKey,
  PLACES_RATE_LIMIT_USER_MESSAGE,
} from "@/app/lib/places-import-session";
import {
  leadDedupeKey,
} from "@/app/lib/generate";
import type {
  LeadAiInsight,
  LeadInterpretation,
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
import { buildSalesSignalSourceBullets } from "@/app/lib/intelligence/signal-source-bullets";
import { hasNewVerifiableEnrichmentSince } from "@/app/lib/lead-enrichment-fingerprint";
import ImportPanel, {
  type ImportRequest,
  type ImportResult,
  isIcpTargetAudience,
} from "@/app/components/ImportPanel";
import { ICP_SEARCH_CONFIGS, filterLeadsForTargetAudience } from "@/app/lib/places-import";
import { LocaleToggle, useLocale } from "@/app/components/LocaleProvider";
import AppNav from "@/app/components/AppNav";
import FollowUpsWorkspace from "@/app/components/FollowUpsWorkspace";
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
import Image from "next/image";
import {
  computeCommercialPackaging,
  type CommercialPackage,
} from "@/lib/commercial/commercial-packaging";
import {
  computeExpectedRevenue,
  type ExpectedRevenueResult,
} from "@/lib/revenue/expected-revenue";
import {
  computeExpectedRevenueRanking,
  type ExpectedRevenueRankingResult,
} from "@/lib/revenue/expected-revenue-ranking";

const STORAGE_KEY = "tugobo-lead-engine:state-v1";
const EXTRA_LEADS_KEY = "tugobo-lead-engine:extra-leads-v1";
const IMPORTED_LEADS_V2_KEY = "tugobo-lead-engine:imported-leads-v2";
const LEAD_ENRICHMENT_OVERRIDES_KEY = "tugobo-lead-engine:lead-enrichment-overrides-v1";
const LAST_IMPORT_KEY = "tugobo-lead-engine:last-import-v1";
const IMPORT_CACHE_KEY = "tugobo-lead-engine:import-cache-v1";
const CONTACT_FINDER_MAP_KEY = "tugobo-lead-engine:contact-finder-map-v1";
const IMPORT_META_KEY = "tugobo-lead-engine:import-meta-v1";
const DAILY_OUTREACH_STORAGE_KEY = "tugobo-lead-engine:daily-outreach-v1";
const OUTREACH_LOG_KEY = "tugobo-lead-engine:outreach-log-v1";
const AI_INTERPRETATION_CACHE_KEY = "tugobo-lead-engine:ai-interpretation-cache-v1";
/** Max leads staged for today's outreach queue (local calendar day). */
const DAILY_OUTREACH_LIMIT = 20;
const AUTO_QUEUE_COOLDOWN_DAYS = 2;
const AUTO_QUEUE_RECENT_CONTACT_DAYS = 7;
const IMPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LEGACY_CREATED_AT_TS = Date.UTC(2024, 0, 1, 0, 0, 0, 0);

type AiInterpretationCacheValue = Pick<
  LeadInterpretation,
  | "summary"
  | "acquisitionProfile"
  | "recommendedApproach"
  | "salesAngle"
  | "channelRecommendation"
  | "confidenceLevel"
> & {
  createdAt: number;
  sourceLabel: "ai" | "rules";
};

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

type SmartSegmentId = "hot" | "icp" | "whatsapp" | "digital" | "enterprise" | "growth" | "revenue_priority";

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

type ContactFinderInput = {
  website?: string;
  phone?: string;
  instagram?: string;
};

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

function loadLeadEnrichmentOverrides(): Record<string, ScoredLead> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEAD_ENRICHMENT_OVERRIDES_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    const out: Record<string, ScoredLead> = {};
    for (const [id, val] of Object.entries(p as Record<string, unknown>)) {
      if (!id.trim() || typeof val !== "object" || val === null) continue;
      out[id] = sanitizeScoredLeadForUi(val as ScoredLead);
    }
    return out;
  } catch {
    return {};
  }
}

function saveLeadEnrichmentOverrides(map: Record<string, ScoredLead>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEAD_ENRICHMENT_OVERRIDES_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function leadTableRowToScoredLead(row: LeadTableRow): ScoredLead {
  const { _s, ...rest } = row;
  return rest as ScoredLead;
}

function mergeReEnrichedLeadPreserveImportMeta(
  prev: ScoredLead,
  apiLead: ScoredLead,
): ScoredLead {
  return {
    ...apiLead,
    id: prev.id,
    firstImportedAt: prev.firstImportedAt,
    lastImportedAt: prev.lastImportedAt,
    importSessionId: prev.importSessionId,
    createdAt: prev.createdAt,
    doNotContact: prev.doNotContact,
    whatsappInvalid: prev.whatsappInvalid,
    pipelineStage: prev.pipelineStage,
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
    let timeline = appendLeadActivity(inc.activityTimeline, "lead_imported", "Lead içe aktarıldı");
    if (inc.businessOwnershipType === "chain") {
      timeline = appendLeadActivity(timeline, "chain_detected", "Kurumsal zincir tespit edildi");
    }
    const novel: ScoredLead = {
      ...inc,
      firstImportedAt: first,
      lastImportedAt: importTs,
      importSessionId,
      createdAt:
        typeof inc.createdAt === "number" && Number.isFinite(inc.createdAt) ? inc.createdAt : importTs,
      activityTimeline: timeline,
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

// ══════════════════════════════════════════════════════════════════════════
// v1.6 — DAILY OPPORTUNITY QUEUE
// A daily prioritization LAYER over existing scores. It does NOT replace
// verifiedOpportunityScore and does NOT introduce a new scoring engine — it
// reuses existing fields to answer "Bugün hangi işletmelerle iletişime
// geçmeliyim?" and ranks today's candidates 0–100 (`dailyQueuePriority`).
// ══════════════════════════════════════════════════════════════════════════

/** Verified-channel snapshot reused by the daily queue (no Contact Center dup). */
type QuickChannels = {
  waUrl: string | null;
  phone: string | null;
  websiteUrl: string | null;
  bestLabel: string;
};

/**
 * Minimal verified-channel resolver mirroring {@link LeadContactCenter}'s
 * priority order (verified wa.me link > finder WhatsApp > listing phone, etc.)
 * so queue shortcuts use the same single source of truth as the Contact Center.
 */
function resolveQuickChannels(
  lead: ScoredLead & { whatsappInvalid?: boolean },
  finder: ContactFinderResult | undefined,
  locale: Locale,
): QuickChannels {
  const tr = locale === "tr";
  const v = lead.signalVerification;

  const waSourceUrl = v?.whatsappSourceUrl ?? null;
  const isWaDirectLink =
    !!waSourceUrl &&
    /^https?:\/\/(wa\.me|api\.whatsapp\.com|[^/]*whatsapp\.com)/i.test(waSourceUrl);
  const waFromFinder =
    finder &&
    (finder.bestContactType === "VERIFIED_WHATSAPP" ||
      finder.bestContactType === "whatsapp" ||
      finder.bestContactType === "GENERATED_WHATSAPP")
      ? finder.bestContactValue
      : null;
  const waUrl = (() => {
    if (lead.whatsappInvalid) {
      // Manually flagged invalid; only honor an explicit verified wa.me link.
      return isWaDirectLink ? waSourceUrl! : null;
    }
    if (isWaDirectLink) return waSourceUrl!;
    if (waFromFinder) {
      const d = normalizePhoneForWhatsApp(waFromFinder);
      if (d) return `https://wa.me/${d}`;
    }
    if (lead.phone) {
      const d = normalizePhoneForWhatsApp(lead.phone);
      if (d) return `https://wa.me/${d}`;
    }
    return null;
  })();

  const phone = lead.phone?.trim() ? lead.phone : null;

  const websiteUrl = (() => {
    if (v?.websiteSourceUrl) return v.websiteSourceUrl;
    if (lead.website) {
      return lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
    }
    if (lead.websiteCandidateUrl) return lead.websiteCandidateUrl;
    return null;
  })();
  const webState = v?.websiteVerification ?? (websiteUrl ? "reachable" : "not_found");
  const showWebsite = !!websiteUrl && webState !== "not_found" && webState !== "broken";

  const bestLabel =
    waUrl !== null
      ? v?.whatsappVerification === "verified"
        ? tr
          ? "WhatsApp doğrulandı"
          : "WhatsApp verified"
        : "WhatsApp"
      : phone
        ? tr
          ? "Telefon"
          : "Phone"
        : showWebsite
          ? tr
            ? "Web Sitesi"
            : "Website"
          : tr
            ? "Doğrudan kanal yok"
            : "No direct channel";

  return { waUrl, phone, websiteUrl: showWebsite ? websiteUrl : null, bestLabel };
}

/**
 * `dailyQueuePriority` (0–100). Ranking layer only — a weighted blend of
 * EXISTING scores/state (verifiedOpportunityScore, opportunityTier, ICP fit,
 * verified channels, reservation CTA, freshness, follow-up urgency). Not a
 * replacement for verifiedOpportunityScore.
 */
function computeDailyQueuePriority(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
  now: number,
): number {
  const opp =
    typeof row.verifiedOpportunityScore === "number"
      ? row.verifiedOpportunityScore
      : typeof row.icpFitScore === "number"
        ? row.icpFitScore
        : row.hotScore ?? 0;
  const icp = typeof row.icpFitScore === "number" ? row.icpFitScore : 0;

  // Anchor on existing scores (0..80).
  let p = opp * 0.6 + icp * 0.2;

  switch (row.opportunityTier) {
    case "elite":
      p += 10;
      break;
    case "high":
      p += 7;
      break;
    case "medium":
      p += 4;
      break;
    case "low":
      p += 1;
      break;
  }

  const v = row.signalVerification;
  const ch = resolveQuickChannels(row, finder, "tr");
  if (v?.whatsappVerification === "verified" || finder?.bestContactType === "VERIFIED_WHATSAPP") {
    p += 8;
  } else if (v?.whatsappVerification === "likely" || ch.waUrl) {
    p += 4;
  }
  if (v?.websiteVerification === "verified") p += 4;
  else if (ch.websiteUrl) p += 2;

  if (v?.reservationSignal === "verified") p += 6;
  else if (v?.reservationSignal === "detected") p += 3;

  const freshIso = row.lastVerificationAt ?? row.lastOpportunityEvaluationAt;
  if (freshIso) {
    const ts = Date.parse(freshIso);
    if (Number.isFinite(ts)) {
      const ageDays = (now - ts) / (24 * 60 * 60 * 1000);
      if (ageDays <= 7) p += 4;
      else if (ageDays <= 30) p += 2;
    }
  }

  if (isFollowUpDue(row._s, now)) p += 5;

  if (p < 0) p = 0;
  if (p > 100) p = 100;
  return Math.round(p);
}

/** Short reason (Sebep) for a queue item — reuses opportunity reason labels. */
function dailyQueueReasonText(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
  now: number,
  locale: Locale,
): string {
  const tr = locale === "tr";
  const parts: string[] = [];

  const reasons = (row.opportunityReasons ?? [])
    .map((k) => {
      const m = OPPORTUNITY_REASON_LABELS[k];
      return m ? (tr ? m.tr : m.en) : null;
    })
    .filter((x): x is string => Boolean(x));
  if (reasons.length > 0) parts.push(reasons[0]);

  const v = row.signalVerification;
  if (v?.reservationSignal === "verified" || v?.reservationSignal === "detected") {
    parts.push(tr ? "doğrudan rezervasyon sinyali" : "direct reservation signal");
  } else if (typeof row.icpFitScore === "number" && row.icpFitScore >= 70) {
    parts.push(tr ? "yüksek ICP uyumu" : "high ICP fit");
  }

  if (isFollowUpDue(row._s, now)) {
    parts.unshift(tr ? "takip zamanı geldi" : "follow-up due");
  }

  if (parts.length === 0) {
    const ch = resolveQuickChannels(row, finder, locale);
    if (ch.waUrl) parts.push(tr ? "WhatsApp erişilebilir" : "WhatsApp reachable");
    else if (ch.phone) parts.push(tr ? "telefon mevcut" : "phone available");
    else parts.push(tr ? "değerlendirilmeye değer" : "worth evaluating");
  }

  const text = parts.slice(0, 2).join(" + ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A follow-up is "scheduled" when in the follow-up workflow or has a target time. */
function hasScheduledFollowUp(s: LeadStatusUpdate): boolean {
  if (s.doNotContact) return false;
  if (s.status === "needs_follow_up") return true;
  return (
    typeof s.nextFollowUpAt === "number" &&
    Number.isFinite(s.nextFollowUpAt) &&
    s.nextFollowUpAt > 0
  );
}

/** Exclusion rules: won/lost, DNC, contacted today, or no usable outbound path. */
function isExcludedFromDailyQueue(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
  now: number,
): boolean {
  const s = row._s;
  if (s.status === "won" || s.status === "lost") return true;
  if (s.doNotContact) return true;
  if (wasContactedToday(s, now)) return true;
  const contact = hasValidOutboundContact(row, finder);
  if (!contact.any) return true;
  // Invalid WhatsApp counts as excluded only when no other channel exists.
  if (s.whatsappInvalid && !contact.whatsapp) {
    const hasOther = Boolean(row.phone?.trim() || row.instagram?.trim() || row.website?.trim());
    if (!hasOther) return true;
  }
  return false;
}

/** View-model for one daily-queue candidate (computed once, rendered as-is). */
type QueueCandidate = {
  row: LeadTableRow;
  priority: number;
  reasonText: string;
  channels: QuickChannels;
  inOutreachQueue: boolean;
  followUpScheduled: boolean;
  followUpDue: boolean;
  dueAt: number | null;
};

type DailyQueuePartition = {
  todays: QueueCandidate[];
  followUps: QueueCandidate[];
  highNoContact: QueueCandidate[];
  lowPriority: QueueCandidate[];
  total: number;
};

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

const COMPACT_SIGNAL_LIMIT = 3;
const DEFAULT_CHIP_PRIORITY = 40;
const CHIP_DISPLAY_PRIORITY: Record<string, number> = {
  dnc: 1,
  fudue: 2,
  "opp-vhigh": 3,
  hipri: 4,
  "opp-high": 5,
  risk: 6,
  "priority-bucket": 7,
  "recommended-action": 8,
  inq: 9,
  ctoday: 10,
  "ig-act": 11,
  readiness: 12,
  quality: 13,
  "ig-verified": 14,
  "ota-high-v2": 15,
  "booking-gap-v2": 16,
  cbefore: 17,
  fuonce: 18,
  newimp: 19,
  spam: 20,
  new: 21,
  reimp: 22,
  "ig-possible": 23,
  "ig-broken": 24,
  "ig-manual": 25,
  airtable: 26,
};

function OutreachBadgesRow({
  row,
  newImport,
  reimported,
  inQueue,
  syncedToAirtable = false,
  now,
  compact = false,
}: {
  row: LeadTableRow;
  newImport?: boolean;
  reimported?: boolean;
  inQueue?: boolean;
  syncedToAirtable?: boolean;
  now: number;
  compact?: boolean;
}) {
  const { locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
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

  function renderChip(c: { key: string; cls: string; label: string; href?: string; title?: string }) {
    return c.href ? (
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
    );
  }

  if (compact && !expanded) {
    const sorted = [...chips].sort(
      (a, b) =>
        (CHIP_DISPLAY_PRIORITY[a.key] ?? DEFAULT_CHIP_PRIORITY) -
        (CHIP_DISPLAY_PRIORITY[b.key] ?? DEFAULT_CHIP_PRIORITY),
    );
    const visible = sorted.slice(0, COMPACT_SIGNAL_LIMIT);
    const hiddenCount = chips.length - COMPACT_SIGNAL_LIMIT;
    return (
      <div className="mt-0.5 flex w-full flex-wrap items-center gap-1.5">
        {visible.map(renderChip)}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-inset ring-zinc-600/40 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            +{hiddenCount} {locale === "tr" ? "sinyal daha" : "more signals"}
          </button>
        )}
      </div>
    );
  }

  const chipNodes: ReactNode[] = chips.map(renderChip);
  return (
    <div className="mt-0.5 flex w-full flex-wrap items-center gap-1.5">
      {chipNodes}
      {compact && expanded && chips.length > COMPACT_SIGNAL_LIMIT && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-inset ring-zinc-600/40 transition-colors hover:bg-white/5 hover:text-zinc-200"
        >
          {locale === "tr" ? "↑ Kapat" : "↑ Collapse"}
        </button>
      )}
    </div>
  );
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

/** v1.7 — Lifecycle badge (Yeni / Zenginleştirildi / Doğrulandı / Sıcak Fırsat). */
function LifecycleBadge({ lifecycle }: { lifecycle: LeadLifecycleStatus }) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  type Config = { label: string; cls: string };
  const config: Partial<Record<LeadLifecycleStatus, Config>> = {
    NEW: {
      label: tr ? "Yeni" : "New",
      cls: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
    },
    ENRICHED: {
      label: tr ? "Zenginleştirildi" : "Enriched",
      cls: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    },
    VERIFIED: {
      label: tr ? "Doğrulandı" : "Verified",
      cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    },
    HOT_OPPORTUNITY: {
      label: tr ? "Sıcak Fırsat" : "Hot Opportunity",
      cls: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40",
    },
  };
  const item = config[lifecycle];
  if (!item) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${item.cls}`}
    >
      {item.label}
    </span>
  );
}

/** v1.8 — Today action status badge for the execution layer. */
function ActionStatusBadge({ action }: { action: TodayActionStatus }) {
  type Cfg = { label: string; cls: string };
  const configs: Partial<Record<TodayActionStatus, Cfg>> = {
    HOT_NOW: {
      label: "Sıcak Fırsat",
      cls: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40",
    },
    DEMO_READY: {
      label: "Demo Hazır",
      cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    },
    FOLLOW_UP_DUE: {
      label: "Takip Zamanı",
      cls: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    },
    NEEDS_CONTACT: {
      label: "İletişim Kur",
      cls: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    },
  };
  const c = configs[action];
  if (!c) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${c.cls}`}
    >
      {c.label}
    </span>
  );
}

function todayActionReasonText(
  lead: LeadTableRow,
  action: TodayActionStatus,
  tr: boolean,
): string {
  if (action === "DEMO_READY") return tr ? "Demo için uygun" : "Ready for demo";
  if (action === "FOLLOW_UP_DUE") return tr ? "Takip zamanı geldi" : "Follow-up time reached";
  const v = lead.signalVerification;
  if (v?.reservationSignal === "verified" || v?.reservationSignal === "detected")
    return tr ? "Rezervasyon CTA bulundu" : "Reservation CTA found";
  if (v?.websiteVerification === "verified")
    return tr ? "Web sitesi doğrulandı" : "Website verified";
  if (v?.whatsappVerification === "verified")
    return tr ? "WhatsApp doğrulandı" : "WhatsApp verified";
  return tr ? "Yüksek fırsat skoru" : "High opportunity score";
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
        broken ? t("instagram_link_broken_long", locale) : t("possible_instagram", locale)
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

/** Lead detail chips: nuanced website / WhatsApp / Instagram copy (TR + EN). */
type LeadDetailConfidenceContext = Pick<
  ScoredLead,
  | "website"
  | "hasOwnWebsite"
  | "instagram"
  | "hasInstagram"
  | "phone"
  | "extractedPhones"
  | "extractedSocialLinks"
>;

function websiteConfidenceDisplayLabel(
  raw: string | undefined,
  lead: LeadDetailConfidenceContext | undefined,
  locale: Locale,
): string {
  const hasUrl = Boolean(lead?.website?.trim());
  const c = raw ?? "missing";
  if (locale === "tr") {
    if (c === "confirmed") return "Web sitesi doğrulandı";
    if (c === "likely") return hasUrl ? "Web sitesi muhtemelen erişilebilir" : "Web sinyali olası";
    if (c === "weak" || c === "unknown")
      return hasUrl ? "Web sitesi var, doğrulama gerekli" : "Web sinyali sınırlı; kontrol önerilir";
    return hasUrl ? "Web sitesi var, doğrulama gerekli" : "Kayıtta web adresi yok";
  }
  if (c === "confirmed") return "Website looks verified";
  if (c === "likely") return hasUrl ? "Website likely reachable" : "Website signal probable";
  if (c === "weak" || c === "unknown") return hasUrl ? "Website on file — verify" : "Limited website signal";
  return hasUrl ? "Website on file — verify" : "No website on record";
}

function whatsappConfidenceDisplayLabel(
  raw: string | undefined,
  lead: LeadDetailConfidenceContext | undefined,
  locale: Locale,
): string {
  const c =
    raw === "missing" || raw === "unknown" ? "none" : (raw ?? "none");
  const hasWaPath = lead?.phone ? normalizePhoneForWhatsApp(lead.phone) !== null : false;
  if (locale === "tr") {
    if (c === "confirmed") return "WhatsApp doğrulandı";
    if (c === "likely") return "WhatsApp olası";
    if (c === "weak") return "Kontrol gerekli";
    return hasWaPath ? "WhatsApp olası – kontrol gerekli" : "WhatsApp yok";
  }
  if (c === "confirmed") return "WhatsApp verified";
  if (c === "likely") return "WhatsApp likely";
  if (c === "weak") return "Manual check";
  return hasWaPath ? "Possible WhatsApp path – check needed" : "No WhatsApp signal";
}

function instagramConfidenceDisplayLabel(
  raw: unknown,
  lead: LeadDetailConfidenceContext | undefined,
  locale: Locale,
): string {
  const hasHandle = Boolean(lead?.instagram?.trim()) || lead?.hasInstagram;
  const hasIgUrl = (lead?.extractedSocialLinks ?? []).some((u) => /instagram\.com/i.test(u));
  if (typeof raw === "number") {
    if (locale === "tr") {
      if (raw >= 80) return "Instagram sinyali güçlü; doğrulanmalı";
      if (raw >= 50) return "Olası Instagram hesabı";
      return "Manuel kontrol gerekli";
    }
    if (raw >= 80) return "Strong Instagram signal — verify";
    if (raw >= 50) return "Likely Instagram presence";
    return "Manual check recommended";
  }
  const c = typeof raw === "string" ? raw : "likely";
  if (locale === "tr") {
    if (c === "confirmed") return "Instagram bağlantısı güçlü";
    if (c === "likely") return hasHandle || hasIgUrl ? "Olası Instagram hesabı" : "Instagram sinyali olası";
    if (c === "weak" || c === "unknown") return "Manuel kontrol gerekli";
    return hasHandle || hasIgUrl ? "Olası Instagram hesabı" : "Instagram bilgisi sınırlı";
  }
  if (c === "confirmed") return "Instagram link looks strong";
  if (c === "likely") return hasHandle || hasIgUrl ? "Likely Instagram account" : "Instagram signal probable";
  if (c === "weak" || c === "unknown") return "Manual check recommended";
  return hasHandle || hasIgUrl ? "Likely Instagram account" : "Limited Instagram info";
}

function normalizeWhatsappConfidenceUi(raw: string | undefined): string {
  if (raw === "missing" || raw === "unknown") return "none";
  return raw ?? "none";
}

function whatsappChipToneClass(c: string): string {
  switch (c) {
    case "confirmed":
      return "border-emerald-400/30 bg-emerald-500/12 text-emerald-100";
    case "likely":
      return "border-amber-300/40 bg-amber-500/14 text-amber-100";
    case "weak":
      return "border-orange-400/35 bg-orange-500/12 text-orange-100";
    default:
      return "border-zinc-500/25 bg-zinc-500/10 text-zinc-400";
  }
}

/**
 * One-line acquisition summary plus optional expansion for structured signals
 * (kept compact when {@link isAcquisitionUiMinimal}).
 */
function AcquisitionIntelligencePanel({
  acquisition,
  lead,
}: {
  acquisition?: AcquisitionIntelligenceProfile;
  /** When set (lead detail), website / WhatsApp / Instagram chip values use nuanced copy. */
  lead?: LeadDetailConfidenceContext | null;
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

  const confidenceToneClass = (value: string): string => {
    switch (value) {
      case "confirmed":
        return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
      case "likely":
        return "border-sky-400/25 bg-sky-500/10 text-sky-200";
      case "weak":
      case "unknown":
        return "border-amber-400/25 bg-amber-500/10 text-amber-200";
      default:
        return "border-zinc-500/25 bg-zinc-500/10 text-zinc-300";
    }
  };

  const confidenceLabel = (v: unknown): string => {
    if (v === "confirmed") return t("confidence_confirmed", locale);
    if (v === "likely") return t("confidence_likely", locale);
    if (v === "weak") return t("confidence_weak", locale);
    if (v === "missing" || v === "none") return t("confidence_missing", locale);
    if (typeof v === "number") {
      if (v >= 80) return t("confidence_confirmed", locale);
      if (v >= 50) return t("confidence_likely", locale);
      if (v >= 25) return t("confidence_weak", locale);
      return t("confidence_missing", locale);
    }
    return String(v ?? "");
  };

  const maturityLabel = (v: unknown): string => {
    if (v === "low") return t("maturity_low", locale);
    if (v === "medium") return t("maturity_medium", locale);
    if (v === "high") return t("maturity_high", locale);
    return String(v ?? "");
  };

  const confidenceItems: Array<{ key: string; label: string; value: string }> = [
    {
      key: "website",
      label: t("chip_conf_website", locale),
      value: String(acquisition.websiteConfidence ?? "missing"),
    },
    {
      key: "instagram",
      label: t("chip_conf_instagram", locale),
      value: String(acquisition.instagramConfidence ?? "likely"),
    },
    {
      key: "whatsapp",
      label: t("chip_conf_whatsapp", locale),
      value: normalizeWhatsappConfidenceUi(acquisition.whatsappConfidence),
    },
    {
      key: "ota",
      label: t("chip_conf_ota", locale),
      value: String(acquisition.otaConfidence ?? "missing"),
    },
    {
      key: "ads",
      label: t("chip_conf_ads", locale),
      value: String(acquisition.adsLikelihood ?? "weak"),
    },
  ];

  if (minimal && !hasDetail) return null;
  if (!summary && !hasDetail) return null;

  return (
    <div className="rounded-md border border-teal-400/20 bg-teal-950/40 px-3 py-2 text-[11px] ring-1 ring-inset ring-teal-500/15">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium uppercase tracking-wider text-teal-200/90">
            {t("acq_intel_title", locale)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-200">
              {t("chip_acq_maturity", locale)}{" "}
              <span className="ml-1 uppercase">
                {maturityLabel(acquisition.acquisitionMaturity)}
              </span>
            </span>
            {confidenceItems.map((item) => {
              const chipText =
                lead && item.key === "website"
                  ? websiteConfidenceDisplayLabel(acquisition.websiteConfidence, lead, locale)
                  : lead && item.key === "whatsapp"
                    ? whatsappConfidenceDisplayLabel(acquisition.whatsappConfidence, lead, locale)
                    : lead && item.key === "instagram"
                      ? instagramConfidenceDisplayLabel(
                          acquisition.instagramConfidence,
                          lead,
                          locale,
                        )
                      : confidenceLabel(item.value);
              const chipClass =
                item.key === "whatsapp"
                  ? whatsappChipToneClass(
                      normalizeWhatsappConfidenceUi(acquisition.whatsappConfidence),
                    )
                  : confidenceToneClass(item.value);
              return (
                <span
                  key={item.key}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass}`}
                >
                  {item.label}: {chipText}
                </span>
              );
            })}
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
                title={t("detail_whatsapp_disabled_title", locale)}
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
  const { locale } = useLocale();
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
      title={t("detail_whatsapp_disabled_title", locale)}
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
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accentRing[accent]}`}
      />
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-50">
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-zinc-500">{hint}</div>}
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
  const lifecycle = computeLeadLifecycleStatus(lead, { status });
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
        <div className="flex items-center gap-1.5">
          <StatusPill status={status} />
          <LifecycleBadge lifecycle={lifecycle} />
        </div>
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
  // Turkish equivalents after localization sprint (previous English keys are stale)
  "Rezervasyon taleplerini daha hızlı karşılamak için pratik bir yöntem sunun.",
  "Talep yönetimi ve direkt rezervasyonun misafir beklentileriyle örtüşüp örtüşmediğini değerlendirin.",
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
  // Match Turkish pain strings (localized in previous sprint)
  if (topPain.includes("yanıt") || topPain.includes("iletişim") || topPain.includes("gecikme")) {
    return "Reduce response delays during peak inquiry hours.";
  }
  if (topPain.includes("rezervasyon") || topPain.includes("akış") || topPain.includes("rezerv")) {
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

function aiInterpretationConfidenceBadgeClass(
  level: LeadInterpretation["confidenceLevel"],
): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider";
  if (level === "high") {
    return `${base} border-emerald-400/35 bg-emerald-500/15 text-emerald-100`;
  }
  if (level === "medium") {
    return `${base} border-amber-400/40 bg-amber-500/15 text-amber-100`;
  }
  return `${base} border-rose-400/35 bg-zinc-900/55 text-rose-100/95`;
}

function stableLeadInterpretationKey(lead: LeadTableRow): string {
  const id = lead.id?.trim();
  if (id) return `id:${id}`;
  const name = lead.name?.trim().toLowerCase() || "unknown";
  const city = lead.city?.trim().toLowerCase() || "unknown";
  const location = lead.region?.trim().toLowerCase() || "unknown";
  return `biz:${name}|${city}|${location}`;
}

function loadAiInterpretationCache(): Record<string, AiInterpretationCacheValue> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AI_INTERPRETATION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, AiInterpretationCacheValue> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const row = v as Partial<AiInterpretationCacheValue>;
      if (
        typeof row.summary !== "string" ||
        typeof row.acquisitionProfile !== "string" ||
        typeof row.recommendedApproach !== "string" ||
        typeof row.salesAngle !== "string" ||
        typeof row.channelRecommendation !== "string"
      ) {
        continue;
      }
      if (
        row.confidenceLevel !== "low" &&
        row.confidenceLevel !== "medium" &&
        row.confidenceLevel !== "high"
      ) {
        continue;
      }
      out[k] = {
        summary: row.summary,
        acquisitionProfile: row.acquisitionProfile,
        recommendedApproach: row.recommendedApproach,
        salesAngle: row.salesAngle,
        channelRecommendation: row.channelRecommendation,
        confidenceLevel: row.confidenceLevel,
        createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
        sourceLabel: row.sourceLabel === "rules" ? "rules" : "ai",
      };
    }
    return out;
  } catch {
    return {};
  }
}

function saveAiInterpretationCache(cache: Record<string, AiInterpretationCacheValue>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_INTERPRETATION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

function LeadDetailAiInsightSection({
  lead,
  onAiReviewCompleted,
}: {
  lead: LeadTableRow;
  onAiReviewCompleted?: () => void;
}) {
  const { locale } = useLocale();
  const [llmAvailable, setLlmAvailable] = useState(false);
  const [refined, setRefined] = useState<LeadAiInsight | null>(null);
  const [interpretation, setInterpretation] = useState<AiInterpretationCacheValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stableKey = stableLeadInterpretationKey(lead);
  const cacheKey = `${stableKey}:${locale}`;

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
    const cache = loadAiInterpretationCache();
    setInterpretation(cache[cacheKey] ?? null);
    setError(null);
  }, [cacheKey]);

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

  function buildRuleBasedInterpretation(): AiInterpretationCacheValue {
    const summary =
      active.aiInsight.trim().split(/(?<=[.!?])\s+/).slice(0, 1).join(" ").trim() ||
      (locale === "tr"
        ? "Kayıtlı sinyaller elle dokunulabilir bir satış profili gösteriyor."
        : "On-file signals look workable for a short sales touch.");
    const acquisitionProfile =
      active.painPointSummary[0]?.trim() ||
      (locale === "tr"
        ? "Veri tarafında boşluk varsa mesajda iddiasız ilerlemek iyi olur."
        : "If data is thin, keep the first message humble.");
    const salesAngle = pickOutreachAngleText(active.outreachAngle, active.painPointSummary);
    const salesAngleOne =
      salesAngle.split(/(?<=[.!?])\s+/).slice(0, 1).join(" ").trim() || salesAngle;
    const recommendedApproach =
      locale === "tr"
        ? "Kısa, danışman tonlu bir WhatsApp veya mesajla güçlü kanal üzerinden açılabilir."
        : "Open with a short, consultative note on the strongest channel you see.";
    const channelRecommendation =
      locale === "tr"
        ? "Mümkünse tek mesajda net ol; hızlı dönüş bekleyen kanalı seç."
        : "Prefer one clear message on whichever channel answers fastest.";
    return {
      summary,
      acquisitionProfile,
      recommendedApproach,
      salesAngle: salesAngleOne,
      channelRecommendation,
      confidenceLevel: "medium",
      createdAt: Date.now(),
      sourceLabel: "rules",
    };
  }

  async function refineWithLlm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const previous = interpretation;
    try {
      const res = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, locale }),
      });
      const data = (await res.json()) as LeadAiInsight & {
        error?: string;
        interpretation?: LeadInterpretation | null;
      };
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
      const next = data.interpretation
        ? {
            summary: data.interpretation.summary,
            acquisitionProfile: data.interpretation.acquisitionProfile,
            recommendedApproach: data.interpretation.recommendedApproach,
            salesAngle: data.interpretation.salesAngle,
            channelRecommendation: data.interpretation.channelRecommendation,
            confidenceLevel: data.interpretation.confidenceLevel,
            createdAt: Date.now(),
            sourceLabel: data.source === "llm" ? ("ai" as const) : ("rules" as const),
          }
        : null;
      if (next) {
        setInterpretation(next);
        const cache = loadAiInterpretationCache();
        cache[cacheKey] = next;
        saveAiInterpretationCache(cache);
      }
      onAiReviewCompleted?.();
    } catch (e) {
      if (previous) {
        setInterpretation(previous);
      } else {
        const fallback = buildRuleBasedInterpretation();
        setInterpretation(fallback);
        const cache = loadAiInterpretationCache();
        cache[cacheKey] = fallback;
        saveAiInterpretationCache(cache);
      }
      setError(e instanceof Error ? e.message : t("detail_refine_failed", locale));
    } finally {
      setBusy(false);
    }
  }

  const salesSignalBullets = buildSalesSignalSourceBullets(lead, locale);

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
              {busy ? t("detail_refining_with_ai", locale) : t("ai_reinterpret", locale)}
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

      {interpretation ? (
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.05] px-3 py-2.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-cyan-200/90">
              {t("ai_sales_commentary_section", locale)}
            </div>
            <span
              className={aiInterpretationConfidenceBadgeClass(interpretation.confidenceLevel)}
            >
              {t("ai_confidence_label", locale)} · {interpretation.confidenceLevel}
            </span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
            <span>
              {interpretation.sourceLabel === "ai"
                ? t("ai_interpretation_label_ai", locale)
                : t("ai_interpretation_label_rules", locale)}
            </span>
            <span>·</span>
            <span>
              {t("ai_last_updated_label", locale)}{" "}
              {new Date(interpretation.createdAt).toLocaleString(
                locale === "tr" ? "tr-TR" : "en-US",
              )}
            </span>
          </div>
          {salesSignalBullets.length > 0 ? (
            <div className="mb-3 border-b border-white/5 pb-3">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                {t("ai_signal_sources_header", locale)}
              </div>
              <ul className="space-y-1 text-xs text-zinc-300">
                {salesSignalBullets.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-cyan-400/90" aria-hidden>
                      •
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="space-y-2 text-xs leading-relaxed text-zinc-200">
            <p>
              <span className="text-zinc-400">{t("ai_sales_interp_durum", locale)}:</span>{" "}
              {interpretation.summary}
            </p>
            <p>
              <span className="text-zinc-400">{t("ai_sales_interp_firsat", locale)}:</span>{" "}
              {interpretation.salesAngle}
            </p>
            <p>
              <span className="text-zinc-400">{t("ai_sales_interp_yaklasim", locale)}:</span>{" "}
              {interpretation.recommendedApproach}
            </p>
          </div>
        </div>
      ) : null}

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

function tugoboFitColor(score: number): string {
  if (score >= 72) return "text-emerald-300";
  if (score >= 52) return "text-amber-300";
  return "text-zinc-400";
}

function demandVolumePill(vol: IcpAlignmentProfile["estimatedDemandVolume"], locale: Locale): { label: string; cls: string } {
  const labels: Record<string, { tr: string; en: string }> = {
    high:    { tr: "Talep: Yüksek",  en: "Demand: High" },
    medium:  { tr: "Talep: Orta",    en: "Demand: Med" },
    low:     { tr: "Talep: Düşük",   en: "Demand: Low" },
    unknown: { tr: "Talep: ?",       en: "Demand: ?" },
  };
  const cls: Record<string, string> = {
    high:    "rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
    medium:  "rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/20",
    low:     "rounded-full bg-zinc-500/12 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/10",
    unknown: "rounded-full bg-zinc-500/12 px-2 py-0.5 text-[10px] text-zinc-500 ring-1 ring-inset ring-white/8",
  };
  const l = labels[vol] ?? labels.unknown;
  return { label: locale === "tr" ? l.tr : l.en, cls: cls[vol] ?? cls.unknown };
}

function fmtMemoryDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtEpochDate(epoch: number, locale: string): string {
  return new Date(epoch).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Operational memory block — shows import, enrichment, AI review and contact history. */
function LeadEnrichmentMetaBlock({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();

  const firstImport =
    typeof lead.firstImportedAt === "number" && lead.firstImportedAt > 0
      ? fmtEpochDate(lead.firstImportedAt, locale)
      : null;
  const lastEnriched = lead.lastEnrichedAt ? fmtMemoryDate(lead.lastEnrichedAt, locale) : null;
  const lastAiReview = lead.lastAiReviewAt ? fmtMemoryDate(lead.lastAiReviewAt, locale) : null;
  const lastContact =
    typeof lead._s.lastContactedAt === "number" && lead._s.lastContactedAt > 0
      ? fmtEpochDate(lead._s.lastContactedAt, locale)
      : typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0
        ? fmtEpochDate(lead.lastContactedAt, locale)
        : null;
  const lastVerification = lead.lastVerificationAt
    ? fmtMemoryDate(lead.lastVerificationAt, locale)
    : null;

  const hasAnyData =
    firstImport || lastEnriched || lastAiReview || lastContact || lastVerification ||
    (lead.enrichmentCount ?? 0) > 0 || (lead.reviewCount ?? 0) > 0 ||
    (lead.verificationCount ?? 0) > 0;

  if (!hasAnyData) return null;

  const sourceLabel =
    lead.lastEnrichmentSource === "manual"
      ? t("detail_last_enrichment_source_manual", locale)
      : (lead.lastEnrichmentSource ?? "");

  const actionLabel =
    lead.lastActionType === "enriched"
      ? t("detail_action_enriched", locale)
      : lead.lastActionType === "ai_reviewed"
        ? t("detail_action_ai_reviewed", locale)
        : (lead.lastActionType ?? "");

  type MemRow = { label: string; value: string; chip?: string };
  const rows: MemRow[] = [];

  if (firstImport) {
    rows.push({ label: t("detail_memory_first_imported", locale), value: firstImport });
  }
  if (lastEnriched) {
    rows.push({
      label: t("detail_last_enrichment_title", locale),
      value: lastEnriched,
      chip: sourceLabel || undefined,
    });
  }
  if ((lead.enrichmentCount ?? 0) > 0) {
    rows.push({
      label: t("detail_memory_enrichment_count", locale),
      value: String(lead.enrichmentCount),
    });
  }
  if (lastAiReview) {
    rows.push({ label: t("detail_memory_last_ai_review", locale), value: lastAiReview });
  }
  if ((lead.reviewCount ?? 0) > 0) {
    rows.push({
      label: t("detail_memory_review_count", locale),
      value: String(lead.reviewCount),
    });
  }
  if (lastVerification) {
    rows.push({
      label: locale === "tr" ? "Son doğrulama" : "Last verification",
      value: lastVerification,
      chip: lead.lastVerificationResult || undefined,
    });
  }
  if ((lead.verificationCount ?? 0) > 0) {
    rows.push({
      label: locale === "tr" ? "Doğrulama sayısı" : "Verification count",
      value: String(lead.verificationCount),
    });
  }
  if (typeof lead.lastOpportunityScore === "number") {
    rows.push({
      label: locale === "tr" ? "Son fırsat puanı" : "Last opportunity score",
      value: `${lead.lastOpportunityScore}/100`,
    });
  }
  if (lastContact) {
    rows.push({ label: t("detail_memory_last_contact", locale), value: lastContact });
  }
  if (actionLabel) {
    rows.push({ label: t("detail_memory_last_action", locale), value: actionLabel });
  }

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2.5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {t("detail_lead_memory_title", locale)}
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">{row.label}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] tabular-nums text-zinc-200">{row.value}</span>
              {row.chip ? (
                <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-zinc-600/40">
                  {row.chip}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, { tr: string; en: string }> = {
  lead_imported: { tr: "Lead içe aktarıldı", en: "Lead Imported" },
  lead_enriched: { tr: "Lead yeniden zenginleştirildi", en: "Lead Re-Enriched" },
  ai_reviewed: { tr: "AI yeniden yorumladı", en: "AI Re-Reviewed" },
  contact_started: { tr: "İletişim başlatıldı", en: "Contact Started" },
  followup_scheduled: { tr: "Takip planlandı", en: "Follow-up Scheduled" },
  queue_add: { tr: "Kuyruğa eklendi", en: "Added to Queue" },
  queue_remove: { tr: "Kuyruktan çıkarıldı", en: "Removed from Queue" },
  whatsapp_open: { tr: "WhatsApp açıldı", en: "WhatsApp Opened" },
  whatsapp_message_generated: { tr: "WhatsApp mesajı oluşturuldu", en: "WhatsApp Message Generated" },
  focus_add: { tr: "Odak moduna eklendi", en: "Added to Focus" },
  focus_remove: { tr: "Odak modundan çıkarıldı", en: "Removed from Focus" },
  status_change: { tr: "Durum değişti", en: "Status Changed" },
  demo_booked: { tr: "Demo planlandı", en: "Demo Booked" },
  closed_won: { tr: "Kazanıldı", en: "Won" },
  closed_lost: { tr: "Kaybedildi", en: "Lost" },
  verification_completed: { tr: "Sinyal doğrulaması tamamlandı", en: "Signal Verification Completed" },
  whatsapp_verified: { tr: "WhatsApp doğrulandı", en: "WhatsApp Verified" },
  website_verified: { tr: "Web sitesi doğrulandı", en: "Website Verified" },
  instagram_verified: { tr: "Instagram hesabı doğrulandı", en: "Instagram Verified" },
  instagram_candidate: { tr: "Instagram aday hesabı bulundu", en: "Instagram Candidate Found" },
  reservation_cta_found: { tr: "Rezervasyon CTA bulundu", en: "Reservation CTA Found" },
  chain_detected: { tr: "Kurumsal zincir tespit edildi", en: "Corporate Chain Detected" },
  opportunity_updated: { tr: "Fırsat puanı güncellendi", en: "Opportunity Score Updated" },
  opportunity_tier_elite: { tr: "Elite fırsat seviyesine yükseldi", en: "Upgraded to Elite Opportunity" },
  opportunity_tier_high: { tr: "Yüksek fırsat seviyesine yükseldi", en: "Upgraded to High Opportunity" },
  opportunity_tier_medium: { tr: "Orta fırsat seviyesine yükseldi", en: "Upgraded to Medium Opportunity" },
};

function activityEntryLabel(entry: LeadActivity, locale: string): string {
  const map = ACTIVITY_LABELS[entry.type];
  if (!map) return entry.label;
  return locale === "en" ? map.en : map.tr;
}

function LeadActivityTimelineBlock({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const timeline: LeadActivity[] | undefined = lead.activityTimeline;

  // v1.8: Synthesize runtime display events derived from lifecycle/action state.
  // These are display-only — they are never persisted to the lead record.
  const runtimeEvents: { label: string; color: string }[] = [];
  const lifecycle = computeLeadLifecycleStatus(lead, lead._s);
  const action = computeTodayActionStatus(lead, lead._s, Date.now());
  if (lifecycle === "HOT_OPPORTUNITY") {
    runtimeEvents.push({
      label: tr ? "Hot Opportunity oldu" : "Became Hot Opportunity",
      color: "text-fuchsia-300",
    });
  }
  if (action === "FOLLOW_UP_DUE") {
    runtimeEvents.push({
      label: tr ? "Takip zamanı geldi" : "Follow-up time reached",
      color: "text-amber-300",
    });
  }
  if (action === "DEMO_READY") {
    runtimeEvents.push({
      label: tr ? "Demo adayı oldu" : "Became demo candidate",
      color: "text-emerald-300",
    });
  }

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2.5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {t("detail_activity_timeline_title", locale)}
      </div>
      {runtimeEvents.length > 0 && (
        <div className="mb-2 space-y-1">
          {runtimeEvents.map((ev, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 pt-px text-[10px] tabular-nums text-zinc-600">
                {tr ? "Şimdi" : "Now"}
              </span>
              <span className={`text-[11px] font-medium leading-snug ${ev.color}`}>
                {ev.label}
              </span>
            </div>
          ))}
        </div>
      )}
      {!timeline || timeline.length === 0 ? (
        <p className="text-[11px] text-zinc-500">{t("detail_activity_empty", locale)}</p>
      ) : (
        <div className="space-y-1.5">
          {timeline.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2">
              <span className="shrink-0 text-[10px] tabular-nums text-zinc-500 pt-px">
                {fmtMemoryDate(entry.timestamp, locale)}
              </span>
              <span className="text-[11px] leading-snug text-zinc-200">
                {activityEntryLabel(entry, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function opportunityTierColor(tier: OpportunityTier): string {
  switch (tier) {
    case "elite":
      return "text-fuchsia-300";
    case "high":
      return "text-emerald-300";
    case "medium":
      return "text-amber-300";
    default:
      return "text-zinc-400";
  }
}

function opportunityTierChip(tier: OpportunityTier): string {
  switch (tier) {
    case "elite":
      return "rounded-full bg-fuchsia-500/12 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200 ring-1 ring-inset ring-fuchsia-400/30";
    case "high":
      return "rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/30";
    case "medium":
      return "rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-400/30";
    default:
      return "rounded-full bg-zinc-500/12 px-2 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-inset ring-white/10";
  }
}

/** v1.4 Opportunity assessment block — unified sales opportunity score + reasoning. */
function LeadOpportunityBlock({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const score = lead.verifiedOpportunityScore;
  const tier = lead.opportunityTier;
  if (typeof score !== "number" || !tier) return null;

  const tr = locale === "tr";
  const tierLabel = OPPORTUNITY_TIER_LABELS[tier]
    ? tr
      ? OPPORTUNITY_TIER_LABELS[tier].tr
      : OPPORTUNITY_TIER_LABELS[tier].en
    : tier;
  const reasons = (lead.opportunityReasons ?? [])
    .map((k) => {
      const m = OPPORTUNITY_REASON_LABELS[k];
      return m ? (tr ? m.tr : m.en) : null;
    })
    .filter((x): x is string => Boolean(x));

  return (
    <div className="space-y-2 rounded-xl border border-fuchsia-400/15 bg-fuchsia-500/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-fuchsia-200/80">
          {tr ? "Fırsat Değerlendirmesi" : "Opportunity Assessment"}
        </div>
        <div className={`text-sm font-bold tabular-nums ${opportunityTierColor(tier)}`}>
          {score}
          <span className="text-[9px] font-normal text-zinc-500 ml-0.5">/100</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={opportunityTierChip(tier)}>{tierLabel}</span>
      </div>
      {reasons.length > 0 ? (
        <div className="space-y-1 border-t border-white/5 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {tr ? "Neden?" : "Why?"}
          </div>
          {reasons.map((r) => (
            <div key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-emerald-200">
              <span className="shrink-0" aria-hidden="true">✓</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type VerificationRowTone = "ok" | "warn" | "miss";

const SIGNAL_SOURCE_LABELS: Record<SignalSourceKey, { tr: string; en: string }> = {
  homepage: { tr: "Ana Sayfa", en: "Homepage" },
  contact_page: { tr: "İletişim Sayfası", en: "Contact Page" },
  reservation_page: { tr: "Rezervasyon Sayfası", en: "Reservation Page" },
  about_page: { tr: "Hakkımızda Sayfası", en: "About Page" },
  footer_link: { tr: "Footer Bağlantısı", en: "Footer Link" },
  social_section: { tr: "Sosyal Bölüm", en: "Social Section" },
  official_website: { tr: "Resmi Web Sitesi", en: "Official Website" },
  google_maps: { tr: "Google Haritalar", en: "Google Maps" },
  google_business_profile: { tr: "Google İşletme Profili", en: "Google Business Profile" },
  detected_candidate: { tr: "Tespit Edilen Aday", en: "Detected Candidate" },
};

function signalSourceLabel(key: SignalSourceKey | undefined, locale: string): string | null {
  if (!key) return null;
  const m = SIGNAL_SOURCE_LABELS[key];
  if (!m) return null;
  return locale === "tr" ? m.tr : m.en;
}

/** v1.8 — "Bugün Ne Yapılmalı?" deterministic action recommendation card. */
function TodayActionCard({ lead, now }: { lead: LeadTableRow; now: number }) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const s = lead._s;
  const action = computeTodayActionStatus(lead, s, now);
  if (action === "NO_ACTION") return null;

  const v = lead.signalVerification;
  const hasWA =
    v?.whatsappVerification === "verified" || v?.whatsappVerification === "likely";
  const hasIG =
    v?.instagramVerification === "verified" || v?.instagramVerification === "likely";

  let recommendation = "";
  if (action === "DEMO_READY") {
    recommendation = tr ? "Demo planla" : "Schedule a demo";
  } else if (action === "FOLLOW_UP_DUE") {
    recommendation = tr ? "Takip mesajı gönder" : "Send a follow-up message";
  } else {
    if (hasWA) recommendation = tr ? "WhatsApp üzerinden ilk temas kur" : "Initiate first contact via WhatsApp";
    else if (hasIG) recommendation = tr ? "Instagram DM önerilir" : "Instagram DM recommended";
    else recommendation = tr ? "İlk temas kur" : "Initiate first contact";
  }

  const borderCls =
    action === "HOT_NOW"
      ? "border-fuchsia-500/20 bg-fuchsia-500/[0.03]"
      : action === "DEMO_READY"
        ? "border-emerald-500/20 bg-emerald-500/[0.03]"
        : action === "FOLLOW_UP_DUE"
          ? "border-amber-500/20 bg-amber-500/[0.03]"
          : "border-sky-500/20 bg-sky-500/[0.03]";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${borderCls}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {tr ? "Bugün Ne Yapılmalı?" : "What to Do Today?"}
        </span>
        <ActionStatusBadge action={action} />
      </div>
      <p className="text-[13px] font-medium text-zinc-100">{recommendation}</p>
    </div>
  );
}

/** v1.3/v1.4 Signal Verification panel — verified vs. assumed vs. missing, with evidence sources. */
function LeadSignalVerificationBlock({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const v = lead.signalVerification;
  const ownership = v?.businessOwnershipType ?? lead.businessOwnershipType;
  if (!v && (!ownership || ownership === "unknown")) return null;

  const tr = locale === "tr";
  const rows: {
    key: string;
    tone: VerificationRowTone;
    text: string;
    source?: SignalSourceKey;
    sourceUrl?: string;
  }[] = [];
  const pct = (n: number) => ` (%${n})`;

  if (v) {
    if (v.websiteVerification === "verified") {
      rows.push({ key: "web", tone: "ok", text: (tr ? "Web sitesi doğrulandı" : "Website verified") + pct(v.websiteConfidence), source: v.websiteSource, sourceUrl: v.websiteSourceUrl });
    } else if (v.websiteVerification === "reachable") {
      rows.push({ key: "web", tone: "warn", text: (tr ? "Web sitesi erişilebilir, içerik belirsiz" : "Website reachable, content uncertain") + pct(v.websiteConfidence), source: v.websiteSource, sourceUrl: v.websiteSourceUrl });
    } else if (v.websiteVerification === "broken") {
      rows.push({ key: "web", tone: "miss", text: tr ? "Web sitesi erişilemiyor (DNS/zaman aşımı)" : "Website unreachable (DNS/timeout)" });
    } else {
      rows.push({ key: "web", tone: "miss", text: tr ? "Web sitesi bulunamadı" : "Website not found" });
    }

    if (v.whatsappVerification === "verified") {
      rows.push({ key: "wa", tone: "ok", text: (tr ? "WhatsApp doğrulandı" : "WhatsApp verified") + pct(v.whatsappConfidence), source: v.whatsappSource, sourceUrl: v.whatsappSourceUrl });
    } else if (v.whatsappVerification === "likely") {
      rows.push({ key: "wa", tone: "warn", text: (tr ? "WhatsApp olası" : "WhatsApp likely") + pct(v.whatsappConfidence), source: v.whatsappSource, sourceUrl: v.whatsappSourceUrl });
    } else {
      rows.push({ key: "wa", tone: "miss", text: tr ? "WhatsApp sinyali bulunamadı" : "WhatsApp not found" });
    }

    if (v.instagramVerification === "verified") {
      rows.push({ key: "ig", tone: "ok", text: (tr ? "Instagram hesabı doğrulandı" : "Instagram verified") + pct(v.instagramConfidence), source: v.instagramSource, sourceUrl: v.instagramSourceUrl });
    } else if (v.instagramVerification === "likely") {
      rows.push({ key: "ig", tone: "warn", text: (tr ? "Instagram olası" : "Instagram likely") + pct(v.instagramConfidence), source: v.instagramSource, sourceUrl: v.instagramSourceUrl });
    } else if (v.instagramVerification === "candidate") {
      rows.push({ key: "ig", tone: "warn", text: (tr ? "Instagram aday hesap" : "Instagram candidate account") + pct(v.instagramConfidence), source: v.instagramSource, sourceUrl: v.instagramSourceUrl });
    } else {
      rows.push({ key: "ig", tone: "miss", text: tr ? "Instagram sinyali yok" : "Instagram not found" });
    }

    if (v.reservationSignal === "verified") {
      rows.push({ key: "cta", tone: "ok", text: (tr ? "Rezervasyon CTA bulundu" : "Reservation CTA found") + pct(v.reservationConfidence), source: v.reservationSource, sourceUrl: v.reservationSourceUrl });
    } else if (v.reservationSignal === "detected") {
      rows.push({ key: "cta", tone: "warn", text: (tr ? "Rezervasyon sinyali tespit edildi" : "Reservation intent detected") + pct(v.reservationConfidence), source: v.reservationSource, sourceUrl: v.reservationSourceUrl });
    } else {
      rows.push({ key: "cta", tone: "miss", text: tr ? "Rezervasyon sinyali yok" : "No reservation signal" });
    }
  }

  const toneIcon: Record<VerificationRowTone, string> = { ok: "✅", warn: "⚠", miss: "—" };
  const toneCls: Record<VerificationRowTone, string> = {
    ok: "text-emerald-200",
    warn: "text-amber-200",
    miss: "text-zinc-500",
  };

  const prettyUrl = (u: string) => u.replace(/^https?:\/\//i, "").replace(/\/$/, "");

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2.5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {tr ? "Sinyal Doğrulama" : "Signal Verification"}
      </div>
      {rows.length > 0 ? (
        <div className="space-y-1.5">
          {rows.map((row) => {
            const sourceLabel = signalSourceLabel(row.source, locale);
            return (
              <div key={row.key} className="leading-snug">
                <div className={`flex items-start gap-1.5 text-[11px] ${toneCls[row.tone]}`}>
                  <span className="shrink-0" aria-hidden="true">{toneIcon[row.tone]}</span>
                  <span>{row.text}</span>
                </div>
                {sourceLabel ? (
                  <div className="ml-5 text-[10px] text-zinc-500">
                    {tr ? "Kaynak: " : "Source: "}
                    <span className="text-zinc-400">{sourceLabel}</span>
                    {row.sourceUrl ? (
                      <span className="ml-1 font-mono text-zinc-500" title={row.sourceUrl}>
                        · {prettyUrl(row.sourceUrl).slice(0, 48)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">
          {tr
            ? "Henüz doğrulama yapılmadı — yeniden zenginleştirme doğrulamayı çalıştırır."
            : "Not verified yet — re-enrichment runs verification."}
        </p>
      )}
      {ownership && ownership !== "unknown" ? (
        <div className="mt-2 border-t border-white/5 pt-2">
          <span
            className={
              ownership === "chain"
                ? "inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-2 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-inset ring-sky-400/25"
                : "inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25"
            }
          >
            <span aria-hidden="true">🏢</span>
            {ownership === "chain"
              ? `${tr ? "Kurumsal Zincir" : "Corporate Chain"}${v?.chainBrand ? ` · ${v.chainBrand}` : ""}`
              : tr ? "Bağımsız İşletme" : "Independent Business"}
          </span>
        </div>
      ) : null}
      {v && v.discoveredPages.length > 0 ? (
        <p className="mt-1.5 text-[10px] text-zinc-500">
          {tr
            ? `${v.discoveredPages.length} sayfa tarandı · ${fmtMemoryDate(v.verifiedAt, locale)}`
            : `${v.discoveredPages.length} pages scanned · ${fmtMemoryDate(v.verifiedAt, locale)}`}
        </p>
      ) : null}
    </div>
  );
}

// ─── v3.2 Revenue Potential Engine ──────────────────────────────────────────

type RevenuePotential = {
  estimatedMrr: number;
  estimatedArr: number;
  closeProbability: number;
  expectedValue: number;
  reasons: string[];
};

/** v3.2 — Deterministic revenue potential estimator. No AI, no I/O, no schema changes. */
function computeRevenuePotential(lead: LeadTableRow): RevenuePotential {
  const sv = lead.signalVerification;
  const icp = lead.icpAlignment;
  const size = icp?.estimatedPropertySize ?? "unknown";
  const demandVolume = icp?.estimatedDemandVolume ?? "unknown";
  const operationalComplexityScore = icp?.operationalComplexityScore ?? 0;
  const multiChannelScore = icp?.multiChannelScore ?? 0;
  const verifiedOpportunityScore = lead.verifiedOpportunityScore ?? 0;
  const icpFitScore = lead.icpFitScore ?? 0;
  const digitalMaturity = lead.digitalMaturity ?? 0;
  const hotScore = lead.hotScore ?? 0;
  const leadScore = lead.leadScore ?? 0;
  const hasReservationCTA =
    Boolean(lead.hasReservationCTA) ||
    sv?.reservationSignal === "verified" ||
    sv?.reservationSignal === "detected";
  const websiteVerified = sv?.websiteVerification === "verified";
  const whatsappVerified = sv?.whatsappVerification === "verified";

  // ── MRR Base ──────────────────────────────────────────────────────────────
  const baseMrr =
    size === "large" ? 25_000 : size === "medium" ? 12_000 : size === "small" ? 5_000 : 8_000;

  // ── MRR Multipliers ───────────────────────────────────────────────────────
  let mrrBonus = 0;
  if (verifiedOpportunityScore >= 80) mrrBonus += 0.22;
  else if (verifiedOpportunityScore >= 60) mrrBonus += 0.12;
  else if (verifiedOpportunityScore >= 40) mrrBonus += 0.05;
  if (icpFitScore >= 75) mrrBonus += 0.12;
  else if (icpFitScore >= 55) mrrBonus += 0.06;
  if (digitalMaturity >= 70) mrrBonus += 0.08;
  if (hasReservationCTA) mrrBonus += 0.12;
  if (demandVolume === "high") mrrBonus += 0.14;
  else if (demandVolume === "medium") mrrBonus += 0.06;
  if (operationalComplexityScore >= 70) mrrBonus += 0.10;
  if (multiChannelScore >= 70) mrrBonus += 0.06;
  if (hotScore >= 65) mrrBonus += 0.08;
  const mrrMultiplier = Math.max(0.8, Math.min(1.65, 1.0 + mrrBonus));
  const estimatedMrr = Math.round((baseMrr * mrrMultiplier) / 500) * 500;

  // ── Close Probability ─────────────────────────────────────────────────────
  let prob = 15;
  if (verifiedOpportunityScore >= 80) prob += 25;
  else if (verifiedOpportunityScore >= 60) prob += 15;
  else if (verifiedOpportunityScore >= 40) prob += 8;
  if (icpFitScore >= 75) prob += 10;
  else if (icpFitScore >= 55) prob += 5;
  if (leadScore >= 70) prob += 8;
  else if (leadScore >= 50) prob += 4;
  if (digitalMaturity >= 70) prob += 6;
  if (hasReservationCTA) prob += 5;
  if (websiteVerified) prob += 5;
  if (whatsappVerified) prob += 5;
  if (lead.hasInstagram) prob += 3;
  if (lead.phone) prob += 3;
  if (demandVolume === "high") prob += 5;
  if (operationalComplexityScore >= 70) prob += 4;
  const closeProbability = Math.max(10, Math.min(90, prob)) / 100;

  // ── ARR & Expected Value ──────────────────────────────────────────────────
  const estimatedArr = estimatedMrr * 12;
  const expectedValue = Math.round((estimatedArr * closeProbability) / 500) * 500;

  // ── Reasons ───────────────────────────────────────────────────────────────
  const candidates: string[] = [];
  if (verifiedOpportunityScore >= 80) candidates.push("doğrulanmış yüksek fırsat skoru");
  if (icpFitScore >= 75) candidates.push("ICP uyumu yüksek");
  if (hasReservationCTA) candidates.push("rezervasyon CTA mevcut");
  if (demandVolume === "high") candidates.push("yüksek dijital talep");
  if (operationalComplexityScore >= 70) candidates.push("yüksek operasyonel karmaşıklık");
  if (multiChannelScore >= 70) candidates.push("çok kanallı iletişim");
  if (digitalMaturity >= 70) candidates.push("yüksek dijital olgunluk");
  if (websiteVerified) candidates.push("web sitesi doğrulandı");
  if (whatsappVerified) candidates.push("WhatsApp hattı aktif");
  if (lead.hasInstagram) candidates.push("Instagram kanalı mevcut");
  if (leadScore >= 70) candidates.push("yüksek lead skoru");
  if (hotScore >= 65) candidates.push("bugün sıcak fırsat");
  if (size === "large") candidates.push("büyük ölçekli tesis");
  // Pad to at least 3
  if (candidates.length < 3) {
    const sizeLabel =
      size === "large"
        ? "büyük ölçekli tesis"
        : size === "medium"
          ? "orta ölçekli tesis"
          : "küçük ölçekli tesis";
    if (!candidates.includes(sizeLabel)) candidates.push(sizeLabel);
  }
  if (candidates.length < 3) candidates.push("aktif satış fırsatı");

  return { estimatedMrr, estimatedArr, closeProbability, expectedValue, reasons: candidates.slice(0, 5) };
}

/** v3.2 — "Gelir Potansiyeli" card for the lead detail sidebar. Placement: after AI Summary, before TUGOBO Fit. */
function RevenuePotentialCard({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const rp = computeRevenuePotential(lead);
  const probPct = Math.round(rp.closeProbability * 100);
  const probColor =
    probPct >= 60 ? "text-emerald-300" : probPct >= 35 ? "text-amber-300" : "text-zinc-400";

  return (
    <div className="space-y-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.03] p-3.5">
      <div className="space-y-0.5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-amber-200/80">
          {tr ? "Fırsat Sinyali" : "Opportunity Signal"}
        </div>
        <div className="text-[10px] text-zinc-600">
          {tr ? "Paket MRR için Ticari Paketleme kartına bakın" : "See Commercial Packaging for package MRR"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Fırsat Değeri" : "Opportunity Value"}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-amber-200">
            {formatTRY(rp.estimatedMrr)}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Yıllık Fırsat" : "Annual Opportunity"}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-amber-200">
            {formatTRY(rp.estimatedArr)}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Kapanma Olasılığı" : "Close Probability"}
          </div>
          <div className={`mt-0.5 text-sm font-bold tabular-nums ${probColor}`}>
            %{probPct}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Beklenen Değer" : "Expected Value"}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-300">
            {formatTRY(rp.expectedValue)}
          </div>
        </div>
      </div>
      {rp.reasons.length > 0 ? (
        <div className="space-y-1 border-t border-white/5 pt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {tr ? "Sinyaller" : "Signals"}
          </div>
          {rp.reasons.map((r) => (
            <div key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-100/80">
              <span className="shrink-0 text-emerald-400" aria-hidden="true">✓</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function commercialPackageBadgeClass(pkg: CommercialPackage): string {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset";
  switch (pkg) {
    case "enterprise":
      return `${base} bg-fuchsia-500/12 text-fuchsia-200 ring-fuchsia-400/30`;
    case "growth":
      return `${base} bg-violet-500/12 text-violet-200 ring-violet-400/30`;
    case "professional":
      return `${base} bg-sky-500/12 text-sky-200 ring-sky-400/30`;
    default:
      return `${base} bg-zinc-500/12 text-zinc-300 ring-zinc-400/25`;
  }
}

/** v5.0 — short package label. */
function commercialPackageShortLabel(pkg: CommercialPackage): string {
  switch (pkg) {
    case "enterprise":
      return "Enterprise";
    case "growth":
      return "Growth";
    case "professional":
      return "Professional";
    default:
      return "Starter";
  }
}

/** v5.0 — primary communication channel label for a lead row. */
function primaryChannelLabel(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
  tr: boolean,
): { label: string; cls: string } {
  const hasWa = whatsappLink(row.phone) !== null;
  const hasMobile = getTurkishPhoneKind(row.phone) === "mobile";
  const hasInsta = Boolean(row.instagram?.trim());
  const hasWeb = Boolean(row.website?.trim());
  if (hasWa) return { label: "WhatsApp", cls: "text-emerald-300" };
  if (hasMobile || Boolean(row.phone?.trim())) return { label: tr ? "Telefon" : "Phone", cls: "text-sky-300" };
  if (hasInsta) return { label: "Instagram", cls: "text-fuchsia-300" };
  if (finder && finder.bestContactType) return { label: tr ? "Bulucu" : "Finder", cls: "text-violet-300" };
  if (hasWeb) return { label: "Web", cls: "text-zinc-300" };
  return { label: "—", cls: "text-zinc-600" };
}

/** v5.0 — row-level recommended action (mirrors queue actionRecommendationLabel, derived from row state). */
function rowRecommendedAction(
  row: LeadTableRow,
  rp: ExpectedRevenueRankingResult | undefined,
): { label: string; cls: string } {
  const status = row._s.status;
  const tier = rp?.revenuePriorityTier;
  const hasWa = whatsappLink(row.phone) !== null;
  const hasPhone = Boolean(row.phone?.trim());
  const hasInsta = Boolean(row.instagram?.trim());
  const make = (label: string, cls: string) => ({ label, cls });
  if (status === "won") return make("Kazanıldı", "text-emerald-300 ring-emerald-400/30 bg-emerald-500/10");
  if (status === "lost") return make("Kapandı", "text-zinc-400 ring-white/10 bg-white/5");
  if (status === "meeting") return make("Demo Planla", "text-violet-300 ring-violet-400/30 bg-violet-500/10");
  if (status === "replied") return make("Takip Yap", "text-amber-300 ring-amber-400/30 bg-amber-500/10");
  if (tier === "critical" && hasWa) return make("WhatsApp Gönder", "text-emerald-300 ring-emerald-400/30 bg-emerald-500/10");
  if (tier === "critical" && hasPhone) return make("Hemen Ara", "text-sky-300 ring-sky-400/30 bg-sky-500/10");
  if (tier === "high" && hasInsta) return make("Instagram Temas", "text-fuchsia-300 ring-fuchsia-400/30 bg-fuchsia-500/10");
  if (status === "contacted") return make("Yanıt Bekleniyor", "text-zinc-400 ring-white/10 bg-white/5");
  if (hasWa || hasPhone) return make("İletişime Geç", "text-sky-300 ring-sky-400/30 bg-sky-500/10");
  return make("İncele", "text-zinc-400 ring-white/10 bg-white/5");
}

/**
 * v5.0 — Opportunity Table: the new default revenue-operations row view for the lead list.
 * Compact, scannable rows. Pure presentation — all values come from existing engines
 * (commercial packaging, expected revenue, revenue priority). Row click opens the
 * existing lead detail drawer; no business logic changes.
 */
function LeadOpportunityTable({
  rows,
  packageMap,
  expectedRevenueMap,
  revenuePriorityMap,
  contactFinderMap,
  openId,
  now,
  onOpenDetail,
  getActivityLabel,
}: {
  rows: LeadTableRow[];
  packageMap: Map<string, CommercialPackage>;
  expectedRevenueMap: Map<string, ExpectedRevenueResult>;
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>;
  contactFinderMap: Record<string, ContactFinderResult | undefined>;
  openId: string | null;
  now: number;
  onOpenDetail: (id: string) => void;
  getActivityLabel: (id: string, s: LeadStatusUpdate, now: number) => string;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-zinc-500">
        {tr ? "Filtrelere uygun lead bulunamadı." : "No leads match the filters."}
      </div>
    );
  }

  const headCls = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500";

  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[860px] border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
          <tr className="border-b border-white/10">
            <th className={`${headCls} w-8 text-center`}>#</th>
            <th className={headCls}>{tr ? "İşletme" : "Business"}</th>
            <th className={headCls}>{tr ? "Şehir" : "City"}</th>
            <th className={headCls}>{tr ? "Paket" : "Package"}</th>
            <th className={`${headCls} text-right`}>{tr ? "Ağırlıklı MRR" : "Weighted MRR"}</th>
            <th className={`${headCls} text-right`}>{tr ? "Dönüşüm" : "Conv."}</th>
            <th className={`${headCls} text-right`}>{tr ? "Skor" : "Score"}</th>
            <th className={headCls}>{tr ? "Önerilen Aksiyon" : "Action"}</th>
            <th className={headCls}>{tr ? "Son Aktivite" : "Last Activity"}</th>
            <th className={headCls}>{tr ? "Kanal" : "Channel"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const pkg = packageMap.get(row.id) ?? "starter";
            const er = expectedRevenueMap.get(row.id);
            const rp = revenuePriorityMap.get(row.id);
            const action = rowRecommendedAction(row, rp);
            const channel = primaryChannelLabel(row, contactFinderMap[row.id], tr);
            const tier = rp?.revenuePriorityTier;
            const tierDot =
              tier === "critical" ? "bg-rose-400" :
              tier === "high" ? "bg-amber-400" :
              tier === "medium" ? "bg-indigo-400" :
              "bg-zinc-600";
            return (
              <tr
                key={renderLeadKey("opp-table", row, index)}
                onClick={() => onOpenDetail(row.id)}
                className={`cursor-pointer border-b border-white/[0.04] transition hover:bg-white/[0.03] ${
                  openId === row.id ? "bg-white/[0.04]" : ""
                }`}
              >
                <td className="px-3 py-2 text-center tabular-nums text-zinc-600">{index + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tierDot}`} aria-hidden="true" />
                    <span className="font-medium text-zinc-100">{row.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-zinc-400">{row.city || "—"}</td>
                <td className="px-3 py-2">
                  <span className={commercialPackageBadgeClass(pkg)}>{commercialPackageShortLabel(pkg)}</span>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-300">
                  {er && er.weightedExpectedMonthlyRevenue > 0 ? formatTRY(er.weightedExpectedMonthlyRevenue) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-300">
                  {er && er.expectedCustomerProbability > 0 ? `%${Math.round(er.expectedCustomerProbability * 100)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-indigo-300">
                  {rp ? rp.revenuePriorityScore : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${action.cls}`}>
                    {action.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-zinc-500">{getActivityLabel(row.id, row._s, now)}</td>
                <td className={`px-3 py-2 ${channel.cls}`}>{channel.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** v3.7.1 — "Ticari Paketleme" commercial decision card. Placement: after Revenue Potential. */
function CommercialPackagingCard({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const result = computeCommercialPackaging({
    icpFitScore: lead.icpFitScore ?? 0,
    icpAlignment: lead.icpAlignment,
    verifiedOpportunityScore: lead.verifiedOpportunityScore ?? 0,
    signalVerification: lead.signalVerification,
    hasOwnWebsite: lead.hasOwnWebsite,
    hasInstagram: lead.hasInstagram,
    phone: lead.phone,
    adsLikelihood: lead.adsLikelihood,
    acquisitionIntelligence: lead.acquisitionIntelligence,
    digitalMaturity: lead.digitalMaturity,
    leadScore: lead.leadScore,
  });

  const { package: pkg, commercialFitScore, monthlyRevenue, annualRevenue, reasoning } = result;
  const signals = reasoning.slice(1);

  const pkgLabel =
    pkg === "enterprise"
      ? "Enterprise"
      : pkg === "growth"
        ? "Growth"
        : pkg === "professional"
          ? "Professional"
          : "Starter";

  return (
    <div className="space-y-3 rounded-xl border border-sky-400/15 bg-sky-500/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-sky-200/80">
          {tr ? "Ticari Paketleme" : "Commercial Packaging"}
        </div>
        <div className="text-sm font-bold tabular-nums text-sky-300">
          {commercialFitScore}
          <span className="ml-0.5 text-[9px] font-normal text-zinc-500">/100</span>
        </div>
      </div>
      <div>
        <span className={commercialPackageBadgeClass(pkg)}>{pkgLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Aylık Gelir" : "Monthly Revenue"}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-sky-200">
            {formatTRY(monthlyRevenue)}
            <span className="ml-0.5 text-[9px] font-normal text-zinc-500">/ay</span>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Yıllık Gelir" : "Annual Revenue"}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-sky-200">
            {formatTRY(annualRevenue)}
            <span className="ml-0.5 text-[9px] font-normal text-zinc-500">/yıl</span>
          </div>
        </div>
      </div>
      {signals.length > 0 ? (
        <div className="space-y-1 border-t border-white/5 pt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {tr ? "Paket Gerekçesi" : "Why This Package"}
          </div>
          {signals.map((r) => (
            <div key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-sky-100/80">
              <span className="shrink-0 text-sky-400" aria-hidden="true">✓</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** v3.9.0 — "Beklenen Gelir" expected revenue card. Placement: after CommercialPackagingCard. */
function ExpectedRevenueCard({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const pkg = computeCommercialPackaging({
    icpFitScore: lead.icpFitScore ?? 0,
    icpAlignment: lead.icpAlignment,
    verifiedOpportunityScore: lead.verifiedOpportunityScore ?? 0,
    signalVerification: lead.signalVerification,
    hasOwnWebsite: lead.hasOwnWebsite,
    hasInstagram: lead.hasInstagram,
    phone: lead.phone,
    adsLikelihood: lead.adsLikelihood,
    acquisitionIntelligence: lead.acquisitionIntelligence,
    digitalMaturity: lead.digitalMaturity,
    leadScore: lead.leadScore,
  });

  const er = computeExpectedRevenue({
    commercialPackaging: pkg,
    hotScore: lead.hotScore,
    leadScore: lead.leadScore,
    verifiedOpportunityScore: lead.verifiedOpportunityScore ?? 0,
    icpFitScore: lead.icpFitScore ?? 0,
    contactReadinessScore: lead.contactReadinessScore,
    signalVerification: lead.signalVerification,
    phone: lead.phone,
    hasOwnWebsite: lead.hasOwnWebsite,
    hasInstagram: lead.hasInstagram,
    pipelineStatus: lead._s.status,
    doNotContact: lead._s.doNotContact,
    adsLikelihood: lead.adsLikelihood,
    acquisitionIntelligence: lead.acquisitionIntelligence,
  });

  const probPct = Math.round(er.expectedCustomerProbability * 100);
  const probColor =
    probPct >= 45 ? "text-emerald-300" : probPct >= 20 ? "text-amber-300" : "text-zinc-400";
  const confLabel =
    er.expectedRevenueConfidence === "high"
      ? tr ? "Yüksek" : "High"
      : er.expectedRevenueConfidence === "medium"
        ? tr ? "Orta" : "Medium"
        : tr ? "Düşük" : "Low";
  const confColor =
    er.expectedRevenueConfidence === "high"
      ? "text-emerald-300"
      : er.expectedRevenueConfidence === "medium"
        ? "text-amber-300"
        : "text-zinc-500";

  return (
    <div className="space-y-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-amber-200/80">
          {tr ? "Beklenen Gelir" : "Expected Revenue"}
        </div>
        <div className={`text-xs font-semibold tabular-nums ${probColor}`}>
          %{probPct}
          <span className="ml-0.5 text-[9px] font-normal text-zinc-500">
            {" "}{tr ? "ihtimal" : "probability"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Ağırlıklı Aylık" : "Weighted MRR"}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-amber-200">
            {formatTRY(er.weightedExpectedMonthlyRevenue)}
            <span className="ml-0.5 text-[9px] font-normal text-zinc-500">/ay</span>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Ağırlıklı Yıllık" : "Weighted ARR"}
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-amber-200">
            {formatTRY(er.weightedExpectedAnnualRevenue)}
            <span className="ml-0.5 text-[9px] font-normal text-zinc-500">/yıl</span>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Taban MRR" : "Base MRR"}
          </div>
          <div className="mt-0.5 text-xs font-semibold tabular-nums text-zinc-300">
            {formatTRY(er.expectedMonthlyRevenue)}
            <span className="ml-0.5 text-[9px] font-normal text-zinc-500">/ay</span>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {tr ? "Güven" : "Confidence"}
          </div>
          <div className={`mt-0.5 text-xs font-semibold ${confColor}`}>{confLabel}</div>
        </div>
      </div>

      {er.expectedRevenueReasoning.length > 0 && (
        <div className="space-y-1 border-t border-white/5 pt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {tr ? "Gerekçe" : "Reasoning"}
          </div>
          {er.expectedRevenueReasoning.slice(0, 4).map((reason) => (
            <div
              key={reason}
              className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-100/70"
            >
              <span className="shrink-0 text-amber-400" aria-hidden="true">·</span>
              <span>{reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact ICP indicators for the lead detail drawer. */
function LeadIcpSection({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const icp: IcpAlignmentProfile | undefined = lead.icpAlignment;
  if (!icp) return null;

  const fitScore = icp.tugoboFitScore;
  const dem = demandVolumePill(icp.estimatedDemandVolume, locale);
  const digitalMaturity = lead.digitalMaturity ?? 0;
  const operationalComplexity = icp.operationalComplexityScore;

  const headerTr = "TUGOBO Uyum";
  const headerEn = "TUGOBO Fit";
  const fitLabelTr = "Operasyonel Uyum Skoru";
  const fitLabelEn = "Operational Fit Score";
  const opFitLabelTr = "Yüksek Operasyonel Uyum";
  const opFitLabelEn = "High Operational Fit";
  const digitalLabelTr = "Dijital Olgunluk";
  const digitalLabelEn = "Digital Maturity";
  const complexityLabelTr = "Operasyonel Karmaşıklık";
  const complexityLabelEn = "Op. Complexity";

  return (
    <div className="space-y-2 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-200/80">
          {locale === "tr" ? headerTr : headerEn}
        </div>
        <div className={`text-sm font-bold tabular-nums ${tugoboFitColor(fitScore)}`} title={locale === "tr" ? fitLabelTr : fitLabelEn}>
          {fitScore}
          <span className="text-[9px] font-normal text-zinc-500 ml-0.5">/100</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {icp.operationalFit && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/30">
            ✓ {locale === "tr" ? opFitLabelTr : opFitLabelEn}
          </span>
        )}
        <span className={dem.cls}>{dem.label}</span>
        <span
          className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300 ring-1 ring-inset ring-sky-400/20"
          title={locale === "tr" ? digitalLabelTr : digitalLabelEn}
        >
          {locale === "tr" ? "Dijital" : "Digital"} {digitalMaturity}
        </span>
        <span
          className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-400/20"
          title={locale === "tr" ? complexityLabelTr : complexityLabelEn}
        >
          {locale === "tr" ? "Op. Karmaşa" : "Op. Complexity"} {operationalComplexity}
        </span>
      </div>

      {icp.operationalValueSummary ? (
        <p className="text-[10px] leading-snug text-zinc-400">{icp.operationalValueSummary}</p>
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

function LeadDetailWhatsAppStatus({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const acq = lead.acquisitionIntelligence;
  const conf = normalizeWhatsappConfidenceUi(acq?.whatsappConfidence ?? lead.whatsappConfidence);
  const signals: string[] =
    lead.whatsappSignals?.length
      ? [...lead.whatsappSignals]
      : acq?.whatsappSignals
        ? [...acq.whatsappSignals]
        : [];
  const tr = normalizePhoneNumber(lead.phone);
  const hasWaPath = normalizePhoneForWhatsApp(lead.phone) !== null;
  const wi = lead.websiteIntelligence;
  const meta = wi?.whatsappSurfaceMeta;
  const sourceTr =
    (meta?.validatedLinkCount ?? 0) > 0
      ? "Web sitesi wa.me / api bağlantısı"
      : wi?.hasWhatsAppLink
        ? "Web sitesi bağlantısı"
        : tr
          ? "Kayıtlı GSM"
          : (lead.extractedSocialLinks ?? []).some((u) => /wa\.me|whatsapp/i.test(u))
            ? "Çıkarılmış bağlantı"
            : "Genel sinyal";
  const sourceEn =
    (meta?.validatedLinkCount ?? 0) > 0
      ? "Website wa.me / API link"
      : wi?.hasWhatsAppLink
        ? "Website link"
        : tr
          ? "Listed mobile"
          : (lead.extractedSocialLinks ?? []).some((u) => /wa\.me|whatsapp/i.test(u))
            ? "Extracted link hint"
            : "Listing / scan signal";
  const statusTr =
    conf === "confirmed"
      ? "Bağlantı katmanı doğrulandı"
      : conf === "likely" || conf === "weak"
        ? "Manuel kontrol önerilir"
        : hasWaPath
          ? "WhatsApp olası – kontrol gerekli"
          : "Kayıtlı kanal yok";
  const statusEn =
    conf === "confirmed"
      ? "Validated link layer"
      : conf === "likely" || conf === "weak"
        ? "Manual check suggested"
        : hasWaPath
          ? "Possible WhatsApp path – check needed"
          : "No WhatsApp channel on record";
  const trustTR =
    conf === "confirmed" ? "Yüksek" : conf === "likely" ? "Orta" : conf === "weak" ? "Düşük" : "Yok";
  const trustEN =
    conf === "confirmed" ? "High" : conf === "likely" ? "Medium" : conf === "weak" ? "Low" : "None";

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-200">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {locale === "tr" ? "WhatsApp Durumu" : "WhatsApp status"}
      </div>
      <ul className="space-y-0.5 text-zinc-300">
        <li>
          <span className="text-zinc-500">{locale === "tr" ? "Güven:" : "Confidence:"}</span>{" "}
          {locale === "tr" ? trustTR : trustEN}{" "}
          <span className="text-zinc-500">({conf})</span>
        </li>
        <li>
          <span className="text-zinc-500">{locale === "tr" ? "Kaynak:" : "Source:"}</span>{" "}
          {locale === "tr" ? sourceTr : sourceEn}
        </li>
        <li>
          <span className="text-zinc-500">{locale === "tr" ? "Numara:" : "Number:"}</span>{" "}
          {tr ?? "—"}
        </li>
        <li>
          <span className="text-zinc-500">{locale === "tr" ? "Durum:" : "Status:"}</span>{" "}
          {locale === "tr" ? statusTr : statusEn}
        </li>
      </ul>
      {signals.length > 0 ? (
        <div className="mt-1.5 border-t border-white/5 pt-1.5 text-zinc-400">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {locale === "tr" ? "Sinyaller" : "Signals"}
          </div>
          <ul className="mt-0.5 list-inside list-disc text-zinc-400">
            {signals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** v1.5 Verified Contact Center — single source of truth for all outreach actions. */
function LeadContactCenter({
  lead,
  finderPersisted,
}: {
  lead: LeadTableRow;
  finderPersisted: ContactFinderResult | undefined;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const v = lead.signalVerification;

  // ── WhatsApp ─────────────────────────────────────────────────────────
  // Source URL priority: verified wa.me link from site > finder result > listing phone
  const waSourceUrl = v?.whatsappSourceUrl ?? null;
  const isWaDirectLink =
    !!waSourceUrl && /^https?:\/\/(wa\.me|api\.whatsapp\.com|[^/]*whatsapp\.com)/i.test(waSourceUrl);

  const waFromFinder =
    finderPersisted &&
    (finderPersisted.bestContactType === "VERIFIED_WHATSAPP" ||
      finderPersisted.bestContactType === "whatsapp" ||
      finderPersisted.bestContactType === "GENERATED_WHATSAPP")
      ? finderPersisted.bestContactValue
      : null;

  const waUrl = (() => {
    if (isWaDirectLink) return waSourceUrl!;
    if (waFromFinder) {
      const digits = normalizePhoneForWhatsApp(waFromFinder);
      if (digits) return `https://wa.me/${digits}`;
    }
    if (lead.phone) {
      const digits = normalizePhoneForWhatsApp(lead.phone);
      if (digits) return `https://wa.me/${digits}`;
    }
    return null;
  })();

  // Human-readable phone number for display
  const waDisplayNumber = (() => {
    // Try to extract from the wa.me URL first (most reliable)
    const urlToCheck = waUrl ?? waSourceUrl ?? null;
    if (urlToCheck) {
      const d = extractDigitsFromWhatsAppUrl(urlToCheck);
      if (d && d.length === 12 && d.startsWith("90")) {
        return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
      }
      if (d && d.length >= 8) return `+${d}`;
    }
    if (waFromFinder) return waFromFinder;
    return normalizePhoneNumber(lead.phone ?? "") ?? lead.phone ?? null;
  })();

  const waState = v?.whatsappVerification ?? "not_found";
  const waConfidence = v?.whatsappConfidence ?? 0;
  const waSource = v?.whatsappSource;
  const showWa = waState === "verified" || waState === "likely" || !!waUrl;

  // ── Phone ─────────────────────────────────────────────────────────────
  const showPhone = !!lead.phone;

  // ── Website ───────────────────────────────────────────────────────────
  const websiteRawUrl = (() => {
    if (v?.websiteSourceUrl) return v.websiteSourceUrl;
    if (lead.website) {
      return lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
    }
    if (lead.websiteCandidateUrl) return lead.websiteCandidateUrl;
    return null;
  })();
  const websiteDomain = websiteRawUrl
    ? websiteRawUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0]
    : null;
  const webState = v?.websiteVerification ?? (websiteRawUrl ? "reachable" : "not_found");
  const webConfidence = v?.websiteConfidence ?? 0;
  const showWebsite = !!websiteRawUrl && webState !== "not_found" && webState !== "broken";

  // ── Instagram ─────────────────────────────────────────────────────────
  const igRawUrl = v?.instagramSourceUrl ?? (lead.instagram ? instagramLink(lead.instagram) : null);
  const igHandle = (() => {
    if (igRawUrl) {
      const seg = igRawUrl.replace(/^https?:\/\/(www\.)?instagram\.com\/?/, "").replace(/\/?$/, "");
      return seg.replace(/^@/, "") || lead.instagram || null;
    }
    return lead.instagram ?? null;
  })();
  const igState = v?.instagramVerification ?? (lead.instagram ? "candidate" : "not_found");
  const igConfidence = v?.instagramConfidence ?? (lead.instagram ? 55 : 0);
  const showIg = (!!igRawUrl || !!lead.instagram) && igState !== "not_found";

  // ── Best channel recommendation ───────────────────────────────────────
  type BestChannelRec = { channel: string; tier: "high" | "medium" | "low"; reason: string };
  const bestChannel: BestChannelRec | null = (() => {
    // Finder result overrides everything when available
    if (finderPersisted) {
      const ct = finderPersisted.bestContactType;
      const tier = finderPersisted.confidence;
      if (ct === "VERIFIED_WHATSAPP" || ct === "whatsapp") {
        return {
          channel: "WhatsApp",
          tier,
          reason: tr
            ? "Sitede doğrulanmış WhatsApp bağlantısı bulundu."
            : "Verified WhatsApp link found on official website.",
        };
      }
      if (ct === "GENERATED_WHATSAPP") {
        return {
          channel: "WhatsApp",
          tier,
          reason: tr
            ? "GSM numarası üzerinden WhatsApp erişimi mümkün."
            : "WhatsApp accessible via mobile number.",
        };
      }
      if (ct === "PHONE_ONLY" || ct === "mobile" || ct === "phone") {
        return {
          channel: tr ? "Telefon" : "Phone",
          tier,
          reason: tr
            ? "Telefon en güvenilir erişim kanalı."
            : "Phone is the most reliable contact channel.",
        };
      }
      if (ct === "website") {
        return {
          channel: tr ? "Web Sitesi" : "Website",
          tier,
          reason: tr
            ? "İletişim sayfası üzerinden ulaşım önerilir."
            : "Contact via website contact page.",
        };
      }
    }
    // Derive from signal verification
    if (v?.whatsappVerification === "verified") {
      const srcLabel = signalSourceLabel(v.whatsappSource, locale) ?? (tr ? "web sitesi" : "website");
      return {
        channel: "WhatsApp",
        tier: "high",
        reason: tr
          ? `${srcLabel} üzerinde doğrulanmış WhatsApp bağlantısı.`
          : `Verified WhatsApp link on ${srcLabel}.`,
      };
    }
    if (v?.whatsappVerification === "likely" && waUrl) {
      return {
        channel: "WhatsApp",
        tier: "medium",
        reason: tr
          ? "GSM numarası mevcut, WhatsApp olası."
          : "Mobile number available, WhatsApp likely.",
      };
    }
    if (waUrl) {
      return {
        channel: "WhatsApp",
        tier: "medium",
        reason: tr
          ? "GSM numarası üzerinden iletişim denenebilir."
          : "Can try WhatsApp via mobile number.",
      };
    }
    if (showWebsite) {
      return {
        channel: tr ? "Web Sitesi" : "Website",
        tier: "medium",
        reason: tr
          ? "Resmi web sitesi üzerinden iletişim kurulabilir."
          : "Contact via official website.",
      };
    }
    if (showIg) {
      return {
        channel: "Instagram",
        tier: "low",
        reason: tr
          ? "Instagram DM üzerinden iletişim denenebilir."
          : "Can try contact via Instagram DM.",
      };
    }
    return null;
  })();

  if (!showWa && !showPhone && !showWebsite && !showIg) return null;

  // ── Helpers ───────────────────────────────────────────────────────────
  const confidenceLabel = (n: number) => {
    if (n >= 80) return tr ? "YÜKSEK" : "HIGH";
    if (n >= 50) return tr ? "ORTA" : "MEDIUM";
    return tr ? "DÜŞÜK" : "LOW";
  };
  const confidenceClass = (n: number) => {
    if (n >= 80) return "text-emerald-300";
    if (n >= 50) return "text-amber-300";
    return "text-zinc-400";
  };
  const tierLabel = (t: "high" | "medium" | "low") => {
    if (t === "high") return tr ? "YÜKSEK" : "HIGH";
    if (t === "medium") return tr ? "ORTA" : "MEDIUM";
    return tr ? "DÜŞÜK" : "LOW";
  };
  const tierClass = (t: "high" | "medium" | "low") => {
    if (t === "high") return "text-emerald-300";
    if (t === "medium") return "text-amber-300";
    return "text-zinc-400";
  };

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2.5">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {tr ? "İletişim Merkezi" : "Contact Center"}
      </div>

      <div className="space-y-2.5">
        {/* WhatsApp */}
        {showWa && (
          <div className="rounded-md border border-zinc-700/40 bg-zinc-800/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={waState === "verified" ? "text-emerald-400" : "text-amber-400"}
                  aria-hidden="true"
                >
                  {waState === "verified" ? "✓" : "~"}
                </span>
                <span className="text-[11px] font-semibold text-zinc-200">
                  {tr
                    ? waState === "verified"
                      ? "WhatsApp Doğrulandı"
                      : "WhatsApp Olası"
                    : waState === "verified"
                      ? "WhatsApp Verified"
                      : "WhatsApp Likely"}
                </span>
              </div>
              {waConfidence > 0 && (
                <span className={`text-[10px] font-semibold tabular-nums ${confidenceClass(waConfidence)}`}>
                  {confidenceLabel(waConfidence)}
                </span>
              )}
            </div>
            {waDisplayNumber && (
              <div className="mt-1 font-mono text-[11px] text-zinc-300">{waDisplayNumber}</div>
            )}
            {waSource && (
              <div className="mt-0.5 text-[10px] text-zinc-500">
                {tr ? "Kaynak: " : "Source: "}
                <span className="text-zinc-400">{signalSourceLabel(waSource, locale)}</span>
              </div>
            )}
            {v?.verifiedAt && (
              <div className="mt-0.5 text-[10px] text-zinc-600">
                {fmtMemoryDate(v.verifiedAt, locale)}
              </div>
            )}
            {waUrl && (
              <button
                type="button"
                onClick={() => window.open(waUrl!, "_blank")}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 active:scale-95"
              >
                {tr ? "WhatsApp Aç" : "Open WhatsApp"}
              </button>
            )}
          </div>
        )}

        {/* Phone */}
        {showPhone && (
          <div className="rounded-md border border-zinc-700/40 bg-zinc-800/60 p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sky-400" aria-hidden="true">✓</span>
              <span className="text-[11px] font-semibold text-zinc-200">
                {tr ? "Telefon" : "Phone"}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-zinc-300">{lead.phone}</div>
            <div className="mt-2 flex gap-1.5">
              <a
                href={`tel:${(lead.phone ?? "").replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300 transition hover:bg-sky-500/20 active:scale-95"
              >
                {tr ? "Ara" : "Call"}
              </a>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(lead.phone ?? "")}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600/40 bg-zinc-700/30 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700/50 active:scale-95"
              >
                {tr ? "Kopyala" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Website */}
        {showWebsite && (
          <div className="rounded-md border border-zinc-700/40 bg-zinc-800/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={webState === "verified" ? "text-emerald-400" : "text-amber-400"}
                  aria-hidden="true"
                >
                  {webState === "verified" ? "✓" : "~"}
                </span>
                <span className="text-[11px] font-semibold text-zinc-200">
                  {tr ? "Web Sitesi" : "Website"}
                </span>
              </div>
              {webConfidence > 0 && (
                <span className={`text-[10px] font-semibold tabular-nums ${confidenceClass(webConfidence)}`}>
                  {confidenceLabel(webConfidence)}
                </span>
              )}
            </div>
            {websiteDomain && (
              <div className="mt-1 truncate font-mono text-[11px] text-zinc-300">
                {websiteDomain}
              </div>
            )}
            <a
              href={websiteRawUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-600/40 bg-zinc-700/30 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700/50 active:scale-95"
            >
              {tr ? "Siteyi Aç" : "Open Website"}
            </a>
          </div>
        )}

        {/* Instagram */}
        {showIg && (
          <div className="rounded-md border border-zinc-700/40 bg-zinc-800/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={igState === "verified" ? "text-emerald-400" : "text-pink-400"}
                  aria-hidden="true"
                >
                  {igState === "verified" ? "✓" : "~"}
                </span>
                <span className="text-[11px] font-semibold text-zinc-200">Instagram</span>
              </div>
              {igConfidence > 0 && (
                <span className={`text-[10px] font-semibold tabular-nums ${confidenceClass(igConfidence)}`}>
                  {confidenceLabel(igConfidence)}
                </span>
              )}
            </div>
            {igHandle && (
              <div className="mt-1 font-mono text-[11px] text-zinc-300">@{igHandle}</div>
            )}
            {igRawUrl && (
              <a
                href={igRawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-pink-500/25 bg-pink-500/10 px-3 py-1 text-[11px] font-medium text-pink-300 transition hover:bg-pink-500/20 active:scale-95"
              >
                {tr ? "Instagram Aç" : "Open Instagram"}
              </a>
            )}
          </div>
        )}

        {/* Önerilen İlk Temas */}
        {bestChannel && (
          <div className="rounded-md border border-indigo-500/20 bg-indigo-500/[0.06] p-2.5">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-indigo-300/70">
              {tr ? "Önerilen İlk Temas" : "Recommended First Contact"}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-indigo-200">{bestChannel.channel}</span>
              <span className={`text-[10px] font-semibold ${tierClass(bestChannel.tier)}`}>
                {tierLabel(bestChannel.tier)}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{bestChannel.reason}</p>
          </div>
        )}
      </div>
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
  findBestContact: (leadId: string, input: ContactFinderInput) => Promise<void>;
}) {
  const { locale } = useLocale();
  const s = lead._s;
  const loadingHere =
    finderRequest.status === "loading" && finderRequest.leadId === lead.id;
  const finderErrHere =
    finderRequest.status === "error" && finderRequest.leadId === lead.id;
  const nowTs = Date.now();
  // Best URL to send to the Contact Finder API — prefer the canonical website field
  // (which is now promoted from signalVerification.websiteSourceUrl if needed),
  // fall back to the candidate URL discovered during enrichment.
  const finderUrl = lead.website || lead.websiteCandidateUrl;
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
      {lead.websiteCandidateUrl?.trim() ? (
        <div className="text-[11px] leading-relaxed text-amber-200/85">
          {t("detail_website_candidate_label", locale)}:{" "}
          <span className="font-mono text-amber-100/90">{lead.websiteCandidateUrl}</span>
        </div>
      ) : null}

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
            href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            {lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </div>

      <InstagramDiscoveryPanel acquisition={lead.acquisitionIntelligence} />
      <LeadDetailWhatsAppStatus lead={lead} />
      <AcquisitionIntelligencePanel acquisition={lead.acquisitionIntelligence} lead={lead} />
      {(lead.hasReservationCTA ||
        lead.hasContactPage ||
        (lead.extractedPhones?.length ?? 0) > 0 ||
        (lead.extractedEmails?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {lead.hasReservationCTA ? (
            <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
              {t("detail_badge_reservation_cta", locale)}
            </span>
          ) : null}
          {lead.hasContactPage ? (
            <span className="inline-flex items-center rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-200">
              {t("detail_badge_contact_page", locale)}
            </span>
          ) : null}
          {(lead.extractedPhones?.length ?? 0) > 0 || (lead.extractedEmails?.length ?? 0) > 0 ? (
            <span className="inline-flex items-center rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-200">
              {t("detail_badge_contact_extracted", locale)}
            </span>
          ) : null}
        </div>
      )}

      {(finderUrl || lead.phone || lead.instagram || !!finderPersisted) && (
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              {t("detail_contact_finder_header", locale)}
            </div>
            {(finderUrl || lead.phone || lead.instagram) && (
              <button
                type="button"
                onClick={() =>
                  void findBestContact(lead.id, {
                    website: finderUrl || undefined,
                    phone: lead.phone || undefined,
                    instagram: lead.instagram || undefined,
                  })
                }
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20"
              >
                {t("detail_find_best_contact", locale)}
              </button>
            )}
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

function DashboardSectionHeader({ title, titleTr }: { title: string; titleTr: string }) {
  const { locale } = useLocale();
  return (
    <div className="mb-5 mt-8 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/[0.08]" />
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {locale === "tr" ? titleTr : title}
      </span>
      <div className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

type WorkspaceTab = "overview" | "opportunity" | "revenue" | "execution";

/**
 * v4.2 — Shared workspace identity header. Establishes the Revenue Queue
 * operating-workspace design language across every workspace: accent chip,
 * title + operational subtitle, optional inline action cluster.
 */
type WorkspaceAccent = "indigo" | "emerald" | "orange" | "violet" | "amber" | "sky";

function WorkspaceHeader({
  icon,
  title,
  subtitle,
  accent = "indigo",
  actions,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  accent?: WorkspaceAccent;
  actions?: ReactNode;
}) {
  const accentMap: Record<WorkspaceAccent, { chip: string; text: string; border: string; glow: string }> = {
    indigo: { chip: "bg-indigo-500/20", text: "text-indigo-100", border: "border-indigo-400/20", glow: "ring-indigo-400/10" },
    emerald: { chip: "bg-emerald-500/20", text: "text-emerald-100", border: "border-emerald-400/20", glow: "ring-emerald-400/10" },
    orange: { chip: "bg-orange-500/20", text: "text-orange-100", border: "border-orange-400/20", glow: "ring-orange-400/10" },
    violet: { chip: "bg-violet-500/20", text: "text-violet-100", border: "border-violet-400/20", glow: "ring-violet-400/10" },
    amber: { chip: "bg-amber-500/20", text: "text-amber-100", border: "border-amber-400/20", glow: "ring-amber-400/10" },
    sky: { chip: "bg-sky-500/20", text: "text-sky-100", border: "border-sky-400/20", glow: "ring-sky-400/10" },
  };
  const a = accentMap[accent];
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border ${a.border} bg-white/[0.02] px-5 py-4 backdrop-blur ring-1 ring-inset ${a.glow}`}
    >
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${a.chip}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className={`text-sm font-bold tracking-tight ${a.text}`}>{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

/**
 * v5.5 — Unified Founder Console shell. Every major workspace uses this single pattern:
 * compact header (identity + optional actions) → 2-col body [main content | right intelligence].
 * Viewport-constrained on desktop: the whole shell fills the content region (lg:h-full) and the
 * main + right slots scroll internally, so switching workspaces feels like switching views of one app.
 * Pure layout — no data/engine logic.
 */
function FounderConsoleShell({
  icon,
  title,
  subtitle,
  accent = "indigo",
  actions,
  tabs,
  left,
  right,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  accent?: WorkspaceAccent;
  actions?: ReactNode;
  tabs?: ReactNode;
  left: ReactNode;
  right: ReactNode;
}) {
  const accentMap: Record<WorkspaceAccent, { chip: string; text: string; border: string; glow: string }> = {
    indigo: { chip: "bg-indigo-500/20", text: "text-indigo-100", border: "border-indigo-400/20", glow: "ring-indigo-400/10" },
    emerald: { chip: "bg-emerald-500/20", text: "text-emerald-100", border: "border-emerald-400/20", glow: "ring-emerald-400/10" },
    orange: { chip: "bg-orange-500/20", text: "text-orange-100", border: "border-orange-400/20", glow: "ring-orange-400/10" },
    violet: { chip: "bg-violet-500/20", text: "text-violet-100", border: "border-violet-400/20", glow: "ring-violet-400/10" },
    amber: { chip: "bg-amber-500/20", text: "text-amber-100", border: "border-amber-400/20", glow: "ring-amber-400/10" },
    sky: { chip: "bg-sky-500/20", text: "text-sky-100", border: "border-sky-400/20", glow: "ring-sky-400/10" },
  };
  const a = accentMap[accent];
  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      {/* Compact console identity */}
      <section
        className={`flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border ${a.border} bg-white/[0.02] px-4 py-2.5 backdrop-blur ring-1 ring-inset ${a.glow}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${a.chip}`}>
              {icon}
            </div>
          )}
          <h2 className={`shrink-0 text-sm font-bold tracking-tight ${a.text}`}>{title}</h2>
          {subtitle && <p className="hidden truncate text-[11px] text-zinc-500 lg:block">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </section>
      {/* v6.0 — optional queue tabs strip (filtered views of the same console) */}
      {tabs && <div className="shrink-0">{tabs}</div>}
      {/* Body: main content (left) + right intelligence */}
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        {left}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">{right}</div>
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
  onManualReEnrich,
  manualReEnrichBusy,
  manualReEnrichMessage,
  onAiReviewCompleted,
}: {
  selectedLead: LeadTableRow;
  onClose: () => void;
  finderPersisted: ContactFinderResult | undefined;
  contactFinderRequest: ContactFinderRequestState;
  draftNote: string;
  setDraftNote: (v: string) => void;
  updateLead: (id: string, patch: Partial<LeadStatusUpdate>) => void;
  setLeadStatus: (id: string, status: LeadStatus) => void;
  findBestContact: (leadId: string, input: ContactFinderInput) => Promise<void>;
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
  onManualReEnrich: () => void;
  manualReEnrichBusy: boolean;
  manualReEnrichMessage: string | null;
  onAiReviewCompleted?: () => void;
}) {
  const { locale } = useLocale();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab("overview");
  }, [selectedLead.id]);

  const TAB_LABELS: Record<WorkspaceTab, { en: string; tr: string }> = {
    overview:    { en: "Overview",    tr: "Genel Bakış" },
    opportunity: { en: "Opportunity", tr: "Fırsat"      },
    revenue:     { en: "Revenue",     tr: "Gelir"       },
    execution:   { en: "Execution",   tr: "Uygulama"    },
  };
  const ALL_TABS: WorkspaceTab[] = ["overview", "opportunity", "revenue", "execution"];

  function handleTabClick(tab: WorkspaceTab) {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LeadDetailHeader lead={selectedLead} onClose={onClose} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <LeadDetailScoreSummary lead={selectedLead} />
        <div className="mt-4 flex flex-col gap-1.5">
          <button
            type="button"
            disabled={manualReEnrichBusy}
            onClick={() => onManualReEnrich()}
            className="self-start rounded-md border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {manualReEnrichBusy
              ? t("detail_reenrich_loading", locale)
              : t("detail_reenrich_button", locale)}
          </button>
          {manualReEnrichMessage ? (
            <p className="max-w-full text-[11px] leading-snug text-zinc-500">
              {manualReEnrichMessage}
            </p>
          ) : null}
        </div>

        {/* Workspace tab bar */}
        <div className="mt-5 grid grid-cols-4 border-b border-white/[0.08]">
          {ALL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`-mb-px border-b-2 py-2.5 text-[11px] font-medium transition-colors ${
                activeTab === tab
                  ? "border-indigo-400 text-indigo-300"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {locale === "tr" ? TAB_LABELS[tab].tr : TAB_LABELS[tab].en}
            </button>
          ))}
        </div>

        {/* Overview — "How valuable is this lead?" */}
        {activeTab === "overview" && (
          <div className="space-y-3 pt-4">
            <RevenuePotentialCard lead={selectedLead} />
            <CommercialPackagingCard lead={selectedLead} />
            <ExpectedRevenueCard lead={selectedLead} />
            <LeadIcpSection lead={selectedLead} />
          </div>
        )}

        {/* Opportunity — "Can this lead realistically become a customer?" */}
        {activeTab === "opportunity" && (
          <div className="space-y-3 pt-4">
            <LeadOpportunityBlock lead={selectedLead} />
            <LeadDetailIntelligenceSection
              lead={selectedLead}
              finderPersisted={finderPersisted}
            />
            <LeadContactCenter lead={selectedLead} finderPersisted={finderPersisted} />
            <LeadDetailContactSection
              lead={selectedLead}
              finderPersisted={finderPersisted}
              finderRequest={contactFinderRequest}
              updateLead={updateLead}
              findBestContact={findBestContact}
            />
            <LeadSignalVerificationBlock lead={selectedLead} />
          </div>
        )}

        {/* Revenue — "What revenue opportunity exists?" */}
        {activeTab === "revenue" && (
          <div className="space-y-3 pt-4">
            <LeadDetailAiInsightSection
              lead={selectedLead}
              onAiReviewCompleted={onAiReviewCompleted}
            />
            <LeadDetailMetrics lead={selectedLead} />
          </div>
        )}

        {/* Execution — "What should I do next?" */}
        {activeTab === "execution" && (
          <div className="space-y-3 pb-4 pt-4">
            <LeadActivityTimelineBlock lead={selectedLead} />
            <OperationGuideSection lead={selectedLead} finder={finderPersisted} now={now} />
            <PipelineStageActions lead={selectedLead} setLeadStatus={setLeadStatus} now={now} />
            <DemoReadinessCard lead={selectedLead} />
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
            <LeadEnrichmentMetaBlock lead={selectedLead} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Header brand logo.
 * Renders the Tugobo Lead Engine PNG at 36 px height.
 * Falls back to the original gradient "T" mark if the asset fails to load.
 */
function BrandLogo() {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-orange-500 text-xs font-bold text-white shadow-lg shadow-indigo-500/20">
        T
      </div>
    );
  }
  return (
    <Image
      src="/assets/logos/tugobo-lead-engine-icon.png"
      alt="Tugobo Lead Engine"
      width={40}
      height={40}
      className="h-10 w-auto object-contain"
      priority
      onError={() => setImgError(true)}
    />
  );
}

/** One compact row inside a daily-queue section. */
/** v2.2 — One-line outreach mode hint for a queue candidate. Pure. */
function queueOutreachHint(
  candidate: QueueCandidate,
  tr: boolean,
): { text: string; cls: string } | null {
  if (candidate.followUpDue)
    return {
      text: tr ? "Takip zamanı geldi" : "Follow-up due",
      cls: "text-amber-400",
    };
  const v = candidate.row.signalVerification;
  if (v?.whatsappVerification === "verified" || candidate.channels.waUrl)
    return {
      text: tr ? "WhatsApp önerilir" : "WhatsApp recommended",
      cls: "text-emerald-400",
    };
  if (
    v?.instagramVerification === "verified" ||
    v?.instagramVerification === "likely" ||
    candidate.row.instagram
  )
    return {
      text: tr ? "Instagram önerilir" : "Instagram recommended",
      cls: "text-sky-400",
    };
  return null;
}

function DailyQueueItem({
  candidate,
  rank,
  onOpenDetail,
  onAddToQueue,
  onContact,
  queueLimitReached,
}: {
  candidate: QueueCandidate;
  rank?: number;
  onOpenDetail: (id: string) => void;
  onAddToQueue: (id: string) => void;
  onContact: (id: string, channel: "whatsapp" | "phone" | "website", url: string) => void;
  queueLimitReached: boolean;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const { row, channels } = candidate;
  const tier = row.opportunityTier;
  const score = row.verifiedOpportunityScore;
  const tierLabel =
    tier && OPPORTUNITY_TIER_LABELS[tier]
      ? tr
        ? OPPORTUNITY_TIER_LABELS[tier].tr
        : OPPORTUNITY_TIER_LABELS[tier].en
      : tier ?? "";
  const hint = queueOutreachHint(candidate, tr);

  return (
    <div className="flex items-center gap-2 rounded-md border border-white/8 bg-white/[0.015] px-2.5 py-2 transition hover:bg-white/[0.03]">
      {typeof rank === "number" && (
        <span className="w-4 shrink-0 text-center text-[10px] font-bold tabular-nums text-zinc-600">
          {rank}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-zinc-100">{row.name}</span>
          {row.city && (
            <span className="shrink-0 text-[10px] text-zinc-500">· {row.city}</span>
          )}
          {tier && <span className={opportunityTierChip(tier)}>{tierLabel}</span>}
          {typeof score === "number" && (
            <span className={`shrink-0 tabular-nums text-[11px] font-semibold ${tier ? opportunityTierColor(tier) : "text-zinc-300"}`}>
              {score}
            </span>
          )}
          {candidate.inOutreachQueue && (
            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-200 ring-1 ring-inset ring-indigo-400/30">
              {tr ? "Kuyrukta" : "In queue"}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px]">
          <span className="truncate text-zinc-500">{candidate.reasonText}</span>
          {hint && <span className={`shrink-0 font-medium ${hint.cls}`}>{hint.text}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onOpenDetail(row.id)}
          className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-zinc-300 transition hover:bg-white/10"
        >
          {tr ? "Detay" : "Detail"}
        </button>
        {channels.waUrl && (
          <button
            type="button"
            onClick={() => onContact(row.id, "whatsapp", channels.waUrl!)}
            className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-1 text-[10px] font-medium text-emerald-200 transition hover:bg-emerald-500/20"
          >
            WA
          </button>
        )}
        {!channels.waUrl && channels.phone && (
          <button
            type="button"
            onClick={() => onContact(row.id, "phone", `tel:${channels.phone!.replace(/\s+/g, "")}`)}
            className="rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-1 text-[10px] font-medium text-sky-200 transition hover:bg-sky-500/20"
          >
            {tr ? "Ara" : "Call"}
          </button>
        )}
        {!channels.waUrl && !channels.phone && channels.websiteUrl && (
          <button
            type="button"
            onClick={() => onContact(row.id, "website", channels.websiteUrl!)}
            className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-zinc-300 transition hover:bg-white/10"
          >
            Web
          </button>
        )}
        {!candidate.inOutreachQueue && !candidate.followUpScheduled && (
          <button
            type="button"
            onClick={() => onAddToQueue(row.id)}
            disabled={queueLimitReached}
            title={queueLimitReached ? (tr ? "Günlük kuyruk dolu" : "Daily queue full") : undefined}
            className="rounded border border-fuchsia-400/25 bg-fuchsia-500/10 px-1.5 py-1 text-[10px] font-medium text-fuchsia-200 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tr ? "Kuyruk" : "Queue"}
          </button>
        )}
      </div>
    </div>
  );
}

/** v1.6 — "Bugünün Fırsatları" daily sales-priority queue with 4 sections. */
function DailyOpportunityQueue({
  partition,
  onOpenDetail,
  onAddToQueue,
  onContact,
  queueLimitReached,
}: {
  partition: DailyQueuePartition;
  onOpenDetail: (id: string) => void;
  onAddToQueue: (id: string) => void;
  onContact: (id: string, channel: "whatsapp" | "phone" | "website", url: string) => void;
  queueLimitReached: boolean;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const { todays, followUps, highNoContact, lowPriority } = partition;

  const renderSection = (
    title: string,
    subtitle: string,
    items: QueueCandidate[],
    opts?: { ranked?: boolean; limit?: number; tone?: string },
  ) => {
    const limit = opts?.limit ?? items.length;
    const shown = items.slice(0, limit);
    const more = items.length - shown.length;
    return (
      <div className="rounded-lg border border-white/8 bg-black/20 p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${opts?.tone ?? "text-zinc-200"}`}>
            {title}
            <span className="ml-1.5 text-[10px] font-normal tabular-nums text-zinc-500">
              ({items.length})
            </span>
          </h3>
        </div>
        <p className="mb-2 text-[11px] text-zinc-500">{subtitle}</p>
        {shown.length === 0 ? (
          <div className="px-1 py-2 text-[11px] text-zinc-600">
            {tr ? "Bu bölümde uygun lead yok." : "No leads in this section."}
          </div>
        ) : (
          <div className="space-y-1.5">
            {shown.map((c, i) => (
              <DailyQueueItem
                key={c.row.id}
                candidate={c}
                rank={opts?.ranked ? i + 1 : undefined}
                onOpenDetail={onOpenDetail}
                onAddToQueue={onAddToQueue}
                onContact={onContact}
                queueLimitReached={queueLimitReached}
              />
            ))}
            {more > 0 && (
              <div className="px-1 pt-1 text-[11px] text-zinc-600">
                {tr ? `+${more} daha` : `+${more} more`}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.03] p-4 backdrop-blur ring-1 ring-inset ring-fuchsia-400/10">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-fuchsia-500/20">
          <IconSpark className="h-3.5 w-3.5 text-fuchsia-200" />
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-fuchsia-200">
          {tr ? "Bugünün Fırsatları" : "Today's Opportunities"}
        </h2>
        <span className="text-[11px] text-zinc-500">
          {tr
            ? "Bugün hangi işletmelerle iletişime geçmelisin?"
            : "Who should you contact today?"}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          {renderSection(
            tr ? "Bugünün Fırsatları" : "Today's Opportunities",
            tr
              ? "En güçlü fırsatlar önce — günlük öncelik sırasına göre ilk 10."
              : "Strongest opportunities first — top 10 by daily priority.",
            todays,
            { ranked: true, limit: 10, tone: "text-fuchsia-200" },
          )}
        </div>
        <div className="space-y-3">
          {renderSection(
            tr ? "Takip Bekleyenler" : "Awaiting Follow-up",
            tr
              ? "Takip planlanmış lead'ler — en yakın zamanı gelen önce."
              : "Leads with a scheduled follow-up — soonest due first.",
            followUps,
            { limit: 12, tone: "text-orange-200" },
          )}
          {renderSection(
            tr ? "Yüksek Fırsat — Henüz İletişim Yok" : "High Opportunity — Not Yet Contacted",
            tr
              ? "Güçlü fırsat ama hiç iletişime geçilmemiş yeni lead'ler."
              : "Strong but never-contacted new leads.",
            highNoContact,
            { limit: 10, tone: "text-emerald-200" },
          )}
          {renderSection(
            tr ? "Düşük Öncelik" : "Low Priority",
            tr ? "Bugün için daha düşük öncelikli adaylar." : "Lower-priority candidates for today.",
            lowPriority,
            { limit: 8, tone: "text-zinc-300" },
          )}
        </div>
      </div>
    </section>
  );
}

// ─── v3.9.3 Revenue-Aware Opportunity Queue ─────────────────────────────────

/** v3.9.3 — Revenue-prioritized queue grouped by tier (Critical / High / Medium / Low). */
function RevenueOpportunityQueuePanel({
  candidates,
  revenuePriorityMap,
  expectedRevenueMap,
  onOpenDetail,
  onAddToQueue,
  onContact,
  queueLimitReached,
}: {
  candidates: QueueCandidate[];
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>;
  expectedRevenueMap: Map<string, ExpectedRevenueResult>;
  onOpenDetail: (id: string) => void;
  onAddToQueue: (id: string) => void;
  onContact: (id: string, channel: "whatsapp" | "phone" | "website", url: string) => void;
  queueLimitReached: boolean;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const critical = candidates.filter((c) => revenuePriorityMap.get(c.row.id)?.revenuePriorityTier === "critical");
  const high = candidates.filter((c) => revenuePriorityMap.get(c.row.id)?.revenuePriorityTier === "high");
  const medium = candidates.filter((c) => revenuePriorityMap.get(c.row.id)?.revenuePriorityTier === "medium");
  const low = candidates.filter((c) => revenuePriorityMap.get(c.row.id)?.revenuePriorityTier === "low");

  const renderTierSection = (
    title: string,
    subtitle: string,
    items: QueueCandidate[],
    accentClass: string,
    borderBgClass: string,
    limit = 10,
  ) => {
    if (items.length === 0) return null;
    const shown = items.slice(0, limit);
    const more = items.length - shown.length;
    return (
      <div className={`rounded-lg border p-3 ${borderBgClass}`}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${accentClass}`}>
            {title}
            <span className="ml-1.5 text-[10px] font-normal tabular-nums text-zinc-500">({items.length})</span>
          </h3>
          <span className="text-[10px] text-zinc-500">{subtitle}</span>
        </div>
        <div className="space-y-1.5">
          {shown.map((c, i) => {
            const er = expectedRevenueMap.get(c.row.id);
            const rp = revenuePriorityMap.get(c.row.id);
            return (
              <div
                key={c.row.id}
                className="flex items-center gap-2 rounded-md border border-white/8 bg-white/[0.015] px-2.5 py-2 transition hover:bg-white/[0.03]"
              >
                <span className="w-4 shrink-0 text-center text-[10px] font-bold tabular-nums text-zinc-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-zinc-100">{c.row.name}</span>
                    {c.row.city && (
                      <span className="shrink-0 text-[10px] text-zinc-500">· {c.row.city}</span>
                    )}
                    {rp && (
                      <span className="rounded bg-white/5 px-1 py-0.5 text-[10px] font-medium tabular-nums text-zinc-300 ring-1 ring-inset ring-white/10">
                        {rp.revenuePriorityScore}
                      </span>
                    )}
                    {er && er.weightedExpectedMonthlyRevenue > 0 && (
                      <span className="shrink-0 text-[10px] font-medium text-emerald-300">
                        {formatTRY(er.weightedExpectedMonthlyRevenue)}/ay
                      </span>
                    )}
                    {c.inOutreachQueue && (
                      <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-200 ring-1 ring-inset ring-indigo-400/30">
                        {tr ? "Kuyrukta" : "In queue"}
                      </span>
                    )}
                    {(() => {
                      const label = actionRecommendationLabel(c, rp);
                      if (!label) return null;
                      const labelColor =
                        label === "Hemen Ara" ? "text-sky-300 ring-sky-400/30 bg-sky-500/10" :
                        label === "WhatsApp Gönder" ? "text-emerald-300 ring-emerald-400/30 bg-emerald-500/10" :
                        label === "Instagram Temas" ? "text-fuchsia-300 ring-fuchsia-400/30 bg-fuchsia-500/10" :
                        label === "Demo Planla" ? "text-violet-300 ring-violet-400/30 bg-violet-500/10" :
                        label === "Takip Yap" ? "text-amber-300 ring-amber-400/30 bg-amber-500/10" :
                        "text-zinc-400 ring-white/10 bg-white/5";
                      return (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${labelColor}`}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px]">
                    <span className="truncate text-zinc-500">{c.reasonText}</span>
                    {er && er.expectedCustomerProbability > 0 && (
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        %{Math.round(er.expectedCustomerProbability * 100)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(c.row.id)}
                    className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-zinc-300 transition hover:bg-white/10"
                  >
                    {tr ? "Detay" : "Detail"}
                  </button>
                  {c.channels.waUrl && (
                    <button
                      type="button"
                      onClick={() => onContact(c.row.id, "whatsapp", c.channels.waUrl!)}
                      className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-1 text-[10px] font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      WA
                    </button>
                  )}
                  {!c.channels.waUrl && c.channels.phone && (
                    <button
                      type="button"
                      onClick={() =>
                        onContact(c.row.id, "phone", `tel:${c.channels.phone!.replace(/\s+/g, "")}`)
                      }
                      className="rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-1 text-[10px] font-medium text-sky-200 transition hover:bg-sky-500/20"
                    >
                      {tr ? "Ara" : "Call"}
                    </button>
                  )}
                  {!c.channels.waUrl && !c.channels.phone && c.channels.websiteUrl && (
                    <button
                      type="button"
                      onClick={() => onContact(c.row.id, "website", c.channels.websiteUrl!)}
                      className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-zinc-300 transition hover:bg-white/10"
                    >
                      Web
                    </button>
                  )}
                  {!c.inOutreachQueue && !c.followUpScheduled && (
                    <button
                      type="button"
                      onClick={() => onAddToQueue(c.row.id)}
                      disabled={queueLimitReached}
                      className="rounded border border-fuchsia-400/25 bg-fuchsia-500/10 px-1.5 py-1 text-[10px] font-medium text-fuchsia-200 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {tr ? "Kuyruk" : "Queue"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {more > 0 && (
            <div className="px-1 pt-1 text-[11px] text-zinc-600">
              {tr ? `+${more} daha` : `+${more} more`}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
        {tr ? "Kuyruğa eklenecek fırsat bulunamadı." : "No opportunities for the queue."}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-indigo-400/15 bg-white/[0.015] p-5 backdrop-blur ring-1 ring-inset ring-white/5">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20">
          <IconSpark className="h-3.5 w-3.5 text-indigo-200" />
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
          {tr ? "Fırsat Kuyruğu" : "Opportunity Queue"}
        </h2>
        <span className="text-[11px] text-zinc-500">
          {tr ? "Revenue Priority sırasına göre" : "Sorted by Revenue Priority"}
        </span>
        <span className="ml-auto tabular-nums text-[11px] text-zinc-600">
          {candidates.length} {tr ? "fırsat" : "leads"}
        </span>
      </div>
      <div className="space-y-3">
        {renderTierSection(
          tr ? "Kritik" : "Critical",
          tr ? "Hemen harekete geç" : "Act immediately",
          critical,
          "text-rose-300",
          "border-rose-400/25 bg-rose-500/[0.04]",
          10,
        )}
        {renderTierSection(
          tr ? "Yüksek" : "High",
          tr ? "Bugün iletişime geç" : "Contact today",
          high,
          "text-amber-300",
          "border-amber-400/20 bg-amber-500/[0.03]",
          10,
        )}
        {renderTierSection(
          tr ? "Orta" : "Medium",
          tr ? "Bu hafta takip et" : "Follow up this week",
          medium,
          "text-indigo-300",
          "border-indigo-400/15 bg-indigo-500/[0.03]",
          8,
        )}
        {renderTierSection(
          tr ? "Düşük" : "Low",
          tr ? "Uzun vadeli fırsatlar" : "Long-term",
          low,
          "text-zinc-400",
          "border-white/8 bg-white/[0.01]",
          5,
        )}
      </div>
    </section>
  );
}

/** v3.9.3 — "Neden Bu Sıralama?" — queue sorting explanation panel (right side). */
function QueueReasoningPanel({
  topCandidate,
  revenuePriorityMap,
  expectedRevenueMap,
}: {
  topCandidate: QueueCandidate | null;
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>;
  expectedRevenueMap: Map<string, ExpectedRevenueResult>;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const row = topCandidate?.row ?? null;
  const er = row ? expectedRevenueMap.get(row.id) ?? null : null;
  const rp = row ? revenuePriorityMap.get(row.id) ?? null : null;

  const factors: { label: string; desc: string; accent: string }[] = [
    {
      label: tr ? "Ağırlıklı MRR" : "Weighted MRR",
      desc: tr ? "Paket fiyatı × dönüşüm olasılığı" : "Package price × conversion probability",
      accent: "text-emerald-300",
    },
    {
      label: tr ? "Dönüşüm Olasılığı" : "Conv. Probability",
      desc: tr ? "Sinyal ve pipeline verisiyle hesaplanır" : "Derived from signals and pipeline",
      accent: "text-sky-300",
    },
    {
      label: tr ? "Revenue Priority Skoru" : "Revenue Priority Score",
      desc: tr ? "0–100 birleşik skor" : "0–100 composite score",
      accent: "text-indigo-300",
    },
    {
      label: tr ? "Hazırlık Skoru" : "Readiness Score",
      desc: tr ? "İletişim kanalı ve veri kalitesi" : "Contact channel + data quality",
      accent: "text-violet-300",
    },
    {
      label: tr ? "Son Aktivite" : "Last Activity",
      desc: tr ? "En son temas veya takip tarihi" : "Latest contact or follow-up date",
      accent: "text-amber-300",
    },
    {
      label: tr ? "İletişim Hazırlığı" : "Contact Readiness",
      desc: tr ? "WhatsApp, telefon veya web" : "WhatsApp, phone or web",
      accent: "text-fuchsia-300",
    },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-300">
        {tr ? "Neden Bu Sıralama?" : "Why This Order?"}
      </div>
      {row && er && rp && (
        <div className="mb-3 rounded-lg border border-indigo-400/20 bg-indigo-500/[0.04] p-2.5">
          <div className="text-[11px] font-semibold text-zinc-200">{row.name}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="text-[10px]">
              <span className="text-zinc-500">{tr ? "Ağırlıklı MRR" : "W-MRR"}: </span>
              <span className="font-medium text-emerald-300">{formatTRY(er.weightedExpectedMonthlyRevenue)}</span>
            </div>
            <div className="text-[10px]">
              <span className="text-zinc-500">{tr ? "Olasılık" : "Prob."}: </span>
              <span className="font-medium text-sky-300">%{Math.round(er.expectedCustomerProbability * 100)}</span>
            </div>
            <div className="text-[10px]">
              <span className="text-zinc-500">{tr ? "R.Priority" : "R.Priority"}: </span>
              <span className="font-medium text-indigo-300">{rp.revenuePriorityScore}</span>
            </div>
            <div className="text-[10px]">
              <span className="text-zinc-500">{tr ? "Hazırlık" : "Readiness"}: </span>
              <span className="font-medium text-violet-300">{row.contactReadinessScore ?? "—"}</span>
            </div>
          </div>
          {rp.rankingReasoning.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {rp.rankingReasoning.slice(0, 3).map((r, i) => (
                <div key={i} className="text-[10px] text-zinc-500">· {r}</div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="space-y-2.5">
        {factors.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 w-3.5 shrink-0 text-center text-[11px] font-bold tabular-nums ${f.accent}`}>
              {i + 1}
            </span>
            <div>
              <div className={`text-[11px] font-semibold ${f.accent}`}>{f.label}</div>
              <div className="text-[10px] text-zinc-500">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** v3.9.3 — "Günün Operasyon Planı" daily action breakdown panel. */
function DailyActionPanel({
  candidates,
  revenuePriorityMap,
  onOpenDetail,
  onContact,
}: {
  candidates: QueueCandidate[];
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>;
  onOpenDetail: (id: string) => void;
  onContact: (id: string, channel: "whatsapp" | "phone" | "website", url: string) => void;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const callReady = candidates.filter((c) => {
    const rp = revenuePriorityMap.get(c.row.id);
    if (!rp || (rp.revenuePriorityTier !== "critical" && rp.revenuePriorityTier !== "high")) return false;
    return Boolean(c.channels.phone) || Boolean(c.channels.waUrl);
  });

  const msgReady = candidates.filter((c) => {
    const rp = revenuePriorityMap.get(c.row.id);
    if (!rp || (rp.revenuePriorityTier !== "critical" && rp.revenuePriorityTier !== "high")) return false;
    return Boolean(c.channels.waUrl) || Boolean(c.row.instagram?.trim());
  });

  const followUpsDue = candidates.filter((c) => c.followUpDue);
  const awaitingReply = candidates.filter(
    (c) => c.row._s.status === "contacted" || c.row._s.status === "replied",
  );

  const renderMiniRow = (c: QueueCandidate) => (
    <div key={c.row.id} className="flex items-center gap-1.5 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-200">{c.row.name}</span>
      <div className="ml-auto flex shrink-0 gap-1">
        {c.channels.waUrl && (
          <button
            type="button"
            onClick={() => onContact(c.row.id, "whatsapp", c.channels.waUrl!)}
            className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-medium text-emerald-200 transition hover:bg-emerald-500/20"
          >
            WA
          </button>
        )}
        {!c.channels.waUrl && c.channels.phone && (
          <button
            type="button"
            onClick={() =>
              onContact(c.row.id, "phone", `tel:${c.channels.phone!.replace(/\s+/g, "")}`)
            }
            className="rounded border border-sky-400/30 bg-sky-500/10 px-1 py-0.5 text-[9px] font-medium text-sky-200 transition hover:bg-sky-500/20"
          >
            {tr ? "Ara" : "Call"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenDetail(c.row.id)}
          className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px] text-zinc-400 transition hover:bg-white/10"
        >
          →
        </button>
      </div>
    </div>
  );

  const renderSection = (
    title: string,
    count: number,
    items: QueueCandidate[],
    accent: string,
    limit = 4,
  ) => (
    <div>
      <div className={`mb-1 flex items-baseline gap-1.5 text-[11px] font-semibold ${accent}`}>
        {title}
        <span className="text-[10px] font-normal text-zinc-500">({count})</span>
      </div>
      {items.length === 0 ? (
        <div className="text-[10px] text-zinc-600">{tr ? "Yok" : "None"}</div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {items.slice(0, limit).map(renderMiniRow)}
          {items.length > limit && (
            <div className="pt-1 text-[10px] text-zinc-600">
              +{items.length - limit} {tr ? "daha" : "more"}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-300">
        {tr ? "Günün Operasyon Planı" : "Daily Action Plan"}
      </div>
      <div className="space-y-4">
        {renderSection(tr ? "Aranacaklar" : "To Call", callReady.length, callReady, "text-sky-300")}
        {renderSection(tr ? "Mesaj Atılacaklar" : "To Message", msgReady.length, msgReady, "text-emerald-300")}
        {renderSection(
          tr ? "Takip Zamanı Gelenler" : "Follow-ups Due",
          followUpsDue.length,
          followUpsDue,
          "text-amber-300",
        )}
        {renderSection(
          tr ? "Bekleyen Yanıtlar" : "Awaiting Reply",
          awaitingReply.length,
          awaitingReply,
          "text-violet-300",
        )}
      </div>
    </div>
  );
}

/** v3.9.3 — Revenue summary for queue sourced from v3.9.0 / v3.9.1 engines. */
function RevenueSummaryPanel({
  candidates,
  revenuePriorityMap,
  expectedRevenueMap,
}: {
  candidates: QueueCandidate[];
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>;
  expectedRevenueMap: Map<string, ExpectedRevenueResult>;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  let queueMRR = 0;
  let queueARR = 0;
  let criticalCount = 0;
  let highCount = 0;

  for (const c of candidates) {
    const rp = revenuePriorityMap.get(c.row.id);
    const er = expectedRevenueMap.get(c.row.id);
    if (rp?.revenuePriorityTier === "critical") criticalCount++;
    if (rp?.revenuePriorityTier === "high") highCount++;
    if (er) {
      queueMRR += er.weightedExpectedMonthlyRevenue;
      queueARR += er.weightedExpectedAnnualRevenue;
    }
  }

  const items = [
    { label: tr ? "Kuyruk Ağırlıklı MRR" : "Queue Weighted MRR", value: formatTRY(queueMRR), accent: "text-emerald-300" },
    { label: tr ? "Kuyruk Ağırlıklı ARR" : "Queue Weighted ARR", value: formatTRY(queueARR), accent: "text-emerald-200" },
    { label: tr ? "Kritik Fırsat" : "Critical", value: String(criticalCount), accent: "text-rose-300" },
    { label: tr ? "Yüksek Öncelikli" : "High Priority", value: String(highCount), accent: "text-amber-300" },
  ];

  return (
    <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.03] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-300">
        {tr ? "Kuyruk Gelir Özeti" : "Queue Revenue Summary"}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{item.label}</div>
            <div className={`mt-0.5 text-sm font-semibold tabular-nums ${item.accent}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── v3.9.4 Daily Operations Desk ──────────────────────────────────────────

type DailyOperationsDesk = {
  calls: QueueCandidate[];
  messages: QueueCandidate[];
  followups: QueueCandidate[];
  waiting: QueueCandidate[];
  dailyRevenueImpact: number;
};

type QueueSubTab = "queue" | "calls" | "messages" | "followups" | "waiting";

function computeDailyOperationsDesk(
  candidates: QueueCandidate[],
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>,
  expectedRevenueMap: Map<string, ExpectedRevenueResult>,
): DailyOperationsDesk {
  const calls: QueueCandidate[] = [];
  const messages: QueueCandidate[] = [];
  const followups: QueueCandidate[] = [];
  const waiting: QueueCandidate[] = [];

  for (const c of candidates) {
    const rp = revenuePriorityMap.get(c.row.id);
    const status = c.row._s.status;
    const tier = rp?.revenuePriorityTier;
    const isCriticalOrHigh = tier === "critical" || tier === "high";

    if (isCriticalOrHigh && (c.row.contactReadinessScore ?? 0) >= 60 && Boolean(c.channels.phone)) {
      calls.push(c);
    }
    if (isCriticalOrHigh && (Boolean(c.channels.waUrl) || Boolean(c.row.instagram?.trim()))) {
      messages.push(c);
    }
    if (status === "contacted" || status === "replied" || status === "meeting") {
      followups.push(c);
    }
    if (status === "replied" || status === "meeting") {
      waiting.push(c);
    }
  }

  const impactIds = new Set<string>();
  let dailyRevenueImpact = 0;
  for (const c of [...calls, ...messages]) {
    if (!impactIds.has(c.row.id)) {
      impactIds.add(c.row.id);
      const er = expectedRevenueMap.get(c.row.id);
      if (er) dailyRevenueImpact += er.weightedExpectedMonthlyRevenue;
    }
  }

  return { calls, messages, followups, waiting, dailyRevenueImpact };
}

function actionRecommendationLabel(
  c: QueueCandidate,
  rp: ExpectedRevenueRankingResult | undefined,
): string {
  const status = c.row._s.status;
  const tier = rp?.revenuePriorityTier;
  if (status === "meeting") return "Demo Planla";
  if (status === "replied") return "Takip Yap";
  if (tier === "critical" && c.channels.waUrl) return "WhatsApp Gönder";
  if (tier === "critical" && c.channels.phone) return "Hemen Ara";
  if (tier === "high" && Boolean(c.row.instagram?.trim())) return "Instagram Temas";
  if (status === "contacted") return "Yanıt Bekleniyor";
  return "";
}

/** v3.9.4 — Founder daily operating desk: 4 action metrics + daily revenue impact. */
function FounderOperatingDeskCard({
  dailyDesk,
  activeTab,
  onTabChange,
}: {
  dailyDesk: DailyOperationsDesk;
  activeTab: QueueSubTab;
  onTabChange: (tab: QueueSubTab) => void;
}) {
  const metrics: { label: string; count: number; tab: QueueSubTab; accent: string }[] = [
    { label: "Aranacaklar", count: dailyDesk.calls.length, tab: "calls", accent: "sky" },
    { label: "Mesaj Atılacaklar", count: dailyDesk.messages.length, tab: "messages", accent: "emerald" },
    { label: "Takip Edilecekler", count: dailyDesk.followups.length, tab: "followups", accent: "amber" },
    { label: "Bekleyenler", count: dailyDesk.waiting.length, tab: "waiting", accent: "violet" },
  ];

  const accentConfig: Record<string, { border: string; text: string; activeBg: string; ring: string }> = {
    sky: { border: "border-sky-400/30", text: "text-sky-200", activeBg: "bg-sky-500/20", ring: "ring-sky-400/30" },
    emerald: { border: "border-emerald-400/30", text: "text-emerald-200", activeBg: "bg-emerald-500/20", ring: "ring-emerald-400/30" },
    amber: { border: "border-amber-400/30", text: "text-amber-200", activeBg: "bg-amber-500/20", ring: "ring-amber-400/30" },
    violet: { border: "border-violet-400/30", text: "text-violet-200", activeBg: "bg-violet-500/20", ring: "ring-violet-400/30" },
  };

  return (
    <section className="rounded-xl border border-orange-400/20 bg-orange-500/[0.04] p-5 ring-1 ring-inset ring-orange-400/10">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-orange-500/20">
          <IconSpark className="h-3.5 w-3.5 text-orange-200" />
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-200">
          Bugünün Operasyon Masası
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(({ label, count, tab, accent }) => {
          const cfg = accentConfig[accent];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(isActive ? "queue" : tab)}
              className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition ring-1 ring-inset ${
                isActive
                  ? `${cfg.border} ${cfg.activeBg} ${cfg.ring}`
                  : "border-white/10 bg-white/[0.02] ring-transparent hover:bg-white/[0.05]"
              }`}
            >
              <span className={`text-2xl font-bold tabular-nums ${isActive ? cfg.text : "text-zinc-200"}`}>
                {count}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${isActive ? cfg.text : "text-zinc-500"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.04] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Tahmini Günlük Gelir Etkisi
        </div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-300">
          {formatTRY(dailyDesk.dailyRevenueImpact)}
        </div>
        <div className="mt-0.5 text-[10px] text-zinc-500">
          Bugün aksiyon alınacak fırsatların toplam ağırlıklı MRR etkisi
        </div>
      </div>
    </section>
  );
}

/** v3.9.4 — Top 3 revenue priority leads, clickable to open lead detail. */
function RevenueFocusStrip({
  candidates,
  revenuePriorityMap,
  expectedRevenueMap,
  onOpenDetail,
}: {
  candidates: QueueCandidate[];
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>;
  expectedRevenueMap: Map<string, ExpectedRevenueResult>;
  onOpenDetail: (id: string) => void;
}) {
  const top3 = candidates
    .slice()
    .sort((a, b) => {
      const rA = revenuePriorityMap.get(a.row.id)?.revenuePriorityScore ?? 0;
      const rB = revenuePriorityMap.get(b.row.id)?.revenuePriorityScore ?? 0;
      return rB - rA;
    })
    .slice(0, 3);

  if (top3.length === 0) return null;

  return (
    <div className="grid gap-2">
      {top3.map((c, i) => {
        const er = expectedRevenueMap.get(c.row.id);
        const rp = revenuePriorityMap.get(c.row.id);
        return (
          <button
            key={c.row.id}
            type="button"
            onClick={() => onOpenDetail(c.row.id)}
            className="flex flex-col gap-1.5 rounded-xl border border-amber-400/15 bg-amber-500/[0.04] px-4 py-3 text-left transition hover:bg-amber-500/[0.08] hover:border-amber-400/25"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold tabular-nums text-amber-300">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">
                {c.row.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {er && er.weightedExpectedMonthlyRevenue > 0 && (
                <span className="text-[14px] font-bold tabular-nums text-emerald-300">
                  {formatTRY(er.weightedExpectedMonthlyRevenue)}
                  <span className="ml-0.5 text-[10px] font-normal text-zinc-500">/ay</span>
                </span>
              )}
              {rp && (
                <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-400 ring-1 ring-inset ring-white/10">
                  {rp.revenuePriorityScore} puan
                </span>
              )}
            </div>
            {rp?.revenuePriorityTier && (
              <span className={`self-start rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                rp.revenuePriorityTier === "critical" ? "bg-rose-500/20 text-rose-300" :
                rp.revenuePriorityTier === "high" ? "bg-orange-500/20 text-orange-300" :
                rp.revenuePriorityTier === "medium" ? "bg-amber-500/20 text-amber-300" :
                "bg-zinc-500/20 text-zinc-400"
              }`}>
                {rp.revenuePriorityTier === "critical" ? "Kritik" : rp.revenuePriorityTier === "high" ? "Yüksek" : rp.revenuePriorityTier === "medium" ? "Orta" : "Düşük"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── v2.1 Founder Focus Engine ──────────────────────────────────────────────

/**
 * Runtime priority score for daily focus ranking. Pure — no I/O.
 * Returns 0 for NO_ACTION leads (won/lost/meeting with no action).
 */
function computePriorityScore(row: LeadTableRow, now: number): number {
  const action = computeTodayActionStatus(row, row._s, now);
  let score = 0;
  if (action === "HOT_NOW") score += 100;
  else if (action === "DEMO_READY") score += 80;
  else if (action === "FOLLOW_UP_DUE") score += 60;
  else if (action === "NEEDS_CONTACT") score += 40;
  else return 0;

  const v = row.signalVerification;
  if (v?.websiteVerification === "verified") score += 15;
  if (v?.reservationSignal === "verified" || v?.reservationSignal === "detected") score += 20;
  if (v?.whatsappVerification === "verified" || v?.whatsappVerification === "likely") score += 10;
  if (typeof row.icpFitScore === "number" && row.icpFitScore >= 70) score += 15;

  return score;
}

/** v2.1 — "Bugünün En Öncelikli Fırsatları" — top-3 priority panel with queue builder & founder insight. */
function TodayTopPrioritiesPanel({
  rows,
  now,
  onOpenDetail,
  onBuildQueue,
  queueFull,
}: {
  rows: LeadTableRow[];
  now: number;
  onOpenDetail: (id: string) => void;
  onBuildQueue: (ids: string[]) => void;
  queueFull: boolean;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const { top3, top10Ids, followUpDue, hotCount, demoCount, waCount, igCount } = useMemo(() => {
    const scored = rows
      .map((row) => ({ row, score: computePriorityScore(row, now) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    let fDue = 0;
    let hot = 0;
    let demo = 0;
    let wa = 0;
    let ig = 0;
    for (const { row } of scored) {
      const a = computeTodayActionStatus(row, row._s, now);
      if (a === "FOLLOW_UP_DUE") fDue++;
      else if (a === "HOT_NOW") hot++;
      else if (a === "DEMO_READY") demo++;
      const vv = row.signalVerification;
      if (
        vv?.whatsappVerification === "verified" ||
        vv?.whatsappVerification === "likely" ||
        row.phone
      )
        wa++;
      else if (
        vv?.instagramVerification === "verified" ||
        vv?.instagramVerification === "likely" ||
        row.instagram
      )
        ig++;
    }

    return {
      top3: scored.slice(0, 3),
      top10Ids: scored.slice(0, 10).map(({ row }) => row.id),
      followUpDue: fDue,
      hotCount: hot,
      demoCount: demo,
      waCount: wa,
      igCount: ig,
    };
  }, [rows, now]);

  if (top3.length === 0) return null;

  // v2.2 communication-aware founder insight (highest-priority rule wins)
  const insight =
    followUpDue > hotCount + demoCount
      ? tr
        ? "Takip bekleyen fırsatlar öncelikli."
        : "Overdue follow-ups need attention first."
      : waCount >= 4
        ? tr
          ? `Bugün ${waCount} WhatsApp teması öneriliyor.`
          : `${waCount} WhatsApp contacts recommended today.`
        : igCount > waCount && igCount > 0
          ? tr
            ? "Instagram ağırlıklı iletişim günü."
            : "Instagram-heavy outreach day."
          : hotCount > demoCount
            ? tr
              ? "Demo planlamaya odaklan."
              : "Focus on scheduling demos."
            : demoCount > 0
              ? tr
                ? "Alt funnel güçlü, yeni fırsat üretimine bak."
                : "Bottom funnel strong — consider sourcing fresh leads."
              : hotCount === 0 && demoCount === 0 && followUpDue === 0
                ? tr
                  ? "Yeni lead üretimi gerekli."
                  : "Pipeline needs fresh leads."
                : tr
                  ? "Pipeline dengeli görünüyor."
                  : "Pipeline looks balanced.";

  return (
    <section className="overflow-hidden rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fuchsia-200">
            {tr ? "Bugünün En Öncelikli Fırsatları" : "Today's Top Priorities"}
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {tr
              ? "Anlık öncelik sıralaması — kalıcı değil"
              : "Runtime priority ranking — not persisted"}
          </p>
        </div>
        {/* Part 3: Queue Builder */}
        {!queueFull && top10Ids.length > 0 && (
          <button
            type="button"
            onClick={() => onBuildQueue(top10Ids)}
            className="shrink-0 rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-200 transition hover:bg-fuchsia-500/20"
          >
            {tr ? "Bugünün Kuyruğunu Oluştur" : "Build Today's Queue"}
          </button>
        )}
      </div>

      <div className="divide-y divide-white/5">
        {top3.map(({ row, score }, idx) => {
          const action = computeTodayActionStatus(row, row._s, now);
          const badgeLabel =
            action === "HOT_NOW"
              ? tr
                ? "Sıcak Fırsat"
                : "Hot Lead"
              : action === "DEMO_READY"
                ? tr
                  ? "Demo Hazır"
                  : "Demo Ready"
                : action === "FOLLOW_UP_DUE"
                  ? tr
                    ? "Takip Zamanı"
                    : "Follow-up Due"
                  : tr
                    ? "İletişim Gerekli"
                    : "Needs Contact";
          const badgeCls =
            action === "HOT_NOW"
              ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300"
              : action === "DEMO_READY"
                ? "border-violet-400/30 bg-violet-500/10 text-violet-300"
                : action === "FOLLOW_UP_DUE"
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
                  : "border-sky-400/30 bg-sky-500/10 text-sky-300";

          const v = row.signalVerification;
          const reasonParts: string[] = [];
          if (action === "FOLLOW_UP_DUE")
            reasonParts.push(tr ? "Takip zamanı geldi" : "Follow-up due");
          else if (action === "HOT_NOW")
            reasonParts.push(tr ? "Yüksek fırsat skoru" : "High opportunity score");
          else if (action === "DEMO_READY")
            reasonParts.push(tr ? "Demo için hazır" : "Ready for demo");
          if (v?.reservationSignal === "verified" || v?.reservationSignal === "detected")
            reasonParts.push(tr ? "Rezervasyon sinyali" : "Reservation CTA");
          if (v?.whatsappVerification === "verified") reasonParts.push("WhatsApp ✓");

          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpenDetail(row.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-zinc-400">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-zinc-100">{row.name}</span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${badgeCls}`}
                  >
                    {badgeLabel}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {[row.city, reasonParts[0]].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-bold tabular-nums text-zinc-300">{score}</div>
                <div className="text-[10px] text-zinc-600">{tr ? "öncelik" : "priority"}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Part 5: Founder Focus Insight */}
      <div className="border-t border-white/5 px-4 py-2.5">
        <span className="text-[11px] font-medium text-fuchsia-400">
          {tr ? "Kurucu Odağı" : "Founder Focus"}
        </span>
        <span className="ml-2 text-[11px] text-zinc-400">{insight}</span>
      </div>
    </section>
  );
}

// ─── v2.3 Founder Daily Operating System ────────────────────────────────────

type CriticalTaskType =
  | "follow_up_overdue"
  | "hot_not_contacted"
  | "demo_ready"
  | "needs_contact_hot"
  | "missing_signal";

type CriticalTask = {
  id: string;
  name: string;
  city: string | null | undefined;
  taskType: CriticalTaskType;
  reason: string;
};

/** v2.3 — "Bugünün Operasyonu" Daily Operating Brief. Derived only — no AI, no persistence. */
function DailyOperatingBrief({
  rows,
  now,
  completedToday,
  activeQueueCount,
}: {
  rows: LeadTableRow[];
  now: number;
  completedToday: number;
  activeQueueCount: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const intel = useMemo(() => {
    let followUpDue = 0;
    let hotNotContacted = 0;
    let demoCount = 0;
    let criticalCount = 0;
    let activeLeadCount = 0;
    for (const row of rows) {
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      activeLeadCount++;
      const lifecycle = computeLeadLifecycleStatus(row, s);
      const action = computeTodayActionStatus(row, s, now);
      if (action === "FOLLOW_UP_DUE") { followUpDue++; criticalCount++; }
      if (action === "HOT_NOW") criticalCount++;
      if (action === "DEMO_READY") { demoCount++; criticalCount++; }
      if (lifecycle === "HOT_OPPORTUNITY" && s.status === "new") hotNotContacted++;
    }

    const focus = followUpDue > 0
      ? (tr ? "Bugün takip gecikmelerini kapat." : "Close overdue follow-ups today.")
      : hotNotContacted > 0
        ? (tr ? "Bugün sıcak fırsatları işleme al." : "Engage hot opportunities today.")
        : demoCount > 0
          ? (tr ? "Bugün sıcak fırsatları demo aşamasına taşı." : "Move hot leads to demo stage today.")
          : (tr ? "Bugün yeni lead üretimi gerekiyor." : "New lead generation needed today.");

    const estimatedMinutes = criticalCount * 3;
    return { criticalCount, focus, estimatedMinutes, activeLeadCount };
  }, [rows, now, tr]);

  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-indigo-500/25 bg-indigo-500/[0.04]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-200">
          {tr ? "Bugünün Operasyonu" : "Today's Operation"}
        </h2>
      </div>
      <div className="p-4">
        <div className="mb-4 rounded-lg border border-indigo-400/20 bg-indigo-500/[0.06] px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
            {tr ? "Bugünün Ana Odağı" : "Today's Main Focus"}
          </div>
          <div className="text-sm font-medium text-indigo-100">{intel.focus}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-center">
            <div className="text-2xl font-bold tabular-nums text-rose-300">{intel.criticalCount}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{tr ? "Kritik İş" : "Critical Tasks"}</div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-center">
            <div className="text-2xl font-bold tabular-nums text-amber-300">
              {intel.estimatedMinutes > 0 ? `~${intel.estimatedMinutes}` : "0"}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{tr ? "Tahmini Dakika" : "Est. Minutes"}</div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-center">
            <div className="text-2xl font-bold tabular-nums text-sky-300">{intel.activeLeadCount}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{tr ? "Aktif Lead" : "Active Leads"}</div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-center">
            <div className="text-2xl font-bold tabular-nums text-emerald-300">{completedToday}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{tr ? "Günlük Hedef" : "Daily Target"}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** v2.3 — "Kritik İşler" up to 5 critical tasks. Excludes won/lost leads. */
function TodayCriticalTasks({
  rows,
  now,
  onOpenDetail,
}: {
  rows: LeadTableRow[];
  now: number;
  onOpenDetail: (id: string) => void;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const tasks = useMemo((): CriticalTask[] => {
    const result: CriticalTask[] = [];
    const added = new Set<string>();

    const add = (row: LeadTableRow, taskType: CriticalTaskType, reason: string) => {
      if (added.has(row.id) || result.length >= 5) return;
      added.add(row.id);
      result.push({ id: row.id, name: row.name, city: row.city, taskType, reason });
    };

    // Priority 1: Follow-up overdue
    for (const row of rows) {
      if (result.length >= 5) break;
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      if (computeTodayActionStatus(row, s, now) === "FOLLOW_UP_DUE") {
        add(row, "follow_up_overdue", tr
          ? "Takip süresi doldu — hemen iletişim kur."
          : "Follow-up overdue — contact now.");
      }
    }

    // Priority 2: Hot opportunity not yet contacted
    for (const row of rows) {
      if (result.length >= 5) break;
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      const lifecycle = computeLeadLifecycleStatus(row, s);
      if (lifecycle === "HOT_OPPORTUNITY" && computeTodayActionStatus(row, s, now) === "HOT_NOW") {
        add(row, "hot_not_contacted", tr
          ? "Sıcak fırsat — ilk temas kurulmadı."
          : "Hot opportunity — not yet contacted.");
      }
    }

    // Priority 3: Demo-ready
    for (const row of rows) {
      if (result.length >= 5) break;
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      if (computeTodayActionStatus(row, s, now) === "DEMO_READY") {
        add(row, "demo_ready", tr
          ? "Demo görüşmesi planlanmayı bekliyor."
          : "Demo meeting needs to be scheduled.");
      }
    }

    // Priority 4: Queue lead ready for outreach (has contact info — can reach now)
    for (const row of rows) {
      if (result.length >= 5) break;
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      if (!added.has(row.id) && computeTodayActionStatus(row, s, now) === "NEEDS_CONTACT") {
        const v = row.signalVerification;
        const hasContact =
          Boolean(row.phone?.trim()) ||
          Boolean(row.instagram?.trim()) ||
          Boolean(row.website?.trim()) ||
          v?.whatsappVerification === "verified";
        if (hasContact) {
          add(row, "needs_contact_hot", tr
            ? "İletişim kurulmayı bekleyen fırsat."
            : "Opportunity awaiting outreach.");
        }
      }
    }

    // Priority 5: Missing contact signal for high-value lead
    for (const row of rows) {
      if (result.length >= 5) break;
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      if (!added.has(row.id) && computeTodayActionStatus(row, s, now) === "NEEDS_CONTACT") {
        const v = row.signalVerification;
        const hasContact =
          Boolean(row.phone?.trim()) ||
          Boolean(row.instagram?.trim()) ||
          Boolean(row.website?.trim()) ||
          v?.whatsappVerification === "verified";
        if (!hasContact) {
          add(row, "missing_signal", tr
            ? "Yüksek potansiyel — iletişim bilgisi eksik."
            : "High potential — contact info missing.");
        }
      }
    }

    return result;
  }, [rows, now, tr]);

  if (tasks.length === 0) return null;

  const taskTypeMeta = (t: CriticalTaskType): { label: string; cls: string } => {
    switch (t) {
      case "follow_up_overdue":
        return { label: tr ? "Takip Gecikmiş" : "Overdue Follow-up", cls: "bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/30" };
      case "hot_not_contacted":
        return { label: tr ? "Sıcak Fırsat" : "Hot Opportunity", cls: "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-inset ring-fuchsia-400/30" };
      case "demo_ready":
        return { label: tr ? "Demo Hazır" : "Demo Ready", cls: "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30" };
      case "missing_signal":
        return { label: tr ? "Veri Eksik" : "Missing Data", cls: "bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-400/30" };
      case "needs_contact_hot":
        return { label: tr ? "Ulaşılacak" : "Reach Out", cls: "bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-400/30" };
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-rose-500/20 bg-rose-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-200">
          {tr ? "Kritik İşler" : "Critical Tasks"}
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {tr
            ? `Bugün tamamlanması gereken en kritik ${tasks.length} iş.`
            : `${tasks.length} most critical tasks to complete today.`}
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {tasks.map((task) => {
          const meta = taskTypeMeta(task.taskType);
          return (
            <div key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">{task.name}</span>
                  {task.city && (
                    <span className="shrink-0 text-[11px] text-zinc-500">· {task.city}</span>
                  )}
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">{task.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenDetail(task.id)}
                className="shrink-0 rounded-md border border-white/12 bg-white/5 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-white/10"
              >
                {tr ? "Detay Aç" : "Open Detail"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** v2.3 — "Günlük İlerleme" progress strip. Derived from rows and queue session data only. */
function DailyProgressStrip({
  rows,
  completedToday,
  activeQueueCount,
}: {
  rows: LeadTableRow[];
  completedToday: number;
  activeQueueCount: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const counts = useMemo(() => {
    let contacted = 0;
    let followUpClosed = 0;
    let demoPlanned = 0;
    let won = 0;
    for (const row of rows) {
      const s = row._s;
      if (s.status === "contacted" || s.status === "replied") contacted++;
      if (s.status === "replied") followUpClosed++;
      if (s.status === "meeting") demoPlanned++;
      if (s.status === "won") won++;
    }
    const queueTotal = completedToday + activeQueueCount;
    const queueRate = queueTotal > 0 ? Math.round((completedToday / queueTotal) * 100) : 0;
    return { contacted, followUpClosed, demoPlanned, won, queueRate };
  }, [rows, completedToday, activeQueueCount]);

  const items = [
    { label: tr ? "Kuyruk Tamamlama" : "Queue Done", value: `${counts.queueRate}%`, cls: "text-indigo-300" },
    { label: tr ? "İletişim Kuruldu" : "Contacted", value: String(counts.contacted), cls: "text-sky-300" },
    { label: tr ? "Takip Kapatılan" : "Follow-up Closed", value: String(counts.followUpClosed), cls: "text-amber-300" },
    { label: tr ? "Demo Planlanan" : "Demo Planned", value: String(counts.demoPlanned), cls: "text-emerald-300" },
    { label: tr ? "Kazanılan" : "Won", value: String(counts.won), cls: "text-fuchsia-300" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-center"
        >
          <div className={`text-xl font-bold tabular-nums ${item.cls}`}>{item.value}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── v2.4 Founder Workflow Engine ────────────────────────────────────────────

type WorkflowStepBadge = "Öncelikli" | "Aktif" | "Beklemede" | "Tamamlandı";

type FounderWorkflowData = {
  followUpDue: number;
  hotNow: number;
  demoReady: number;
  pipelineLow: boolean;
  step4Count: number;
  firstActiveStep: number;
  recommendation: string;
};

/** v2.4 — Pure workflow status computation. Excludes won/lost. No I/O. */
function computeFounderWorkflowStatus(
  rows: LeadTableRow[],
  now: number,
  tr: boolean,
): FounderWorkflowData {
  let followUpDue = 0;
  let hotNow = 0;
  let demoReady = 0;

  for (const row of rows) {
    const s = row._s;
    if (s.status === "won" || s.status === "lost") continue;
    const action = computeTodayActionStatus(row, s, now);
    if (action === "FOLLOW_UP_DUE") followUpDue++;
    else if (action === "HOT_NOW") hotNow++;
    if (action === "DEMO_READY" || s.status === "meeting") demoReady++;
  }

  const pipelineLow = hotNow + demoReady + followUpDue < 3;
  const step4Count = pipelineLow ? 1 : 0;
  const firstActiveStep =
    followUpDue > 0 ? 1 : hotNow > 0 ? 2 : demoReady > 0 ? 3 : pipelineLow ? 4 : 0;

  const recommendation =
    followUpDue > 0
      ? tr
        ? "Önce takip gecikmelerini kapat."
        : "Close overdue follow-ups first."
      : hotNow > 0
        ? tr
          ? "Sıcak fırsatları ilk temas veya demo yönüne taşı."
          : "Move hot opportunities toward first contact or demo."
        : demoReady > 0
          ? tr
            ? "Demo adaylarını görüşmeye dönüştür."
            : "Convert demo candidates to meetings."
          : pipelineLow
            ? tr
              ? "Yeni lead import ederek pipeline'ı güçlendir."
              : "Strengthen the pipeline by importing new leads."
            : tr
              ? "Günlük operasyon dengeli görünüyor."
              : "Daily operation looks balanced.";

  return { followUpDue, hotNow, demoReady, pipelineLow, step4Count, firstActiveStep, recommendation };
}

function resolveWorkflowStepBadge(
  stepNum: number,
  count: number,
  firstActiveStep: number,
): WorkflowStepBadge {
  if (count > 0) return stepNum === firstActiveStep ? "Öncelikli" : "Aktif";
  return stepNum <= 2 ? "Tamamlandı" : "Beklemede";
}

/** v2.4 — "Operasyon Akışı" 4-step workflow panel with active recommendation. */
function FounderWorkflowSteps({
  rows,
  now,
}: {
  rows: LeadTableRow[];
  now: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const wf = useMemo(
    () => computeFounderWorkflowStatus(rows, now, tr),
    [rows, now, tr],
  );

  if (rows.length === 0) return null;

  const badgeCls: Record<WorkflowStepBadge, string> = {
    Öncelikli:
      "bg-rose-500/20 text-rose-200 ring-1 ring-inset ring-rose-400/30",
    Aktif: "bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/30",
    Beklemede:
      "bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-600/30",
    Tamamlandı:
      "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30",
  };

  const stepNumCls: Record<WorkflowStepBadge, string> = {
    Öncelikli: "text-rose-300",
    Aktif: "text-amber-300",
    Beklemede: "text-zinc-600",
    Tamamlandı: "text-emerald-400",
  };

  type StepDef = {
    num: number;
    title: string;
    count: number;
    reason: string;
    badge: WorkflowStepBadge;
  };

  const steps: StepDef[] = [
    {
      num: 1,
      title: tr ? "Takipleri Kapat" : "Close Follow-ups",
      count: wf.followUpDue,
      reason:
        wf.followUpDue > 0
          ? tr
            ? `${wf.followUpDue} takip gecikmiş`
            : `${wf.followUpDue} overdue`
          : tr
            ? "Takip borcu yok"
            : "No overdue follow-ups",
      badge: resolveWorkflowStepBadge(1, wf.followUpDue, wf.firstActiveStep),
    },
    {
      num: 2,
      title: tr ? "Sıcak Fırsatları İşle" : "Engage Hot Leads",
      count: wf.hotNow,
      reason:
        wf.hotNow > 0
          ? tr
            ? `${wf.hotNow} sıcak fırsat bekliyor`
            : `${wf.hotNow} hot lead waiting`
          : tr
            ? "Temas edilmemiş sıcak fırsat yok"
            : "No uncontacted hot leads",
      badge: resolveWorkflowStepBadge(2, wf.hotNow, wf.firstActiveStep),
    },
    {
      num: 3,
      title: tr ? "Demo Adaylarını İlerlet" : "Advance Demo Candidates",
      count: wf.demoReady,
      reason:
        wf.demoReady > 0
          ? tr
            ? `${wf.demoReady} demo adayı ilerlemeyi bekliyor`
            : `${wf.demoReady} demo candidate pending`
          : tr
            ? "Demo adayı yok"
            : "No demo candidates",
      badge: resolveWorkflowStepBadge(3, wf.demoReady, wf.firstActiveStep),
    },
    {
      num: 4,
      title: tr ? "Yeni Fırsat Üret" : "Generate New Opportunities",
      count: wf.step4Count,
      reason: wf.pipelineLow
        ? tr
          ? "Pipeline üst kısmı zayıflıyor"
          : "Upper pipeline thinning"
        : tr
          ? "Pipeline yeterince güçlü"
          : "Pipeline sufficiently strong",
      badge: resolveWorkflowStepBadge(4, wf.step4Count, wf.firstActiveStep),
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-200">
          {tr ? "Operasyon Akışı" : "Operation Flow"}
        </h2>
      </div>
      <div className="divide-y divide-white/5">
        {steps.map((step) => (
          <div
            key={step.num}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`shrink-0 text-lg font-bold tabular-nums ${stepNumCls[step.badge]}`}
              >
                {step.num}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">
                    {step.title}
                  </span>
                  {step.count > 0 && (
                    <span className="text-sm font-bold tabular-nums text-zinc-300">
                      ({step.count})
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {step.reason}
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${badgeCls[step.badge]}`}
            >
              {step.badge}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5 px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">
          {tr ? "Sıradaki Adım" : "Next Step"}
        </span>
        <span className="ml-2 text-[11px] text-zinc-300">{wf.recommendation}</span>
      </div>
    </section>
  );
}

/** v2.4.1 — "Operasyon Durumu" bridge strip. Derived from computeFounderWorkflowStatus. No AI, no persistence. */
function OperationStatusStrip({
  rows,
  now,
}: {
  rows: LeadTableRow[];
  now: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const { msg, accent } = useMemo(() => {
    const wf = computeFounderWorkflowStatus(rows, now, tr);
    if (wf.followUpDue > 0) {
      return {
        msg: tr
          ? `${wf.followUpDue} kritik takip bekliyor.`
          : `${wf.followUpDue} overdue follow-up${wf.followUpDue !== 1 ? "s" : ""} pending.`,
        accent: "rose" as const,
      };
    }
    if (wf.hotNow > 0) {
      return {
        msg: tr
          ? `${wf.hotNow} sıcak fırsat işlenmeyi bekliyor.`
          : `${wf.hotNow} hot opportunit${wf.hotNow !== 1 ? "ies" : "y"} ready to engage.`,
        accent: "amber" as const,
      };
    }
    if (wf.demoReady > 0) {
      return {
        msg: tr
          ? `${wf.demoReady} demo adayı ilerletilmeyi bekliyor.`
          : `${wf.demoReady} demo candidate${wf.demoReady !== 1 ? "s" : ""} ready to advance.`,
        accent: "emerald" as const,
      };
    }
    if (wf.pipelineLow) {
      return {
        msg: tr
          ? "Operasyon yükü düşük, yeni fırsat üretimine odaklanılabilir."
          : "Operation load is low — focus on new opportunity generation.",
        accent: "sky" as const,
      };
    }
    return {
      msg: tr
        ? "Bugünkü operasyon planlandığı şekilde ilerliyor."
        : "Today's operation is progressing as planned.",
      accent: "emerald" as const,
    };
  }, [rows, now, tr]);

  if (rows.length === 0) return null;

  const dotCls: Record<typeof accent, string> = {
    rose: "bg-rose-400",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
    sky: "bg-sky-400",
  };

  const textCls: Record<typeof accent, string> = {
    rose: "text-rose-200",
    amber: "text-amber-200",
    emerald: "text-emerald-200",
    sky: "text-sky-200",
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-700/40 bg-zinc-500/[0.03] px-4 py-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls[accent]}`} aria-hidden />
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {tr ? "Operasyon Durumu" : "Operation Status"}
      </span>
      <span className={`min-w-0 flex-1 text-sm font-medium ${textCls[accent]}`}>{msg}</span>
    </div>
  );
}

// ─── v3.0 Autonomous Sales Plan ────────────────────────────────────────────

type SalesPlanItem = {
  leadId: string;
  leadName: string;
  city: string;
  action: string;
  reason: string;
  channelCopy: string;
  priority: number;
};

/** v3.0 — Pure sales plan engine. No AI, no I/O, no scoring changes. */
function computeAutonomousSalesPlan(
  rows: LeadTableRow[],
  now: number,
  contactFinderMap: Record<string, ContactFinderResult>,
): SalesPlanItem[] {
  const items: SalesPlanItem[] = [];
  const seen = new Set<string>();
  const MAX = 6;

  function channelCopyFor(row: LeadTableRow): string {
    const finder = contactFinderMap[row.id];
    const rec = computeRecommendedChannel(row, finder);
    if (rec.channel === "whatsapp_verified" || rec.channel === "whatsapp_possible")
      return "WhatsApp üzerinden ilerle";
    if (rec.channel === "instagram") return "Instagram DM ile ilerle";
    if (rec.channel === "website") return "Web formu / site üzerinden ilerle";
    if (rec.channel === "phone") return "Telefonla ilk temas kur";
    return "Önce iletişim bilgisini doğrula";
  }

  function push(row: LeadTableRow, action: string, reason: string, priority: number) {
    if (seen.has(row.id) || items.length >= MAX) return;
    seen.add(row.id);
    items.push({
      leadId: row.id,
      leadName: row.name || "—",
      city: row.city || "",
      action,
      reason,
      channelCopy: channelCopyFor(row),
      priority,
    });
  }

  // 1. FOLLOW_UP_DUE
  for (const row of rows) {
    if (items.length >= MAX) break;
    const s = row._s;
    if (s.status === "won" || s.status === "lost") continue;
    if (computeTodayActionStatus(row, s, now) === "FOLLOW_UP_DUE")
      push(row, "Takip mesajı gönder", "Takip zamanı geçmiş", 1);
  }

  // 2. HOT_NOW
  for (const row of rows) {
    if (items.length >= MAX) break;
    const s = row._s;
    if (s.status === "won" || s.status === "lost" || seen.has(row.id)) continue;
    if (computeTodayActionStatus(row, s, now) === "HOT_NOW")
      push(row, "İlk temas kur", "Sıcak fırsat işlenmeyi bekliyor", 2);
  }

  // 3. DEMO_READY or meeting
  for (const row of rows) {
    if (items.length >= MAX) break;
    const s = row._s;
    if (s.status === "won" || s.status === "lost" || seen.has(row.id)) continue;
    if (computeTodayActionStatus(row, s, now) === "DEMO_READY" || s.status === "meeting")
      push(row, "Demo görüşmesini ilerlet", "Demo aşamasına taşınabilir", 3);
  }

  // 4. NEEDS_CONTACT
  for (const row of rows) {
    if (items.length >= MAX) break;
    const s = row._s;
    if (s.status === "won" || s.status === "lost" || seen.has(row.id)) continue;
    if (computeTodayActionStatus(row, s, now) === "NEEDS_CONTACT")
      push(row, "Tanışma mesajı gönder", "İletişime uygun lead", 4);
  }

  // 5. High-value (score >= 70) with no valid outbound contact
  for (const row of rows) {
    if (items.length >= MAX) break;
    const s = row._s;
    if (s.status === "won" || s.status === "lost" || seen.has(row.id)) continue;
    const score = typeof row.verifiedOpportunityScore === "number" ? row.verifiedOpportunityScore : 0;
    if (score >= 70 && !hasValidOutboundContact(row, contactFinderMap[row.id]).any)
      push(row, "İletişim sinyalini tamamla", "Yüksek değerli lead ancak ulaşım bilgisi eksik", 5);
  }

  return items;
}

/** v3.0 — "Bugünün Satış Planı" — Autonomous daily sales plan. Derived only — no AI, no persistence. */
function AutonomousSalesPlan({
  rows,
  now,
  contactFinderMap,
  onOpenDetail,
}: {
  rows: LeadTableRow[];
  now: number;
  contactFinderMap: Record<string, ContactFinderResult>;
  onOpenDetail: (id: string) => void;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const plan = useMemo(
    () => computeAutonomousSalesPlan(rows, now, contactFinderMap),
    [rows, now, contactFinderMap],
  );

  const summary = useMemo(() => {
    if (plan.length === 0) return null;
    const followUps = plan.filter((i) => i.priority === 1).length;
    const firstContact = plan.filter((i) => i.priority === 2 || i.priority === 4).length;
    const demos = plan.filter((i) => i.priority === 3).length;
    const highPriorityCount = followUps + firstContact + demos;

    if (followUps > 0 && followUps >= firstContact + demos)
      return `Bugün takip öncelikli bir operasyon günü.`;

    if (highPriorityCount === 0)
      return `Pipeline düşük; satış planı yeni fırsat üretimine yöneliyor.`;

    const parts: string[] = [];
    if (followUps > 0) parts.push(`${followUps} takip`);
    if (firstContact > 0) parts.push(`${firstContact} ilk temas`);
    if (demos > 0) parts.push(`${demos} demo`);
    return `Bugün ${plan.length} aksiyon önerildi: ${parts.join(", ")}.`;
  }, [plan]);

  if (rows.length === 0) return null;

  const priorityCls: Record<number, string> = {
    1: "border-rose-500/30 text-rose-300",
    2: "border-fuchsia-500/30 text-fuchsia-300",
    3: "border-violet-500/30 text-violet-300",
    4: "border-sky-500/30 text-sky-300",
    5: "border-amber-500/30 text-amber-300",
  };

  if (plan.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-500/[0.03]">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-200">
            {tr ? "Bugünün Satış Planı" : "Today's Sales Plan"}
          </h2>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-zinc-400">
            {tr
              ? "Bugün aktif satış aksiyonu görünmüyor."
              : "No active sales actions today."}
          </p>
          <p className="mt-1 text-[12px] text-zinc-600">
            {tr
              ? "Yeni lead import ederek pipeline'ı güçlendirebilirsin."
              : "Import new leads to strengthen the pipeline."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-200">
          {tr ? "Bugünün Satış Planı" : "Today's Sales Plan"}
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {tr
            ? "Sistem bugün odaklanman gereken satış aksiyonlarını sıraladı."
            : "The system ranked today's sales actions for focus."}
        </p>
      </div>

      <div className="space-y-2 p-4">
        {summary && (
          <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
            <p className="text-[12px] font-medium text-violet-200">{summary}</p>
          </div>
        )}

        <div className="space-y-1.5">
          {plan.map((item) => (
            <div
              key={item.leadId}
              className={`flex items-start gap-3 rounded-lg border bg-white/[0.02] px-3 py-2.5 ${priorityCls[item.priority] ?? "border-zinc-700/40"}`}
            >
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums ${priorityCls[item.priority] ?? "border-zinc-600/40 text-zinc-400"}`}
              >
                {item.priority}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="truncate text-[13px] font-semibold text-zinc-100">
                    {item.leadName}
                  </span>
                  {item.city && (
                    <span className="text-[11px] text-zinc-500">{item.city}</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] font-medium text-zinc-200">{item.action}</p>
                <p className="text-[11px] text-zinc-500">{item.reason}</p>
                <p className="mt-0.5 text-[11px] italic text-zinc-400">{item.channelCopy}</p>
              </div>

              <button
                type="button"
                onClick={() => onOpenDetail(item.leadId)}
                className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 transition hover:bg-violet-500/20"
              >
                {tr ? "Detay Aç" : "Open"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── end v3.0 ───────────────────────────────────────────────────────────────

// ─── v3.9.1 — Revenue Ranking Summary ───────────────────────────────────────

/** v3.9.1 — Revenue priority ranking summary: critical/high counts + top ranked lead. */
function RevenueRankingCard({
  rows,
  revenuePriorityMap,
  onOpenDetail,
}: {
  rows: LeadTableRow[];
  revenuePriorityMap: Map<string, ExpectedRevenueRankingResult>;
  onOpenDetail: (id: string) => void;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const stats = useMemo(() => {
    let critical = 0;
    let high = 0;
    let topLead: LeadTableRow | null = null;
    let topScore = -1;

    for (const r of rows) {
      if (r._s.status === "lost" || r._s.doNotContact) continue;
      const rp = revenuePriorityMap.get(r.id);
      if (!rp) continue;
      if (rp.revenuePriorityTier === "critical") critical++;
      else if (rp.revenuePriorityTier === "high") high++;
      if (rp.revenuePriorityScore > topScore) {
        topScore = rp.revenuePriorityScore;
        topLead = r;
      }
    }

    return { critical, high, topLead, topScore };
  }, [rows, revenuePriorityMap]);

  if (stats.critical === 0 && stats.high === 0) return null;

  const topRp = stats.topLead ? revenuePriorityMap.get(stats.topLead.id) : null;

  return (
    <section className="overflow-hidden rounded-xl border border-amber-400/20 bg-amber-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200">
          {tr ? "Gelir Öncelik Sıralaması" : "Revenue Priority Ranking"}
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {tr
            ? "Ağırlıklı MRR × dönüşüm olasılığı × paket seviyesine göre sıralama."
            : "Ranked by weighted MRR × conversion probability × package tier."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-3">
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {tr ? "Kritik" : "Critical"}
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-rose-300">
            {stats.critical}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {tr ? "lead (≥80 puan)" : "leads (≥80 score)"}
          </p>
        </div>
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {tr ? "Yüksek" : "High"}
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-300">
            {stats.high}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {tr ? "lead (≥60 puan)" : "leads (≥60 score)"}
          </p>
        </div>
        {stats.topLead && topRp && (
          <div className="col-span-2 bg-zinc-900 px-4 py-4 sm:col-span-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              {tr ? "En Yüksek Öncelik" : "Top Priority"}
            </p>
            <button
              type="button"
              onClick={() => onOpenDetail(stats.topLead!.id)}
              className="mt-1.5 block text-left"
            >
              <p className="truncate text-sm font-semibold text-zinc-100 hover:text-amber-200">
                {stats.topLead.name}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {tr ? "Puan" : "Score"}: {topRp.revenuePriorityScore}
                {" · "}
                {({
                  critical: tr ? "Kritik" : "Critical",
                  high: tr ? "Yüksek" : "High",
                  medium: tr ? "Orta" : "Medium",
                  low: tr ? "Düşük" : "Low",
                } as const)[topRp.revenuePriorityTier]}
              </p>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── v3.2.1 — Weighted Revenue Pipeline Dashboard ───────────────────────────

/** v3.9.0 — Pipeline Expected Revenue summary: weighted MRR, ARR, expected customer count. */
function PipelineExpectedRevenueCard({ rows }: { rows: LeadTableRow[] }) {
  const kpis = useMemo(() => {
    let totalWeightedMrr = 0;
    let totalWeightedArr = 0;
    let expectedCustomers = 0;
    let activeCount = 0;

    for (const r of rows) {
      if (r._s.status === "lost") continue;

      const pkg = computeCommercialPackaging({
        icpFitScore: r.icpFitScore ?? 0,
        icpAlignment: r.icpAlignment,
        verifiedOpportunityScore: r.verifiedOpportunityScore ?? 0,
        signalVerification: r.signalVerification,
        hasOwnWebsite: r.hasOwnWebsite,
        hasInstagram: r.hasInstagram,
        phone: r.phone,
        adsLikelihood: r.adsLikelihood,
        acquisitionIntelligence: r.acquisitionIntelligence,
        digitalMaturity: r.digitalMaturity,
        leadScore: r.leadScore,
      });

      const er = computeExpectedRevenue({
        commercialPackaging: pkg,
        hotScore: r.hotScore,
        leadScore: r.leadScore,
        verifiedOpportunityScore: r.verifiedOpportunityScore ?? 0,
        icpFitScore: r.icpFitScore ?? 0,
        contactReadinessScore: r.contactReadinessScore,
        signalVerification: r.signalVerification,
        phone: r.phone,
        hasOwnWebsite: r.hasOwnWebsite,
        hasInstagram: r.hasInstagram,
        pipelineStatus: r._s.status,
        doNotContact: r._s.doNotContact,
        adsLikelihood: r.adsLikelihood,
        acquisitionIntelligence: r.acquisitionIntelligence,
      });

      totalWeightedMrr += er.weightedExpectedMonthlyRevenue;
      totalWeightedArr += er.weightedExpectedAnnualRevenue;
      expectedCustomers += er.expectedCustomerProbability;
      activeCount++;
    }

    return {
      totalWeightedMrr: Math.round(totalWeightedMrr),
      totalWeightedArr: Math.round(totalWeightedArr),
      expectedCustomers: Math.round(expectedCustomers * 10) / 10,
      activeCount,
    };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200">
          Pipeline Beklenen Gelir
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Paket fiyatı × dönüşüm olasılığı — lost hariç {kpis.activeCount} aktif lead.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-px bg-white/5">
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Beklenen MRR
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-amber-300">
            {formatTRY(kpis.totalWeightedMrr)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Ağırlıklı aylık abonelik geliri</p>
        </div>
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Beklenen ARR
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-amber-300">
            {formatTRY(kpis.totalWeightedArr)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Ağırlıklı yıllık abonelik geliri</p>
        </div>
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Beklenen Müşteri
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-amber-300">
            {kpis.expectedCustomers}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Toplam beklenen dönüşüm sayısı</p>
        </div>
      </div>
    </section>
  );
}

/** v3.9.2 — Pipeline KPI grid: package ARR, weighted expected ARR, actionable ARR, avg conversion probability. Uses v3.9 revenue truth. Read-only. */
function RevenuePipelineOverview({
  rows,
  now,
}: {
  rows: LeadTableRow[];
  now: number;
}) {
  const kpis = useMemo(() => {
    let totalPackageArr = 0;
    let weightedArr = 0;
    let actionableArr = 0;
    let probSum = 0;
    let activeCount = 0;

    for (const row of rows) {
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;

      const pkg = computeCommercialPackaging({
        icpFitScore: row.icpFitScore ?? 0,
        icpAlignment: row.icpAlignment,
        verifiedOpportunityScore: row.verifiedOpportunityScore ?? 0,
        signalVerification: row.signalVerification,
        hasOwnWebsite: row.hasOwnWebsite,
        hasInstagram: row.hasInstagram,
        phone: row.phone,
        adsLikelihood: row.adsLikelihood,
        acquisitionIntelligence: row.acquisitionIntelligence,
        digitalMaturity: row.digitalMaturity,
        leadScore: row.leadScore,
      });

      const er = computeExpectedRevenue({
        commercialPackaging: pkg,
        hotScore: row.hotScore,
        leadScore: row.leadScore,
        verifiedOpportunityScore: row.verifiedOpportunityScore ?? 0,
        icpFitScore: row.icpFitScore ?? 0,
        contactReadinessScore: row.contactReadinessScore,
        signalVerification: row.signalVerification,
        phone: row.phone,
        hasOwnWebsite: row.hasOwnWebsite,
        hasInstagram: row.hasInstagram,
        pipelineStatus: s.status,
        doNotContact: s.doNotContact,
        adsLikelihood: row.adsLikelihood,
        acquisitionIntelligence: row.acquisitionIntelligence,
      });

      totalPackageArr += pkg.annualRevenue;
      weightedArr += er.weightedExpectedAnnualRevenue;
      probSum += er.expectedCustomerProbability;
      activeCount++;

      const action = computeTodayActionStatus(row, s, now);
      if (
        action === "FOLLOW_UP_DUE" ||
        action === "HOT_NOW" ||
        action === "DEMO_READY" ||
        s.status === "meeting"
      ) {
        actionableArr += er.weightedExpectedAnnualRevenue;
      }
    }

    const avgProbability = activeCount > 0 ? probSum / activeCount : 0;
    return { totalPackageArr, weightedArr, actionableArr, avgProbability };
  }, [rows, now]);

  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-200">
          Pipeline Gelir Değeri
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Paket ARR × dönüşüm olasılığı — won/lost hariç aktif leadler.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Paket ARR
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-zinc-100">
            {formatTRY(kpis.totalPackageArr)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Toplam paket ARR (aktif leadler)</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Ağırlıklı ARR
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-sky-300">
            {formatTRY(kpis.weightedArr)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Paket ARR × dönüşüm olasılığı</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Bu Ay Hedeflenebilir
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-fuchsia-300">
            {formatTRY(kpis.actionableArr)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Aksiyon leadlerden ağırlıklı ARR</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Ort. Dönüşüm
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-amber-300">
            %{Math.round(kpis.avgProbability * 100)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Ortalama dönüşüm olasılığı</p>
        </div>
      </div>
    </section>
  );
}

/** v3.9.2 — Top 5 active leads ranked by weighted expected ARR (v3.9 revenue truth). Read-only. */
function TopRevenueOpportunities({
  rows,
  now,
}: {
  rows: LeadTableRow[];
  now: number;
}) {
  const top5 = useMemo(() => {
    return rows
      .filter((row) => row._s.status !== "won" && row._s.status !== "lost")
      .map((row) => {
        const pkg = computeCommercialPackaging({
          icpFitScore: row.icpFitScore ?? 0,
          icpAlignment: row.icpAlignment,
          verifiedOpportunityScore: row.verifiedOpportunityScore ?? 0,
          signalVerification: row.signalVerification,
          hasOwnWebsite: row.hasOwnWebsite,
          hasInstagram: row.hasInstagram,
          phone: row.phone,
          adsLikelihood: row.adsLikelihood,
          acquisitionIntelligence: row.acquisitionIntelligence,
          digitalMaturity: row.digitalMaturity,
          leadScore: row.leadScore,
        });
        const er = computeExpectedRevenue({
          commercialPackaging: pkg,
          hotScore: row.hotScore,
          leadScore: row.leadScore,
          verifiedOpportunityScore: row.verifiedOpportunityScore ?? 0,
          icpFitScore: row.icpFitScore ?? 0,
          contactReadinessScore: row.contactReadinessScore,
          signalVerification: row.signalVerification,
          phone: row.phone,
          hasOwnWebsite: row.hasOwnWebsite,
          hasInstagram: row.hasInstagram,
          pipelineStatus: row._s.status,
          doNotContact: row._s.doNotContact,
          adsLikelihood: row.adsLikelihood,
          acquisitionIntelligence: row.acquisitionIntelligence,
        });
        const action = computeTodayActionStatus(row, row._s, now);
        return { row, er, action };
      })
      .sort((a, b) => b.er.weightedExpectedAnnualRevenue - a.er.weightedExpectedAnnualRevenue)
      .slice(0, 5);
  }, [rows, now]);

  if (top5.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
          En Değerli Fırsatlar
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Beklenen değere göre sıralanan ilk 5 aktif lead.
        </p>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {top5.map(({ row, er, action }, idx) => {
          const actionLabel =
            action === "HOT_NOW"
              ? "Sıcak Fırsat"
              : action === "DEMO_READY"
                ? "Demo Adayı"
                : action === "FOLLOW_UP_DUE"
                  ? "Takip Bekliyor"
                  : row._s.status === "meeting"
                    ? "Görüşme Aşamasında"
                    : "Aktif";

          const actionCls =
            action === "HOT_NOW"
              ? "text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10"
              : action === "DEMO_READY"
                ? "text-violet-300 border-violet-500/30 bg-violet-500/10"
                : action === "FOLLOW_UP_DUE"
                  ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                  : row._s.status === "meeting"
                    ? "text-sky-300 border-sky-500/30 bg-sky-500/10"
                    : "text-zinc-400 border-zinc-600/40 bg-zinc-700/20";

          return (
            <div key={row.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-4 shrink-0 text-center text-[11px] font-bold tabular-nums text-zinc-600">
                {idx + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-zinc-100">
                  {row.name}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {formatTRY(er.weightedExpectedMonthlyRevenue)} Ağırlıklı MRR &middot; %{Math.round(er.expectedCustomerProbability * 100)} dönüşüm
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[13px] font-bold tabular-nums text-emerald-300">
                  {formatTRY(er.weightedExpectedAnnualRevenue)}
                </p>
                <span
                  className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${actionCls}`}
                >
                  {actionLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── end v3.2.1 ──────────────────────────────────────────────────────────────

// ─── v3.3.0 — Founder Forecast Engine ───────────────────────────────────────

/** v3.9.2 — 30-day deterministic sales forecast with three bands and confidence rating. Uses v3.9 revenue truth. Read-only. */
function FounderForecastEngine({
  rows,
  now,
}: {
  rows: LeadTableRow[];
  now: number;
}) {
  const forecast = useMemo(() => {
    let baseSum = 0;
    let probSum = 0;
    let activeCount = 0;
    let demoReady = 0;
    let meetingCount = 0;
    let hotNow = 0;
    let followUpDue = 0;

    for (const row of rows) {
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;

      const action = computeTodayActionStatus(row, s, now);
      const isCommerciallyActive =
        action === "FOLLOW_UP_DUE" ||
        action === "HOT_NOW" ||
        action === "DEMO_READY" ||
        s.status === "meeting";

      if (!isCommerciallyActive) continue;

      const pkg = computeCommercialPackaging({
        icpFitScore: row.icpFitScore ?? 0,
        icpAlignment: row.icpAlignment,
        verifiedOpportunityScore: row.verifiedOpportunityScore ?? 0,
        signalVerification: row.signalVerification,
        hasOwnWebsite: row.hasOwnWebsite,
        hasInstagram: row.hasInstagram,
        phone: row.phone,
        adsLikelihood: row.adsLikelihood,
        acquisitionIntelligence: row.acquisitionIntelligence,
        digitalMaturity: row.digitalMaturity,
        leadScore: row.leadScore,
      });
      const er = computeExpectedRevenue({
        commercialPackaging: pkg,
        hotScore: row.hotScore,
        leadScore: row.leadScore,
        verifiedOpportunityScore: row.verifiedOpportunityScore ?? 0,
        icpFitScore: row.icpFitScore ?? 0,
        contactReadinessScore: row.contactReadinessScore,
        signalVerification: row.signalVerification,
        phone: row.phone,
        hasOwnWebsite: row.hasOwnWebsite,
        hasInstagram: row.hasInstagram,
        pipelineStatus: s.status,
        doNotContact: s.doNotContact,
        adsLikelihood: row.adsLikelihood,
        acquisitionIntelligence: row.acquisitionIntelligence,
      });
      baseSum += er.weightedExpectedAnnualRevenue;
      probSum += er.expectedCustomerProbability;
      activeCount++;

      if (action === "DEMO_READY") demoReady++;
      if (s.status === "meeting") meetingCount++;
      if (action === "HOT_NOW") hotNow++;
      if (action === "FOLLOW_UP_DUE") followUpDue++;
    }

    const avgProbability = activeCount > 0 ? probSum / activeCount : 0;

    const conservative = Math.round((baseSum * 0.55) / 500) * 500;
    const expected = Math.round(baseSum / 500) * 500;
    const aggressive = Math.round((baseSum * 1.35) / 500) * 500;

    let confidence: "high" | "medium" | "low";
    if (demoReady + meetingCount >= 2 || avgProbability >= 0.65) {
      confidence = "high";
    } else if (hotNow + followUpDue + demoReady >= 3) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    const reason =
      confidence === "high"
        ? "Demo ve sıcak fırsat yoğunluğu güçlü olduğu için tahmin güveni yüksek."
        : confidence === "medium"
          ? "Pipeline aktif ancak kapanış için takip ve demo aksiyonları gerekli."
          : "Pipeline henüz zayıf; yeni fırsat üretimi ve takip aksiyonları gerekli.";

    return {
      conservative,
      expected,
      aggressive,
      confidence,
      reason,
      activeCount,
      demoReady,
      meetingCount,
      hotNow,
      followUpDue,
      avgProbability,
    };
  }, [rows, now]);

  if (rows.length === 0) return null;

  if (forecast.activeCount === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-500/[0.03]">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            30 Günlük Satış Tahmini
          </h2>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-zinc-400">
            30 günlük satış tahmini için yeterli aktif fırsat yok.
          </p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Yeni lead üret veya mevcut leadleri zenginleştirerek pipeline&apos;ı güçlendir.
          </p>
        </div>
      </section>
    );
  }

  const confidenceLabel =
    forecast.confidence === "high"
      ? "Yüksek"
      : forecast.confidence === "medium"
        ? "Orta"
        : "Düşük";

  const confidenceCls =
    forecast.confidence === "high"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
      : forecast.confidence === "medium"
        ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
        : "text-rose-300 border-rose-500/30 bg-rose-500/10";

  return (
    <section className="overflow-hidden rounded-xl border border-sky-500/20 bg-sky-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-200">
          30 Günlük Satış Tahmini
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Paket ARR × dönüşüm olasılığı — aktif fırsatlardan deterministik tahmin.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-px bg-white/5">
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Muhafazakâr
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-zinc-300">
            {formatTRY(forecast.conservative)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">×0.55 ağırlıklı ARR</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Beklenen
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-sky-300">
            {formatTRY(forecast.expected)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Ağırlıklı ARR toplamı</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Agresif
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-fuchsia-300">
            {formatTRY(forecast.aggressive)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">×1.35 ağırlıklı ARR</p>
        </div>
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Tahmin Güveni
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-zinc-200">{forecast.reason}</p>
          </div>
          <span
            className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${confidenceCls}`}
          >
            {confidenceLabel}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {forecast.demoReady + forecast.meetingCount > 0 && (
            <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300">
              {forecast.demoReady + forecast.meetingCount} demo adayı
            </span>
          )}
          {forecast.hotNow > 0 && (
            <span className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] text-fuchsia-300">
              {forecast.hotNow} sıcak fırsat
            </span>
          )}
          {forecast.followUpDue > 0 && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">
              {forecast.followUpDue} takip bekliyor
            </span>
          )}
          <span className="rounded border border-zinc-700/40 bg-zinc-700/20 px-2.5 py-1 text-[11px] text-zinc-400">
            Ort. dönüşüm %{Math.round(forecast.avgProbability * 100)}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── end v3.3.0 ──────────────────────────────────────────────────────────────

// ─── v3.4.0 — Revenue Risk Engine ───────────────────────────────────────────

type RevenueRiskItem = {
  leadId: string;
  leadName: string;
  expectedValue: number;
  reason: string;
  weight: "high" | "medium";
  actionLabel: string;
};

/**
 * v3.4.0 — Deterministic risk scanner. Pure function, no AI, no I/O.
 * Priority order: FOLLOW_UP_DUE > HOT_NOW not contacted > DEMO_READY idle >
 *   high value no contact > high ICP/revenue no activity.
 * First matching rule wins per lead; won/lost excluded.
 */
function computeRevenueRisk(
  rows: LeadTableRow[],
  now: number,
  contactFinderMap: Record<string, ContactFinderResult>,
): RevenueRiskItem[] {
  const items: RevenueRiskItem[] = [];

  for (const row of rows) {
    const s = row._s;
    if (s.status === "won" || s.status === "lost") continue;

    const action = computeTodayActionStatus(row, s, now);
    const rp = computeRevenuePotential(row);
    const finder = contactFinderMap[row.id];
    const icpFit = typeof row.icpFitScore === "number" ? row.icpFitScore : 0;

    let reason: string | null = null;
    let weight: "high" | "medium" = "medium";
    let actionLabel = "";

    if (action === "FOLLOW_UP_DUE") {
      // Risk Type 1: overdue follow-up
      reason = "Takip gecikmiş.";
      weight = "high";
      actionLabel = "Takip Bekliyor";
    } else if (action === "HOT_NOW" && s.status === "new") {
      // Risk Type 2: hot opportunity, never contacted
      reason = "Sıcak fırsat işlenmiyor.";
      weight = "high";
      actionLabel = "Sıcak Fırsat";
    } else if (action === "DEMO_READY" && s.status !== "meeting") {
      // Risk Type 3: demo-ready but not advanced to meeting
      reason = "Demo fırsatı bekliyor.";
      weight = "medium";
      actionLabel = "Demo Adayı";
    } else if (rp.expectedValue > 100_000 && !hasValidOutboundContact(row, finder).any) {
      // Risk Type 4: high value, no reachable contact channel
      reason = "Yüksek değerli fırsat ancak ulaşım kanalı eksik.";
      weight = "high";
      actionLabel =
        s.status === "new"
          ? "Yeni Lead"
          : s.status === "contacted"
            ? "Temas Kuruldu"
            : s.status === "needs_follow_up"
              ? "Takip"
              : s.status === "replied"
                ? "Yanıt Verdi"
                : "Aktif";
    } else if (
      icpFit >= 60 &&
      rp.expectedValue >= 80_000 &&
      s.status === "new" &&
      (s.contactAttempts ?? 0) === 0
    ) {
      // Risk Type 5: high ICP + high revenue, never touched
      reason = "Ticari değeri yüksek fırsat aksiyon almıyor.";
      weight = "medium";
      actionLabel = "Yeni Lead";
    }

    if (reason) {
      items.push({
        leadId: row.id,
        leadName: row.name || "—",
        expectedValue: rp.expectedValue,
        reason,
        weight,
        actionLabel,
      });
    }
  }

  return items;
}

/** v3.4.0 — Revenue Risk Engine: risk KPIs + top 5 risk rows + founder warning. Read-only. */
function RevenueRiskEngine({
  rows,
  now,
  contactFinderMap,
}: {
  rows: LeadTableRow[];
  now: number;
  contactFinderMap: Record<string, ContactFinderResult>;
}) {
  const risk = useMemo(() => {
    const items = computeRevenueRisk(rows, now, contactFinderMap);

    // Weighted pipeline = sum of all active leads' expectedValue (denominator)
    let weightedPipeline = 0;
    for (const row of rows) {
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      weightedPipeline += computeRevenuePotential(row).expectedValue;
    }

    const riskedRevenue = items.reduce((acc, i) => acc + i.expectedValue, 0);
    const riskRatio = weightedPipeline > 0 ? riskedRevenue / weightedPipeline : 0;

    let riskLevel: "low" | "medium" | "high";
    if (riskRatio >= 0.4) riskLevel = "high";
    else if (riskRatio >= 0.2) riskLevel = "medium";
    else riskLevel = "low";

    const warning =
      riskLevel === "high"
        ? "Yüksek değerli fırsatlar risk altında. Operasyon öncelikleri gözden geçirilmeli."
        : riskLevel === "medium"
          ? "Takip ve demo gecikmeleri gelir tahminini etkileyebilir."
          : "Pipeline sağlıklı görünüyor.";

    // Driver counts
    const followUpCount = items.filter((i) => i.reason === "Takip gecikmiş.").length;
    const hotIdleCount = items.filter((i) => i.reason === "Sıcak fırsat işlenmiyor.").length;
    const demoIdleCount = items.filter((i) => i.reason === "Demo fırsatı bekliyor.").length;
    const noContactCount = items.filter(
      (i) => i.reason === "Yüksek değerli fırsat ancak ulaşım kanalı eksik.",
    ).length;

    const top5 = [...items].sort((a, b) => b.expectedValue - a.expectedValue).slice(0, 5);

    return {
      items,
      riskedRevenue,
      riskLevel,
      warning,
      followUpCount,
      hotIdleCount,
      demoIdleCount,
      noContactCount,
      top5,
    };
  }, [rows, now, contactFinderMap]);

  if (rows.length === 0) return null;

  if (risk.items.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-500/[0.03]">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Gelir Risk Analizi
          </h2>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-zinc-400">Risk altında gelir görünmüyor.</p>
          <p className="mt-1 text-[12px] text-zinc-600">Pipeline şu an sağlıklı görünüyor.</p>
        </div>
      </section>
    );
  }

  const riskLevelLabel =
    risk.riskLevel === "high" ? "Yüksek" : risk.riskLevel === "medium" ? "Orta" : "Düşük";

  const riskLevelCls =
    risk.riskLevel === "high"
      ? "text-rose-300 border-rose-500/30 bg-rose-500/10"
      : risk.riskLevel === "medium"
        ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
        : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";

  const sectionBorderCls =
    risk.riskLevel === "high"
      ? "border-rose-500/20 bg-rose-500/[0.03]"
      : risk.riskLevel === "medium"
        ? "border-amber-500/20 bg-amber-500/[0.03]"
        : "border-zinc-700/40 bg-zinc-500/[0.03]";

  const headingCls =
    risk.riskLevel === "high"
      ? "text-rose-200"
      : risk.riskLevel === "medium"
        ? "text-amber-200"
        : "text-zinc-300";

  return (
    <section className={`overflow-hidden rounded-xl border ${sectionBorderCls}`}>
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className={`text-sm font-semibold uppercase tracking-wider ${headingCls}`}>
          Gelir Risk Analizi
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Risk altındaki fırsatların gelir etkisi — won/lost hariç.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-px bg-white/5">
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Risk Altındaki Gelir
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-rose-300">
            {formatTRY(risk.riskedRevenue)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Riskli fırsatların beklenen değer toplamı</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Riskli Fırsatlar
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-zinc-100">
            {risk.items.length} fırsat
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Risk altındaki aktif leadler</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Risk Seviyesi
          </p>
          <p className="mt-1.5">
            <span className={`rounded border px-2.5 py-1 text-sm font-bold ${riskLevelCls}`}>
              {riskLevelLabel}
            </span>
          </p>
          <p className="mt-1.5 text-[11px] text-zinc-600">Pipeline ağırlığına göre</p>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {/* Warning */}
        <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[12px] font-medium text-zinc-200">{risk.warning}</p>
        </div>

        {/* Risk drivers */}
        <div className="flex flex-wrap gap-2">
          {risk.followUpCount > 0 && (
            <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300">
              {risk.followUpCount} takip gecikmiş
            </span>
          )}
          {risk.hotIdleCount > 0 && (
            <span className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] text-fuchsia-300">
              {risk.hotIdleCount} sıcak fırsat işlenmiyor
            </span>
          )}
          {risk.demoIdleCount > 0 && (
            <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300">
              {risk.demoIdleCount} demo bekliyor
            </span>
          )}
          {risk.noContactCount > 0 && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">
              {risk.noContactCount} ulaşım kanalı eksik
            </span>
          )}
        </div>

        {/* Top 5 risk rows */}
        <div className="overflow-hidden rounded-lg border border-white/5">
          <div className="divide-y divide-white/[0.04]">
            {risk.top5.map(({ leadId, leadName, expectedValue, reason, weight, actionLabel }) => (
              <div key={leadId} className="flex items-center gap-3 px-3 py-2.5">
                <div
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${weight === "high" ? "bg-rose-400" : "bg-amber-400"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-100">{leadName}</p>
                  <p className="text-[11px] text-zinc-500">{reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold tabular-nums text-rose-300">
                    {formatTRY(expectedValue)}
                  </p>
                  <p className="text-[10px] text-zinc-600">{actionLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── end v3.4.0 ──────────────────────────────────────────────────────────────

// ─── v3.5.0 — Revenue Recovery Engine ───────────────────────────────────────

type RevenueRecoveryItem = {
  leadId: string;
  leadName: string;
  expectedValue: number;
  recoveryValue: number;
  recoveryAction: string;
  priority: "Critical" | "High" | "Medium";
  actionLabel: string;
};

/**
 * v3.5.0 — Deterministic recovery planner. Pure function, no AI, no I/O.
 * Mirrors v3.4.0 risk types but attaches a concrete action and a recovery value multiplier.
 * Priority order matches computeRevenueRisk; won/lost excluded.
 */
function computeRevenueRecovery(
  rows: LeadTableRow[],
  now: number,
  contactFinderMap: Record<string, ContactFinderResult>,
): RevenueRecoveryItem[] {
  const items: RevenueRecoveryItem[] = [];

  for (const row of rows) {
    const s = row._s;
    if (s.status === "won" || s.status === "lost") continue;

    const action = computeTodayActionStatus(row, s, now);
    const rp = computeRevenuePotential(row);
    const finder = contactFinderMap[row.id];
    const icpFit = typeof row.icpFitScore === "number" ? row.icpFitScore : 0;

    let recoveryAction: string | null = null;
    let recoveryMultiplier = 1;
    let priority: "Critical" | "High" | "Medium" = "Medium";
    let actionLabel = "";

    if (action === "FOLLOW_UP_DUE") {
      recoveryAction = "Takip mesajı gönder";
      recoveryMultiplier = 1.0;
      priority = "Critical";
      actionLabel = "Takip Bekliyor";
    } else if (action === "HOT_NOW" && s.status === "new") {
      recoveryAction = "İlk teması bugün kur";
      recoveryMultiplier = 0.9;
      priority = "High";
      actionLabel = "Sıcak Fırsat";
    } else if (action === "DEMO_READY" && s.status !== "meeting") {
      recoveryAction = "Demo planla";
      recoveryMultiplier = 0.8;
      priority = "High";
      actionLabel = "Demo Adayı";
    } else if (rp.expectedValue > 100_000 && !hasValidOutboundContact(row, finder).any) {
      recoveryAction = "İletişim bilgisini doğrula";
      recoveryMultiplier = 0.7;
      priority = "Medium";
      actionLabel =
        s.status === "new"
          ? "Yeni Lead"
          : s.status === "contacted"
            ? "Temas Kuruldu"
            : s.status === "needs_follow_up"
              ? "Takip"
              : s.status === "replied"
                ? "Yanıt Verdi"
                : "Aktif";
    } else if (
      icpFit >= 60 &&
      rp.expectedValue >= 80_000 &&
      s.status === "new" &&
      (s.contactAttempts ?? 0) === 0
    ) {
      recoveryAction = "Satış planına dahil et";
      recoveryMultiplier = 0.6;
      priority = "Medium";
      actionLabel = "Yeni Lead";
    }

    if (recoveryAction) {
      const recoveryValue = Math.round((rp.expectedValue * recoveryMultiplier) / 500) * 500;
      items.push({
        leadId: row.id,
        leadName: row.name || "—",
        expectedValue: rp.expectedValue,
        recoveryValue,
        recoveryAction,
        priority,
        actionLabel,
      });
    }
  }

  return items;
}

/** v3.5.0 — Revenue Recovery Engine: recoverable revenue KPIs + top 5 recovery rows. Read-only. */
function RevenueRecoveryEngine({
  rows,
  now,
  contactFinderMap,
}: {
  rows: LeadTableRow[];
  now: number;
  contactFinderMap: Record<string, ContactFinderResult>;
}) {
  const recovery = useMemo(() => {
    const items = computeRevenueRecovery(rows, now, contactFinderMap);

    let weightedPipeline = 0;
    for (const row of rows) {
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;
      weightedPipeline += computeRevenuePotential(row).expectedValue;
    }

    const recoverableRevenue = items.reduce((acc, i) => acc + i.recoveryValue, 0);
    const recoveryRatio = weightedPipeline > 0 ? recoverableRevenue / weightedPipeline : 0;

    let recoveryPotential: "low" | "medium" | "high";
    if (recoveryRatio >= 0.4) recoveryPotential = "high";
    else if (recoveryRatio >= 0.2) recoveryPotential = "medium";
    else recoveryPotential = "low";

    const founderMessage =
      recoveryPotential === "high"
        ? "Mevcut pipeline içinde önemli miktarda geri kazanılabilir gelir bulunuyor."
        : recoveryPotential === "medium"
          ? "Takip ve demo aksiyonları gelir potansiyelini artırabilir."
          : "Recovery potansiyeli sınırlı. Yeni fırsat üretimi daha değerli olabilir.";

    const criticalCount = items.filter((i) => i.priority === "Critical").length;
    const highCount = items.filter((i) => i.priority === "High").length;
    const mediumCount = items.filter((i) => i.priority === "Medium").length;

    const top5 = [...items].sort((a, b) => b.recoveryValue - a.recoveryValue).slice(0, 5);

    return {
      items,
      recoverableRevenue,
      recoveryPotential,
      founderMessage,
      criticalCount,
      highCount,
      mediumCount,
      top5,
    };
  }, [rows, now, contactFinderMap]);

  if (rows.length === 0) return null;

  if (recovery.items.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-500/[0.03]">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Gelir Recovery Planı
          </h2>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Kurtarılabilir gelir görünmüyor.
          </p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Risk altındaki fırsatlar için ek aksiyon gerekmiyor.
          </p>
        </div>
      </section>
    );
  }

  const potentialLabel =
    recovery.recoveryPotential === "high"
      ? "Yüksek"
      : recovery.recoveryPotential === "medium"
        ? "Orta"
        : "Düşük";

  const potentialCls =
    recovery.recoveryPotential === "high"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
      : recovery.recoveryPotential === "medium"
        ? "text-sky-300 border-sky-500/30 bg-sky-500/10"
        : "text-zinc-400 border-zinc-600/40 bg-zinc-700/20";

  const priorityCls: Record<string, string> = {
    Critical: "text-rose-300 border-rose-500/30 bg-rose-500/10",
    High: "text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10",
    Medium: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  };

  const priorityDotCls: Record<string, string> = {
    Critical: "bg-rose-400",
    High: "bg-fuchsia-400",
    Medium: "bg-amber-400",
  };

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-200">
          Gelir Recovery Planı
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Risk altındaki leadler için bugün alınabilecek aksiyonlar ve kurtarılabilir gelir.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-px bg-white/5">
        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Kurtarılabilir Gelir
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-emerald-300">
            {formatTRY(recovery.recoverableRevenue)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Kurtarılabilir fırsat değeri toplamı</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Recovery Fırsatları
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-zinc-100">
            {recovery.items.length} fırsat
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Aksiyon alınabilir leadler</p>
        </div>

        <div className="bg-zinc-900 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Recovery Potansiyeli
          </p>
          <p className="mt-1.5">
            <span className={`rounded border px-2.5 py-1 text-sm font-bold ${potentialCls}`}>
              {potentialLabel}
            </span>
          </p>
          <p className="mt-1.5 text-[11px] text-zinc-600">Pipeline ağırlığına göre</p>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {/* Founder message */}
        <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[12px] font-medium text-zinc-200">{recovery.founderMessage}</p>
        </div>

        {/* Driver chips */}
        <div className="flex flex-wrap gap-2">
          {recovery.criticalCount > 0 && (
            <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300">
              {recovery.criticalCount} kritik aksiyon
            </span>
          )}
          {recovery.highCount > 0 && (
            <span className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] text-fuchsia-300">
              {recovery.highCount} yüksek öncelik
            </span>
          )}
          {recovery.mediumCount > 0 && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">
              {recovery.mediumCount} orta öncelik
            </span>
          )}
        </div>

        {/* Top 5 recovery rows */}
        <div className="overflow-hidden rounded-lg border border-white/5">
          <div className="divide-y divide-white/[0.04]">
            {recovery.top5.map(
              ({ leadId, leadName, recoveryValue, recoveryAction, priority, actionLabel }) => (
                <div key={leadId} className="flex items-center gap-3 px-3 py-2.5">
                  <div
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDotCls[priority] ?? "bg-zinc-500"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-100">{leadName}</p>
                    <p className="text-[11px] text-zinc-400">{recoveryAction}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-bold tabular-nums text-emerald-300">
                      {formatTRY(recoveryValue)}
                    </p>
                    <span
                      className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${priorityCls[priority] ?? "text-zinc-400 border-zinc-600/40 bg-zinc-700/20"}`}
                    >
                      {priority === "Critical"
                        ? "Kritik"
                        : priority === "High"
                          ? "Yüksek"
                          : "Orta"}
                    </span>
                    <p className="mt-0.5 text-[10px] text-zinc-600">{actionLabel}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── end v3.5.0 ──────────────────────────────────────────────────────────────

// ─── v3.6.0 — Founder Command Center ────────────────────────────────────────

type FounderCommandResult = {
  command: string;
  impactRevenue: number;
  criticalLeadId: string | null;
  criticalLeadName: string;
  criticalLeadCity: string;
  criticalLeadReason: string;
  confidence: "high" | "medium" | "low";
  insight: string;
  priority: 1 | 2 | 3 | 4 | 5;
};

/**
 * v3.6.0 — Orchestration engine that synthesises existing runtime signals into a
 * single primary command. Pure function, no AI, no I/O.
 * Priority order: FOLLOW_UP_DUE > HOT_NOW > DEMO_READY > RECOVERY > PIPELINE_LOW.
 * Won/lost leads excluded.
 */
function computeFounderCommand(
  rows: LeadTableRow[],
  now: number,
  contactFinderMap: Record<string, ContactFinderResult>,
): FounderCommandResult {
  type Candidate = { row: LeadTableRow; ev: number };
  const followUpDue: Candidate[] = [];
  const hotNow: Candidate[] = [];
  const demoReady: Candidate[] = [];
  const recovery: Candidate[] = [];

  for (const row of rows) {
    const s = row._s;
    if (s.status === "won" || s.status === "lost") continue;

    const action = computeTodayActionStatus(row, s, now);
    const rp = computeRevenuePotential(row);
    const finder = contactFinderMap[row.id];
    const icpFit = typeof row.icpFitScore === "number" ? row.icpFitScore : 0;
    const ev = rp.expectedValue;

    if (action === "FOLLOW_UP_DUE") {
      followUpDue.push({ row, ev });
    } else if (action === "HOT_NOW" && s.status === "new") {
      hotNow.push({ row, ev });
    } else if (action === "DEMO_READY") {
      demoReady.push({ row, ev });
    } else if (
      (ev > 100_000 && !hasValidOutboundContact(row, finder).any) ||
      (icpFit >= 60 && ev >= 80_000 && s.status === "new" && (s.contactAttempts ?? 0) === 0)
    ) {
      recovery.push({ row, ev });
    }
  }

  const activePriorityCount = [
    followUpDue.length > 0,
    hotNow.length > 0,
    demoReady.length > 0,
    recovery.length > 0,
  ].filter(Boolean).length;

  let confidence: "high" | "medium" | "low";
  if (activePriorityCount === 1) confidence = "high";
  else if (activePriorityCount === 2) confidence = "medium";
  else confidence = "low";

  let command: string;
  let priority: 1 | 2 | 3 | 4 | 5;
  let candidates: Candidate[];
  let criticalLeadReason: string;
  let insight: string;

  if (followUpDue.length > 0) {
    priority = 1;
    command = "Takip gecikmelerini kapat";
    candidates = followUpDue;
    criticalLeadReason = "Takip gecikmesi nedeniyle risk altında.";
    insight = "Bugünkü en büyük gelir riski takip gecikmeleri.";
  } else if (hotNow.length > 0) {
    priority = 2;
    command = "Sıcak fırsatlarla iletişime geç";
    candidates = hotNow;
    criticalLeadReason = "Sıcak fırsat henüz işleme alınmadı.";
    insight = "Sıcak fırsatlar gelir yaratma potansiyeli taşıyor.";
  } else if (demoReady.length > 0) {
    priority = 3;
    command = "Demo adaylarını ilerlet";
    candidates = demoReady;
    criticalLeadReason = "Demo aşamasına hazır, harekete geçilmeli.";
    insight = "Demo adayları kapanış için hazır, harekete geç.";
  } else if (recovery.length > 0) {
    priority = 4;
    command = "Risk altındaki geliri geri kazan";
    candidates = recovery;
    criticalLeadReason = "İletişim veya aksiyon eksikliği nedeniyle risk altında.";
    insight = "Pipeline içindeki riski azaltmak için iletişim aksiyonları gerekli.";
  } else {
    // PIPELINE_LOW — no actionable leads
    return {
      command: "Yeni fırsat üretimine odaklan",
      impactRevenue: 0,
      criticalLeadId: null,
      criticalLeadName: "",
      criticalLeadCity: "",
      criticalLeadReason: "",
      confidence: "low",
      insight: "Pipeline dengeli görünüyor ancak yeni fırsat üretimi gerekli.",
      priority: 5,
    };
  }

  candidates.sort((a, b) => b.ev - a.ev);
  const top = candidates[0];
  const impactRevenue = candidates.reduce((acc, c) => acc + c.ev, 0);

  return {
    command,
    impactRevenue,
    criticalLeadId: top.row.id,
    criticalLeadName: top.row.name || "—",
    criticalLeadCity: top.row.city || "",
    criticalLeadReason,
    confidence,
    insight,
    priority,
  };
}

/** v3.6.0 — Founder Command Center: single dominant recommendation, revenue impact, critical lead. */
function FounderCommandCenter({
  rows,
  now,
  contactFinderMap,
  onOpenDetail,
}: {
  rows: LeadTableRow[];
  now: number;
  contactFinderMap: Record<string, ContactFinderResult>;
  onOpenDetail: (id: string) => void;
}) {
  const cmd = useMemo(
    () => computeFounderCommand(rows, now, contactFinderMap),
    [rows, now, contactFinderMap],
  );

  if (rows.length === 0) return null;

  // Empty / PIPELINE_LOW with no leads at all
  if (cmd.priority === 5 && cmd.impactRevenue === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-500/[0.03]">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
            Komuta Merkezi
          </h2>
        </div>
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Operasyon planlandığı şekilde ilerliyor.
          </p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Bugün için kritik aksiyon görünmüyor.
          </p>
        </div>
      </section>
    );
  }

  const priorityBorder: Record<number, string> = {
    1: "border-rose-500/25 bg-rose-500/[0.04]",
    2: "border-fuchsia-500/25 bg-fuchsia-500/[0.04]",
    3: "border-violet-500/25 bg-violet-500/[0.04]",
    4: "border-amber-500/25 bg-amber-500/[0.04]",
    5: "border-zinc-700/40 bg-zinc-500/[0.03]",
  };

  const commandCls: Record<number, string> = {
    1: "text-rose-200",
    2: "text-fuchsia-200",
    3: "text-violet-200",
    4: "text-amber-200",
    5: "text-zinc-300",
  };

  const confidenceLabel =
    cmd.confidence === "high" ? "Yüksek" : cmd.confidence === "medium" ? "Orta" : "Düşük";

  const confidenceCls =
    cmd.confidence === "high"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
      : cmd.confidence === "medium"
        ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
        : "text-zinc-400 border-zinc-600/40 bg-zinc-700/20";

  return (
    <section
      className={`overflow-hidden rounded-xl border ${priorityBorder[cmd.priority] ?? priorityBorder[5]}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-300">
          Komuta Merkezi
        </h2>
        <span className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${confidenceCls}`}>
          Komut Güveni: {confidenceLabel}
        </span>
      </div>

      {/* Primary command */}
      <div className="px-5 pt-5 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Bugünkü Birincil Komut
        </p>
        <p
          className={`mt-2 text-2xl font-bold leading-snug tracking-tight ${commandCls[cmd.priority] ?? "text-zinc-200"}`}
        >
          {cmd.command}
        </p>
        {cmd.impactRevenue > 0 && (
          <p className="mt-2 text-sm font-medium text-zinc-400">
            <span className="font-bold text-zinc-100">{formatTRY(cmd.impactRevenue)}</span>
            {" "}gelir etkisi
          </p>
        )}
      </div>

      {/* Critical lead */}
      {cmd.criticalLeadId && (
        <div className="mx-5 mb-4 overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Kritik Lead
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {cmd.criticalLeadName}
                {cmd.criticalLeadCity && (
                  <span className="ml-2 text-[11px] font-normal text-zinc-500">
                    {cmd.criticalLeadCity}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{cmd.criticalLeadReason}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenDetail(cmd.criticalLeadId!)}
              className="shrink-0 rounded-md border border-zinc-600/50 bg-zinc-700/30 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700/50"
            >
              Detay Aç
            </button>
          </div>
        </div>
      )}

      {/* Founder insight */}
      <div className="border-t border-white/5 px-5 py-3">
        <p className="text-[11px] italic text-zinc-500">{cmd.insight}</p>
      </div>
    </section>
  );
}

// ─── end v3.6.0 ──────────────────────────────────────────────────────────────

/** v2.0 — "Bu Haftaki Ticari Görünüm" Revenue Intelligence Layer. Derived only — no AI, no persistence. */
function WeeklyCommercialOutlook({
  rows,
  now,
}: {
  rows: LeadTableRow[];
  now: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const intel = useMemo(() => {
    let verified = 0;
    let hotCount = 0;
    let demoCount = 0;
    let followUpDue = 0;
    let hotNotContacted = 0;
    let demoIdle = 0;
    let activeCount = 0;
    let expectedClosings = 0;

    for (const row of rows) {
      const s = row._s;
      if (s.status === "won" || s.status === "lost") continue;

      const lifecycle = computeLeadLifecycleStatus(row, s);
      const action = computeTodayActionStatus(row, s, now);

      if (lifecycle === "VERIFIED" || lifecycle === "HOT_OPPORTUNITY") verified++;
      if (lifecycle === "HOT_OPPORTUNITY") {
        hotCount++;
        if (s.status === "new") hotNotContacted++;
      }
      if (action === "DEMO_READY" || s.status === "meeting") demoCount++;
      if (action === "FOLLOW_UP_DUE") followUpDue++;
      if (action === "DEMO_READY") demoIdle++;
      if (
        s.status === "contacted" ||
        s.status === "needs_follow_up" ||
        s.status === "replied"
      )
        activeCount++;

      // Part 2: probability-weighted expected closings
      if (action === "HOT_NOW") expectedClosings += 0.35;
      else if (action === "DEMO_READY") expectedClosings += 0.6;
      else if (action === "FOLLOW_UP_DUE") expectedClosings += 0.15;
      else if (action === "NEEDS_CONTACT") expectedClosings += 0.08;
    }

    // Part 3: Pipeline Gücü 0–100
    const pipelineScore = Math.min(
      Math.min(verified * 8, 25) +
        Math.min(hotCount * 12, 35) +
        Math.min(demoCount * 15, 30) +
        Math.min(activeCount * 2, 10),
      100,
    );

    return {
      verified,
      hotCount,
      demoCount,
      followUpDue,
      hotNotContacted,
      demoIdle,
      expectedClosings,
      pipelineScore,
    };
  }, [rows, now]);

  if (rows.length === 0) return null;

  const { pipelineScore } = intel;
  const pipelineLabelCls =
    pipelineScore >= 75
      ? "text-emerald-300"
      : pipelineScore >= 50
        ? "text-sky-300"
        : pipelineScore >= 25
          ? "text-amber-300"
          : "text-zinc-400";
  const pipelineLabel =
    pipelineScore >= 75
      ? tr
        ? "Mükemmel"
        : "Excellent"
      : pipelineScore >= 50
        ? tr
          ? "Güçlü"
          : "Strong"
        : pipelineScore >= 25
          ? tr
            ? "Orta"
            : "Medium"
          : tr
            ? "Zayıf"
            : "Weak";

  // Part 4: collect active risks (max 3)
  const risks: string[] = [];
  if (intel.followUpDue > 0)
    risks.push(
      tr
        ? `${intel.followUpDue} takip gecikmiş`
        : `${intel.followUpDue} follow-up overdue`,
    );
  if (intel.hotNotContacted > 0)
    risks.push(
      tr
        ? `${intel.hotNotContacted} sıcak fırsat henüz işleme alınmadı`
        : `${intel.hotNotContacted} hot opportunity not contacted`,
    );
  if (intel.demoIdle > 0)
    risks.push(
      tr
        ? `${intel.demoIdle} demo adayı bekliyor`
        : `${intel.demoIdle} demo candidate idle`,
    );

  // Part 5: single highest-priority founder insight
  const insight =
    intel.followUpDue > 0
      ? tr
        ? "Takip gecikmeleri kapanış oranını düşürebilir."
        : "Overdue follow-ups may hurt your close rate."
      : intel.hotCount > intel.demoCount
        ? tr
          ? "Fırsat üretimi güçlü, demo planlamaya odaklan."
          : "Opportunity generation is strong — focus on scheduling demos."
        : intel.demoCount > intel.hotCount
          ? tr
            ? "Borunun alt kısmı güçlü, yeni fırsat ihtiyacı oluşabilir."
            : "Bottom of funnel is strong — consider sourcing fresh opportunities."
          : tr
            ? "Pipeline sağlıklı görünüyor, aksiyonlara devam et."
            : "Pipeline looks healthy — keep executing.";

  const metrics = [
    {
      label: tr ? "Doğrulanmış Fırsatlar" : "Verified Opportunities",
      value: intel.verified,
      cls: "text-emerald-300",
    },
    {
      label: tr ? "Sıcak Fırsatlar" : "Hot Opportunities",
      value: intel.hotCount,
      cls: "text-fuchsia-300",
    },
    {
      label: tr ? "Demo Adayları" : "Demo Candidates",
      value: intel.demoCount,
      cls: "text-violet-300",
    },
    {
      label: tr ? "Takip Bekleyenler" : "Follow-up Due",
      value: intel.followUpDue,
      cls: "text-amber-300",
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03]">
      <div className="border-b border-white/5 px-5 py-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-200">
          {tr ? "Bu Haftaki Ticari Görünüm" : "Weekly Commercial Outlook"}
        </h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          {tr
            ? "Pipeline zekası — anlık hesaplama, kalıcı değil"
            : "Runtime pipeline intelligence — not persisted"}
        </p>
      </div>

      <div className="space-y-3 p-4">
        {/* Part 1: Four metric counters */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-center"
            >
              <div className={`text-2xl font-bold tabular-nums ${c.cls}`}>{c.value}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Part 2 + 3: Expected Closings & Pipeline Gücü */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {tr ? "Beklenen Kapanış" : "Expected Closings"}
            </div>
            <div className="mt-1.5 text-3xl font-bold tabular-nums text-sky-300">
              {intel.expectedClosings.toFixed(1)}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-600">
              {tr ? "Olasılık tabanlı tahmin" : "Probability-weighted forecast"}
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {tr ? "Pipeline Gücü" : "Pipeline Strength"}
            </div>
            <div className={`mt-1.5 text-3xl font-bold tabular-nums ${pipelineLabelCls}`}>
              {pipelineScore}
              <span className="ml-1 text-base font-normal text-zinc-500">/100</span>
            </div>
            <div className={`mt-0.5 text-[11px] font-medium ${pipelineLabelCls}`}>
              {pipelineLabel}
            </div>
          </div>
        </div>

        {/* Part 4: Risk Detection */}
        {risks.length > 0 && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.03] px-3 py-2.5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-rose-400">
              {tr ? "Riskler" : "Risks"}
            </div>
            <ul className="space-y-1">
              {risks.map((r) => (
                <li key={r} className="flex items-start gap-1.5 text-[12px] text-zinc-300">
                  <span className="mt-0.5 text-rose-400">·</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Part 5: Founder Insight */}
        <div className="rounded-lg border border-indigo-400/15 bg-indigo-500/[0.04] px-3 py-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-indigo-400">
            {tr ? "Kurucu İçgörüsü" : "Founder Insight"}
          </div>
          <p className="text-[12px] leading-relaxed text-zinc-300">{insight}</p>
        </div>
      </div>
    </section>
  );
}

/** v1.8 — Summary counter cards: Bugün Ulaşılacak / Takip Bekleyen / Demo Adayı / Kazanılan. */
function ExecutionCounters({ rows, now }: { rows: LeadTableRow[]; now: number }) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const counts = useMemo(() => {
    let todayReach = 0;
    let followUpPending = 0;
    let demoCandidate = 0;
    let won = 0;
    for (const row of rows) {
      const s = row._s;
      if (s.status === "won") {
        won++;
        continue;
      }
      const action = computeTodayActionStatus(row, s, now);
      if (action === "HOT_NOW" || action === "NEEDS_CONTACT") todayReach++;
      else if (action === "FOLLOW_UP_DUE") followUpPending++;
      else if (action === "DEMO_READY") demoCandidate++;
    }
    return { todayReach, followUpPending, demoCandidate, won };
  }, [rows, now]);

  const cards = [
    {
      label: tr ? "Bugün Ulaşılacak" : "Reach Today",
      value: counts.todayReach,
      cls: "text-orange-300",
    },
    {
      label: tr ? "Takip Bekleyen" : "Follow-up Pending",
      value: counts.followUpPending,
      cls: "text-amber-300",
    },
    {
      label: tr ? "Demo Adayı" : "Demo Candidate",
      value: counts.demoCandidate,
      cls: "text-emerald-300",
    },
    {
      label: tr ? "Kazanılan" : "Won",
      value: counts.won,
      cls: "text-fuchsia-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-center"
        >
          <div className={`text-2xl font-bold tabular-nums ${c.cls}`}>{c.value}</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

const ACTION_PRIORITY: Record<TodayActionStatus, number> = {
  HOT_NOW: 4,
  DEMO_READY: 3,
  FOLLOW_UP_DUE: 2,
  NEEDS_CONTACT: 1,
  NO_ACTION: 0,
};

/** v1.8 — "Günün Öncelikli Aksiyonları" sorted action queue panel. */
function ActionQueuePanel({
  rows,
  now,
  onOpenDetail,
}: {
  rows: LeadTableRow[];
  now: number;
  onOpenDetail: (id: string) => void;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";

  const items = useMemo(
    () =>
      rows
        .map((row) => ({ row, action: computeTodayActionStatus(row, row._s, now) }))
        .filter(({ action }) => action !== "NO_ACTION")
        .sort((a, b) => ACTION_PRIORITY[b.action] - ACTION_PRIORITY[a.action]),
    [rows, now],
  );

  if (items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-orange-500/20 bg-orange-500/[0.03]">
      <div className="border-b border-white/5 px-5 py-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-orange-200">
          {tr ? "Günün Öncelikli Aksiyonları" : "Today's Priority Actions"}
        </h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          {tr
            ? "Bugün iletişime geçilmesi gereken işletmeler"
            : "Businesses to reach today"}
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {items.map(({ row, action }) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-white/[0.02]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-zinc-100">{row.name}</span>
                {row.city && (
                  <span className="shrink-0 text-[11px] text-zinc-500">· {row.city}</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {todayActionReasonText(row, action, tr)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ActionStatusBadge action={action} />
              <button
                type="button"
                onClick={() => onOpenDetail(row.id)}
                className="rounded-md border border-white/12 bg-white/5 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-white/10"
              >
                {tr ? "Detay Aç" : "Open"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── v1.9 Sales Pipeline Layer ───────────────────────────────────────────────

/** Pure: follow-up age label for contacted/follow-up leads. Derived only, no persistence. */
function computeFollowUpAge(s: LeadStatusUpdate, now: number, tr: boolean): string | null {
  if (s.status !== "contacted" && s.status !== "needs_follow_up" && s.status !== "replied")
    return null;
  const base =
    typeof s.lastContactedAt === "number" && s.lastContactedAt > 0
      ? s.lastContactedAt
      : typeof s.contactedAt === "number" && s.contactedAt > 0
        ? s.contactedAt
        : null;
  const followUpAt =
    typeof s.nextFollowUpAt === "number" && Number.isFinite(s.nextFollowUpAt)
      ? s.nextFollowUpAt
      : base != null
        ? base +
          (typeof s.followUpAfterHours === "number" && s.followUpAfterHours > 0
            ? s.followUpAfterHours
            : 24) *
            3600000
        : null;
  if (followUpAt !== null && now > followUpAt) return tr ? "Takip gecikti" : "Follow-up overdue";
  if (base == null) return null;
  const days = Math.floor((now - base) / 86400000);
  if (days <= 0) return tr ? "Takip bugün" : "Follow-up today";
  if (days < 2) return tr ? "1 gün geçti" : "1 day ago";
  if (days < 5) return tr ? "3 gün geçti" : "3 days ago";
  return tr ? "7 gün geçti" : "7 days ago";
}

/** Pure: demo readiness checklist derived from signal verification and ICP score. */
function computeDemoReadiness(
  lead: LeadTableRow,
  tr: boolean,
): { pct: number; ready: boolean; items: { label: string; ok: boolean }[] } {
  const v = lead.signalVerification;
  const items = [
    { label: tr ? "Website doğrulandı" : "Website verified", ok: v?.websiteVerification === "verified" },
    {
      label: tr ? "WhatsApp bulundu" : "WhatsApp found",
      ok: v?.whatsappVerification === "verified" || v?.whatsappVerification === "likely",
    },
    {
      label: tr ? "Instagram bulundu" : "Instagram found",
      ok:
        v?.instagramVerification === "verified" ||
        v?.instagramVerification === "likely" ||
        v?.instagramVerification === "candidate",
    },
    {
      label: tr ? "Rezervasyon CTA bulundu" : "Reservation CTA found",
      ok: v?.reservationSignal === "verified" || v?.reservationSignal === "detected",
    },
    {
      label: tr ? "ICP uyumu yüksek" : "High ICP fit",
      ok: typeof lead.icpFitScore === "number" && lead.icpFitScore >= 70,
    },
  ];
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  return { pct, ready: pct >= 80, items };
}

/** v1.9 — "Demo Hazırlık Durumu" checklist card in lead detail panel. */
// ─── v2.2 Communication Intelligence Layer ──────────────────────────────────

type RecommendedChannelResult = {
  channel:
    | "whatsapp_verified"
    | "whatsapp_possible"
    | "instagram"
    | "website"
    | "phone"
    | "none";
  confidence: "high" | "medium" | "low";
};

/**
 * Derives the best outreach channel from existing signal verification and
 * contact finder data. Pure — no I/O. Priority:
 *   Verified WA > Possible WA > Instagram > Website > Phone > None
 */
function computeRecommendedChannel(
  row: LeadTableRow,
  finder: ContactFinderResult | undefined,
): RecommendedChannelResult {
  const v = row.signalVerification;

  if (
    v?.whatsappVerification === "verified" ||
    finder?.bestContactType === "VERIFIED_WHATSAPP"
  )
    return { channel: "whatsapp_verified", confidence: "high" };

  if (
    v?.whatsappVerification === "likely" ||
    finder?.bestContactType === "whatsapp" ||
    finder?.bestContactType === "GENERATED_WHATSAPP" ||
    Boolean(row.phone?.trim())
  )
    return { channel: "whatsapp_possible", confidence: "medium" };

  if (
    v?.instagramVerification === "verified" ||
    v?.instagramVerification === "likely" ||
    v?.instagramVerification === "candidate" ||
    finder?.bestContactType === "instagram" ||
    Boolean(row.instagram?.trim())
  )
    return { channel: "instagram", confidence: "medium" };

  if (
    v?.websiteVerification === "verified" ||
    v?.websiteVerification === "reachable" ||
    Boolean(row.website?.trim())
  )
    return { channel: "website", confidence: "low" };

  if (row.phone?.trim()) return { channel: "phone", confidence: "low" };

  return { channel: "none", confidence: "low" };
}

/** v2.2 — "İletişim Stratejisi" — channel strategy + readiness + playbook (Parts 1, 3, 4). */
function CommunicationStrategyCard({
  lead,
  finder,
  now,
}: {
  lead: LeadTableRow;
  finder: ContactFinderResult | undefined;
  now: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  // Communication phase is over for won/lost leads — hide the card entirely.
  if (lead._s.status === "won" || lead._s.status === "lost") return null;
  const v = lead.signalVerification;
  const action = computeTodayActionStatus(lead, lead._s, now);
  const rec = computeRecommendedChannel(lead, finder);

  // Part 3: readiness checklist (5 signals)
  const checks = [
    {
      label: tr ? "Website doğrulandı" : "Website verified",
      ok: v?.websiteVerification === "verified",
    },
    {
      label: tr ? "WhatsApp bulundu" : "WhatsApp found",
      ok:
        v?.whatsappVerification === "verified" ||
        v?.whatsappVerification === "likely" ||
        finder?.bestContactType === "VERIFIED_WHATSAPP" ||
        finder?.bestContactType === "whatsapp" ||
        finder?.bestContactType === "GENERATED_WHATSAPP",
    },
    {
      label: tr ? "Instagram bulundu" : "Instagram found",
      ok:
        v?.instagramVerification === "verified" ||
        v?.instagramVerification === "likely" ||
        v?.instagramVerification === "candidate" ||
        Boolean(lead.instagram?.trim()),
    },
    {
      label: tr ? "Rezervasyon CTA bulundu" : "Reservation CTA found",
      ok: v?.reservationSignal === "verified" || v?.reservationSignal === "detected",
    },
    {
      label: tr ? "İletişim kişisi bulundu" : "Contact person found",
      ok: Boolean(finder?.bestContactValue?.trim()),
    },
  ];
  const readyCount = checks.filter((c) => c.ok).length;
  const readinessPct = Math.round((readyCount / checks.length) * 100);
  const readinessLabel =
    readinessPct >= 80
      ? tr
        ? "Hazır"
        : "Ready"
      : readinessPct >= 40
        ? tr
          ? "Kısmen Hazır"
          : "Partially Ready"
        : tr
          ? "Araştırma Gerekli"
          : "Research Needed";
  const readinessCls =
    readinessPct >= 80 ? "text-emerald-300" : readinessPct >= 40 ? "text-amber-300" : "text-rose-400";

  // Part 1: channel display strings
  const channelLabel =
    rec.channel === "whatsapp_verified" || rec.channel === "whatsapp_possible"
      ? "WhatsApp"
      : rec.channel === "instagram"
        ? "Instagram"
        : rec.channel === "website"
          ? tr
            ? "Web Sitesi"
            : "Website"
          : rec.channel === "phone"
            ? tr
              ? "Telefon"
              : "Phone"
            : tr
              ? "Belirsiz"
              : "Unknown";

  const channelBadgeCls =
    rec.channel === "whatsapp_verified"
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
      : rec.channel === "whatsapp_possible"
        ? "border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-400"
        : rec.channel === "instagram"
          ? "border-violet-400/30 bg-violet-500/10 text-violet-300"
          : rec.channel === "website"
            ? "border-sky-400/30 bg-sky-500/10 text-sky-300"
            : "border-zinc-700 bg-zinc-800/60 text-zinc-500";

  const channelReason =
    rec.channel === "whatsapp_verified"
      ? tr
        ? "WhatsApp doğrulandı ve doğrudan iletişim mümkün."
        : "WhatsApp verified — direct contact available."
      : rec.channel === "whatsapp_possible"
        ? tr
          ? "WhatsApp muhtemel, telefon numarası üzerinden denenebilir."
          : "WhatsApp likely via phone number."
        : rec.channel === "instagram"
          ? tr
            ? "Instagram aktif, WhatsApp doğrulanmadı."
            : "Instagram active — WhatsApp not confirmed."
          : rec.channel === "website"
            ? v?.reservationSignal === "verified" || v?.reservationSignal === "detected"
              ? tr
                ? "Rezervasyon CTA mevcut."
                : "Reservation CTA detected on site."
              : tr
                ? "Web sitesi üzerinden iletişim kurulabilir."
                : "Contact reachable via website."
            : tr
              ? "Doğrulanmış kanal henüz bulunamadı."
              : "No verified channel found yet.";

  // Part 4: First Contact Playbook — deterministic, action-aware
  const playbook =
    action === "DEMO_READY"
      ? tr
        ? "Demo görüşmesi planla."
        : "Schedule a demo call."
      : action === "FOLLOW_UP_DUE"
        ? tr
          ? "Takip mesajı gönder."
          : "Send a follow-up message."
        : action === "HOT_NOW"
          ? rec.channel === "whatsapp_verified" || rec.channel === "whatsapp_possible"
            ? tr
              ? "Doğrudan WhatsApp teması önerilir."
              : "Direct WhatsApp contact recommended."
            : tr
              ? "İlk temas kur — yüksek öncelikli fırsat."
              : "Make first contact — high-priority opportunity."
          : rec.channel === "instagram"
            ? tr
              ? "DM ile ilk temas kur."
              : "Initiate contact via Instagram DM."
            : rec.channel === "website"
              ? tr
                ? "İletişim formu üzerinden ulaş."
                : "Reach out via contact form."
              : tr
                ? "İlk tanışma mesajı ile başla."
                : "Start with an introductory message.";

  if (rec.channel === "none" && readyCount === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-sky-500/20 bg-sky-500/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-sky-200">
            {tr ? "İletişim Stratejisi" : "Communication Strategy"}
          </span>
          <span className={`text-[10px] font-semibold ${readinessCls}`}>
            %{readinessPct} · {readinessLabel}
          </span>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {/* Recommended channel */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            {tr ? "Önerilen Kanal" : "Channel"}
          </span>
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${channelBadgeCls}`}>
            {channelLabel}
            {rec.channel === "whatsapp_verified" && " ✓"}
          </span>
        </div>

        {/* Communication reason */}
        <p className="text-[11px] text-zinc-400">
          <span className="text-zinc-500">{tr ? "Sebep: " : "Reason: "}</span>
          {channelReason}
        </p>

        {/* First action playbook */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{tr ? "İlk Aksiyon: " : "First Action: "}</span>
          <span className="ml-1 text-[11px] font-semibold text-zinc-100">{playbook}</span>
        </div>

        {/* Readiness checklist */}
        <div className="space-y-1.5">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-[11px]">
              <span className={c.ok ? "text-emerald-400" : "text-zinc-600"}>{c.ok ? "✓" : "—"}</span>
              <span className={c.ok ? "text-zinc-300" : "text-zinc-500"}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── v3.1 Founder Sales Assistant ──────────────────────────────────────────

type SalesAssistantSuggestion = {
  message: string;
  actionLabel: string;
  channelText: string;
  template: string;
};

/** v3.1 — Pure deterministic suggestion engine. No AI, no I/O. */
function computeSalesAssistantSuggestion(
  lead: LeadTableRow,
  finder: ContactFinderResult | undefined,
  now: number,
): SalesAssistantSuggestion | null {
  const s = lead._s;
  if (s.status === "won" || s.status === "lost") return null;

  const action = computeTodayActionStatus(lead, s, now);
  const rec = computeRecommendedChannel(lead, finder);

  // Action-based guidance
  let message: string;
  let actionLabel: string;
  if (s.status === "meeting") {
    message = "Demo görüşmesini planla ve karar verici kişiyi sürece dahil et.";
    actionLabel = "Demo Planla";
  } else if (action === "FOLLOW_UP_DUE") {
    message =
      "Takip zamanı geldi. Son görüşmeyi referans alarak kısa bir hatırlatma mesajı gönder.";
    actionLabel = "Takip Mesajı Gönder";
  } else if (action === "HOT_NOW") {
    message =
      "İlk teması kur. İşletmenin mevcut rezervasyon operasyonunu anlamaya odaklan.";
    actionLabel = "İlk Teması Kur";
  } else if (action === "DEMO_READY") {
    message =
      "Demo görüşmesi teklif et. Operasyon yoğunluğu ve çok kanallı iletişim problemlerine odaklan.";
    actionLabel = "Demo Teklif Et";
  } else {
    message = "Önce uygun iletişim kanalından kısa bir tanışma mesajı gönder.";
    actionLabel = "Tanışma Mesajı Gönder";
  }

  // Channel helper text
  let channelText: string;
  if (rec.channel === "whatsapp_verified" || rec.channel === "whatsapp_possible") {
    channelText = "WhatsApp üzerinden ilerlenmesi öneriliyor.";
  } else if (rec.channel === "instagram") {
    channelText = "Instagram DM üzerinden ilerlenmesi öneriliyor.";
  } else if (rec.channel === "website") {
    channelText = "Web formu veya web sitesi üzerinden iletişim öneriliyor.";
  } else if (rec.channel === "phone") {
    channelText = "Telefon görüşmesi öneriliyor.";
  } else {
    channelText = "Önce iletişim bilgisi doğrulanmalı.";
  }

  // Channel-specific ready-to-use template
  let template: string;
  if (rec.channel === "whatsapp_verified" || rec.channel === "whatsapp_possible") {
    template =
      "Merhaba,\n\nİşletmenizin dijital rezervasyon süreçlerini inceledim.\n\nKısa bir görüşme yaparak mevcut operasyon yapınızı anlamak isterim.\n\nUygun olursanız bilgi paylaşabilir misiniz?";
  } else if (rec.channel === "instagram") {
    template =
      "Merhaba,\n\nRezervasyon ve misafir iletişimi süreçleriniz hakkında kısa bir görüşme yapmak isterim.\n\nUygun olursanız bilgi paylaşabilir misiniz?";
  } else if (rec.channel === "phone") {
    template =
      "Arama öncesi not:\n\nİlk amaç satış yapmak değil,\nmevcut operasyon yapısını anlamak.";
  } else {
    template =
      "Merhaba,\n\nİşletmenizin rezervasyon operasyonları hakkında bilgi almak isterim.\n\nUygun olursanız geri dönüş sağlayabilir misiniz?";
  }

  return { message, actionLabel, channelText, template };
}

/** v3.1 — "Satış Asistanı" — deterministic sales guidance card for lead detail sidebar. */
function FounderSalesAssistant({
  lead,
  finder,
  now,
}: {
  lead: LeadTableRow;
  finder: ContactFinderResult | undefined;
  now: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const [copied, setCopied] = useState(false);

  const suggestion = computeSalesAssistantSuggestion(lead, finder, now);
  if (!suggestion) return null;

  function handleCopy() {
    navigator.clipboard.writeText(suggestion!.template).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-3">
      {/* Header */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
          {tr ? "Satış Asistanı" : "Sales Assistant"}
        </span>
      </div>
      <p className="mb-3 text-[11px] text-zinc-500">
        {tr ? "Bu lead için önerilen ilk aksiyon." : "Recommended first action for this lead."}
      </p>

      {/* Action guidance */}
      <div className="mb-3 rounded-md border border-white/8 bg-white/[0.025] px-3 py-2.5">
        <p className="text-[12px] font-semibold text-emerald-300">{suggestion.actionLabel}</p>
        <p className="mt-1 text-[12px] text-zinc-300 leading-relaxed">{suggestion.message}</p>
        <p className="mt-1.5 text-[11px] italic text-zinc-500">{suggestion.channelText}</p>
      </div>

      {/* Ready-to-use message template */}
      <div className="mb-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {tr ? "Önerilen Mesaj" : "Suggested Message"}
        </p>
        <div className="rounded-md border border-white/8 bg-zinc-900/40 px-3 py-2.5">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">
            {suggestion.template}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <p className="w-full text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {tr ? "Hızlı Aksiyonlar" : "Quick Actions"}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
        >
          {copied ? (tr ? "Kopyalandı!" : "Copied!") : (tr ? "Mesajı Kopyala" : "Copy Message")}
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-700/40 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.05]"
        >
          {tr ? "Lead Detayını Aç" : "Open Lead Detail"}
        </button>
      </div>
    </div>
  );
}

// ─── end v3.1 ───────────────────────────────────────────────────────────────

// ─── v3.1.1 Operation Guide — Sidebar Consolidation ─────────────────────────

/** v3.1.1 — Unified operational workspace. Merges channel, action, message template and quick
 *  actions into a single card. Replaces standalone CommunicationStrategyCard,
 *  FounderSalesAssistant, and TodayActionCard in the sidebar. No new logic — reuses
 *  computeRecommendedChannel, computeTodayActionStatus, computeSalesAssistantSuggestion. */
function OperationGuideSection({
  lead,
  finder,
  now,
}: {
  lead: LeadTableRow;
  finder: ContactFinderResult | undefined;
  now: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const [copied, setCopied] = useState(false);
  const s = lead._s;

  // Closed lead — compact status card instead of operational actions
  if (s.status === "won" || s.status === "lost") {
    return (
      <div className="rounded-lg border border-zinc-700/40 bg-zinc-500/[0.03] px-3 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {tr ? "Operasyon Rehberi" : "Operation Guide"}
        </p>
        <div className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-2.5 text-center">
          {s.status === "won" ? (
            <>
              <p className="text-[13px] font-semibold text-emerald-300">
                {tr ? "Kazanıldı" : "Won"}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {tr
                  ? "Bu fırsat başarıyla sonuçlandırıldı."
                  : "This opportunity was successfully closed."}
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-zinc-400">
                {tr ? "Kaybedildi" : "Lost"}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {tr
                  ? "Bu fırsat aktif takipten çıkarıldı."
                  : "This opportunity has been removed from active follow-up."}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const action = computeTodayActionStatus(lead, s, now);
  const rec = computeRecommendedChannel(lead, finder);
  const suggestion = computeSalesAssistantSuggestion(lead, finder, now);
  const waDigits = queueSessionWhatsAppDigits(lead, finder);
  const waLink = waDigits ? whatsappLink(waDigits) : null;

  // Channel display label
  const channelLabel =
    rec.channel === "whatsapp_verified" || rec.channel === "whatsapp_possible"
      ? "WhatsApp"
      : rec.channel === "instagram"
        ? "Instagram"
        : rec.channel === "website"
          ? tr ? "Web Formu" : "Website"
          : rec.channel === "phone"
            ? tr ? "Telefon" : "Phone"
            : tr ? "Belirsiz" : "Unknown";

  // Short action label for today
  const actionCopy =
    s.status === "meeting"
      ? tr ? "Demo görüşmesini ilerlet" : "Advance demo meeting"
      : action === "FOLLOW_UP_DUE"
        ? tr ? "Takip mesajı gönder" : "Send follow-up"
        : action === "HOT_NOW"
          ? tr ? "İlk temas kur" : "Make first contact"
          : action === "DEMO_READY"
            ? tr ? "Demo görüşmesini ilerlet" : "Advance to demo"
            : !hasValidOutboundContact(lead, finder).any
              ? tr ? "İletişim bilgisini doğrula" : "Verify contact info"
              : tr ? "Tanışma mesajı gönder" : "Send intro message";

  function handleCopy() {
    if (!suggestion) return;
    navigator.clipboard.writeText(suggestion.template).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-3">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        {tr ? "Operasyon Rehberi" : "Operation Guide"}
      </p>

      {/* Önerilen Kanal + Bugünkü Aksiyon */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-white/8 bg-white/[0.025] px-2.5 py-2">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            {tr ? "Önerilen Kanal" : "Channel"}
          </p>
          <p className="text-[12px] font-semibold text-emerald-300">{channelLabel}</p>
        </div>
        <div className="rounded-md border border-white/8 bg-white/[0.025] px-2.5 py-2">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            {tr ? "Bugünkü Aksiyon" : "Today's Action"}
          </p>
          <p className="text-[12px] font-semibold text-sky-300">{actionCopy}</p>
        </div>
      </div>

      {/* Guidance message from suggestion engine */}
      {suggestion && (
        <p className="mb-3 text-[12px] leading-relaxed text-zinc-300">{suggestion.message}</p>
      )}

      {/* Önerilen Mesaj */}
      {suggestion && (
        <div className="mb-3">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            {tr ? "Önerilen Mesaj" : "Suggested Message"}
          </p>
          <div className="rounded-md border border-white/8 bg-zinc-900/40 px-3 py-2.5">
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">
              {suggestion.template}
            </p>
          </div>
        </div>
      )}

      {/* Hızlı Aksiyonlar */}
      {(suggestion || waLink) && (
        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            {tr ? "Hızlı Aksiyonlar" : "Quick Actions"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestion && (
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                {copied
                  ? tr ? "Kopyalandı!" : "Copied!"
                  : tr ? "Mesajı Kopyala" : "Copy Message"}
              </button>
            )}
            {waLink && (
              <button
                type="button"
                onClick={() => openExternal(waLink)}
                className="rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-1.5 text-[11px] font-medium text-green-300 transition hover:bg-green-500/20"
              >
                {tr ? "WhatsApp Aç" : "Open WhatsApp"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── end v3.1.1 ──────────────────────────────────────────────────────────────

function DemoReadinessCard({ lead }: { lead: LeadTableRow }) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const s = lead._s;
  if (s.status === "won" || s.status === "lost") return null;
  const { pct, ready, items } = computeDemoReadiness(lead, tr);
  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.03] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {tr ? "Demo Hazırlık Durumu" : "Demo Readiness"}
        </span>
        <span
          className={`text-xs font-semibold tabular-nums ${ready ? "text-emerald-300" : "text-amber-300"}`}
        >
          %{pct}
        </span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[11px]">
            <span className={item.ok ? "text-emerald-400" : "text-zinc-600"}>
              {item.ok ? "✓" : "—"}
            </span>
            <span className={item.ok ? "text-zinc-200" : "text-zinc-500"}>{item.label}</span>
          </div>
        ))}
      </div>
      <div
        className={`mt-2 rounded-md px-2 py-1 text-center text-[11px] font-medium ${
          ready ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/10 text-amber-300"
        }`}
      >
        {ready
          ? tr
            ? "Demo Hazır"
            : "Ready for Demo"
          : tr
            ? "Daha Fazla Veri Gerekli"
            : "More Data Needed"}
      </div>
    </div>
  );
}

/** v1.9 — Quick pipeline stage action buttons in lead detail panel. */
function PipelineStageActions({
  lead,
  setLeadStatus,
  now,
}: {
  lead: LeadTableRow;
  setLeadStatus: (id: string, status: LeadStatus) => void;
  now: number;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const s = lead._s;
  const ageLabel = computeFollowUpAge(s, now, tr);
  const ageCls =
    ageLabel === (tr ? "Takip gecikti" : "Follow-up overdue")
      ? "text-rose-300"
      : ageLabel === (tr ? "Takip bugün" : "Follow-up today")
        ? "text-sky-300"
        : "text-amber-300";

  const stages: { label: string; status: LeadStatus; active: boolean; activeCls: string }[] = [
    {
      label: tr ? "İlk Temas Yapıldı" : "First Contact",
      status: "contacted",
      active: s.status === "contacted",
      activeCls: "bg-sky-500/20 text-sky-200 ring-sky-400/40",
    },
    {
      label: tr ? "Takibe Al" : "Follow-up",
      status: "needs_follow_up",
      active: s.status === "needs_follow_up" || s.status === "replied",
      activeCls: "bg-amber-500/20 text-amber-200 ring-amber-400/40",
    },
    {
      label: tr ? "Demo Planlandı" : "Demo Planned",
      status: "meeting",
      active: s.status === "meeting",
      activeCls: "bg-violet-500/20 text-violet-200 ring-violet-400/40",
    },
    {
      label: tr ? "Kazanıldı" : "Won",
      status: "won",
      active: s.status === "won",
      activeCls: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40",
    },
    {
      label: tr ? "Kaybedildi" : "Lost",
      status: "lost",
      active: s.status === "lost",
      activeCls: "bg-rose-500/20 text-rose-200 ring-rose-400/40",
    },
  ];

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {tr ? "Satış Aşaması" : "Pipeline Stage"}
        </span>
        {ageLabel && (
          <span className={`text-[11px] font-medium ${ageCls}`}>{ageLabel}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {stages.map((stage) => (
          <button
            key={stage.status}
            type="button"
            onClick={() => setLeadStatus(lead.id, stage.status)}
            className={`rounded-md px-2.5 py-1 text-xs ring-1 ring-inset transition ${
              stage.active
                ? stage.activeCls
                : "bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10"
            }`}
          >
            {stage.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** v1.9 — Pipeline stage counters (Temas Kuruldu / Takipte / Demo Aşamasında / Kazanıldı). */
function PipelineCounters({ rows }: { rows: LeadTableRow[] }) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const counts = useMemo(() => {
    let contacted = 0;
    let following = 0;
    let demo = 0;
    let won = 0;
    for (const row of rows) {
      const st = row._s.status;
      if (st === "contacted") contacted++;
      else if (st === "needs_follow_up" || st === "replied") following++;
      else if (st === "meeting") demo++;
      else if (st === "won") won++;
    }
    return { contacted, following, demo, won };
  }, [rows]);
  if (!counts.contacted && !counts.following && !counts.demo && !counts.won) return null;
  const cards = [
    { label: tr ? "Temas Kuruldu" : "Contacted", value: counts.contacted, cls: "text-sky-300" },
    { label: tr ? "Takipte" : "Following Up", value: counts.following, cls: "text-amber-300" },
    { label: tr ? "Demo Aşamasında" : "In Demo", value: counts.demo, cls: "text-violet-300" },
    { label: tr ? "Kazanıldı" : "Won", value: counts.won, cls: "text-emerald-300" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-center"
        >
          <div className={`text-2xl font-bold tabular-nums ${c.cls}`}>{c.value}</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/** One card in the pipeline kanban board. */
function PipelineBoardCard({
  row,
  now,
  onOpen,
}: {
  row: LeadTableRow;
  now: number;
  onOpen: (id: string) => void;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const score = row.verifiedOpportunityScore;
  const ageLabel = computeFollowUpAge(row._s, now, tr);
  const ageCls =
    ageLabel === (tr ? "Takip gecikti" : "Follow-up overdue")
      ? "text-rose-300"
      : ageLabel === (tr ? "Takip bugün" : "Follow-up today")
        ? "text-sky-300"
        : "text-amber-400";
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      className="w-full rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-white/15 hover:bg-white/[0.04]"
    >
      <div className="truncate text-[12px] font-medium text-zinc-100">{row.name}</div>
      {row.city && <div className="mt-0.5 text-[10px] text-zinc-500">{row.city}</div>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {typeof score === "number" && (
          <span className="text-[10px] tabular-nums text-zinc-400">
            {tr ? "Fırsat" : "Score"}{" "}
            <span className="font-semibold text-zinc-200">{score}</span>
          </span>
        )}
        {ageLabel && (
          <span className={`text-[10px] font-medium ${ageCls}`}>· {ageLabel}</span>
        )}
      </div>
    </button>
  );
}

/** v1.9 — "Satış Boru Hattı" kanban-style pipeline board. Derived only, no persistence. */
function SalesPipelineBoard({
  rows,
  now,
  onOpenDetail,
}: {
  rows: LeadTableRow[];
  now: number;
  onOpenDetail: (id: string) => void;
}) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const columns = useMemo(() => {
    const contacted: LeadTableRow[] = [];
    const following: LeadTableRow[] = [];
    const demo: LeadTableRow[] = [];
    const won: LeadTableRow[] = [];
    const lost: LeadTableRow[] = [];
    for (const row of rows) {
      const st = row._s.status;
      if (st === "contacted") contacted.push(row);
      else if (st === "needs_follow_up" || st === "replied") following.push(row);
      else if (st === "meeting") demo.push(row);
      else if (st === "won") won.push(row);
      else if (st === "lost") lost.push(row);
    }
    return { contacted, following, demo, won, lost };
  }, [rows]);

  const hasAny =
    columns.contacted.length > 0 ||
    columns.following.length > 0 ||
    columns.demo.length > 0 ||
    columns.won.length > 0 ||
    columns.lost.length > 0;
  if (!hasAny) return null;

  type ColDef = {
    key: string;
    label: string;
    items: LeadTableRow[];
    headerCls: string;
    countCls: string;
  };
  const cols: ColDef[] = [
    {
      key: "contacted",
      label: tr ? "İlk Temas" : "First Contact",
      items: columns.contacted,
      headerCls: "text-sky-300 border-sky-500/25",
      countCls: "bg-sky-500/15 text-sky-200",
    },
    {
      key: "following",
      label: tr ? "Takip" : "Follow-up",
      items: columns.following,
      headerCls: "text-amber-300 border-amber-500/25",
      countCls: "bg-amber-500/15 text-amber-200",
    },
    {
      key: "demo",
      label: tr ? "Demo" : "Demo",
      items: columns.demo,
      headerCls: "text-violet-300 border-violet-500/25",
      countCls: "bg-violet-500/15 text-violet-200",
    },
    {
      key: "won",
      label: tr ? "Kazanılan" : "Won",
      items: columns.won,
      headerCls: "text-emerald-300 border-emerald-500/25",
      countCls: "bg-emerald-500/15 text-emerald-200",
    },
    {
      key: "lost",
      label: tr ? "Kaybedilen" : "Lost",
      items: columns.lost,
      headerCls: "text-zinc-400 border-zinc-600/30",
      countCls: "bg-zinc-600/15 text-zinc-400",
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-indigo-500/15 bg-indigo-500/[0.02]">
      <div className="border-b border-white/5 px-5 py-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-200">
          {tr ? "Satış Boru Hattı" : "Sales Pipeline"}
        </h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          {tr
            ? "Aktif lead aşamalarına genel bakış — aşama değiştirmek için lead detayını aç"
            : "Active pipeline stages — open lead detail to change stage"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-[640px] gap-3 p-4">
          {cols.map((col) => (
            <div key={col.key} className="flex min-w-0 flex-1 flex-col gap-2">
              <div
                className={`mb-0.5 flex items-center justify-between border-b pb-1.5 ${col.headerCls}`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  {col.label}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${col.countCls}`}
                >
                  {col.items.length}
                </span>
              </div>
              {col.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/8 px-3 py-4 text-center text-[10px] text-zinc-600">
                  {tr ? "Boş" : "Empty"}
                </div>
              ) : (
                col.items.map((row) => (
                  <PipelineBoardCard key={row.id} row={row} now={now} onOpen={onOpenDetail} />
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
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
  const [sort, setSort] = useState<
    "opportunity" | "priority" | "readiness" | "hot" | "lead" | "name"
  >("opportunity");
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
  const [workspaceTab, setWorkspaceTab] = useState<"opportunities" | "revenue" | "execution" | "intelligence" | "followups" | "acquisition">("opportunities");
  const [queueSubTab, setQueueSubTab] = useState<QueueSubTab>("queue");
  const workspaceSelectorRef = useRef<HTMLElement>(null);
  const [smartSegment, setSmartSegment] = useState<SmartSegmentId | null>(null);
  // v5.0 — Lead list view mode: row-based Opportunity Table (default) or legacy card grid.
  const [leadViewMode, setLeadViewMode] = useState<"list" | "card">("list");
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
  const [leadEnrichmentOverrides, setLeadEnrichmentOverrides] = useState<
    Record<string, ScoredLead>
  >({});
  const [reenrichBusyLeadId, setReenrichBusyLeadId] = useState<string | null>(null);
  const [reenrichMessage, setReenrichMessage] = useState<string | null>(null);
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
    setLeadEnrichmentOverrides(loadLeadEnrichmentOverrides());
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
      if (isIcpTargetAudience(req.type as string)) return false;
      const cacheKey = makePlacesImportSessionKey(req.city, req.type as LeadType, req.source);
      const cache = loadImportCache();
      const hit = cache[cacheKey];
      if (!hit || !Array.isArray(hit.leads) || hit.leads.length === 0) return false;
      if (typeof hit.importedAt !== "number") return false;
      return Date.now() - hit.importedAt <= IMPORT_CACHE_TTL_MS;
    },
    [],
  );

  const fetchIcpSubSearch = async (
    city: string,
    source: string,
    searchTerm: string,
    type: LeadType,
    forceGoogleRefresh: boolean,
  ): Promise<ScoredLead[]> => {
    try {
      const res = await fetch("/api/import-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, type, source, forceGoogleRefresh, icpSearchTerm: searchTerm }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { leads?: ScoredLead[] };
      return data.leads ?? [];
    } catch {
      return [];
    }
  };

  const handleImport = async (req: ImportRequest): Promise<ImportResult> => {
    let batch: ScoredLead[] = [];
    let source: "cached" | "google" = "google";
    let importNoticeKey: "import_places_recent_cache_note" | undefined;
    let importRateLimitHintKey: "import_places_rate_limit_user" | undefined;

    if (isIcpTargetAudience(req.type as string)) {
      // ICP multi-search: execute all 6 queries, merge and deduplicate
      const allResults: ScoredLead[] = [];
      for (const config of ICP_SEARCH_CONFIGS) {
        const subBatch = await fetchIcpSubSearch(
          req.city,
          req.source,
          config.searchTerm,
          config.type,
          Boolean(req.forceGoogleRefresh),
        );
        allResults.push(...subBatch);
      }
      const seenIds = new Set<string>();
      for (const lead of allResults) {
        if (!seenIds.has(lead.id)) {
          seenIds.add(lead.id);
          batch.push(lead);
        }
      }
      // v1.3 ICP qualification: keep only leads matching the selected preset.
      batch = filterLeadsForTargetAudience(req.type as string, batch);
      source = "google";
    } else {
      const cacheKey = makePlacesImportSessionKey(req.city, req.type as LeadType, req.source);
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
          body: JSON.stringify({
            city: req.city,
            type: req.type,
            source: req.source,
            forceGoogleRefresh: Boolean(req.forceGoogleRefresh),
          }),
        });
        const data = (await res.json()) as {
          leads?: ScoredLead[];
          error?: string;
          fromPlacesMemoryCache?: boolean;
          refreshCooldownActive?: boolean;
        };

        if (!res.ok && res.status === 429) {
          const staleHit = cache[cacheKey];
          if (
            staleHit &&
            Array.isArray(staleHit.leads) &&
            staleHit.leads.length > 0
          ) {
            batch = staleHit.leads;
            source = "cached";
            importNoticeKey = "import_places_recent_cache_note";
            importRateLimitHintKey = "import_places_rate_limit_user";
          } else {
            throw new Error(
              typeof data.error === "string" && data.error.trim()
                ? data.error
                : PLACES_RATE_LIMIT_USER_MESSAGE,
            );
          }
        } else if (!res.ok) {
          throw new Error(data.error || `Import failed (${res.status})`);
        } else {
          batch = data.leads ?? [];
          if (data.fromPlacesMemoryCache && batch.length > 0) {
            importNoticeKey = "import_places_recent_cache_note";
            source = "cached";
          } else {
            source = "google";
          }
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
        }
      }
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
      importNoticeKey,
      importRateLimitHintKey,
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

  const applyEnrichedLeadToStore = useCallback((enriched: ScoredLead) => {
    const id = enriched.id;
    const prevImported = importedLeadsRef.current;
    const idx = prevImported.findIndex((l) => l.id === id);
    if (idx >= 0) {
      const next = [...prevImported];
      next[idx] = enriched;
      importedLeadsRef.current = next;
      setImportedLeads(next);
      saveImportedLeadsV2(next);
      setLeadEnrichmentOverrides((prev) => {
        if (!(id in prev)) return prev;
        const { [id]: _removed, ...rest } = prev;
        saveLeadEnrichmentOverrides(rest);
        return rest;
      });
      return;
    }
    setLeadEnrichmentOverrides((prev) => {
      const next = { ...prev, [id]: enriched };
      saveLeadEnrichmentOverrides(next);
      return next;
    });
  }, []);

  const allRows = useMemo(() => {
    const seedLayer = leads.map((l) => leadEnrichmentOverrides[l.id] ?? l);
    const base = [...seedLayer];
    const dedupeSet = buildDedupeKeySet(seedLayer);
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
  }, [leads, importedLeads, stateMap, leadEnrichmentOverrides]);

  const allRowsById = useMemo(() => {
    return new Map(allRows.map((r) => [r.id, r]));
  }, [allRows]);

  const packageByLeadId = useMemo(() => {
    const m = new Map<string, CommercialPackage>();
    for (const r of allRows) {
      m.set(r.id, computeCommercialPackaging({
        icpFitScore: r.icpFitScore ?? 0,
        icpAlignment: r.icpAlignment,
        verifiedOpportunityScore: r.verifiedOpportunityScore ?? 0,
        signalVerification: r.signalVerification,
        hasOwnWebsite: r.hasOwnWebsite,
        hasInstagram: r.hasInstagram,
        phone: r.phone,
        adsLikelihood: r.adsLikelihood,
        acquisitionIntelligence: r.acquisitionIntelligence,
        digitalMaturity: r.digitalMaturity,
        leadScore: r.leadScore,
      }).package);
    }
    return m;
  }, [allRows]);

  /** v3.9.0 — Expected revenue per lead: weighted MRR = package price × conversion probability. */
  const expectedRevenueByLeadId = useMemo(() => {
    const m = new Map<string, ExpectedRevenueResult>();
    for (const r of allRows) {
      const pkg = computeCommercialPackaging({
        icpFitScore: r.icpFitScore ?? 0,
        icpAlignment: r.icpAlignment,
        verifiedOpportunityScore: r.verifiedOpportunityScore ?? 0,
        signalVerification: r.signalVerification,
        hasOwnWebsite: r.hasOwnWebsite,
        hasInstagram: r.hasInstagram,
        phone: r.phone,
        adsLikelihood: r.adsLikelihood,
        acquisitionIntelligence: r.acquisitionIntelligence,
        digitalMaturity: r.digitalMaturity,
        leadScore: r.leadScore,
      });
      m.set(r.id, computeExpectedRevenue({
        commercialPackaging: pkg,
        hotScore: r.hotScore,
        leadScore: r.leadScore,
        verifiedOpportunityScore: r.verifiedOpportunityScore ?? 0,
        icpFitScore: r.icpFitScore ?? 0,
        contactReadinessScore: r.contactReadinessScore,
        signalVerification: r.signalVerification,
        phone: r.phone,
        hasOwnWebsite: r.hasOwnWebsite,
        hasInstagram: r.hasInstagram,
        pipelineStatus: r._s.status,
        doNotContact: r._s.doNotContact,
        adsLikelihood: r.adsLikelihood,
        acquisitionIntelligence: r.acquisitionIntelligence,
      }));
    }
    return m;
  }, [allRows]);

  /** v3.9.1 — Revenue priority ranking per lead: revenuePriorityScore (0–100) + tier. */
  const revenuePriorityByLeadId = useMemo(() => {
    const m = new Map<string, ExpectedRevenueRankingResult>();
    for (const r of allRows) {
      const er = expectedRevenueByLeadId.get(r.id);
      if (!er) continue;
      const pkg = packageByLeadId.get(r.id) ?? "starter";
      m.set(r.id, computeExpectedRevenueRanking({
        expectedRevenue: er,
        commercialPackage: pkg,
        hotScore: r.hotScore,
        leadScore: r.leadScore,
        verifiedOpportunityScore: r.verifiedOpportunityScore ?? 0,
        icpFitScore: r.icpFitScore ?? 0,
        contactReadinessScore: r.contactReadinessScore,
        pipelineStatus: r._s.status,
        signalVerification: r.signalVerification,
        acquisitionIntelligence: r.acquisitionIntelligence,
      }));
    }
    return m;
  }, [allRows, expectedRevenueByLeadId, packageByLeadId]);

  /** v3.9.3 — Aggregate revenue KPIs for the Operation Header (6 cards). */
  const operationHeaderStats = useMemo(() => {
    let totalWeightedMRR = 0;
    let totalWeightedARR = 0;
    let totalProb = 0;
    let opportunityCount = 0;
    let callReadyCount = 0;
    let msgReadyCount = 0;
    for (const r of allRows) {
      if (r._s.doNotContact || r._s.status === "lost" || r._s.status === "won") continue;
      const er = expectedRevenueByLeadId.get(r.id);
      if (!er) continue;
      opportunityCount++;
      totalWeightedMRR += er.weightedExpectedMonthlyRevenue;
      totalWeightedARR += er.weightedExpectedAnnualRevenue;
      totalProb += er.expectedCustomerProbability;
      const rp = revenuePriorityByLeadId.get(r.id);
      if (rp && (rp.revenuePriorityTier === "critical" || rp.revenuePriorityTier === "high")) {
        const hasPhone = Boolean(r.phone?.trim());
        const hasWhatsApp = Boolean(r.phone?.trim()) && !r._s.whatsappInvalid;
        const hasInsta = Boolean(r.instagram?.trim());
        if (hasPhone) callReadyCount++;
        if (hasWhatsApp || hasInsta) msgReadyCount++;
      }
    }
    return {
      totalWeightedMRR,
      totalWeightedARR,
      opportunityCount,
      avgProbability: opportunityCount > 0 ? totalProb / opportunityCount : 0,
      callReadyCount,
      msgReadyCount,
    };
  }, [allRows, expectedRevenueByLeadId, revenuePriorityByLeadId]);

  /** v3.9.3 — Revenue-sorted QueueCandidates for the Opportunity workspace queue. */
  const revenueQueueCandidates = useMemo<QueueCandidate[]>(() => {
    const now = renderNow || Date.now();
    const queuedSet = new Set(dailyOutreach.todayQueue);
    const candidates: QueueCandidate[] = [];
    for (const row of allRows) {
      const finder = contactFinderMap[row.id];
      if (isExcludedFromDailyQueue(row, finder, now)) continue;
      candidates.push({
        row,
        priority: computeDailyQueuePriority(row, finder, now),
        reasonText: dailyQueueReasonText(row, finder, now, locale),
        channels: resolveQuickChannels(row, finder, locale),
        inOutreachQueue: queuedSet.has(row.id),
        followUpScheduled: hasScheduledFollowUp(row._s),
        followUpDue: isFollowUpDue(row._s, now),
        dueAt: followUpTargetTimestamp(row._s),
      });
    }
    return candidates.sort((a, b) => {
      const rpA = revenuePriorityByLeadId.get(a.row.id)?.revenuePriorityScore ?? 0;
      const rpB = revenuePriorityByLeadId.get(b.row.id)?.revenuePriorityScore ?? 0;
      if (rpB !== rpA) return rpB - rpA;
      const mrrA = expectedRevenueByLeadId.get(a.row.id)?.weightedExpectedMonthlyRevenue ?? 0;
      const mrrB = expectedRevenueByLeadId.get(b.row.id)?.weightedExpectedMonthlyRevenue ?? 0;
      if (mrrB !== mrrA) return mrrB - mrrA;
      const pA = expectedRevenueByLeadId.get(a.row.id)?.expectedCustomerProbability ?? 0;
      const pB = expectedRevenueByLeadId.get(b.row.id)?.expectedCustomerProbability ?? 0;
      if (pB !== pA) return pB - pA;
      return (b.row.contactReadinessScore ?? 0) - (a.row.contactReadinessScore ?? 0);
    });
  }, [allRows, contactFinderMap, dailyOutreach.todayQueue, renderNow, locale, revenuePriorityByLeadId, expectedRevenueByLeadId]);

  /** v3.9.4 — Daily operations desk: categorized candidate lists + revenue impact. */
  const dailyOperationsDesk = useMemo(
    () => computeDailyOperationsDesk(revenueQueueCandidates, revenuePriorityByLeadId, expectedRevenueByLeadId),
    [revenueQueueCandidates, revenuePriorityByLeadId, expectedRevenueByLeadId],
  );

  /** v3.9.4 — Active queue filtered by sub-tab selection. */
  const activeQueueCandidates = useMemo<QueueCandidate[]>(() => {
    switch (queueSubTab) {
      case "calls": return dailyOperationsDesk.calls;
      case "messages": return dailyOperationsDesk.messages;
      case "followups": return dailyOperationsDesk.followups;
      case "waiting": return dailyOperationsDesk.waiting;
      default: return revenueQueueCandidates;
    }
  }, [queueSubTab, revenueQueueCandidates, dailyOperationsDesk]);

  const segmentCounts = useMemo((): Record<SmartSegmentId, number> => ({
    hot: allRows.filter((r) => r.hotScore >= 70).length,
    icp: allRows.filter((r) => (r.icpAlignment?.tugoboFitScore ?? r.icpFitScore ?? 0) >= 75).length,
    whatsapp: allRows.filter((r) => Boolean(r.phone?.trim()) && !r._s.whatsappInvalid).length,
    digital: allRows.filter((r) => Boolean(r.website?.trim()) && Boolean(r.instagram?.trim())).length,
    enterprise: allRows.filter((r) => packageByLeadId.get(r.id) === "enterprise").length,
    growth: allRows.filter((r) => packageByLeadId.get(r.id) === "growth").length,
    revenue_priority: allRows.filter((r) => (revenuePriorityByLeadId.get(r.id)?.revenuePriorityScore ?? 0) >= 60).length,
  }), [allRows, packageByLeadId, revenuePriorityByLeadId]);

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
      // Opportunity ranking surfaces the strongest sales opportunities first,
      // independent of import recency (v1.4 default sales prioritization).
      if (sort === "opportunity") {
        const ao = typeof a.verifiedOpportunityScore === "number" ? a.verifiedOpportunityScore : -1;
        const bo = typeof b.verifiedOpportunityScore === "number" ? b.verifiedOpportunityScore : -1;
        if (bo !== ao) return bo - ao;
        return b.hotScore - a.hotScore;
      }
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

  // Segment discovery mode: when a smartSegment is active, source directly from
  // filtered (search/type/status/channel filters only) so the displayed count
  // matches the segment card count. Tab/focus narrowing is bypassed intentionally.
  // When no segment is active the normal focusFiltered chain is used unchanged.
  const segmentApplied = useMemo(() => {
    if (!smartSegment) return focusFiltered;
    return filtered.filter((r) => {
      switch (smartSegment) {
        case "hot": return r.hotScore >= 70;
        case "icp": return (r.icpAlignment?.tugoboFitScore ?? r.icpFitScore ?? 0) >= 75;
        case "whatsapp": return Boolean(r.phone?.trim()) && !r._s.whatsappInvalid;
        case "digital": return Boolean(r.website?.trim()) && Boolean(r.instagram?.trim());
        case "enterprise": return packageByLeadId.get(r.id) === "enterprise";
        case "growth": return packageByLeadId.get(r.id) === "growth";
        case "revenue_priority": return (revenuePriorityByLeadId.get(r.id)?.revenuePriorityScore ?? 0) >= 60;
        default: return true;
      }
    });
  }, [filtered, focusFiltered, smartSegment, packageByLeadId, revenuePriorityByLeadId]);

  const visibleAllLeads = useMemo(() => {
    if (showAllLeadsRows) return segmentApplied;
    return segmentApplied.slice(0, 15);
  }, [segmentApplied, showAllLeadsRows]);

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

  const manualReEnrichOpenLead = useCallback(async () => {
    if (!openLead) return;
    const before = leadTableRowToScoredLead(openLead);
    setReenrichBusyLeadId(openLead.id);
    setReenrichMessage(null);
    try {
      const res = await fetch("/api/re-enrich-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: before }),
      });
      const data = (await res.json()) as { lead?: ScoredLead; error?: string };
      if (!res.ok) {
        setReenrichMessage(data.error ?? t("detail_reenrich_error", locale));
        return;
      }
      if (!data.lead) {
        setReenrichMessage(t("detail_reenrich_error", locale));
        return;
      }
      const merged = mergeReEnrichedLeadPreserveImportMeta(before, data.lead);
      const sanitized = sanitizeScoredLeadForUi(merged);
      applyEnrichedLeadToStore(sanitized);
      if (!hasNewVerifiableEnrichmentSince(before, sanitized)) {
        setReenrichMessage(t("detail_reenrich_no_new", locale));
      }
    } catch {
      setReenrichMessage(t("detail_reenrich_error", locale));
    } finally {
      setReenrichBusyLeadId(null);
    }
  }, [openLead, locale, applyEnrichedLeadToStore]);

  const recordAiReviewForOpenLead = useCallback(() => {
    if (!openLead) return;
    const base = leadTableRowToScoredLead(openLead);
    const updated: ScoredLead = {
      ...base,
      lastAiReviewAt: new Date().toISOString(),
      reviewCount: (base.reviewCount ?? 0) + 1,
      lastActionType: "ai_reviewed",
      activityTimeline: appendLeadActivity(base.activityTimeline, "ai_reviewed", "AI yeniden yorumladı"),
    };
    applyEnrichedLeadToStore(sanitizeScoredLeadForUi(updated));
  }, [openLead, applyEnrichedLeadToStore]);

  const lastLoggedDrawerLeadId = useRef<string | null>(null);

  useEffect(() => {
    setReenrichMessage(null);
  }, [openId]);
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

  const recordContactActivity = useCallback(
    (id: string, newAttempts: number) => {
      const leadRow = allRowsById.get(id);
      if (!leadRow) return;
      const base = leadTableRowToScoredLead(leadRow);
      let updatedTimeline = appendLeadActivity(
        base.activityTimeline,
        "contact_started",
        "İletişim başlatıldı",
      );
      if (newAttempts <= 2) {
        updatedTimeline = appendLeadActivity(updatedTimeline, "followup_scheduled", "Takip planlandı");
      }
      applyEnrichedLeadToStore({ ...base, activityTimeline: updatedTimeline });
    },
    [allRowsById, applyEnrichedLeadToStore],
  );

  const recordWhatsAppOutreach = useCallback(
    (id: string) => {
      const outcome = applyOutreachConfirmed(id);
      if (outcome) {
        showQueueNotice(
          outreachConfirmationCopy(outcome.newAttempts, outcome.doNotContact),
        );
        recordContactActivity(id, outcome.newAttempts);
      }
    },
    [applyOutreachConfirmed, recordContactActivity],
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
        recordContactActivity(id, outcome.newAttempts);
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
      const repliedRow = allRowsById.get(id);
      if (repliedRow) {
        const base = leadTableRowToScoredLead(repliedRow);
        applyEnrichedLeadToStore({ ...base, activityTimeline: appendLeadActivity(base.activityTimeline, "status_change", "Durum değişti: Replied") });
      }
      return;
    }
    if (status === "meeting") {
      updateLead(id, {
        status,
        meetingAt:
          typeof current.meetingAt === "number" ? current.meetingAt : ts,
        nextFollowUpAt: null,
      });
      const meetingRow = allRowsById.get(id);
      if (meetingRow) {
        const base = leadTableRowToScoredLead(meetingRow);
        applyEnrichedLeadToStore({ ...base, activityTimeline: appendLeadActivity(base.activityTimeline, "demo_booked", "Demo planlandı") });
      }
      return;
    }
    if (status === "won") {
      updateLead(id, {
        status,
        wonAt: typeof current.wonAt === "number" ? current.wonAt : ts,
        nextFollowUpAt: null,
      });
      const wonRow = allRowsById.get(id);
      if (wonRow) {
        const base = leadTableRowToScoredLead(wonRow);
        applyEnrichedLeadToStore({ ...base, activityTimeline: appendLeadActivity(base.activityTimeline, "closed_won", "Kazanıldı") });
      }
      return;
    }
    if (status === "lost") {
      updateLead(id, {
        status,
        lostAt: typeof current.lostAt === "number" ? current.lostAt : ts,
        nextFollowUpAt: null,
      });
      const lostRow = allRowsById.get(id);
      if (lostRow) {
        const base = leadTableRowToScoredLead(lostRow);
        applyEnrichedLeadToStore({ ...base, activityTimeline: appendLeadActivity(base.activityTimeline, "closed_lost", "Kaybedildi") });
      }
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
      const msgBase = leadTableRowToScoredLead(lead);
      applyEnrichedLeadToStore({ ...msgBase, activityTimeline: appendLeadActivity(msgBase.activityTimeline, "whatsapp_message_generated", "WhatsApp mesajı oluşturuldu") });
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

  const findBestContact = async (leadId: string, input: ContactFinderInput) => {
    setContactFinderRequest({ status: "loading", leadId });
    try {
      const res = await fetch("/api/contact-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
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

  // v2.1 Queue health — ready/missing counts derived from current queue state.
  const queueHealth = useMemo(() => {
    let ready = 0;
    let missingData = 0;
    for (const id of dailyOutreach.todayQueue) {
      const row = allRowsById.get(id);
      if (!row) continue;
      if (hasValidOutboundContact(row, contactFinderMap[row.id]).any) ready++;
      else missingData++;
    }
    return {
      ready,
      missingData,
      estimatedMinutes: dailyOutreach.todayQueue.length * 3,
    };
  }, [dailyOutreach.todayQueue, allRowsById, contactFinderMap]);
  const safeQueueHealth = mounted
    ? queueHealth
    : { ready: 0, missingData: 0, estimatedMinutes: 0 };

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
      const queuedAtTs = Date.now();
      for (const id of actuallyAdded) {
        const qRow = allRowsById.get(id);
        if (qRow) {
          const base = leadTableRowToScoredLead(qRow);
          // v1.6 lightweight queue memory (lead-level, survives re-enrichment).
          applyEnrichedLeadToStore({
            ...base,
            lastQueuedAt: queuedAtTs,
            queueCount: (base.queueCount ?? 0) + 1,
            lastQueueReason: dailyQueueReasonText(qRow, contactFinderMap[id], queuedAtTs, locale),
            activityTimeline: appendLeadActivity(base.activityTimeline, "queue_add", "Kuyruğa eklendi"),
          });
        }
      }
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
    const rmRow = allRowsById.get(id);
    if (rmRow) {
      const base = leadTableRowToScoredLead(rmRow);
      applyEnrichedLeadToStore({ ...base, activityTimeline: appendLeadActivity(base.activityTimeline, "queue_remove", "Kuyruktan çıkarıldı") });
    }
  }, [allRowsById, applyEnrichedLeadToStore]);

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
      const qMsgRow = allRowsById.get(queueCurrentId);
      if (qMsgRow) {
        const base = leadTableRowToScoredLead(qMsgRow);
        applyEnrichedLeadToStore({ ...base, activityTimeline: appendLeadActivity(base.activityTimeline, "whatsapp_message_generated", "WhatsApp mesajı oluşturuldu") });
      }
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
    const waRow = allRowsById.get(leadId);
    if (waRow) {
      const base = leadTableRowToScoredLead(waRow);
      applyEnrichedLeadToStore({ ...base, activityTimeline: appendLeadActivity(base.activityTimeline, "whatsapp_open", "WhatsApp açıldı") });
    }
  };

  // ── v1.6 Daily Opportunity Queue ───────────────────────────────────────
  const dailyQueuePartition = useMemo<DailyQueuePartition>(() => {
    const now = renderNow || Date.now();
    const queuedSet = new Set(dailyOutreach.todayQueue);
    const candidates: QueueCandidate[] = [];
    for (const row of allRows) {
      const finder = contactFinderMap[row.id];
      if (isExcludedFromDailyQueue(row, finder, now)) continue;
      candidates.push({
        row,
        priority: computeDailyQueuePriority(row, finder, now),
        reasonText: dailyQueueReasonText(row, finder, now, locale),
        channels: resolveQuickChannels(row, finder, locale),
        inOutreachQueue: queuedSet.has(row.id),
        followUpScheduled: hasScheduledFollowUp(row._s),
        followUpDue: isFollowUpDue(row._s, now),
        dueAt: followUpTargetTimestamp(row._s),
      });
    }

    const followUps = candidates
      .filter((c) => c.followUpScheduled)
      .sort((a, b) => {
        const ad = a.dueAt ?? Number.MAX_SAFE_INTEGER;
        const bd = b.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (ad !== bd) return ad - bd;
        return b.priority - a.priority;
      });

    // Non-follow-up candidates ranked by daily priority. Follow-up leads live
    // only in "Takip Bekleyenler" (no duplication) per spec.
    const ranked = candidates
      .filter((c) => !c.followUpScheduled)
      .sort((a, b) => b.priority - a.priority || b.row.hotScore - a.row.hotScore);

    const todays = ranked.slice(0, 10);
    const todaysIds = new Set(todays.map((c) => c.row.id));
    const rest = ranked.filter((c) => !todaysIds.has(c.row.id));

    const highNoContact = rest.filter(
      (c) =>
        c.row._s.status === "new" &&
        (c.row.opportunityTier === "elite" ||
          c.row.opportunityTier === "high" ||
          c.priority >= 65),
    );
    const highIds = new Set(highNoContact.map((c) => c.row.id));
    const lowPriority = rest.filter((c) => !highIds.has(c.row.id));

    return { todays, followUps, highNoContact, lowPriority, total: candidates.length };
  }, [allRows, contactFinderMap, dailyOutreach.todayQueue, renderNow, locale]);

  /**
   * v1.7 Focus Queue — HOT_OPPORTUNITY leads not yet contacted.
   * Derived filter for future daily outreach targeting; no new page required.
   */
  const focusQueue = useMemo(
    () =>
      allRows.filter((row) => {
        const lc = computeLeadLifecycleStatus(row, row._s);
        return lc === "HOT_OPPORTUNITY" && row._s.status === "new";
      }),
    [allRows],
  );
  void focusQueue; // available for future outreach targeting

  /** Contact a lead directly from the daily queue; logs an "İletişim başlatıldı" event. */
  const contactFromDailyQueue = useCallback(
    (id: string, channel: "whatsapp" | "phone" | "website", url: string) => {
      openExternal(url);
      const row = allRowsById.get(id);
      if (row) {
        const base = leadTableRowToScoredLead(row);
        applyEnrichedLeadToStore({
          ...base,
          activityTimeline: appendLeadActivity(
            base.activityTimeline,
            "contact_started",
            "İletişim başlatıldı",
          ),
        });
      }
      // Preserve existing WhatsApp open behavior (outreach event + follow-up timer).
      if (channel === "whatsapp") logWhatsappOpened(id, "direct", "");
    },
    [allRowsById, applyEnrichedLeadToStore, logWhatsappOpened],
  );

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
      recordContactActivity(id, outcome.newAttempts);
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
      recordContactActivity(leadId, outcome.newAttempts);
    }
  };

  return (
    <div className="relative mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[176px_1fr] lg:gap-5 lg:px-8 lg:h-screen lg:max-h-screen lg:overflow-hidden lg:py-4">
      <aside className="lg:h-full lg:min-h-0 lg:self-stretch lg:overflow-y-auto lg:pr-0.5">
        <AppNav
          currentPath="/"
          showLocaleToggle
          activeWorkspace={workspaceTab}
          onNavigate={(ws) => {
            setWorkspaceTab(ws);
            // v6.0 — primary views only; queue sub-tabs live inside Gelir Kuyruğu now.
            if (ws === "opportunities") setQueueSubTab("queue");
            if (ws === "intelligence") setSmartSegment(null);
            workspaceSelectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      </aside>
      <div className="flex min-w-0 flex-col gap-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-white/5 pb-3 sm:flex-row sm:items-center sm:justify-between lg:shrink-0">
        <div className="flex items-center gap-3">
          <BrandLogo />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-50">
              Founder <span className="text-orange-300">Revenue OS</span>
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              {locale === "tr" ? "Bugünün gelir fırsatlarını yönetin." : "Manage today's revenue opportunities."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
          <LocaleToggle className="lg:hidden" />
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
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10"
          >
            {t("start_new_session", locale)}
          </button>
        </div>
      </header>

      {/* v3.9.3 Operation Header — Revenue Operating Desk KPIs */}
      <section ref={workspaceSelectorRef} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:shrink-0 lg:grid-cols-6">
        {(
          [
            {
              label: locale === "tr" ? "Ağırlıklı MRR" : "Weighted MRR",
              value: formatTRY(operationHeaderStats.totalWeightedMRR),
              accent: "emerald" as const,
              hint: locale === "tr" ? "Tüm aktif fırsatlar" : "All active opportunities",
            },
            {
              label: locale === "tr" ? "Ağırlıklı ARR" : "Weighted ARR",
              value: formatTRY(operationHeaderStats.totalWeightedARR),
              accent: "emerald" as const,
              hint: locale === "tr" ? "Yıllık projeksiyon" : "Annual projection",
            },
            {
              label: locale === "tr" ? "Fırsat Sayısı" : "Opportunities",
              value: operationHeaderStats.opportunityCount,
              accent: "indigo" as const,
              hint: locale === "tr" ? "Aktif pipeline" : "Active pipeline",
            },
            {
              label: locale === "tr" ? "Ort. Dönüşüm" : "Avg. Conversion",
              value: `%${Math.round(operationHeaderStats.avgProbability * 100)}`,
              accent: "sky" as const,
              hint: locale === "tr" ? "Ortalama olasılık" : "Average probability",
            },
            {
              label: locale === "tr" ? "Bugün Aranacak" : "To Call Today",
              value: operationHeaderStats.callReadyCount,
              accent: "orange" as const,
              hint: locale === "tr" ? "Kritik + Yüksek, telefon hazır" : "Critical + High, phone ready",
            },
            {
              label: locale === "tr" ? "Bugün Mesaj" : "To Message",
              value: operationHeaderStats.msgReadyCount,
              accent: "sky" as const,
              hint: locale === "tr" ? "Kritik + Yüksek, WA/IG hazır" : "Critical + High, WA/IG ready",
            },
          ] satisfies { label: string; value: string | number; accent: "emerald" | "indigo" | "sky" | "orange"; hint: string }[]
        ).map(({ label, value, accent, hint }) => (
          <StatCard key={label} label={label} value={value} hint={hint} accent={accent} />
        ))}
      </section>

      {/* v5.0 — Top workspace tab selector removed; the left sidebar is the single navigation system. */}

      {/* v5.3 App-shell content region — workspace content scrolls internally; header + KPI stay fixed. */}
      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">

      {/* EXECUTION workspace — v5.5 unified Founder Console (Command Center) */}
      {workspaceTab === "execution" && mounted && allRows.length > 0 && (
        <FounderConsoleShell
          accent="orange"
          icon={<IconSpark className="h-4 w-4 text-orange-200" />}
          title={locale === "tr" ? "Komuta Merkezi" : "Command Center"}
          subtitle={
            locale === "tr"
              ? "Kritik işler, satış planı ve operasyon akışı"
              : "Critical tasks, sales plan and execution flow"
          }
          actions={
            <>
              <button
                type="button"
                onClick={autoBuildTodayQueue}
                className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/25"
              >
                {t("auto_build_queue", locale)}
              </button>
              <button
                type="button"
                onClick={startDailyOutreachSession}
                disabled={safeActiveQueueCount === 0}
                className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("start_outreach_session", locale)}
              </button>
            </>
          }
          left={
            <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
              <TodayCriticalTasks
                rows={allRows}
                now={renderNow || Date.now()}
                onOpenDetail={(id) => setOpenId(id)}
              />
              <AutonomousSalesPlan
                rows={allRows}
                now={renderNow || Date.now()}
                contactFinderMap={contactFinderMap}
                onOpenDetail={(id) => setOpenId(id)}
              />
              <ActionQueuePanel
                rows={allRows}
                now={renderNow || Date.now()}
                onOpenDetail={(id) => setOpenId(id)}
              />
              <SalesPipelineBoard
                rows={allRows}
                now={renderNow || Date.now()}
                onOpenDetail={(id) => setOpenId(id)}
              />
            </div>
          }
          right={
            <>
              <FounderCommandCenter
                rows={allRows}
                now={renderNow || Date.now()}
                contactFinderMap={contactFinderMap}
                onOpenDetail={(id) => setOpenId(id)}
              />
              <DailyOperatingBrief
                rows={allRows}
                now={renderNow || Date.now()}
                completedToday={safeCompletedToday}
                activeQueueCount={safeActiveQueueCount}
              />
              <FounderWorkflowSteps rows={allRows} now={renderNow || Date.now()} />
              <OperationStatusStrip rows={allRows} now={renderNow || Date.now()} />
              <DailyProgressStrip
                rows={allRows}
                completedToday={safeCompletedToday}
                activeQueueCount={safeActiveQueueCount}
              />
            </>
          }
        />
      )}

      {/* REVENUE workspace — v5.5 unified Founder Console (Revenue Intelligence) */}
      {workspaceTab === "revenue" && mounted && allRows.length > 0 && (
        <FounderConsoleShell
          accent="emerald"
          icon={<IconSpark className="h-4 w-4 text-emerald-200" />}
          title={locale === "tr" ? "Gelir Analizi" : "Revenue Intelligence"}
          subtitle={
            locale === "tr"
              ? "Ağırlıklı pipeline, 30 günlük tahmin, risk ve geri kazanım"
              : "Weighted pipeline, 30-day forecast, risk and recovery"
          }
          left={
            <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
              <RevenuePipelineOverview rows={allRows} now={renderNow || Date.now()} />
              <RevenueRankingCard
                rows={allRows}
                revenuePriorityMap={revenuePriorityByLeadId}
                onOpenDetail={(id) => setOpenId(id)}
              />
              <TopRevenueOpportunities rows={allRows} now={renderNow || Date.now()} />
              <RevenueRiskEngine
                rows={allRows}
                now={renderNow || Date.now()}
                contactFinderMap={contactFinderMap}
              />
              <RevenueRecoveryEngine
                rows={allRows}
                now={renderNow || Date.now()}
                contactFinderMap={contactFinderMap}
              />
            </div>
          }
          right={
            <>
              <FounderForecastEngine rows={allRows} now={renderNow || Date.now()} />
              <WeeklyCommercialOutlook rows={allRows} now={renderNow || Date.now()} />
            </>
          }
        />
      )}

      {/* OPPORTUNITIES workspace — v5.5 unified Founder Console (Revenue Queue, benchmark; also serves Operasyon filtered views) */}
      {workspaceTab === "opportunities" && mounted && allRows.length > 0 && (
        <FounderConsoleShell
          accent="indigo"
          icon={<IconSpark className="h-4 w-4 text-indigo-200" />}
          title={
            locale === "tr"
              ? queueSubTab === "calls"
                ? "Aranacaklar"
                : queueSubTab === "messages"
                  ? "Mesajlar"
                  : queueSubTab === "followups"
                    ? "Takipler"
                    : queueSubTab === "waiting"
                      ? "Bekleyenler"
                      : "Gelir Kuyruğu"
              : queueSubTab === "calls"
                ? "Calls"
                : queueSubTab === "messages"
                  ? "Messages"
                  : queueSubTab === "followups"
                    ? "Follow-ups"
                    : queueSubTab === "waiting"
                      ? "Waiting"
                      : "Revenue Queue"
          }
          subtitle={
            locale === "tr"
              ? "Fırsat tablosu ve gelir zekası — tek konsol"
              : "Opportunity table and revenue intelligence — one console"
          }
          tabs={
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { tab: "queue", label: locale === "tr" ? "Fırsat Kuyruğu" : "Opportunity Queue", count: revenueQueueCandidates.length },
                  { tab: "calls", label: locale === "tr" ? "Aranacaklar" : "Calls", count: dailyOperationsDesk.calls.length },
                  { tab: "messages", label: locale === "tr" ? "Mesajlar" : "Messages", count: dailyOperationsDesk.messages.length },
                  { tab: "followups", label: locale === "tr" ? "Takipler" : "Follow-ups", count: dailyOperationsDesk.followups.length },
                  { tab: "waiting", label: locale === "tr" ? "Bekleyenler" : "Waiting", count: dailyOperationsDesk.waiting.length },
                ] satisfies { tab: QueueSubTab; label: string; count: number }[]
              ).map(({ tab, label, count }) => {
                const isActive = queueSubTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setQueueSubTab(tab)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
                      isActive
                        ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-100 ring-1 ring-inset ring-indigo-400/20"
                        : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
                        isActive ? "bg-indigo-500/25 text-indigo-100" : "bg-white/5 text-zinc-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          }
          left={
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-indigo-400/20 bg-white/[0.015] backdrop-blur ring-1 ring-inset ring-indigo-400/10">
              <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-4 py-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20">
                  <IconSpark className="h-3.5 w-3.5 text-indigo-200" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-100">
                  {locale === "tr" ? "Fırsat Tablosu" : "Opportunity Table"}
                </h2>
                <span className="hidden text-[11px] text-zinc-500 sm:inline">
                  {locale === "tr" ? "Revenue Priority sırasına göre" : "Sorted by Revenue Priority"}
                </span>
                <span className="ml-auto tabular-nums text-[11px] text-zinc-600">
                  {activeQueueCandidates.length} {locale === "tr" ? "fırsat" : "leads"}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <LeadOpportunityTable
                  rows={activeQueueCandidates.map((c) => c.row)}
                  packageMap={packageByLeadId}
                  expectedRevenueMap={expectedRevenueByLeadId}
                  revenuePriorityMap={revenuePriorityByLeadId}
                  contactFinderMap={contactFinderMap}
                  openId={openId}
                  now={renderNow}
                  onOpenDetail={(id) => setOpenId(id)}
                  getActivityLabel={getLastOutreachActivityLabel}
                />
              </div>
            </section>
          }
          right={
            <>
              <QueueReasoningPanel
                topCandidate={activeQueueCandidates[0] ?? null}
                revenuePriorityMap={revenuePriorityByLeadId}
                expectedRevenueMap={expectedRevenueByLeadId}
              />
              <RevenueSummaryPanel
                candidates={activeQueueCandidates}
                revenuePriorityMap={revenuePriorityByLeadId}
                expectedRevenueMap={expectedRevenueByLeadId}
              />
              {/* v3.9.4 Bugünün Gelir Odağı — top 3 revenue priorities */}
              <section className="rounded-xl border border-amber-400/20 bg-amber-500/[0.03] p-4 backdrop-blur ring-1 ring-inset ring-amber-400/10">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20">
                    <svg className="h-3.5 w-3.5 text-amber-300" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 2l1.5 4.5H14l-3.75 2.75L11.5 14 8 11.25 4.5 14l1.25-4.75L2 6.5h4.5z" fill="currentColor" />
                    </svg>
                  </div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-amber-200">
                    Bugünün Gelir Odağı
                  </h2>
                </div>
                <RevenueFocusStrip
                  candidates={revenueQueueCandidates}
                  revenuePriorityMap={revenuePriorityByLeadId}
                  expectedRevenueMap={expectedRevenueByLeadId}
                  onOpenDetail={(id) => setOpenId(id)}
                />
              </section>
              {/* v3.9.4 Günlük Operasyon Planı — daily action plan */}
              <DailyActionPanel
                candidates={activeQueueCandidates}
                revenuePriorityMap={revenuePriorityByLeadId}
                onOpenDetail={(id) => setOpenId(id)}
                onContact={contactFromDailyQueue}
              />
            </>
          }
        />
      )}

      {/* v5.5 — execution counters & pipeline board consolidated into the Command Center console above. */}

      {/* ACQUISITION workspace (v5.0 — Lead Edinimi: import + sync + results, moved out of main ops) */}
      {workspaceTab === "acquisition" && (
      <>

      {/* Acquisition identity */}
      <WorkspaceHeader
        accent="indigo"
        icon={<IconSpark className="h-4 w-4 text-indigo-200" />}
        title={locale === "tr" ? "Lead Edinimi" : "Lead Acquisition"}
        subtitle={
          locale === "tr"
            ? "Yeni fırsatları içe aktar, senkronize et ve kuyruğa al"
            : "Import new opportunities, sync and queue them"
        }
      />

      {/* Import */}
      <ImportPanel onImport={handleImport} hasCachedResults={hasCachedImportResults} />

      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/5 px-5 py-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            {locale === "tr" ? "Senkronizasyon" : "Synchronization"}
          </h2>
        </div>
        <div className="p-4">
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
        </div>
      </section>

      {/* Last Import Results */}
      <section className="overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] backdrop-blur ring-1 ring-inset ring-indigo-500/10">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-200">
            {t("last_import_results", locale)}
          </h2>
          <p className="mt-1 text-[11px] text-zinc-400">{t("last_import_sub", locale)}</p>
        </div>

        {!hasImportRun ? (
          <div className="px-5 py-6 text-xs text-zinc-500">{t("run_import_prompt", locale)}</div>
        ) : latestImportRows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-amber-300">{t("no_new_leads_import", locale)}</div>
        ) : (
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
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
                {locale === "tr" ? "Tümünü seç" : "Select all"}
              </label>
              <span className="tabular-nums text-[11px] text-zinc-600">
                {latestImportRows.length} {locale === "tr" ? "lead" : "leads"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {latestImportRows.map((row, index) => {
                const isNew = lastImportNewIds.includes(row.id);
                const isReimported = lastImportUpdatedIds.includes(row.id);
                const inQueueCard = dailyOutreach.todayQueue.includes(row.id);
                const isSynced = airtableSyncedLeadIds.includes(row.id);
                const readinessCard = rowReadinessWithFinder(row, contactFinderMap[row.id]);
                const readinessLabelCard = readinessCategoryUiLabel(row, contactFinderMap[row.id], locale);
                const lcCard = row._s.lastContactedAt ?? row._s.contactedAt ?? null;

                return (
                  <div
                    key={renderLeadKey("latest-import", row, index)}
                    className="flex flex-col gap-2 rounded-lg border border-indigo-400/20 bg-indigo-500/[0.04] p-3 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.15)] transition hover:bg-indigo-500/[0.07]"
                  >
                    {/* Card header */}
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(row.id)}
                        aria-label={`Select ${row.name}`}
                        onChange={(e) => toggleLeadSelection(row.id, e.target.checked)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        {/* Name + meta */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOpenId(row.id)}
                            className="text-left text-sm font-semibold text-zinc-100 hover:text-white"
                          >
                            {row.name}
                          </button>
                          {row.type && (
                            <span className="shrink-0 text-[10px] text-zinc-500">· {row.type}</span>
                          )}
                          {(row.city || row.region) && (
                            <span className="shrink-0 text-[10px] text-zinc-500">
                              · {[row.city, row.region].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                        {/* Import status badges */}
                        {(isNew || isReimported) && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {isNew && (
                              <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                                {t("new_to_database", locale)}
                              </span>
                            )}
                            {isReimported && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200 ring-1 ring-inset ring-amber-400/40">
                                {t("reimported", locale)}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Scores */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1.5">
                            <ScoreBar score={readinessCard.score} tone="lead" />
                            <span className="text-[10px] text-zinc-500">{readinessLabelCard}</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {locale === "tr" ? "Sıcak" : "Hot"}:{" "}
                            <span className={`font-semibold tabular-nums ${scoreColor(row.hotScore)}`}>
                              {row.hotScore}
                            </span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            Lead:{" "}
                            <span className={`font-semibold tabular-nums ${scoreColor(row.leadScore)}`}>
                              {row.leadScore}
                            </span>
                          </span>
                        </div>
                        {/* Signal badges (compact) */}
                        <OutreachBadgesRow
                          row={row}
                          newImport={isNew}
                          reimported={isReimported}
                          inQueue={inQueueCard}
                          syncedToAirtable={isSynced}
                          now={renderNow}
                          compact
                        />
                        {/* Why this lead */}
                        <WhyThisLeadChips
                          lead={row}
                          enrichment={contactFinderMap[row.id]}
                          limit={3}
                        />
                        {/* Date meta */}
                        <div className="mt-0.5 text-[10px] text-zinc-600">
                          {relativeCalendarLabel(row.firstImportedAt ?? row.createdAt, renderNow, locale)}
                          {lcCard && (
                            <> · {t("last_contact", locale)}: {relativeCalendarLabel(lcCard, renderNow, locale)}</>
                          )}
                          {" · "}{t("outreach_prefix", locale)}: {getLastOutreachActivityLabel(row.id, row._s, renderNow)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
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
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <IconSpark className="h-3.5 w-3.5 shrink-0" />
                        {t("ai_message", locale)}
                      </button>
                      {!row._s.doNotContact &&
                        (isFollowUpDue(row._s, renderNow) || row._s.status === "needs_follow_up") && (
                          <button
                            type="button"
                            onClick={() => void startFollowUpOutreach(row)}
                            title="Kısa hatırlatma mesajı ve WhatsApp"
                            className="inline-flex h-8 shrink-0 items-center rounded-md border border-orange-400/30 bg-orange-500/10 px-2 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/20"
                          >
                            {t("follow_up", locale)}
                          </button>
                        )}
                      <button
                        type="button"
                        disabled={(() => {
                          const nowCard = renderNow;
                          const inQNow = dailyOutreach.todayQueue.includes(row.id);
                          const eligCard = isEligibleForDailyQueue(
                            row,
                            contactFinderMap[row.id],
                            dailyOutreach.todayQueue,
                            nowCard,
                          );
                          return inQNow || !eligCard || (!inQNow && safeActiveQueueCount >= DAILY_OUTREACH_LIMIT);
                        })()}
                        title="Add to today’s outreach queue (max 20)"
                        onClick={() => addLeadIdsToDailyQueue([row.id])}
                        className="inline-flex h-8 shrink-0 items-center rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t("add_to_queue", locale)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenId(row.id)}
                        title="Open details"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-zinc-200 transition hover:bg-white/10"
                      >
                        {t("open", locale)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {latestImportOnlyDuplicates && latestImportRows.length === 0 && (
          <div className="border-t border-white/5 px-4 py-2 text-[11px] text-zinc-500">
            {t("latest_import_dupes_only", locale)}
          </div>
        )}
      </section>

      </>)}

      {queueActionNotice && (
        <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {queueActionNotice}
        </div>
      )}

      {/* EXECUTION workspace (part 4 — queue & follow-ups) */}
      {workspaceTab === "execution" && (
      <>

      <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] ring-1 ring-inset ring-emerald-500/10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">
              {t("todays_queue", locale)}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
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
          <div className="max-h-28 overflow-y-auto p-4 pt-3">
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
          <p className="px-5 py-4 text-[11px] text-zinc-500">{t("queue_empty_hint", locale)}</p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-orange-500/20 bg-orange-500/[0.04] ring-1 ring-inset ring-orange-500/10">
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-orange-200">
              {t("follow_up_due_section", locale)}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">{t("follow_up_due_sub", locale)}</p>
          </div>
          <span className="rounded-md bg-black/20 px-2.5 py-1 text-[11px] font-medium text-orange-200">
            {safeFollowUpDueCount} {t("due_count", locale)}
          </span>
        </div>
        {safeFollowUpDueCount === 0 ? (
          <p className="px-5 py-4 text-[11px] text-zinc-500">{t("no_follow_up_due", locale)}</p>
        ) : (
          <div className="max-h-44 space-y-2 overflow-y-auto p-4 pr-3">
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

      </>)}

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

      {/* INTELLIGENCE workspace — v5.5 unified Founder Console (Lead List) */}
      {workspaceTab === "intelligence" && mounted && allRows.length > 0 && (
        <FounderConsoleShell
          accent="violet"
          icon={<IconSpark className="h-4 w-4 text-violet-200" />}
          title={locale === "tr" ? "Lead Havuzu" : "Lead Pool"}
          subtitle={
            locale === "tr"
              ? "Akıllı segmentler, sıcak fırsatlar ve tüm lead havuzu"
              : "Smart segments, hot opportunities and the full lead pool"
          }
          right={
            <>

      {/* Hot opportunities — moved into right intelligence panel */}
      <section className="overflow-hidden rounded-xl border border-orange-400/15 bg-orange-500/[0.03] ring-1 ring-inset ring-orange-400/10">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.12em] text-orange-200">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
            {useLatestImportHotLeads
              ? t("hot_targets_import", locale)
              : t("hot_targets", locale)}
          </h2>
        </div>
        <div className="p-3">
          <div className="-mx-1 grid grid-flow-col auto-cols-[240px] gap-3 overflow-x-auto px-1 pb-2">
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
        </div>
      </section>

      {/* v3.8.7 Smart Lead Segments */}
      <section className="overflow-hidden rounded-xl border border-violet-400/15 bg-violet-500/[0.03] backdrop-blur ring-1 ring-inset ring-violet-400/10">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-violet-200">
            {locale === "tr" ? "Akıllı Lead Segmentleri" : "Smart Lead Segments"}
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            {locale === "tr" ? "Tek tıkla lead gruplarını keşfet" : "Discover lead groups with one click"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          {(
            [
              {
                id: "hot" as SmartSegmentId,
                icon: "🔥",
                label: locale === "tr" ? "Sıcak Fırsatlar" : "Hot Opportunities",
                desc: locale === "tr" ? "Yüksek dönüşüm potansiyeli" : "High conversion potential",
                activeCls: "border-orange-400/40 bg-orange-500/[0.08]",
                countCls: "bg-orange-500/20 text-orange-200",
              },
              {
                id: "icp" as SmartSegmentId,
                icon: "🟢",
                label: locale === "tr" ? "Ticari Uyum Yüksek" : "High ICP Alignment",
                desc: locale === "tr" ? "TUGOBO ICP uyumu güçlü" : "Strong TUGOBO ICP fit",
                activeCls: "border-emerald-400/40 bg-emerald-500/[0.08]",
                countCls: "bg-emerald-500/20 text-emerald-200",
              },
              {
                id: "whatsapp" as SmartSegmentId,
                icon: "📱",
                label: locale === "tr" ? "WhatsApp Hazır" : "WhatsApp Ready",
                desc: locale === "tr" ? "WhatsApp kanalı mevcut" : "WhatsApp channel available",
                activeCls: "border-green-400/40 bg-green-500/[0.08]",
                countCls: "bg-green-500/20 text-green-200",
              },
              {
                id: "digital" as SmartSegmentId,
                icon: "🌐",
                label: locale === "tr" ? "Dijital Güçlü" : "Digitally Strong",
                desc: locale === "tr" ? "Web + Instagram aktif" : "Website + Instagram active",
                activeCls: "border-sky-400/40 bg-sky-500/[0.08]",
                countCls: "bg-sky-500/20 text-sky-200",
              },
              {
                id: "enterprise" as SmartSegmentId,
                icon: "📦",
                label: locale === "tr" ? "Enterprise Adayları" : "Enterprise Candidates",
                desc: locale === "tr" ? "En yüksek ticari potansiyel" : "Highest commercial potential",
                activeCls: "border-violet-400/40 bg-violet-500/[0.08]",
                countCls: "bg-violet-500/20 text-violet-200",
              },
              {
                id: "growth" as SmartSegmentId,
                icon: "📈",
                label: locale === "tr" ? "Growth Adayları" : "Growth Candidates",
                desc: locale === "tr" ? "Büyüme odaklı paket uyumu" : "Growth package alignment",
                activeCls: "border-indigo-400/40 bg-indigo-500/[0.08]",
                countCls: "bg-indigo-500/20 text-indigo-200",
              },
              {
                id: "revenue_priority" as SmartSegmentId,
                icon: "💰",
                label: locale === "tr" ? "Gelir Önceliği Yüksek" : "High Revenue Priority",
                desc: locale === "tr" ? "Yüksek + Kritik gelir öncelikli" : "High & critical revenue priority",
                activeCls: "border-amber-400/40 bg-amber-500/[0.08]",
                countCls: "bg-amber-500/20 text-amber-200",
              },
            ]
          ).map(({ id, icon, label, desc, activeCls, countCls }) => {
            const isActive = smartSegment === id;
            const count = segmentCounts[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSmartSegment(smartSegment === id ? null : id);
                  setAllLeadsOpen(true);
                }}
                className={`flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-all ${
                  isActive
                    ? activeCls
                    : "border-white/10 bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm leading-none">{icon}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                      isActive ? countCls : "bg-white/10 text-zinc-400"
                    }`}
                  >
                    {count}
                  </span>
                </div>
                <div
                  className={`text-[11px] font-medium leading-tight ${
                    isActive ? "text-zinc-100" : "text-zinc-300"
                  }`}
                >
                  {label}
                </div>
                <div className="text-[10px] leading-tight text-zinc-500">{desc}</div>
              </button>
            );
          })}
        </div>
      </section>

            </>
          }
          left={
            <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">

      {/* Active segment filter bar */}
      {smartSegment && (
        <div className="flex items-center justify-between rounded-xl border border-violet-400/20 bg-violet-500/[0.05] px-4 py-3">
          <span className="text-[11px] text-zinc-400">
            {locale === "tr" ? "Filtre:" : "Filter:"}{" "}
            <span className="font-medium text-violet-200">
              {({
                hot: locale === "tr" ? "🔥 Sıcak Fırsatlar" : "🔥 Hot Opportunities",
                icp: locale === "tr" ? "🟢 Ticari Uyum Yüksek" : "🟢 High ICP Alignment",
                whatsapp: locale === "tr" ? "📱 WhatsApp Hazır" : "📱 WhatsApp Ready",
                digital: locale === "tr" ? "🌐 Dijital Güçlü" : "🌐 Digitally Strong",
                enterprise: locale === "tr" ? "📦 Enterprise Adayları" : "📦 Enterprise Candidates",
                growth: locale === "tr" ? "📈 Growth Adayları" : "📈 Growth Candidates",
                revenue_priority: locale === "tr" ? "💰 Gelir Önceliği Yüksek" : "💰 High Revenue Priority",
              } satisfies Record<SmartSegmentId, string>)[smartSegment]}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSmartSegment(null)}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
          >
            {locale === "tr" ? "✕ Temizle" : "✕ Clear"}
          </button>
        </div>
      )}

      {/* All Leads (collapsible) */}
      <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-200">
              {t("all_leads", locale)}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">{t("all_leads_sub", locale)}</p>
          </div>
          <button
            onClick={() => setAllLeadsOpen((v) => !v)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            {allLeadsOpen ? t("hide", locale) : t("show", locale)}
          </button>
        </div>

        {allLeadsOpen && (
          <>
            <section className="flex flex-col gap-3 border-b border-white/5 p-4 md:flex-row md:items-center md:justify-between">
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
                    setSort(
                      e.target.value as
                        | "opportunity"
                        | "priority"
                        | "readiness"
                        | "hot"
                        | "lead"
                        | "name",
                    )
                  }
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 sm:w-auto"
                >
                  <option value="opportunity">
                    {locale === "tr" ? "Fırsat Puanı" : "Opportunity Score"}
                  </option>
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
                    const nextFocus = !focusMode;
                    setFocusMode(nextFocus);
                    setShowAllLeadsRows(false);
                    if (openLead) {
                      const fBase = leadTableRowToScoredLead(openLead);
                      applyEnrichedLeadToStore({ ...fBase, activityTimeline: appendLeadActivity(fBase.activityTimeline, nextFocus ? "focus_add" : "focus_remove", nextFocus ? "Odak moduna eklendi" : "Odak modundan çıkarıldı") });
                    }
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
                {segmentApplied.length} {t("leads_word", locale)}
              </span>
              <div className="flex items-center gap-4">
                {/* v5.0 — Liste / Kart view toggle (default Liste = Opportunity Table) */}
                <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.02] p-0.5">
                  {([
                    { id: "list" as const, label: locale === "tr" ? "Liste" : "List" },
                    { id: "card" as const, label: locale === "tr" ? "Kart" : "Card" },
                  ]).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLeadViewMode(id)}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                        leadViewMode === id
                          ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-inset ring-indigo-400/30"
                          : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectVisible(e.target.checked)}
                    aria-label="Select all visible leads"
                  />
                  {t("select_all_visible", locale)}
                </label>
                {smartSegment ? (
                  <span className="text-[11px] text-violet-300">
                    {locale === "tr" ? "Segment görünümü — Odak modu uygulanmıyor" : "Segment view — Focus mode bypassed"}
                  </span>
                ) : focusMode && (
                  <span className="text-[11px] text-orange-300">{t("focus_hint", locale)}</span>
                )}
              </div>
            </div>

            <div className="p-4">
              {leadViewMode === "list" ? (
                <LeadOpportunityTable
                  rows={visibleAllLeads}
                  packageMap={packageByLeadId}
                  expectedRevenueMap={expectedRevenueByLeadId}
                  revenuePriorityMap={revenuePriorityByLeadId}
                  contactFinderMap={contactFinderMap}
                  openId={openId}
                  now={renderNow}
                  onOpenDetail={(id) => setOpenId(id)}
                  getActivityLabel={getLastOutreachActivityLabel}
                />
              ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleAllLeads.map((row, index) => {
                  const s = row._s;
                  const isRecentlyImported = recentlyImportedLeadIds.includes(row.id);
                  const isNew = lastImportNewIds.includes(row.id);
                  const isReimported = lastImportUpdatedIds.includes(row.id);
                  const inQueue = dailyOutreach.todayQueue.includes(row.id);
                  const isSynced = airtableSyncedLeadIds.includes(row.id);
                  const readiness = rowReadinessWithFinder(row, contactFinderMap[row.id]);
                  const readinessLabel = readinessCategoryUiLabel(row, contactFinderMap[row.id], locale);
                  const lc = s.lastContactedAt ?? s.contactedAt ?? null;
                  const acqCls = leadRowAcquisitionHighlightClass(row);
                  const cardBorderBg =
                    row.hotScore > 80
                      ? "border-orange-400/20 bg-orange-500/[0.04] hover:bg-orange-500/[0.07]"
                      : row.hotScore >= 70
                      ? "border-white/10 bg-white/[0.025] hover:bg-white/[0.04]"
                      : "border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.025] opacity-80 hover:opacity-100";
                  const ringCls = isRecentlyImported
                    ? "shadow-[inset_0_0_0_1px_rgba(129,140,248,0.35)]"
                    : openId === row.id
                    ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                    : "";
                  return (
                    <div
                      key={renderLeadKey("all-leads", row, index)}
                      className={`flex flex-col gap-2 rounded-lg border p-3 transition ${cardBorderBg} ${ringCls} ${acqCls}`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(row.id)}
                          aria-label={`Select ${row.name}`}
                          onChange={(e) => toggleLeadSelection(row.id, e.target.checked)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setOpenId(row.id)}
                              className="text-left text-sm font-semibold text-zinc-100 hover:text-white"
                            >
                              {row.name}
                            </button>
                            {row.type && (
                              <span className="shrink-0 text-[10px] text-zinc-500">· {row.type}</span>
                            )}
                            {(row.city || row.region) && (
                              <span className="shrink-0 text-[10px] text-zinc-500">
                                · {[row.city, row.region].filter(Boolean).join(", ")}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <LifecycleBadge lifecycle={computeLeadLifecycleStatus(row, s)} />
                            {isNew && (
                              <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                                {t("new_to_database", locale)}
                              </span>
                            )}
                            {isReimported && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200 ring-1 ring-inset ring-amber-400/40">
                                {t("reimported", locale)}
                              </span>
                            )}
                            {isRecentlyImported && !isNew && !isReimported && (
                              <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
                                {t("session_import_badge", locale)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="flex items-center gap-1.5">
                              <ScoreBar score={readiness.score} tone="lead" />
                              <span className="text-[10px] text-zinc-500">{readinessLabel}</span>
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {locale === "tr" ? "Sıcak" : "Hot"}:{" "}
                              <span className={`font-semibold tabular-nums ${scoreColor(row.hotScore)}`}>
                                {row.hotScore}
                              </span>
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              Lead:{" "}
                              <span className={`font-semibold tabular-nums ${scoreColor(row.leadScore)}`}>
                                {row.leadScore}
                              </span>
                            </span>
                          </div>
                          <OutreachBadgesRow
                            row={row}
                            newImport={isNew}
                            reimported={isReimported}
                            inQueue={inQueue}
                            syncedToAirtable={isSynced}
                            now={renderNow}
                            compact
                          />
                          <WhyThisLeadChips
                            lead={row}
                            enrichment={contactFinderMap[row.id]}
                            limit={3}
                          />
                          <div className="mt-0.5 text-[10px] text-zinc-600">
                            {relativeCalendarLabel(row.firstImportedAt ?? row.createdAt, renderNow, locale)}
                            {lc && (
                              <> · {t("last_contact", locale)}: {relativeCalendarLabel(lc, renderNow, locale)}</>
                            )}
                            {" · "}{t("outreach_prefix", locale)}: {getLastOutreachActivityLabel(row.id, s, renderNow)}
                          </div>
                          {(() => {
                            const er = expectedRevenueByLeadId.get(row.id);
                            const rp = revenuePriorityByLeadId.get(row.id);
                            if (!er || er.weightedExpectedMonthlyRevenue < 500) return null;
                            const tierLabel = rp
                              ? ({
                                  critical: locale === "tr" ? "Kritik" : "Critical",
                                  high: locale === "tr" ? "Yüksek" : "High",
                                  medium: locale === "tr" ? "Orta" : "Medium",
                                  low: locale === "tr" ? "Düşük" : "Low",
                                } as const)[rp.revenuePriorityTier]
                              : null;
                            const tierColor = rp
                              ? ({
                                  critical: "text-rose-300",
                                  high: "text-amber-300",
                                  medium: "text-zinc-400",
                                  low: "text-zinc-500",
                                } as const)[rp.revenuePriorityTier]
                              : "text-zinc-500";
                            return (
                              <div className="mt-0.5 text-[10px] text-zinc-500">
                                {locale === "tr" ? "Beklenen MRR" : "Expected MRR"}:{" "}
                                <span className="font-medium tabular-nums text-amber-300">
                                  {formatTRY(er.weightedExpectedMonthlyRevenue)}
                                </span>
                                <span className="ml-1 text-zinc-600">
                                  · %{Math.round(er.expectedCustomerProbability * 100)}
                                </span>
                                {tierLabel && rp && (rp.revenuePriorityTier === "critical" || rp.revenuePriorityTier === "high") && (
                                  <span className={`ml-1 font-medium ${tierColor}`}>
                                    · {locale === "tr" ? "Gelir Önceliği" : "Rev. Priority"}: {tierLabel}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
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
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/20 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <IconSpark className="h-3.5 w-3.5 shrink-0" />
                          {t("ai_message", locale)}
                        </button>
                        {!s.doNotContact &&
                          (isFollowUpDue(s, renderNow) || s.status === "needs_follow_up") && (
                            <button
                              type="button"
                              onClick={() => void startFollowUpOutreach(row)}
                              title="Kısa hatırlatma mesajı ve WhatsApp"
                              className="inline-flex h-8 shrink-0 items-center rounded-md border border-orange-400/30 bg-orange-500/10 px-2 text-[11px] font-medium text-orange-200 transition hover:bg-orange-500/20"
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
                            return inQ || !elig || (!inQ && safeActiveQueueCount >= DAILY_OUTREACH_LIMIT);
                          })()}
                          title="Add to today’s outreach queue"
                          onClick={() => addLeadIdsToDailyQueue([row.id])}
                          className="inline-flex h-8 shrink-0 items-center rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t("queue_short", locale)}
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
                    </div>
                  );
                })}
                {segmentApplied.length === 0 && (
                  <div className="col-span-full px-4 py-10 text-center text-sm text-zinc-500">
                    {t("no_leads_filters", locale)}
                  </div>
                )}
              </div>
              )}
            </div>
            {segmentApplied.length > 15 && (
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

            </div>
          }
        />
      )}

      {/* FOLLOWUPS workspace — Bugünün Takipleri */}
      {workspaceTab === "followups" && (
        <FollowUpsWorkspace />
      )}

      <footer className="pb-8 pt-2 text-center text-[11px] text-zinc-600">
        {t("footer_mvp", locale)}
      </footer>

      </div>
      {/* /v5.3 App-shell content region */}

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
                onManualReEnrich={() => void manualReEnrichOpenLead()}
                manualReEnrichBusy={reenrichBusyLeadId === openLead.id}
                manualReEnrichMessage={reenrichMessage}
                onAiReviewCompleted={recordAiReviewForOpenLead}
              />
            </aside>
          </div>,
          document.body,
        )}
      </div>
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
