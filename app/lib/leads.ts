import {
  generateLeadInsight,
  type LeadForAiInsight,
  type OpportunityLevel,
  type AiInsightSource,
} from "./intelligence/ai-insight";
import { buildExtractedSignals, type BusinessSignal } from "./intelligence/signals";
import {
  deriveOutreachIntelligence,
  type OutreachIntelligenceProfile,
} from "./intelligence/outreach-intelligence";
import { buildEnrichmentV2Profile } from "./intelligence/enrichment-v2";
import {
  calculateAcquisitionOpportunityAdjustment,
  calculateAcquisitionPriorityBoost,
  type AcquisitionIntelligence,
  type AcquisitionIntelligenceProfile,
  type AcquisitionChannel,
  type AcquisitionIntentLevel,
} from "./intelligence/acquisition-intelligence";
import type {
  CommercialReadiness,
  CommercialReadinessLevel,
} from "./intelligence/commercial-readiness";
import {
  calculateConversionLeak,
  conversionLeakOpportunityDelta,
  type ConversionLeak,
} from "./intelligence/conversion-leak";
import {
  calculateOpportunityProfile,
  type OpportunityProfile,
} from "./intelligence/opportunity-engine";
import type {
  MaturityLevel,
  SignalConfidence,
  VerificationStatus,
} from "./intelligence/confidence";
import type {
  WhatsAppConfidence,
  WhatsAppSurfaceMeta,
} from "./intelligence/whatsapp-verification";
import { turkishGsmDigitsForWaMe } from "./intelligence/whatsapp-verification";
import type { WebsiteContactSignalsInterpretation } from "./intelligence/extracted-signals-interpretation";
import {
  calculateIcpAlignment,
  type IcpAlignmentProfile,
  type EstimatedPropertySize,
  type EstimatedDemandVolume,
  type DirectBookingReadiness,
  type OtaDependencyLevel,
} from "./intelligence/icp-alignment";
import {
  calculateIcpFitScore,
  detectBusinessOwnership,
  type BusinessOwnershipType,
  type SignalVerificationProfile,
  type WhatsappVerificationState,
  type WebsiteVerificationState,
  type InstagramVerificationState,
  type ReservationSignalState,
} from "./signal-verification";
import {
  calculateVerifiedOpportunityScore,
  type OpportunityTier,
} from "./opportunity-scoring";

export type { WebsiteContactSignalsInterpretation };
export type {
  IcpAlignmentProfile,
  EstimatedPropertySize,
  EstimatedDemandVolume,
  DirectBookingReadiness,
  OtaDependencyLevel,
};
export type { BusinessSignal };
export type {
  AcquisitionIntelligence,
  AcquisitionIntelligenceProfile,
  AcquisitionChannel,
  AcquisitionIntentLevel,
};
export type { CommercialReadiness, CommercialReadinessLevel };
export {
  calculateAcquisitionMaturity,
  calculateAcquisitionPriorityBoost,
  getAcquisitionPriorityReason,
} from "./intelligence/acquisition-intelligence";
export type {
  ConversionLeak,
  ConversionLeakLevel,
  ConversionLeakSignalId,
} from "./intelligence/conversion-leak";
export {
  calculateConversionLeak,
  conversionLeakOpportunityDelta,
  conversionLeakUiChipHints,
  detectConversionLeakSignals,
  getConversionLeakLevel,
  getLikelyLeakSources,
  hasAcquisitionTrafficProxy,
} from "./intelligence/conversion-leak";
export type { OpportunityLevel, AiInsightSource };
export type { OutreachIntelligenceProfile };
export type { OpportunityProfile };
export type { SignalConfidence, VerificationStatus, MaturityLevel };
export type {
  BusinessOwnershipType,
  SignalVerificationProfile,
  WhatsappVerificationState,
  WebsiteVerificationState,
  InstagramVerificationState,
  ReservationSignalState,
};
export type { OpportunityTier } from "./opportunity-scoring";
export {
  OPPORTUNITY_REASON_LABELS,
  OPPORTUNITY_TIER_LABELS,
  opportunityTierRank,
} from "./opportunity-scoring";
export type { WhatsAppConfidence, WhatsAppSurfaceMeta } from "./intelligence/whatsapp-verification";

export type OutreachPriorityBucket = "today" | "high" | "medium" | "low" | "archive";

export type LeadActivity = {
  id: string;
  type: string;
  timestamp: string;
  label: string;
};
export type RecommendedAction =
  | "send_whatsapp"
  | "follow_up"
  | "research_more"
  | "wait"
  | "skip";

export type LeadType =
  | "Hotel"
  | "Boutique Hotel"
  | "Bungalow"
  | "Villa"
  | "Pension";

export type LeadStatus =
  | "new"
  | "contacted"
  | "needs_follow_up"
  | "replied"
  | "meeting"
  | "won"
  | "lost";

export type Channel = "Booking" | "Airbnb" | "Direct" | "Tatilsepeti";

export type Lead = {
  id: string;
  createdAt?: number;
  /** First time this business was added to the master database (import). */
  firstImportedAt?: number;
  /** Most recent import that touched this lead. */
  lastImportedAt?: number;
  /** Last outreach marked as contacted (mirrors workflow state). */
  lastContactedAt?: number | null;
  /** Next follow-up target in epoch ms. */
  nextFollowUpAt?: number | null;
  /** Number of times outreach was marked contacted. */
  contactAttempts?: number;
  /** Import batch session id (last touch). */
  importSessionId?: string | null;
  /** Optional mirror; persisted workflow flag lives in {@link LeadStatusUpdate.doNotContact}. */
  doNotContact?: boolean;
  /** Optional CRM stage mirror (e.g. Airtable pipeline_stage). */
  pipelineStage?: string;
  /** Contact readiness intelligence score (0-100). */
  contactReadinessScore?: number;
  /** Manually marked invalid WhatsApp number. */
  whatsappInvalid?: boolean;
  name: string;
  type: LeadType;
  city: string;
  region: string;
  contactName: string;
  phone: string;
  instagram?: string;
  website?: string;
  /**
   * Probable official hostname (or URL normalized to hostname) when Places omitted `website`,
   * discovered via bounded homepage checks. Does not replace {@link website} from Google.
   */
  websiteCandidateUrl?: string;
  /** Present when a guessed homepage matched weakly and should be human-verified. */
  websiteVerificationStatus?: VerificationStatus;
  /** Optional non-Places hint (imports / future fields) used only for domain guessing. */
  googleWebsiteSearchHint?: string;
  units: number;
  pricePerNight: number;
  occupancy30d: number;
  rating: number;
  channels: Channel[];
  hasOwnWebsite: boolean;
  hasInstagram: boolean;
  reviewsCount: number;
  daysSinceLastReview: number;
  daysOnPlatform: number;
  signals: string[];
  /** Strength of website URL / crawl signal (optional; omitted on older persisted leads). */
  websiteConfidence?: SignalConfidence;
  whatsappConfidence?: WhatsAppConfidence;
  /** TR reasoning lines from {@link detectWhatsAppConfidence} (homepage + listing rules). */
  whatsappSignals?: string[];
  /** Legacy numeric Instagram strength may appear alongside enum confidence. */
  instagramConfidence?: SignalConfidence | number;
  extractedPhones?: string[];
  extractedEmails?: string[];
  extractedSocialLinks?: string[];
  hasReservationCTA?: boolean;
  hasContactPage?: boolean;
};

export type ContactQuality = "high" | "medium" | "low";

export type ReviewPainPointCategory =
  | "response_delay"
  | "unreachable"
  | "reservation"
  | "communication"
  | "cleanliness"
  | "value"
  | "other";

export type ReviewPainPoint = {
  id: string;
  category: ReviewPainPointCategory;
  summary: string;
  severity: "low" | "medium" | "high";
  evidence?: { reviewId: string; excerpt: string }[];
  firstSeen?: string;
  lastSeen?: string;
  frequency?: number;
  confidence?: number;
};

export type WebsiteIntelligenceSummary = {
  hasWhatsAppLink?: boolean;
  hasTelLink?: boolean;
  hasBookingCtaText?: boolean;
  hasBookingEngine?: boolean;
  hasContactPage?: boolean;
  hasInquiryForm?: boolean;
  hasSocialIcons?: boolean;
  hasOtaOutboundLinks?: boolean;
  bookingFlowQuality?: number;
  mobileViewportPresent?: boolean;
  confidence?: number;
  websiteConfidence?: SignalConfidence;
  directBookingMaturity?: MaturityLevel;
  conversionMaturity?: MaturityLevel;
  errors?: string[];
  /** Present when homepage enrichment estimates outbound social link depth (0–100). */
  socialLinksQuality?: number;
  /** When set, homepage was matched to the listing without an official Places website URL. */
  websiteCandidateMatch?: "strong" | "uncertain";
  /** WhatsApp links were present in HTML but failed basic digit validation. */
  hasInvalidWhatsAppLinks?: boolean;
  /** Optional bounded summary from homepage HTML (not persisted to Airtable). */
  whatsappSurfaceMeta?: WhatsAppSurfaceMeta;
};

export type ScoredLead = Lead & {
  leadScore: number;
  hotScore: number;
  leadReasons: string[];
  hotReasons: string[];
  contactQuality: ContactQuality;
  /** Rule-based signals; recomputed on score/sanitize */
  businessSignals?: BusinessSignal[];
  whyThisLead?: string[];
  heuristicOutreachAngle?: string;
  /** Structured “consultative opportunity” score (0–100), not the same as leadScore */
  intelligenceScore?: number;
  /** Review-derived operational/commercial pain points when evidence exists. */
  reviewPainPoints?: ReviewPainPoint[];
  reviewIntelligenceScore?: number;
  reviewAnalyzedAt?: number;
  /** Optional next-generation scoring fields; older records may not have them. */
  smartLeadScoreV2?: number;
  /** Lead Scoring v3 breakdown fields (0–100 unless noted). */
  businessTier?: "micro" | "small" | "medium" | "premium" | "enterprise";
  opportunityScore?: number;
  outreachFit?: number;
  digitalMaturity?: number;
  bookingFlowStrength?: number;
  otaDependencyLikelihood?: number;
  socialDemandStrength?: number;
  communicationHealth?: number;
  operationalActivity?: number;
  communicationRisk?: number;
  priorityScore?: number;
  priorityDelta?: number;
  websiteIntelligence?: WebsiteIntelligenceSummary;
  /** AI insight layer (rules by default; optional LLM via `/api/ai-insight`). */
  aiInsight?: string;
  outreachAngle?: string;
  painPointSummary?: string[];
  opportunityLevel?: OpportunityLevel;
  aiInsightSource?: AiInsightSource;
  /** Rule-based outreach intelligence profile — how the lead should be approached. */
  outreachIntelligence?: OutreachIntelligenceProfile;
  /** Acquisition intent / Meta-ready proxies from deterministic enrichment. */
  acquisitionIntelligence?: AcquisitionIntelligenceProfile;
  /** Heuristic conversion friction vs. acquisition/demand proxies (v1). */
  conversionLeak?: ConversionLeak;
  /** Deterministic likelihood of investing in growth / conversion systems. */
  commercialReadiness?: CommercialReadiness;
  /** Confidence-based acquisition enrichment (optional for older persisted data). */
  otaConfidence?: SignalConfidence;
  adsLikelihood?: SignalConfidence;
  directBookingMaturity?: MaturityLevel;
  conversionMaturity?: MaturityLevel;
  acquisitionMaturity?: MaturityLevel;
  /** Unified opportunity engine output (v2). */
  opportunityProfile?: OpportunityProfile;
  /** Outreach prioritization layer; independent from leadScore. */
  outreachPriority?: number;
  priorityBucket?: OutreachPriorityBucket;
  recommendedAction?: RecommendedAction;
  /** DeepSeek/OpenAI veya kural tabanlı Türkçe yorum (ana sayfa sinyalleri sonrası). */
  websiteContactSignalsInterpretation?: WebsiteContactSignalsInterpretation;
  /** ICP alignment — operational value estimate for TUGOBO AI. */
  icpAlignment?: IcpAlignmentProfile;
  /** ISO datetime of the most recent manual re-enrichment run. */
  lastEnrichedAt?: string;
  /** Source that triggered the last enrichment refresh (e.g. "manual"). */
  lastEnrichmentSource?: string;
  /** ISO datetime of the most recent AI analysis run (LLM or rules). */
  lastAiReviewAt?: string;
  /** Number of times homepage/signal enrichment has been executed. */
  enrichmentCount?: number;
  /** Number of times AI analysis has been run (including re-enrich). */
  reviewCount?: number;
  /** Most recent high-level action performed on this lead ("enriched" | "ai_reviewed"). */
  lastActionType?: string;
  /** Persistent activity log (max 20 entries, newest first). */
  activityTimeline?: LeadActivity[];
  /** Signal Verification Engine v1.3 — multi-page verified states + 0–100 confidences. */
  signalVerification?: SignalVerificationProfile;
  /** Chain vs. independent classification; informational only, never reduces scores. */
  businessOwnershipType?: BusinessOwnershipType;
  /** TUGOBO ICP fit (0–100). Separate metric — does not replace leadScore/hotScore. */
  icpFitScore?: number;
  /** ISO datetime of the most recent signal verification run (lead memory). */
  lastVerificationAt?: string;
  /** Number of signal verification runs executed (lead memory). */
  verificationCount?: number;
  /** Short Turkish summary of the latest verification outcome (lead memory). */
  lastVerificationResult?: string;
  /**
   * v1.4 Verified Opportunity Score (0–100) — unified sales-prioritization layer.
   * Additive metric; does NOT replace leadScore/hotScore/icpFitScore or the
   * internal {@link opportunityScore} that feeds Lead Score V3.
   */
  verifiedOpportunityScore?: number;
  /** Opportunity classification derived from {@link verifiedOpportunityScore}. */
  opportunityTier?: OpportunityTier;
  /** Stable reason keys explaining the opportunity score (see OPPORTUNITY_REASON_LABELS). */
  opportunityReasons?: string[];
  /** ISO datetime of the most recent opportunity evaluation (lead memory). */
  lastOpportunityEvaluationAt?: string;
  /** Number of opportunity evaluations executed (lead memory). */
  opportunityEvaluationCount?: number;
  /** Opportunity score recorded at the last evaluation (lead memory). */
  lastOpportunityScore?: number;
  /**
   * v1.6 Daily Opportunity Queue — lightweight queue memory (all optional,
   * backward compatible). Mirrors {@link LeadStatusUpdate.lastQueuedAt} at the
   * lead level so it survives re-enrichment / AI reinterpretation.
   */
  lastQueuedAt?: number | null;
  /** Number of times this lead has been staged into the daily outreach queue. */
  queueCount?: number;
  /** Short Turkish reason captured the last time the lead was queued. */
  lastQueueReason?: string;
};

export const OUTREACH_PRIORITY_BUCKET_LABEL: Record<OutreachPriorityBucket, string> = {
  today: "Today",
  high: "High",
  medium: "Medium",
  low: "Low",
  archive: "Archive",
};

export const RECOMMENDED_ACTION_LABEL: Record<RecommendedAction, string> = {
  send_whatsapp: "Send WhatsApp",
  follow_up: "Follow Up",
  research_more: "Research More",
  wait: "Wait",
  skip: "Skip",
};

function normalizePhoneDedupe(phone?: string): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `90${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `9${digits}`;
  return digits;
}

function normalizeNameCityKey(name: string, city: string): string {
  return `${name}`.trim().toLowerCase() + "|" + `${city}`.trim().toLowerCase();
}

export function dedupeLeads(leads: Lead[]): Lead[] {
  const seenNameCity = new Set<string>();
  const seenWhatsapp = new Set<string>();
  const out: Lead[] = [];

  for (const lead of leads) {
    const nameCityKey = normalizeNameCityKey(lead.name, lead.city);
    const whatsappKey = normalizePhoneDedupe(lead.phone);
    if (seenNameCity.has(nameCityKey)) continue;
    if (whatsappKey && seenWhatsapp.has(whatsappKey)) continue;
    seenNameCity.add(nameCityKey);
    if (whatsappKey) seenWhatsapp.add(whatsappKey);
    out.push(lead);
  }

  return out;
}

/** Persisted workflow state for one lead — scalars only (current snapshot, not history). */
export type LeadStatusUpdate = {
  status: LeadStatus;
  /** Single note text; UI and storage must not treat as a list. */
  note: string;
  updatedAt: number | null;
  contactedAt?: number | null;
  channel?: "whatsapp" | "phone" | "instagram" | "email" | null;
  /** Persisted DNC flag (also mirrored on stored ScoredLead for imports). */
  doNotContact?: boolean;
  /** Persisted invalid WhatsApp flag; lead is blocked from outreach queue. */
  whatsappInvalid?: boolean;
  contactAttempts?: number;
  lastContactedAt?: number | null;
  /** Epoch ms when a follow-up is due (set on outbound WhatsApp / contacted). */
  nextFollowUpAt?: number | null;
  /** CRM-ish stage mirror (Airtable pipeline_stage). */
  pipelineStage?: string | null;
  /** Queue memory: whether this lead is queued for the current local calendar day. */
  queuedToday?: boolean;
  /** Queue memory: last time this lead was added to the outreach queue (epoch ms). */
  lastQueuedAt?: number | null;
  /** Hours after last contact before auto “needs follow-up” (default 24 in UI). */
  followUpAfterHours?: number;
  repliedAt?: number | null;
  meetingAt?: number | null;
  wonAt?: number | null;
  lostAt?: number | null;
};

const turkishPhone = (n: number) => {
  const nn = (300000000 + n).toString().padStart(9, "0");
  return `+90 5${nn.slice(0, 2)} ${nn.slice(2, 5)} ${nn.slice(5, 9)}`;
};

export const LEADS: Lead[] = [
  {
    id: "ant-001",
    name: "Lara Sunset Boutique",
    type: "Boutique Hotel",
    city: "Antalya",
    region: "Akdeniz",
    contactName: "Mehmet Yılmaz",
    phone: turkishPhone(12001),
    instagram: "larasunset.boutique",
    website: "larasunset.com.tr",
    units: 22,
    pricePerNight: 4200,
    occupancy30d: 0.86,
    rating: 4.7,
    channels: ["Booking", "Airbnb"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 312,
    daysSinceLastReview: 1,
    daysOnPlatform: 1450,
    signals: ["High season pricing", "Sold out next 2 weekends"],
  },
  {
    id: "bod-002",
    name: "Bodrum Bay Villas",
    type: "Villa",
    city: "Bodrum",
    region: "Ege",
    contactName: "Ayşe Demir",
    phone: turkishPhone(12302),
    instagram: "bodrumbayvillas",
    units: 6,
    pricePerNight: 18500,
    occupancy30d: 0.74,
    rating: 4.9,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 88,
    daysSinceLastReview: 3,
    daysOnPlatform: 720,
    signals: ["Premium ADR", "No own website"],
  },
  {
    id: "kap-003",
    name: "Cappadocia Cave Suites",
    type: "Boutique Hotel",
    city: "Göreme",
    region: "Kapadokya",
    contactName: "Hasan Karaca",
    phone: turkishPhone(13003),
    instagram: "cappadociacavesuites",
    website: "cavesuites.com",
    units: 14,
    pricePerNight: 6800,
    occupancy30d: 0.91,
    rating: 4.8,
    channels: ["Booking", "Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 540,
    daysSinceLastReview: 0,
    daysOnPlatform: 2100,
    signals: ["High occupancy", "Booking #1 in district"],
  },
  {
    id: "alc-004",
    name: "Alaçatı Taş Konak",
    type: "Boutique Hotel",
    city: "Alaçatı",
    region: "Ege",
    contactName: "Selin Aksoy",
    phone: turkishPhone(13404),
    instagram: "alacatitaskonak",
    units: 9,
    pricePerNight: 7400,
    occupancy30d: 0.68,
    rating: 4.6,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 204,
    daysSinceLastReview: 2,
    daysOnPlatform: 980,
    signals: ["Single channel only", "No own website"],
  },
  {
    id: "fet-005",
    name: "Kayaköy Stone Pension",
    type: "Pension",
    city: "Fethiye",
    region: "Akdeniz",
    contactName: "Emre Şahin",
    phone: turkishPhone(13705),
    units: 8,
    pricePerNight: 1900,
    occupancy30d: 0.55,
    rating: 4.4,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: false,
    reviewsCount: 41,
    daysSinceLastReview: 14,
    daysOnPlatform: 410,
    signals: ["Low online presence", "No Instagram"],
  },
  {
    id: "kas-006",
    name: "Kaş Cliffside Villa",
    type: "Villa",
    city: "Kaş",
    region: "Akdeniz",
    contactName: "Can Öztürk",
    phone: turkishPhone(14006),
    instagram: "kascliffside",
    website: "kascliffside.com",
    units: 1,
    pricePerNight: 14500,
    occupancy30d: 0.62,
    rating: 4.9,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 67,
    daysSinceLastReview: 5,
    daysOnPlatform: 540,
    signals: ["High ADR", "Repeat guest signals"],
  },
  {
    id: "sap-007",
    name: "Sapanca Forest Bungalows",
    type: "Bungalow",
    city: "Sapanca",
    region: "Marmara",
    contactName: "Burcu Aydın",
    phone: turkishPhone(14307),
    instagram: "sapancaforestbungalow",
    units: 12,
    pricePerNight: 3400,
    occupancy30d: 0.81,
    rating: 4.5,
    channels: ["Booking", "Tatilsepeti"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 189,
    daysSinceLastReview: 1,
    daysOnPlatform: 870,
    signals: ["Trending category", "No own website"],
  },
  {
    id: "abn-008",
    name: "Abant Pine Bungalov",
    type: "Bungalow",
    city: "Abant",
    region: "Karadeniz",
    contactName: "Onur Çelik",
    phone: turkishPhone(14608),
    units: 10,
    pricePerNight: 2800,
    occupancy30d: 0.58,
    rating: 4.3,
    channels: ["Tatilsepeti"],
    hasOwnWebsite: false,
    hasInstagram: false,
    reviewsCount: 73,
    daysSinceLastReview: 9,
    daysOnPlatform: 320,
    signals: ["Single channel only", "No Instagram"],
  },
  {
    id: "ole-009",
    name: "Olympos Treehouse Camp",
    type: "Bungalow",
    city: "Olympos",
    region: "Akdeniz",
    contactName: "Deniz Kara",
    phone: turkishPhone(14909),
    instagram: "olympostreehouse",
    units: 18,
    pricePerNight: 1600,
    occupancy30d: 0.77,
    rating: 4.6,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 412,
    daysSinceLastReview: 0,
    daysOnPlatform: 2800,
    signals: ["Backpacker favorite", "High review velocity"],
  },
  {
    id: "ist-010",
    name: "Galata Heritage Hotel",
    type: "Hotel",
    city: "İstanbul",
    region: "Marmara",
    contactName: "Zeynep Polat",
    phone: turkishPhone(15010),
    instagram: "galataheritage",
    website: "galataheritage.com",
    units: 48,
    pricePerNight: 5200,
    occupancy30d: 0.72,
    rating: 4.4,
    channels: ["Booking", "Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 1280,
    daysSinceLastReview: 0,
    daysOnPlatform: 3200,
    signals: ["High volume", "Stable bookings"],
  },
  {
    id: "ces-011",
    name: "Çeşme Marina Suites",
    type: "Boutique Hotel",
    city: "Çeşme",
    region: "Ege",
    contactName: "Elif Tunç",
    phone: turkishPhone(15311),
    instagram: "cesmemarinasuites",
    units: 16,
    pricePerNight: 6900,
    occupancy30d: 0.79,
    rating: 4.5,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 145,
    daysSinceLastReview: 2,
    daysOnPlatform: 610,
    signals: ["Fast-growing region", "No own website"],
  },
  {
    id: "kal-012",
    name: "Kalkan Sea View Villa",
    type: "Villa",
    city: "Kalkan",
    region: "Akdeniz",
    contactName: "Murat Eren",
    phone: turkishPhone(15612),
    instagram: "kalkanseaviewvilla",
    website: "kalkanseaview.com",
    units: 1,
    pricePerNight: 22000,
    occupancy30d: 0.69,
    rating: 5.0,
    channels: ["Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 38,
    daysSinceLastReview: 4,
    daysOnPlatform: 410,
    signals: ["Direct-only", "5.0 rating"],
  },
  {
    id: "sir-013",
    name: "Şirince Bağ Evi",
    type: "Pension",
    city: "Şirince",
    region: "Ege",
    contactName: "Hülya Arslan",
    phone: turkishPhone(15913),
    instagram: "sirincebagevi",
    units: 5,
    pricePerNight: 2200,
    occupancy30d: 0.49,
    rating: 4.5,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 62,
    daysSinceLastReview: 11,
    daysOnPlatform: 380,
    signals: ["Low channel count", "Soft season"],
  },
  {
    id: "ayv-014",
    name: "Ayvalık Cunda Konak",
    type: "Pension",
    city: "Ayvalık",
    region: "Ege",
    contactName: "Tolga Bilgin",
    phone: turkishPhone(16214),
    instagram: "cundakonakayvalik",
    units: 7,
    pricePerNight: 2600,
    occupancy30d: 0.63,
    rating: 4.6,
    channels: ["Booking", "Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 98,
    daysSinceLastReview: 3,
    daysOnPlatform: 720,
    signals: ["Tasteful brand", "No own website"],
  },
  {
    id: "fet-015",
    name: "Ölüdeniz Beach Hotel",
    type: "Hotel",
    city: "Ölüdeniz",
    region: "Akdeniz",
    contactName: "Sinem Doğan",
    phone: turkishPhone(16515),
    instagram: "oludenizbeachhotel",
    website: "oludenizbeachhotel.com",
    units: 64,
    pricePerNight: 3900,
    occupancy30d: 0.83,
    rating: 4.3,
    channels: ["Booking", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 920,
    daysSinceLastReview: 0,
    daysOnPlatform: 4100,
    signals: ["Established", "High volume"],
  },
  {
    id: "dat-016",
    name: "Datça Olive Bungalows",
    type: "Bungalow",
    city: "Datça",
    region: "Ege",
    contactName: "Cem Bulut",
    phone: turkishPhone(16816),
    instagram: "datcaolivebungalow",
    units: 9,
    pricePerNight: 2400,
    occupancy30d: 0.71,
    rating: 4.7,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 112,
    daysSinceLastReview: 1,
    daysOnPlatform: 540,
    signals: ["Single channel only", "No own website"],
  },
  {
    id: "ass-017",
    name: "Assos Stone Hotel",
    type: "Boutique Hotel",
    city: "Assos",
    region: "Ege",
    contactName: "Yasemin Koç",
    phone: turkishPhone(17117),
    instagram: "assosstonehotel",
    website: "assosstonehotel.com",
    units: 20,
    pricePerNight: 4400,
    occupancy30d: 0.66,
    rating: 4.4,
    channels: ["Booking", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 256,
    daysSinceLastReview: 6,
    daysOnPlatform: 1700,
    signals: ["Quiet shoulder season"],
  },
  {
    id: "uzu-018",
    name: "Uzungöl Wooden Villas",
    type: "Villa",
    city: "Uzungöl",
    region: "Karadeniz",
    contactName: "Halil Yıldız",
    phone: turkishPhone(17418),
    instagram: "uzungolwoodenvillas",
    units: 4,
    pricePerNight: 4900,
    occupancy30d: 0.58,
    rating: 4.5,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 71,
    daysSinceLastReview: 7,
    daysOnPlatform: 480,
    signals: ["Single channel only", "GCC inbound trend"],
  },
  {
    id: "agv-019",
    name: "Ağva Riverside Bungalow",
    type: "Bungalow",
    city: "Ağva",
    region: "Marmara",
    contactName: "Pelin Aslan",
    phone: turkishPhone(17719),
    instagram: "agvariverside",
    units: 11,
    pricePerNight: 3100,
    occupancy30d: 0.74,
    rating: 4.4,
    channels: ["Airbnb", "Tatilsepeti"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 158,
    daysSinceLastReview: 2,
    daysOnPlatform: 690,
    signals: ["Weekend demand from İstanbul"],
  },
  {
    id: "izm-020",
    name: "Karşıyaka City Hotel",
    type: "Hotel",
    city: "İzmir",
    region: "Ege",
    contactName: "Burak Tezcan",
    phone: turkishPhone(18020),
    website: "karsiyakacityhotel.com",
    units: 52,
    pricePerNight: 2200,
    occupancy30d: 0.61,
    rating: 4.1,
    channels: ["Booking"],
    hasOwnWebsite: true,
    hasInstagram: false,
    reviewsCount: 430,
    daysSinceLastReview: 1,
    daysOnPlatform: 2900,
    signals: ["No Instagram", "Single channel"],
  },
  {
    id: "tra-021",
    name: "Trabzon Taş Pansiyon",
    type: "Pension",
    city: "Trabzon",
    region: "Karadeniz",
    contactName: "Esra Güneş",
    phone: turkishPhone(18321),
    instagram: "trabzontaspansiyon",
    units: 6,
    pricePerNight: 1500,
    occupancy30d: 0.64,
    rating: 4.5,
    channels: ["Booking", "Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 87,
    daysSinceLastReview: 4,
    daysOnPlatform: 510,
    signals: ["Arabic-speaking demand"],
  },
  {
    id: "mar-022",
    name: "Marmaris Adaköy Villa",
    type: "Villa",
    city: "Marmaris",
    region: "Ege",
    contactName: "Kerem Yıldırım",
    phone: turkishPhone(18622),
    instagram: "adakoyvilla",
    website: "adakoyvilla.com",
    units: 1,
    pricePerNight: 11000,
    occupancy30d: 0.55,
    rating: 4.7,
    channels: ["Direct", "Airbnb"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 44,
    daysSinceLastReview: 8,
    daysOnPlatform: 360,
    signals: ["Premium villa segment"],
  },
  {
    id: "boz-023",
    name: "Bozcaada Vine Pension",
    type: "Pension",
    city: "Bozcaada",
    region: "Ege",
    contactName: "Defne Yalçın",
    phone: turkishPhone(18923),
    instagram: "bozcaadavine",
    units: 8,
    pricePerNight: 3300,
    occupancy30d: 0.72,
    rating: 4.7,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 132,
    daysSinceLastReview: 1,
    daysOnPlatform: 800,
    signals: ["Hot island summer", "No own website"],
  },
  {
    id: "akc-024",
    name: "Akçakoca Coast Hotel",
    type: "Hotel",
    city: "Akçakoca",
    region: "Karadeniz",
    contactName: "Volkan Aksu",
    phone: turkishPhone(19224),
    units: 38,
    pricePerNight: 1700,
    occupancy30d: 0.45,
    rating: 4.0,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: false,
    reviewsCount: 220,
    daysSinceLastReview: 12,
    daysOnPlatform: 1900,
    signals: ["Low online presence", "Single channel"],
  },
  {
    id: "ese-025",
    name: "Eskişehir Odunpazarı Konak",
    type: "Boutique Hotel",
    city: "Eskişehir",
    region: "İç Anadolu",
    contactName: "Berke Şener",
    phone: turkishPhone(19525),
    instagram: "odunpazarikonak",
    website: "odunpazarikonak.com",
    units: 11,
    pricePerNight: 2600,
    occupancy30d: 0.74,
    rating: 4.6,
    channels: ["Booking", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 184,
    daysSinceLastReview: 0,
    daysOnPlatform: 1100,
    signals: ["Weekend city break demand"],
  },
  {
    id: "sap-026",
    name: "Saklıkent Mountain Bungalow",
    type: "Bungalow",
    city: "Saklıkent",
    region: "Akdeniz",
    contactName: "Aslı Korkmaz",
    phone: turkishPhone(19826),
    instagram: "saklikentbungalow",
    units: 7,
    pricePerNight: 2700,
    occupancy30d: 0.6,
    rating: 4.4,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 53,
    daysSinceLastReview: 5,
    daysOnPlatform: 360,
    signals: ["Single channel only"],
  },
  {
    id: "akb-027",
    name: "Akbük Bay Hotel",
    type: "Hotel",
    city: "Didim",
    region: "Ege",
    contactName: "İlker Doğru",
    phone: turkishPhone(20127),
    website: "akbukbayhotel.com",
    units: 44,
    pricePerNight: 2900,
    occupancy30d: 0.7,
    rating: 4.2,
    channels: ["Booking"],
    hasOwnWebsite: true,
    hasInstagram: false,
    reviewsCount: 615,
    daysSinceLastReview: 1,
    daysOnPlatform: 2400,
    signals: ["No Instagram", "Stable demand"],
  },
  {
    id: "nev-028",
    name: "Uçhisar Stone Suites",
    type: "Boutique Hotel",
    city: "Uçhisar",
    region: "Kapadokya",
    contactName: "Tuğçe Şimşek",
    phone: turkishPhone(20428),
    instagram: "uchisarstonesuites",
    website: "uchisarstone.com",
    units: 12,
    pricePerNight: 7200,
    occupancy30d: 0.88,
    rating: 4.8,
    channels: ["Booking", "Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 388,
    daysSinceLastReview: 0,
    daysOnPlatform: 1850,
    signals: ["Premium ADR", "High occupancy"],
  },
  {
    id: "gum-029",
    name: "Gümüşlük Marina Pension",
    type: "Pension",
    city: "Gümüşlük",
    region: "Ege",
    contactName: "Naz Erden",
    phone: turkishPhone(20729),
    instagram: "gumuslukmarinapansiyon",
    units: 6,
    pricePerNight: 3000,
    occupancy30d: 0.66,
    rating: 4.6,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 79,
    daysSinceLastReview: 2,
    daysOnPlatform: 470,
    signals: ["Single channel only"],
  },
  {
    id: "alc-030",
    name: "Alaçatı Wind Villas",
    type: "Villa",
    city: "Alaçatı",
    region: "Ege",
    contactName: "Yiğit Bayar",
    phone: turkishPhone(21030),
    instagram: "alacatiwindvillas",
    units: 3,
    pricePerNight: 16500,
    occupancy30d: 0.78,
    rating: 4.9,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 71,
    daysSinceLastReview: 1,
    daysOnPlatform: 530,
    signals: ["Premium ADR", "No own website"],
  },
];

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

type BusinessTier = NonNullable<ScoredLead["businessTier"]>;

type LeadScoreV3Breakdown = {
  leadScore: number;
  businessTier: BusinessTier;
  opportunityScore: number;
  outreachFit: number;
  digitalMaturity: number;
  communicationRisk: number;
  reasons: string[];
};

const SCORE_V3 = {
  tier: {
    micro: { weight: 0.55, base: 18 },
    small: { weight: 0.8, base: 42 },
    medium: { weight: 1.0, base: 62 },
    premium: { weight: 1.1, base: 74 },
    enterprise: { weight: 0.35, base: 40 }, // future stage penalty via weight
  },
  weights: {
    opportunity: 0.42,
    outreachFit: 0.2,
    activity: 0.2,
    digitalWeakness: 0.18,
  },
} as const;

function calculateBusinessTier(l: Lead): BusinessTier {
  const units = typeof l.units === "number" && Number.isFinite(l.units) ? l.units : 0;
  // Enterprise / chain is explicitly de-prioritized for current stage.
  if (units >= 140) return "enterprise";

  // Premium independent often sits in the 60–120 range, or smaller but high-ADR boutique/resort-like.
  const highAdr = typeof l.pricePerNight === "number" && l.pricePerNight >= 9000;
  if (units >= 60) return "premium";
  if (units >= 20 && units <= 120 && (highAdr || l.type === "Boutique Hotel")) return "medium";

  if (units >= 20) return "medium";
  if (units >= 6) return "small";
  return "micro";
}

function scoreOutreachFit(l: Lead, contactQuality: ContactQuality): { score: number; notes: string[] } {
  const notes: string[] = [];
  let s = 0;
  const hasWhatsapp = normalizePhoneForWhatsApp(l.phone) !== null;
  const hasInstagram = Boolean(l.instagram?.trim()) || Boolean(l.hasInstagram);
  const hasWebsite = Boolean(l.website?.trim()) || Boolean(l.hasOwnWebsite);

  if (hasWhatsapp) {
    s += 55;
    notes.push("WhatsApp reachable");
  } else if (contactQuality !== "low") {
    s += 18;
  }
  // Instagram is a primary TUGOBO entry channel — weighted higher than generic social presence.
  if (hasInstagram) s += 26;
  if (hasWebsite) s += 12;
  // Both Instagram + WhatsApp = centralized multi-channel inbound, highest TUGOBO value.
  if (hasInstagram && hasWhatsapp) { s += 6; notes.push("Instagram + WhatsApp aktif"); }

  if (contactQuality === "low") {
    s -= 28;
    notes.push("Low contact quality");
  }
  if (!hasWhatsapp && !hasInstagram) {
    s = Math.min(s, 22);
    notes.push("No instant channel");
  }
  return { score: Math.round(clamp(s)), notes };
}

function scoreCommunicationRisk(l: Lead, signals: BusinessSignal[]): number {
  let s = 0;
  if (signals.includes("reputation_risk")) s += 55;
  if (signals.includes("review_recency_stale")) s += 12;
  // Low ratings with meaningful volume is a “risk” input; not a blanket penalty.
  if (l.rating > 0 && l.rating < 4.25 && l.reviewsCount >= 25) s += 18;
  return Math.round(clamp(s));
}

function buildSocialSignalText(l: Pick<Lead, "instagram" | "website">): string {
  const raw = [l.instagram, l.website].filter(Boolean).join("\n");
  return raw.toLowerCase();
}

function scoreOpportunityFromSignals(
  tier: BusinessTier,
  signals: BusinessSignal[],
  outreachFit: number,
  digitalMaturity: number,
  acquisitionProfile?: AcquisitionIntelligenceProfile,
  commercialReadiness?: CommercialReadiness,
): { score: number; notes: string[] } {
  const notes: string[] = [];
  const set = new Set(signals);
  let raw = SCORE_V3.tier[tier].base;

  if (set.has("conversion_gap")) {
    raw += 18;
    notes.push("Conversion gap");
  }
  if (set.has("ota_dependency")) {
    raw += 16;
    notes.push("OTA dependency");
  }
  if (set.has("single_channel_risk")) raw += 8;
  if (set.has("missing_own_website")) raw += 10;
  if (set.has("premium_without_owned_funnel")) raw += 12;

  if (set.has("social_acquisition_intent")) {
    raw += 14;
    notes.push("Social acquisition intent");
  }
  if (set.has("paid_traffic_candidate")) {
    raw += 10;
    notes.push("Paid traffic candidate");
  }

  // ICP alignment: Instagram + high social demand = strong TUGOBO operational fit.
  // A hotel actively managing DMs is exactly the pilot profile.
  if (set.has("social_acquisition_intent") && outreachFit >= 60) {
    raw += 6;
    notes.push("High-demand social inbound — TUGOBO fit");
  }

  // Digital weakness creates consultative upside, but only if the lead is reachable.
  const weakness = clamp(100 - digitalMaturity, 0, 100);
  raw += weakness * 0.12;
  raw += outreachFit * 0.18;

  // Enterprise too early: reduce by weight rather than zeroing out.
  raw *= SCORE_V3.tier[tier].weight;

  const baseOpp = Math.round(clamp(raw));
  const acqAdj = acquisitionProfile
    ? calculateAcquisitionOpportunityAdjustment(acquisitionProfile, set)
    : 0;
  let commercialAdj = 0;
  if (commercialReadiness) {
    if (
      commercialReadiness.commercialReadinessLevel === "very_high" &&
      set.has("conversion_gap")
    ) {
      commercialAdj += 3;
    } else if (
      commercialReadiness.commercialReadinessLevel === "high" &&
      (set.has("conversion_gap") || set.has("social_acquisition_intent"))
    ) {
      commercialAdj += 2;
    } else if (commercialReadiness.commercialReadinessLevel === "low") {
      commercialAdj -= 2;
    }
  }
  const score = Math.round(clamp(baseOpp + acqAdj + commercialAdj));
  if (acqAdj >= 4) notes.push("Acquisition intent vs. conversion path");
  if (acqAdj <= -2) notes.push("Limited acquisition activity");
  if (commercialAdj >= 2) notes.push("Commercial readiness supports ROI adoption");
  if (commercialAdj <= -1) notes.push("Commercial readiness is early-stage");

  return { score, notes };
}

export function calculateLeadScoreV3(l: Lead): LeadScoreV3Breakdown {
  const contactQuality = getContactQuality(l.phone);
  const tier = calculateBusinessTier(l);

  const hasWhatsAppPath = normalizePhoneForWhatsApp(l.phone) !== null;
  const enrichment = buildEnrichmentV2Profile({
    hasOwnWebsite: l.hasOwnWebsite || Boolean(l.website?.trim()),
    hasInstagram: l.hasInstagram || Boolean(l.instagram?.trim()),
    website: l.website,
    instagramHandle: l.instagram,
    socialSignalText: buildSocialSignalText(l),
    channels: l.channels,
    rating: l.rating,
    reviewsCount: l.reviewsCount,
    daysSinceLastReview: l.daysSinceLastReview,
    occupancy30d: l.occupancy30d,
    contactQuality,
    hasWhatsAppPath,
    phoneMissing: !l.phone?.trim(),
    listingPhone: l.phone,
    businessTier: tier,
    businessName: l.name,
    city: l.city,
    type: l.type,
  });
  const intel = buildExtractedSignals({
    hasOwnWebsite: l.hasOwnWebsite,
    hasInstagram: l.hasInstagram,
    channels: l.channels,
    rating: l.rating,
    reviewsCount: l.reviewsCount,
    daysSinceLastReview: l.daysSinceLastReview,
    units: l.units,
    pricePerNight: l.pricePerNight,
    occupancy30d: l.occupancy30d,
    contactQuality,
    hasWhatsAppPath,
    phoneMissing: !l.phone?.trim(),
    enrichment,
  });

  const outreach = scoreOutreachFit(l, contactQuality);
  const digitalMaturity = enrichment.digitalMaturity;
  const activity = enrichment.operationalActivity;
  const communicationRisk = scoreCommunicationRisk(l, intel.signals);
  const opp = scoreOpportunityFromSignals(
    tier,
    intel.signals,
    outreach.score,
    digitalMaturity,
    enrichment.acquisitionIntelligence,
    enrichment.commercialReadiness,
  );

  const digitalWeakness = clamp(100 - digitalMaturity, 0, 100);

  const leadScore =
    opp.score * SCORE_V3.weights.opportunity +
    outreach.score * SCORE_V3.weights.outreachFit +
    activity * SCORE_V3.weights.activity +
    digitalWeakness * SCORE_V3.weights.digitalWeakness;

  const reasons = [
    ...(opp.notes.length > 0 ? opp.notes : []),
    ...(outreach.notes.length > 0 ? outreach.notes : []),
    tier === "medium" ? "Medium tier (ROI fit)" : tier === "premium" ? "Premium independent tier" : null,
    activity >= 70 ? "Operationally active" : null,
  ].filter((x): x is string => Boolean(x));

  return {
    leadScore: Math.round(clamp(leadScore)),
    businessTier: tier,
    opportunityScore: opp.score,
    outreachFit: outreach.score,
    digitalMaturity,
    communicationRisk,
    reasons: reasons.slice(0, 5),
  };
}

/**
 * leadScore = long-term fit / revenue potential.
 * Considers ADR, units, rating, occupancy, presence breadth.
 */
export function scoreLead(l: Lead): { score: number; reasons: string[] } {
  const v3 = calculateLeadScoreV3(l);
  return { score: v3.leadScore, reasons: v3.reasons.slice(0, 4) };
}

/**
 * hotScore = how worth contacting *today*.
 * Considers recency, gaps in setup, momentum, missing distribution.
 */
export function scoreHot(l: Lead): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let s = 30;

  if (l.daysSinceLastReview <= 1) {
    s += 18;
    reasons.push("New review today");
  } else if (l.daysSinceLastReview <= 3) {
    s += 10;
    reasons.push("Recent review");
  }

  if (l.occupancy30d >= 0.85) {
    s += 14;
    reasons.push("Selling out");
  } else if (l.occupancy30d >= 0.7) {
    s += 8;
  }

  if (!l.hasOwnWebsite) {
    s += 12;
    reasons.push("Needs own website");
  }
  if (l.channels.length <= 1) {
    s += 10;
    reasons.push("Channel diversification");
  }
  if (l.pricePerNight >= 8000 && !l.hasOwnWebsite) {
    s += 6;
    reasons.push("Premium leaking margin");
  }
  if (l.daysOnPlatform >= 365 && l.daysOnPlatform <= 1500 && l.rating >= 4.5) {
    s += 6;
    reasons.push("Sweet-spot maturity");
  }
  if (!l.hasInstagram && l.units >= 8) {
    s += 6;
    reasons.push("Missing social presence");
  }
  if (l.daysSinceLastReview >= 10) {
    s -= 6;
  }

  // small daily jitter that is stable per id
  let h = 0;
  for (let i = 0; i < l.id.length; i++) h = (h * 31 + l.id.charCodeAt(i)) | 0;
  const today = new Date();
  const day = today.getUTCFullYear() * 1000 + today.getUTCMonth() * 31 + today.getUTCDate();
  const jitter = Math.abs((h ^ day) % 7) - 3; // -3..+3
  s += jitter;

  return { score: Math.round(clamp(s)), reasons: reasons.slice(0, 4) };
}

/** Turkish national patterns after stripping IDD/country code: 05… mobile, 02/03… landline. */
export type TurkishPhoneKind = "mobile" | "landline" | "unknown";

export function getTurkishPhoneKind(phone: string): TurkishPhoneKind {
  const trimmed = phone.trim();
  if (!trimmed) return "unknown";

  let d = trimmed.replace(/\D/g, "");
  if (!d) return "unknown";

  while (d.startsWith("00") && d.length > 2) {
    d = d.slice(2);
  }
  if (d.startsWith("90") && d.length > 2) {
    d = d.slice(2);
  }

  if (d.startsWith("05")) return "mobile";
  if (d.startsWith("02") || d.startsWith("03")) return "landline";

  if (d.length === 10 && d.startsWith("5")) return "mobile";
  if (d.length === 10 && (d.startsWith("2") || d.startsWith("3"))) {
    return "landline";
  }
  if (d.length === 11 && d.startsWith("0")) {
    if (d[1] === "5") return "mobile";
    if (d[1] === "2" || d[1] === "3") return "landline";
  }

  return "unknown";
}

/** landline → low; mobile without wa.me → medium; mobile with working WhatsApp → high. */
export function getContactQuality(phone: string): ContactQuality {
  const kind = getTurkishPhoneKind(phone);
  if (kind === "landline") return "low";
  if (kind !== "mobile") return "low";
  if (normalizePhoneForWhatsApp(phone) !== null) return "high";
  return "medium";
}

export function computeContactReadinessScore(
  lead: Pick<
    Lead,
    "phone" | "website" | "instagram" | "daysSinceLastReview" | "whatsappInvalid"
  > & { hotScore: number },
  contactQuality?: ContactQuality,
  extras?: {
    hasPhone?: boolean;
    hasEmail?: boolean;
    contactVerified?: boolean;
  },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const hasWhatsapp = normalizePhoneForWhatsApp(lead.phone) !== null;
  const hasWebsite = Boolean(lead.website?.trim());
  const hasInstagram = Boolean(lead.instagram?.trim());
  const hasPhone = extras?.hasPhone ?? Boolean(lead.phone?.trim());
  const hasEmail = Boolean(extras?.hasEmail);
  const contactVerified = Boolean(extras?.contactVerified);
  const hasRecentReview =
    typeof lead.daysSinceLastReview === "number" && lead.daysSinceLastReview <= 7;
  const hotEnough = typeof lead.hotScore === "number" && lead.hotScore >= 60;
  const isWhatsappInvalid = Boolean(lead.whatsappInvalid);
  const quality = contactQuality ?? getContactQuality(lead.phone);

  if (hasWhatsapp) {
    score += 40;
    reasons.push("WhatsApp available");
  }
  if (hasWebsite) {
    score += 20;
    reasons.push("Website available");
  }
  if (hasInstagram) {
    score += 18;
    reasons.push("Instagram available");
  }
  if (hasPhone) {
    score += 12;
    reasons.push("Phone available");
  }
  if (hasEmail) {
    score += 12;
    reasons.push("Email available");
  }
  if (contactVerified) {
    score += 10;
    reasons.push("Contact verified");
  }
  if (hasRecentReview) {
    score += 8;
    reasons.push("Recent review activity");
  }
  if (hotEnough) {
    score += 8;
    reasons.push("High hot score");
  }

  if (isWhatsappInvalid) score -= 40;
  if (!hasWebsite) score -= 18;
  if (!hasInstagram || quality === "low") score -= 18;
  if (!hasPhone && !hasEmail) score -= 20;

  // Hard cap if both primary instant channels are missing.
  if (!hasWhatsapp && !hasInstagram) {
    score = Math.min(score, 20);
  }

  return { score: Math.round(clamp(score)), reasons };
}

export function toLeadForAiInsight(s: ScoredLead): LeadForAiInsight {
  const hasWhatsAppPath = normalizePhoneForWhatsApp(s.phone) !== null;
  const v = s.signalVerification;
  // signalVerification is the authoritative post-enrichment source; fall back to
  // legacy booleans when verification has not run yet (older persisted leads).
  const hasOwnWebsite =
    Boolean(s.hasOwnWebsite) ||
    Boolean(s.website?.trim()) ||
    Boolean(s.websiteCandidateUrl?.trim()) ||
    v?.websiteVerification === "verified" ||
    v?.websiteVerification === "reachable";
  const hasInstagram =
    Boolean(s.hasInstagram) ||
    Boolean(s.instagram?.trim()) ||
    v?.instagramVerification === "verified" ||
    v?.instagramVerification === "likely";
  const whatsappConfidence: WhatsAppConfidence | undefined =
    v?.whatsappVerification === "verified"
      ? "confirmed"
      : v?.whatsappVerification === "likely" &&
          s.whatsappConfidence !== "confirmed"
        ? "likely"
        : s.whatsappConfidence;
  return {
    businessSignals: s.businessSignals,
    reviewPainPoints: s.reviewPainPoints?.map((p) => ({
      category: p.category,
      severity: p.severity,
      summary: p.summary,
    })),
    websiteIntelligence: s.websiteIntelligence,
    heuristicOutreachAngle: s.heuristicOutreachAngle,
    hotScore:
      typeof s.hotScore === "number" && Number.isFinite(s.hotScore)
        ? s.hotScore
        : 0,
    leadScore:
      typeof s.leadScore === "number" && Number.isFinite(s.leadScore)
        ? s.leadScore
        : 0,
    intelligenceScore: s.intelligenceScore,
    smartLeadScoreV2: s.smartLeadScoreV2,
    reviewIntelligenceScore: s.reviewIntelligenceScore,
    contactQuality:
      s.contactQuality === "high" ||
      s.contactQuality === "medium" ||
      s.contactQuality === "low"
        ? s.contactQuality
        : getContactQuality(s.phone),
    hasWhatsAppPath,
    hasInstagram,
    hasOwnWebsite,
    channels: s.channels ?? [],
    outreachIntelligence: s.outreachIntelligence,
    whatsappConfidence,
  };
}

function attachStructuredIntelligence(s: ScoredLead): ScoredLead {
  const hasWhatsAppPath = normalizePhoneForWhatsApp(s.phone) !== null;
  const tier = s.businessTier ?? calculateBusinessTier(s);
  // Resolve the authoritative presence flags from signalVerification (post-enrichment
  // ground truth) before falling back to the legacy import-time booleans.
  const sv = s.signalVerification;
  const evHasWebsite =
    s.hasOwnWebsite ||
    Boolean(s.website?.trim()) ||
    Boolean(s.websiteCandidateUrl?.trim()) ||
    sv?.websiteVerification === "verified" ||
    sv?.websiteVerification === "reachable";
  const evHasInstagram =
    s.hasInstagram ||
    Boolean(s.instagram?.trim()) ||
    sv?.instagramVerification === "verified" ||
    sv?.instagramVerification === "likely";
  const evHasWhatsApp =
    hasWhatsAppPath || sv?.whatsappVerification === "verified";
  const evWebsite =
    s.website?.trim() ||
    ((sv?.websiteVerification === "verified" || sv?.websiteVerification === "reachable")
      ? sv?.websiteSourceUrl?.trim()
      : undefined) ||
    s.websiteCandidateUrl?.trim();
  const evReservationSignal =
    Boolean(s.hasReservationCTA) ||
    sv?.reservationSignal === "verified" ||
    sv?.reservationSignal === "detected";
  const enrichment = buildEnrichmentV2Profile({
    hasOwnWebsite: evHasWebsite,
    hasInstagram: evHasInstagram,
    website: evWebsite,
    instagramHandle: s.instagram,
    socialSignalText: buildSocialSignalText(s),
    channels: s.channels,
    rating: s.rating,
    reviewsCount: s.reviewsCount,
    daysSinceLastReview: s.daysSinceLastReview,
    occupancy30d: s.occupancy30d,
    contactQuality: s.contactQuality,
    hasWhatsAppPath,
    phoneMissing: !s.phone?.trim(),
    listingPhone: s.phone,
    websiteIntelligence: s.websiteIntelligence,
    businessTier: tier,
    businessName: s.name,
    city: s.city,
    type: s.type,
  });
  const intel = buildExtractedSignals({
    hasOwnWebsite: evHasWebsite,
    hasInstagram: evHasInstagram,
    channels: s.channels,
    rating: s.rating,
    reviewsCount: s.reviewsCount,
    daysSinceLastReview: s.daysSinceLastReview,
    units: s.units,
    pricePerNight: s.pricePerNight,
    occupancy30d: s.occupancy30d,
    contactQuality: s.contactQuality,
    hasWhatsAppPath,
    phoneMissing: !s.phone?.trim(),
    enrichment,
  });
  const base: ScoredLead = {
    ...s,
    // Promote the authoritative resolved URL into the canonical website field so that
    // all downstream UI (sidebar link, Contact Finder gate) sees a non-empty value
    // for leads whose website was discovered post-import via signalVerification.
    website: evWebsite ?? s.website,
    hasOwnWebsite: evHasWebsite,
    digitalMaturity: enrichment.digitalMaturity,
    bookingFlowStrength: enrichment.bookingFlowStrength,
    otaDependencyLikelihood: enrichment.otaDependencyLikelihood,
    socialDemandStrength: enrichment.socialDemandStrength,
    communicationHealth: enrichment.communicationHealth,
    operationalActivity: enrichment.operationalActivity,
    businessSignals: intel.signals,
    whyThisLead: intel.whyThisLead,
    heuristicOutreachAngle: intel.heuristicOutreachAngle,
    intelligenceScore: intel.intelligenceScore,
    acquisitionIntelligence: enrichment.acquisitionIntelligence,
    commercialReadiness: enrichment.commercialReadiness,
    websiteConfidence: enrichment.acquisitionIntelligence.websiteConfidence,
    instagramConfidence: enrichment.acquisitionIntelligence.instagramConfidence,
    whatsappConfidence: enrichment.acquisitionIntelligence.whatsappConfidence,
    whatsappSignals: [...(enrichment.acquisitionIntelligence.whatsappSignals ?? [])],
    otaConfidence: enrichment.acquisitionIntelligence.otaConfidence,
    adsLikelihood: enrichment.acquisitionIntelligence.adsLikelihood,
    directBookingMaturity: enrichment.acquisitionIntelligence.directBookingMaturity,
    conversionMaturity: enrichment.acquisitionIntelligence.conversionMaturity,
    acquisitionMaturity: enrichment.acquisitionIntelligence.acquisitionMaturity,
  };
  const ai = generateLeadInsight(toLeadForAiInsight(base), "rules");
  const withAi: ScoredLead = {
    ...base,
    aiInsight: ai.aiInsight,
    outreachAngle: ai.outreachAngle,
    painPointSummary: ai.painPointSummary,
    opportunityLevel: ai.opportunityLevel,
    aiInsightSource: ai.source,
  };

  const conversionLeak = calculateConversionLeak({
    channels: withAi.channels ?? [],
    hasOwnWebsite: evHasWebsite,
    hasInstagram: evHasInstagram,
    hasWhatsAppPath: evHasWhatsApp,
    bookingFlowStrength: enrichment.bookingFlowStrength,
    otaDependencyLikelihood: enrichment.otaDependencyLikelihood,
    socialDemandStrength: enrichment.socialDemandStrength,
    operationalActivity: enrichment.operationalActivity,
    digitalMaturity: enrichment.digitalMaturity,
    reviewsCount: withAi.reviewsCount,
    daysSinceLastReview: withAi.daysSinceLastReview,
    communicationRisk: withAi.communicationRisk,
    websiteIntelligence: withAi.websiteIntelligence,
    businessSignals: new Set(withAi.businessSignals ?? []),
    reviewPainPoints: withAi.reviewPainPoints,
    acquisitionIntelligence: enrichment.acquisitionIntelligence,
  });

  const oppDelta = conversionLeakOpportunityDelta(
    conversionLeak,
    enrichment.acquisitionIntelligence,
  );
  const readiness = computeContactReadinessScore(
    {
      phone: withAi.phone,
      website: withAi.website,
      instagram: withAi.instagram,
      daysSinceLastReview: withAi.daysSinceLastReview,
      whatsappInvalid: withAi.whatsappInvalid,
      hotScore: withAi.hotScore,
    },
    withAi.contactQuality,
  );
  const opportunityProfile = calculateOpportunityProfile({
    acquisitionIntentScore: enrichment.acquisitionIntelligence.acquisition.acquisitionIntentScore,
    conversionLeakScore: conversionLeak.conversionLeakScore,
    commercialReadinessScore: enrichment.commercialReadiness.commercialReadinessScore,
    reachabilityScore: readiness.score,
    contactQuality: withAi.contactQuality,
    otaDependencyLikelihood: enrichment.otaDependencyLikelihood,
    hasWhatsAppPath,
    socialDemandStrength: enrichment.socialDemandStrength,
    bookingFlowStrength: enrichment.bookingFlowStrength,
    operationalActivity: enrichment.operationalActivity,
    intelligenceScore: withAi.intelligenceScore,
    businessSignals: withAi.businessSignals,
    acquisitionIntelligence: enrichment.acquisitionIntelligence,
    conversionLeak,
    commercialReadiness: enrichment.commercialReadiness,
    hasInstagram: evHasInstagram,
    hasOwnWebsite: evHasWebsite,
  });
  const newOpp = Math.round(clamp(opportunityProfile.opportunityScore + oppDelta, 0, 100));
  const opportunityLevel: OpportunityLevel =
    newOpp >= 80 ? "very_high" : newOpp >= 64 ? "high" : newOpp >= 42 ? "medium" : "low";
  const outreachFit = typeof withAi.outreachFit === "number" ? withAi.outreachFit : 0;
  const activity =
    typeof withAi.operationalActivity === "number"
      ? withAi.operationalActivity
      : enrichment.operationalActivity;
  const digitalMaturityNum =
    typeof withAi.digitalMaturity === "number" ? withAi.digitalMaturity : enrichment.digitalMaturity;
  const digitalWeakness = clamp(100 - digitalMaturityNum, 0, 100);
  const newLeadScore = Math.round(
    clamp(
      newOpp * SCORE_V3.weights.opportunity +
        outreachFit * SCORE_V3.weights.outreachFit +
        activity * SCORE_V3.weights.activity +
        digitalWeakness * SCORE_V3.weights.digitalWeakness,
    ),
  );

  const scored: ScoredLead = {
    ...withAi,
    opportunityScore: newOpp,
    opportunityLevel,
    leadScore: newLeadScore,
    smartLeadScoreV2: newLeadScore,
    conversionLeak,
    commercialReadiness: enrichment.commercialReadiness,
    opportunityProfile: {
      ...opportunityProfile,
      opportunityScore: newOpp,
      opportunityLevel,
    },
  };

  const icpAlignment = calculateIcpAlignment({
    units: scored.units,
    reviewsCount: scored.reviewsCount,
    daysSinceLastReview: scored.daysSinceLastReview,
    occupancy30d: scored.occupancy30d,
    pricePerNight: scored.pricePerNight,
    hasInstagram: evHasInstagram,
    hasOwnWebsite: evHasWebsite,
    hasWhatsAppPath: evHasWhatsApp,
    channels: scored.channels ?? [],
    bookingFlowStrength: enrichment.bookingFlowStrength,
    otaDependencyLikelihood: enrichment.otaDependencyLikelihood,
    digitalMaturity: enrichment.digitalMaturity,
    socialDemandStrength: enrichment.socialDemandStrength,
    operationalActivity: enrichment.operationalActivity,
    acquisitionIntelligence: enrichment.acquisitionIntelligence,
  });

  const outreachIntelligence = deriveOutreachIntelligence({
    businessTier: scored.businessTier,
    hasWhatsAppPath: evHasWhatsApp,
    hasInstagram: evHasInstagram,
    hasOwnWebsite: evHasWebsite,
    contactQuality: scored.contactQuality,
    channels: scored.channels ?? [],
    businessSignals: scored.businessSignals,
    reviewPainPoints: scored.reviewPainPoints?.map((p) => ({
      category: p.category,
      severity: p.severity,
    })),
    hotScore: scored.hotScore,
    leadScore: scored.leadScore,
    opportunityScore: scored.opportunityScore,
    opportunityLevel: scored.opportunityLevel,
    communicationRisk: scored.communicationRisk,
    intelligenceScore: scored.intelligenceScore,
    websiteIntelligence: scored.websiteIntelligence,
    units: scored.units,
    pricePerNight: scored.pricePerNight,
    bookingFlowStrength: enrichment.bookingFlowStrength,
    acquisitionIntelligence: enrichment.acquisitionIntelligence,
    commercialReadiness: enrichment.commercialReadiness,
    conversionLeak,
  });
  const outreachPriority = calculateOutreachPriority(
    {
      ...scored,
      outreachIntelligence,
    },
    Date.now(),
  );
  const priorityBucket = getPriorityBucket(
    {
      ...scored,
      outreachIntelligence,
    },
    outreachPriority,
    Date.now(),
  );
  const recommendedAction = getRecommendedAction(
    {
      ...scored,
      outreachIntelligence,
    },
    priorityBucket,
    outreachPriority,
    Date.now(),
  );
  // v1.3 verification layer: classification + ICP fit only — scores stay untouched.
  const ownership = detectBusinessOwnership(
    scored.name,
    scored.website ?? scored.websiteCandidateUrl ?? null,
  );
  const icpFitScore = calculateIcpFitScore({
    hasWebsite: evHasWebsite,
    hasInstagram: evHasInstagram,
    hasWhatsapp: evHasWhatsApp,
    reviewsCount: scored.reviewsCount,
    daysSinceLastReview: scored.daysSinceLastReview,
    hasReservationSignal: evReservationSignal,
    hasDirectContactPath: evHasWhatsApp || Boolean(scored.hasContactPage),
    channelCount: (scored.channels ?? []).length,
    otaPresence: (scored.channels ?? []).some(
      (c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti",
    ),
    verification: scored.signalVerification ?? null,
  });

  // v1.4 Verified Opportunity Score — unified sales ranking from existing signals.
  const opportunity = calculateVerifiedOpportunityScore({
    leadScore: scored.leadScore,
    hotScore: scored.hotScore,
    icpFitScore,
    digitalMaturity: digitalMaturityNum,
    multiChannelScore: icpAlignment.multiChannelScore,
    operationalComplexityScore: icpAlignment.operationalComplexityScore,
    estimatedDemandVolume: icpAlignment.estimatedDemandVolume,
    reviewsCount: scored.reviewsCount,
    daysSinceLastReview: scored.daysSinceLastReview,
    hasWhatsAppPath: evHasWhatsApp,
    businessOwnershipType: ownership.type,
    verification: scored.signalVerification ?? null,
  });

  return {
    ...scored,
    outreachIntelligence,
    outreachPriority,
    priorityBucket,
    recommendedAction,
    icpAlignment,
    businessOwnershipType: ownership.type,
    icpFitScore,
    verifiedOpportunityScore: opportunity.score,
    opportunityTier: opportunity.tier,
    opportunityReasons: opportunity.reasons,
  };
}

function hasFollowUpDue(lead: Pick<ScoredLead, "nextFollowUpAt">, now: number): boolean {
  if (typeof lead.nextFollowUpAt === "number" && Number.isFinite(lead.nextFollowUpAt)) {
    return lead.nextFollowUpAt <= now;
  }
  return false;
}

function wasContactedRecently(
  lead: Pick<ScoredLead, "lastContactedAt">,
  now: number,
): boolean {
  const last =
    typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0
      ? lead.lastContactedAt
      : null;
  if (last === null) return false;
  return now - last < 72 * 60 * 60 * 1000;
}

function importAgeDays(lead: Pick<ScoredLead, "lastImportedAt" | "createdAt">, now: number): number {
  const ts =
    typeof lead.lastImportedAt === "number" && Number.isFinite(lead.lastImportedAt)
      ? lead.lastImportedAt
      : typeof lead.createdAt === "number" && Number.isFinite(lead.createdAt)
        ? lead.createdAt
        : null;
  if (ts === null) return 999;
  return (now - ts) / (24 * 60 * 60 * 1000);
}

export function calculateOutreachPriority(lead: ScoredLead, now = Date.now()): number {
  let score = 45;
  const businessSignals = new Set(lead.businessSignals ?? []);
  const hasWhatsApp = normalizePhoneForWhatsApp(lead.phone) !== null && !lead.whatsappInvalid;
  const readiness = typeof lead.contactReadinessScore === "number" ? lead.contactReadinessScore : 0;
  const opportunity = typeof lead.opportunityScore === "number" ? lead.opportunityScore : 0;
  const operationalActivity = typeof lead.operationalActivity === "number" ? lead.operationalActivity : 0;
  const commercialReadiness = lead.commercialReadiness;
  const temperature = lead.outreachIntelligence?.leadTemperature ?? "cold";
  const ageDays = importAgeDays(lead, now);
  const followUpDue = hasFollowUpDue(lead, now);
  const recentlyContacted = wasContactedRecently(lead, now);
  const attempts = lead.contactAttempts ?? 0;
  const tier = lead.businessTier ?? "micro";
  const isDoNotContact =
    Boolean(lead.doNotContact) ||
    lead.pipelineStage === "lost" ||
    lead.pipelineStage === "won";
  const unreachable =
    Boolean(lead.whatsappInvalid) ||
    (!hasWhatsApp && lead.contactQuality === "low" && !lead.instagram && !lead.website);

  if (hasWhatsApp) score += 18;
  if (readiness >= 70) score += 12;
  if (temperature === "hot") score += 14;
  else if (temperature === "warm") score += 8;
  if (followUpDue) score += 16;
  if (tier === "premium" || tier === "medium") score += 8;
  if (operationalActivity >= 60) score += 8;
  if (commercialReadiness?.commercialReadinessLevel === "very_high") score += 9;
  else if (commercialReadiness?.commercialReadinessLevel === "high") score += 6;
  else if (commercialReadiness?.commercialReadinessLevel === "medium") score += 2;
  if (businessSignals.has("conversion_gap")) score += 10;
  const acq = lead.acquisitionIntelligence;
  if (acq) {
    score += calculateAcquisitionPriorityBoost({
      profile: acq,
      operationalActivity,
      bookingFlowStrength: lead.bookingFlowStrength,
      otaDependencyLikelihood: lead.otaDependencyLikelihood,
      hasWhatsAppPath: hasWhatsApp,
      businessSignals,
    });
  }
  const leak = lead.conversionLeak;
  if (leak?.acquisitionTrafficProxy && acq?.acquisition.isAcquisitionActive) {
    score += Math.round(clamp(leak.conversionLeakScore * 0.065, 0, 9));
    if (leak.conversionLeakLevel === "high" || leak.conversionLeakLevel === "critical") {
      score += 3;
    }
  }
  if (opportunity >= 70) score += 12;
  if (ageDays <= 2) score += 9;
  else if (ageDays <= 7) score += 5;
  if (!recentlyContacted) score += 6;

  if (ageDays > 30) score -= 16;
  if (ageDays > 60) score -= 8;
  if (attempts >= 2) score -= 10;
  if (attempts >= 3) score -= 18;
  if (operationalActivity > 0 && operationalActivity < 35) score -= 12;
  if (businessSignals.has("low_operational_activity")) score -= 10;
  if (commercialReadiness?.commercialReadinessLevel === "low") score -= 8;
  if (recentlyContacted) score -= 14;
  if (unreachable) score -= 24;
  if (isDoNotContact) score -= 80;

  return Math.round(clamp(score));
}

export function getPriorityBucket(
  lead: ScoredLead,
  outreachPriority: number,
  now = Date.now(),
): OutreachPriorityBucket {
  const hasWhatsApp = normalizePhoneForWhatsApp(lead.phone) !== null && !lead.whatsappInvalid;
  const followUpDue = hasFollowUpDue(lead, now);
  const tier = lead.businessTier ?? "micro";
  const opportunity = typeof lead.opportunityScore === "number" ? lead.opportunityScore : 0;
  const temperature = lead.outreachIntelligence?.leadTemperature ?? "cold";
  const attempts = lead.contactAttempts ?? 0;
  const isDoNotContact =
    Boolean(lead.doNotContact) ||
    lead.pipelineStage === "lost" ||
    lead.pipelineStage === "won";

  if (isDoNotContact || attempts >= 4) return "archive";
  if (temperature === "hot" && hasWhatsApp && followUpDue) return "today";
  if ((tier === "premium" || tier === "medium") && opportunity >= 72) {
    return outreachPriority >= 85 ? "today" : "high";
  }
  if (outreachPriority >= 85) return "today";
  if (outreachPriority >= 70) return "high";
  if (outreachPriority >= 50) return "medium";
  if (outreachPriority >= 30) return "low";
  return "archive";
}

export function getRecommendedAction(
  lead: ScoredLead,
  priorityBucket: OutreachPriorityBucket,
  outreachPriority: number,
  now = Date.now(),
): RecommendedAction {
  const attempts = lead.contactAttempts ?? 0;
  const businessSignals = new Set(lead.businessSignals ?? []);
  const isDoNotContact =
    Boolean(lead.doNotContact) ||
    lead.pipelineStage === "lost" ||
    lead.pipelineStage === "won";
  if (isDoNotContact || priorityBucket === "archive") return "skip";
  if (attempts >= 3) return "wait";
  if (hasFollowUpDue(lead, now)) return "follow_up";
  const hasWhatsApp = normalizePhoneForWhatsApp(lead.phone) !== null && !lead.whatsappInvalid;
  const acqProfile = lead.acquisitionIntelligence;
  const otaHeavy =
    businessSignals.has("ota_dependency") ||
    (typeof lead.otaDependencyLikelihood === "number" && lead.otaDependencyLikelihood >= 60);
  if (
    hasWhatsApp &&
    acqProfile &&
    acqProfile.acquisition.isAcquisitionActive &&
    acqProfile.socialDemandIntent === "high" &&
    otaHeavy &&
    (priorityBucket === "today" ||
      priorityBucket === "high" ||
      priorityBucket === "medium" ||
      outreachPriority >= 52)
  ) {
    return "send_whatsapp";
  }
  if (hasWhatsApp && (priorityBucket === "today" || priorityBucket === "high")) {
    return "send_whatsapp";
  }
  const readiness = typeof lead.contactReadinessScore === "number" ? lead.contactReadinessScore : 0;
  if (readiness < 45 || lead.contactQuality === "low") return "research_more";
  if (outreachPriority >= 55) return "follow_up";
  return "wait";
}

const ACTIVITY_MAX = 20;

/** Prepend one event to the timeline; caps at 20 entries and dedupes rapid repeats within 3 s. */
export function appendLeadActivity(
  timeline: LeadActivity[] | undefined,
  type: string,
  label: string,
): LeadActivity[] {
  const now = new Date().toISOString();
  const existing = timeline ?? [];
  const head = existing[0];
  if (head && head.type === type && Date.now() - Date.parse(head.timestamp) < 3000) {
    return existing;
  }
  return [{ id: `${type}-${now}`, type, timestamp: now, label }, ...existing].slice(0, ACTIVITY_MAX);
}

/** Attach or refresh structured intelligence fields (safe to call after merges). */
export function enrichScoredLeadIntelligence(s: ScoredLead): ScoredLead {
  return attachStructuredIntelligence(s);
}

export function scoreAll(leads: Lead[] = LEADS): ScoredLead[] {
  return leads.map((l) => {
    const v3 = calculateLeadScoreV3(l);
    const hot = scoreHot(l);
    const contactQuality = getContactQuality(l.phone);
    const enrichment = buildEnrichmentV2Profile({
      hasOwnWebsite: l.hasOwnWebsite || Boolean(l.website?.trim()),
      hasInstagram: l.hasInstagram || Boolean(l.instagram?.trim()),
      website: l.website,
      instagramHandle: l.instagram,
      socialSignalText: buildSocialSignalText(l),
      channels: l.channels,
      rating: l.rating,
      reviewsCount: l.reviewsCount,
      daysSinceLastReview: l.daysSinceLastReview,
      occupancy30d: l.occupancy30d,
      contactQuality,
      hasWhatsAppPath: normalizePhoneForWhatsApp(l.phone) !== null,
      phoneMissing: !l.phone?.trim(),
      listingPhone: l.phone,
      businessTier: v3.businessTier,
      businessName: l.name,
      city: l.city,
      type: l.type,
    });
    const base: ScoredLead = {
      ...l,
      leadScore: v3.leadScore,
      leadReasons: v3.reasons.slice(0, 4),
      hotScore: hot.score,
      hotReasons: hot.reasons,
      contactQuality,
      smartLeadScoreV2: v3.leadScore,
      businessTier: v3.businessTier,
      opportunityScore: v3.opportunityScore,
      outreachFit: v3.outreachFit,
      digitalMaturity: v3.digitalMaturity,
      bookingFlowStrength: enrichment.bookingFlowStrength,
      otaDependencyLikelihood: enrichment.otaDependencyLikelihood,
      socialDemandStrength: enrichment.socialDemandStrength,
      communicationHealth: enrichment.communicationHealth,
      operationalActivity: enrichment.operationalActivity,
      communicationRisk: v3.communicationRisk,
      commercialReadiness: enrichment.commercialReadiness,
    };
    return attachStructuredIntelligence(base);
  });
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  needs_follow_up: "Follow-Up",
  replied: "Replied",
  meeting: "Meeting",
  won: "Won",
  lost: "Lost",
};

export const STATUS_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "needs_follow_up",
  "replied",
  "meeting",
  "won",
  "lost",
];

export const WHATSAPP_OUTREACH_MESSAGE =
  "Selam, genelde tam burada kaçırılıyor gibi oluyor\nmesaj geliyor ama rezervasyona dönüşen taraf zayıf kalıyor\nsiz de bunu fark ettiniz mi?";

/** Strips spaces, +, parentheses, etc.; normalizes Turkish numbers to international 90…. */
export function normalizePhoneForWhatsApp(phone: string): string | null {
  const tr = turkishGsmDigitsForWaMe(phone);
  if (tr) return tr;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  while (digits.startsWith("00") && digits.length > 2) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("90")) {
    return digits.length >= 12 ? digits : null;
  }
  if (digits.startsWith("0")) {
    const intl = "90" + digits.slice(1);
    return intl.length >= 12 ? intl : null;
  }
  if (digits.length === 10) {
    const intl = "90" + digits;
    return intl.length >= 12 ? intl : null;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}

/** Opens WhatsApp (wa.me) with {@link WHATSAPP_OUTREACH_MESSAGE}; `null` if phone cannot be used. */
export function whatsappLink(phone: string): string | null {
  return whatsappLinkWithText(phone, WHATSAPP_OUTREACH_MESSAGE);
}

/** Opens WhatsApp with a custom URL-encoded message; `null` if not a mobile line or phone unusable. */
export function whatsappLinkWithText(phone: string, text: string): string | null {
  if (getTurkishPhoneKind(phone) !== "mobile") return null;
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

export function instagramLink(handle: string) {
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

// ─── v1.8 Today Action Status ────────────────────────────────────────────────
//
// Definitions live in the leaf module `today-action.ts` (Node-testable — no
// heavy import chain). Re-exported here so all existing `@/app/lib/leads`
// import sites keep working unchanged.

export {
  computeTodayActionStatus,
  isHotNowLead,
  selectHotNowLeads,
} from "./today-action";
export type { TodayActionStatus, TodayActionState } from "./today-action";

// ─── v1.7 Lead Lifecycle ────────────────────────────────────────────────────

export type LeadLifecycleStatus =
  | "NEW"
  | "ENRICHED"
  | "VERIFIED"
  | "HOT_OPPORTUNITY"
  | "CONTACTED"
  | "DEMO_BOOKED"
  | "WON"
  | "LOST";

/**
 * Derives the v1.7 lead lifecycle status from existing scored-lead data and
 * workflow state. Pure — no I/O, no mutation of existing scores.
 *
 * Hierarchy (highest wins):
 *   WON / LOST > DEMO_BOOKED > CONTACTED > HOT_OPPORTUNITY > VERIFIED > ENRICHED > NEW
 */
export function computeLeadLifecycleStatus(
  lead: Pick<
    ScoredLead,
    "verifiedOpportunityScore" | "signalVerification" | "enrichmentCount" | "lastEnrichedAt"
  >,
  s: Pick<LeadStatusUpdate, "status">,
): LeadLifecycleStatus {
  // CRM terminal / progress states take precedence over signal-derived states.
  if (s.status === "won") return "WON";
  if (s.status === "lost") return "LOST";
  if (s.status === "meeting") return "DEMO_BOOKED";
  if (
    s.status === "contacted" ||
    s.status === "needs_follow_up" ||
    s.status === "replied"
  )
    return "CONTACTED";

  const v = lead.signalVerification;

  // HOT_OPPORTUNITY: score threshold OR strong multi-channel verification.
  const score = lead.verifiedOpportunityScore;
  const scoreHot = typeof score === "number" && score >= 80;
  const channelHot =
    v?.websiteVerification === "verified" &&
    (v.reservationSignal === "verified" || v.reservationSignal === "detected") &&
    (v.whatsappVerification === "verified" ||
      v.whatsappVerification === "likely" ||
      v.instagramVerification === "verified" ||
      v.instagramVerification === "likely");
  if (scoreHot || channelHot) return "HOT_OPPORTUNITY";

  // VERIFIED: at least one key signal definitively confirmed.
  const isVerified =
    v?.whatsappVerification === "verified" ||
    v?.websiteVerification === "verified" ||
    v?.instagramVerification === "verified" ||
    v?.reservationSignal === "verified";
  if (isVerified) return "VERIFIED";

  // ENRICHED: lead has passed through the enrichment pipeline at least once.
  const isEnriched =
    (typeof lead.enrichmentCount === "number" && lead.enrichmentCount > 0) ||
    typeof lead.lastEnrichedAt === "string" ||
    v != null;
  if (isEnriched) return "ENRICHED";

  return "NEW";
}
