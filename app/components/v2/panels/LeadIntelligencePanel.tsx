"use client";

import { useState, useEffect, useRef } from "react";
import type { ScoredLead, LeadActivity, LeadStatus, LeadStatusUpdate } from "@/app/lib/leads";
import { normalizePhoneForWhatsApp, whatsappLink, STATUS_ORDER } from "@/app/lib/leads";
import {
  OPPORTUNITY_TIER_LABELS,
  OPPORTUNITY_REASON_LABELS,
  type OpportunityTier,
} from "@/app/lib/opportunity-scoring";
import {
  computeCommercialPackaging,
  type CommercialPackage,
} from "@/lib/commercial/commercial-packaging";
import { computeExpectedRevenue } from "@/lib/revenue/expected-revenue";
import type { IcpAlignmentProfile } from "@/app/lib/intelligence/icp-alignment";
import { computeVerifiedOpportunity } from "@/lib/verified-opportunity/verified-opportunity";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/verified-opportunity/opportunity-stage";
import {
  SALES_PRIORITY_LABELS,
  SALES_PRIORITY_COLOR,
} from "@/lib/verified-opportunity/priority-engine";
import type { BusinessSignal } from "@/app/lib/intelligence/signals";
import { useLeadMutations } from "@/app/hooks/useLeadMutations";
import { useV2PanelState, loadV2PanelEntry } from "@/app/hooks/useV2PanelState";
import type { V2ReenrichSummary } from "@/app/hooks/useV2PanelState";

// ── Panel mode type ────────────────────────────────────────────────────────

export type IntelligencePanelMode = "full" | "compact" | "queue" | "founder";

// ── Utilities ──────────────────────────────────────────────────────────────

function formatTRY(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded).toString();
  const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped} ₺`;
}

function scoreColor(n: number): string {
  if (n >= 70) return "text-emerald-400";
  if (n >= 50) return "text-amber-400";
  return "text-rose-400";
}

function tugoboFitColor(score: number): string {
  if (score >= 72) return "text-emerald-300";
  if (score >= 52) return "text-amber-300";
  return "text-zinc-400";
}

function opportunityTierColor(tier: OpportunityTier): string {
  switch (tier) {
    case "elite":  return "text-fuchsia-300";
    case "high":   return "text-emerald-300";
    case "medium": return "text-amber-300";
    default:       return "text-zinc-400";
  }
}

function opportunityTierChip(tier: OpportunityTier): string {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset";
  switch (tier) {
    case "elite":  return `${base} bg-fuchsia-500/12 text-fuchsia-200 ring-fuchsia-400/30`;
    case "high":   return `${base} bg-emerald-500/12 text-emerald-200 ring-emerald-400/30`;
    case "medium": return `${base} bg-amber-500/12 text-amber-200 ring-amber-400/30`;
    default:       return `${base} bg-zinc-500/12 text-zinc-300 ring-white/10`;
  }
}

function pkgBadgeCls(pkg: CommercialPackage): string {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset";
  switch (pkg) {
    case "enterprise":   return `${base} bg-fuchsia-500/12 text-fuchsia-200 ring-fuchsia-400/30`;
    case "growth":       return `${base} bg-violet-500/12 text-violet-200 ring-violet-400/30`;
    case "professional": return `${base} bg-sky-500/12 text-sky-200 ring-sky-400/30`;
    default:             return `${base} bg-zinc-500/12 text-zinc-300 ring-white/10`;
  }
}

function pkgLabel(pkg: CommercialPackage): string {
  const map: Record<CommercialPackage, string> = {
    enterprise: "Enterprise", growth: "Growth", professional: "Professional", starter: "Starter",
  };
  return map[pkg] ?? pkg;
}

function demandVolumePill(vol: IcpAlignmentProfile["estimatedDemandVolume"]): { label: string; cls: string } {
  const labels: Record<string, string> = { high: "Talep: Yüksek", medium: "Talep: Orta", low: "Talep: Düşük", unknown: "Talep: ?" };
  const cls: Record<string, string> = {
    high:    "rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
    medium:  "rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/20",
    low:     "rounded-full bg-zinc-500/12 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/10",
    unknown: "rounded-full bg-zinc-500/12 px-2 py-0.5 text-[10px] text-zinc-500 ring-1 ring-inset ring-white/[0.08]",
  };
  return { label: labels[vol] ?? labels.unknown, cls: cls[vol] ?? cls.unknown };
}

function hotelInitials(name: string): string {
  const words = name.split(" ").filter((w) => w.length > 1 && w !== "&");
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-amber-500/30 text-amber-200",
  "bg-violet-500/30 text-violet-200",
  "bg-indigo-500/30 text-indigo-200",
  "bg-rose-500/30 text-rose-200",
  "bg-teal-500/30 text-teal-200",
  "bg-sky-500/30 text-sky-200",
  "bg-orange-500/30 text-orange-200",
  "bg-emerald-500/30 text-emerald-200",
];

function stableAvatarIdx(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % AVATAR_COLORS.length;
}

function fmtDate(input: string | number | null | undefined): string | null {
  if (!input) return null;
  const d = typeof input === "number" ? new Date(input) : new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins}d önce`;
  const hrs = Math.round(diff / 3600000);
  if (hrs < 24) return `${hrs}s önce`;
  const days = Math.round(diff / 86400000);
  return `${days}g önce`;
}

// ── Business signal Turkish labels ─────────────────────────────────────────

const BUSINESS_SIGNAL_TR: Record<BusinessSignal, string> = {
  weak_digital_presence:             "Dijital görünürlük zayıf",
  active_marketing_surface:          "Aktif pazarlama yüzeyi",
  conversion_gap:                    "Dönüşüm boşluğu",
  reputation_risk:                   "İtibar riski",
  direct_contact_possible:           "Doğrudan iletişim mümkün",
  ota_dependency:                    "OTA bağımlılığı",
  single_channel_risk:               "Tek kanal riski",
  missing_own_website:               "Kendi sitesi yok",
  instagram_presence_gap:            "Instagram boşluğu",
  review_recency_stale:              "Yorumlar güncel değil",
  review_volume_operational_scale:   "Yorum hacmi / ölçek",
  landline_or_unclear_phone:         "Sabit / belirsiz hat",
  no_listed_phone:                   "Telefon yok",
  premium_without_owned_funnel:      "Premium & doğrudan satış yok",
  weak_booking_cta:                  "Zayıf rezervasyon çağrısı",
  no_booking_flow:                   "Rezervasyon akışı yok",
  external_only_booking_dependency:  "Yalnızca harici rezervasyon",
  weak_contact_visibility:           "İletişim görünürlüğü zayıf",
  low_operational_activity:          "Düşük operasyonel aktivite",
  social_acquisition_intent:         "Sosyal edinim niyeti",
  paid_traffic_candidate:            "Ücretli trafik adayı",
  commercially_active:               "Ticari olarak aktif",
  operationally_mature:              "Operasyonel olarak olgun",
  growth_oriented:                   "Büyüme odaklı",
  high_roi_potential:                "Yüksek ROI potansiyeli",
};

// ── Activity timeline labels ────────────────────────────────────────────────

const ACTIVITY_LABELS_TR: Record<string, string> = {
  lead_imported:              "Lead içe aktarıldı",
  lead_enriched:              "Lead yeniden zenginleştirildi",
  ai_reviewed:                "AI yeniden yorumladı",
  contact_started:            "İletişim başlatıldı",
  followup_scheduled:         "Takip planlandı",
  queue_add:                  "Kuyruğa eklendi",
  queue_remove:               "Kuyruktan çıkarıldı",
  whatsapp_open:              "WhatsApp açıldı",
  whatsapp_message_generated: "WhatsApp mesajı oluşturuldu",
  focus_add:                  "Odak moduna eklendi",
  focus_remove:               "Odak modundan çıkarıldı",
  status_change:              "Durum değişti",
  demo_booked:                "Demo planlandı",
  closed_won:                 "Kazanıldı",
  closed_lost:                "Kaybedildi",
  verification_completed:     "Sinyal doğrulaması tamamlandı",
  whatsapp_verified:          "WhatsApp doğrulandı",
  website_verified:           "Web sitesi doğrulandı",
  instagram_verified:         "Instagram hesabı doğrulandı",
  instagram_candidate:        "Instagram aday hesabı bulundu",
  reservation_cta_found:      "Rezervasyon CTA bulundu",
  chain_detected:             "Kurumsal zincir tespit edildi",
  opportunity_updated:        "Fırsat puanı güncellendi",
  opportunity_tier_elite:     "Elite fırsat seviyesine yükseldi",
  opportunity_tier_high:      "Yüksek fırsat seviyesine yükseldi",
  opportunity_tier_medium:    "Orta fırsat seviyesine yükseldi",
};

function activityLabel(entry: LeadActivity): string {
  return ACTIVITY_LABELS_TR[entry.type] ?? entry.label;
}

// ── Status label map (Turkish) ─────────────────────────────────────────────

const STATUS_TR: Record<LeadStatus, string> = {
  new:             "Yeni",
  contacted:       "İletişime geçildi",
  needs_follow_up: "Takip gerekli",
  replied:         "Yanıt aldı",
  meeting:         "Demo/Toplantı",
  won:             "Kazanıldı",
  lost:            "Kaybedildi",
};

const STATUS_CHIP_CLS: Record<LeadStatus, string> = {
  new:             "bg-zinc-500/12 text-zinc-300 ring-white/10",
  contacted:       "bg-sky-500/12 text-sky-300 ring-sky-400/25",
  needs_follow_up: "bg-amber-500/12 text-amber-300 ring-amber-400/25",
  replied:         "bg-emerald-500/12 text-emerald-300 ring-emerald-400/25",
  meeting:         "bg-violet-500/12 text-violet-300 ring-violet-400/25",
  won:             "bg-fuchsia-500/12 text-fuchsia-200 ring-fuchsia-400/30",
  lost:            "bg-rose-500/12 text-rose-400 ring-rose-400/25",
};

// ── Contact Finder result shape (mirrors Dashboard internal type) ───────────

type CFResult = {
  bestContactType: string;
  bestContactValue: string;
  confidence: string;
  foundPhones: string[];
  foundWhatsapp: string[];
  foundInstagram: string[];
  source: string;
  reason: string;
};

// ── Contact Finder action derivation ─────────────────────────────────────────

type CFAction = { label: string; href: string; cls: string };

function cfResultAction(result: CFResult): CFAction | null {
  const type = result.bestContactType;
  const value = result.bestContactValue;

  const isWa =
    type === "VERIFIED_WHATSAPP" ||
    type === "GENERATED_WHATSAPP" ||
    value.includes("wa.me") ||
    value.toLowerCase().includes("whatsapp.com");

  if (isWa) {
    const href = value.startsWith("http") ? value : `https://wa.me/${value.replace(/\D/g, "")}`;
    return {
      label: "WhatsApp'ta Aç",
      href,
      cls: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300 hover:bg-emerald-500/[0.14]",
    };
  }

  if (type === "PHONE_ONLY") {
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 10) {
      const intl = digits.startsWith("90")
        ? digits
        : digits.startsWith("0")
          ? `90${digits.slice(1)}`
          : `90${digits}`;
      if (intl.length >= 12) {
        return {
          label: "WhatsApp'ta Aç",
          href: `https://wa.me/${intl}`,
          cls: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300 hover:bg-emerald-500/[0.14]",
        };
      }
    }
    return {
      label: "Ara",
      href: `tel:${value}`,
      cls: "border-sky-500/25 bg-sky-500/[0.07] text-sky-300 hover:bg-sky-500/[0.14]",
    };
  }

  if (type === "instagram") {
    const href = value.startsWith("http")
      ? value
      : `https://instagram.com/${value.replace(/^@/, "")}`;
    return {
      label: "Instagram'da Aç",
      href,
      cls: "border-fuchsia-500/25 bg-fuchsia-500/[0.07] text-fuchsia-300 hover:bg-fuchsia-500/[0.14]",
    };
  }

  if (type === "website" || type === "email") {
    const href =
      type === "email"
        ? `mailto:${value}`
        : value.startsWith("http")
          ? value
          : `https://${value}`;
    return {
      label: type === "email" ? "E-posta Gönder" : "Web Sitesini Aç",
      href,
      cls: "border-zinc-500/25 bg-zinc-500/[0.07] text-zinc-300 hover:bg-zinc-500/[0.14]",
    };
  }

  return null;
}

// ── Operational props passed into Execution tab ────────────────────────────

type LastAction = { label: string; ts: number };

type ExecProps = {
  lead: ScoredLead;
  leadState: LeadStatusUpdate;
  mutations: ReturnType<typeof useLeadMutations>;
  lastAction: LastAction | null;
  onAction: (label: string) => void;
  cfResult: CFResult | null;
  cfLoading: boolean;
  cfError: string | null;
  onFindContact: () => void;
  reenrichLoading: boolean;
  reenrichMsg: string | null;
  reenrichResult: V2ReenrichSummary | null;
  onReenrich: () => void;
  msgResult: string | null;
  msgGeneratedAt: number | null;
  msgLoading: boolean;
  msgError: string | null;
  onGenerateMsg: () => void;
  noteDraft: string;
  onNoteChange: (v: string) => void;
  onNoteSave: () => void;
  noteSaved: boolean;
};

// ── Shared Section Header ──────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.06] px-4 py-2.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {children}
      </h4>
    </div>
  );
}

function InfoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/[0.08] bg-white/[0.03] ${className ?? ""}`}>
      {children}
    </div>
  );
}

// ── Quick Actions bar ──────────────────────────────────────────────────────

function QuickActions({
  lead,
  cfLoading,
  reenrichLoading,
  msgLoading,
  onFindContact,
  onReenrich,
  onGenerateMsg,
}: {
  lead: ScoredLead;
  cfLoading: boolean;
  reenrichLoading: boolean;
  msgLoading: boolean;
  onFindContact: () => void;
  onReenrich: () => void;
  onGenerateMsg: () => void;
}) {
  const waUrl = whatsappLink(lead.phone ?? "");
  const igUrl = lead.instagram
    ? lead.instagram.startsWith("http")
      ? lead.instagram
      : `https://instagram.com/${lead.instagram.replace(/^@/, "")}`
    : null;
  const webUrl = lead.website
    ? lead.website.startsWith("http")
      ? lead.website
      : `https://${lead.website}`
    : null;

  const linkBtn = "flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-200 shrink-0";
  const actionBtn = "flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="border-b border-white/[0.06] bg-white/[0.015] px-3 py-2 space-y-2">
      {/* External links row */}
      <div className="flex items-center gap-1.5">
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noopener noreferrer" title="WhatsApp" className={`${linkBtn} border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.08]`}>
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
              <path d="M8 1a7 7 0 0 1 6.06 10.47L15 15l-3.67-.91A7 7 0 1 1 8 1Zm0 1.4a5.6 5.6 0 0 0-4.84 8.39l.15.26-.77 1.92 1.98-.75.25.15A5.6 5.6 0 1 0 8 2.4Zm-1.8 2.7c.14 0 .29.01.41.04.14.04.3.08.44.4l.54 1.33c.1.25.03.46-.1.63l-.33.41c-.12.15-.11.3-.04.45.4.84 1.1 1.55 1.9 1.95.14.07.28.08.4-.05l.37-.44c.15-.18.36-.23.56-.13l1.34.67c.3.15.32.3.31.44-.05.83-.62 1.41-1.46 1.41H11c-.8 0-1.81-.4-3.15-1.7C6.5 9.43 5.9 8.3 5.9 7.48c0-.73.56-1.38 1.3-1.38Z" />
            </svg>
          </a>
        ) : null}
        {lead.phone && (
          <a href={`tel:${lead.phone}`} title="Ara" className={`${linkBtn} border-sky-500/20 text-sky-400 hover:bg-sky-500/[0.08]`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <path d="M3 3.5c0 5 4.5 9.5 9.5 9.5l.5-2.5-3-1-1 1.5A7 7 0 0 1 6 7.5L7.5 6l-1-3-3 .5z" />
            </svg>
          </a>
        )}
        {igUrl && (
          <a href={igUrl} target="_blank" rel="noopener noreferrer" title="Instagram" className={`${linkBtn} border-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/[0.08]`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <rect x="2" y="2" width="12" height="12" rx="3.5" />
              <circle cx="8" cy="8" r="2.5" />
              <circle cx="11.5" cy="4.5" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </a>
        )}
        {webUrl && (
          <a href={webUrl} target="_blank" rel="noopener noreferrer" title="Web Sitesi" className={`${linkBtn}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <circle cx="8" cy="8" r="6" />
              <path d="M2 8h12M8 2c-1.5 2-2.5 3.8-2.5 6s1 4 2.5 6M8 2c1.5 2 2.5 3.8 2.5 6S9.5 12 8 14" />
            </svg>
          </a>
        )}
      </div>

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={onFindContact}
          disabled={cfLoading}
          className={actionBtn}
        >
          {cfLoading ? "Aranıyor…" : "İletişim Bul"}
        </button>
        <button
          onClick={onReenrich}
          disabled={reenrichLoading}
          className={actionBtn}
        >
          {reenrichLoading ? "Zenginleştiriliyor…" : "Yeniden Tara"}
        </button>
        <button
          onClick={onGenerateMsg}
          disabled={msgLoading}
          className={actionBtn}
        >
          {msgLoading ? "Oluşturuluyor…" : "AI Mesaj"}
        </button>
      </div>
    </div>
  );
}

// ── Tab 1: Genel Bakış (Overview) ─────────────────────────────────────────

function OverviewTab({ lead }: { lead: ScoredLead }) {
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
    pipelineStatus: "new",
    doNotContact: false,
    adsLikelihood: lead.adsLikelihood,
    acquisitionIntelligence: lead.acquisitionIntelligence,
  });

  const probPct = Math.round(er.expectedCustomerProbability * 100);
  const probColor = probPct >= 45 ? "text-emerald-300" : probPct >= 20 ? "text-amber-300" : "text-zinc-400";
  const confLabel = er.expectedRevenueConfidence === "high" ? "Yüksek" : er.expectedRevenueConfidence === "medium" ? "Orta" : "Düşük";
  const confColor = er.expectedRevenueConfidence === "high" ? "text-emerald-300" : er.expectedRevenueConfidence === "medium" ? "text-amber-300" : "text-zinc-500";
  const icp: IcpAlignmentProfile | undefined = lead.icpAlignment;
  const dem = icp ? demandVolumePill(icp.estimatedDemandVolume) : null;

  return (
    <div className="space-y-3">
      {/* Score hero */}
      <InfoCard>
        <SectionHeader>Skor Özeti</SectionHeader>
        <div className="grid grid-cols-2 gap-px p-3">
          <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5 mr-1">
            <p className={`text-[18px] font-bold tabular-nums leading-none ${scoreColor(lead.leadScore ?? 0)}`}>
              {lead.leadScore ?? 0}
            </p>
            <p className="mt-1 text-[9px] text-zinc-500">Lead Skoru</p>
            {(lead.leadReasons ?? []).length > 0 && (
              <p className="mt-1 text-[9px] leading-snug text-zinc-600 line-clamp-2">
                {lead.leadReasons!.slice(0, 2).join(" · ")}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5 ml-1">
            <p className={`text-[18px] font-bold tabular-nums leading-none ${scoreColor(lead.hotScore ?? 0)}`}>
              {lead.hotScore ?? 0}
            </p>
            <p className="mt-1 text-[9px] text-zinc-500">Hot Skoru</p>
            {(lead.hotReasons ?? []).length > 0 && (
              <p className="mt-1 text-[9px] leading-snug text-zinc-600 line-clamp-2">
                {lead.hotReasons!.slice(0, 2).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </InfoCard>

      {/* Commercial Packaging */}
      <InfoCard>
        <SectionHeader>Ticari Paketleme</SectionHeader>
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={pkgBadgeCls(pkg.package)}>{pkgLabel(pkg.package)}</span>
            <span className="text-[11px] tabular-nums text-sky-300">
              {pkg.commercialFitScore}
              <span className="text-zinc-600 text-[9px] ml-0.5">/100</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">Aylık</div>
              <div className="mt-0.5 text-[13px] font-bold tabular-nums text-sky-200">
                {formatTRY(pkg.monthlyRevenue)}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">Yıllık</div>
              <div className="mt-0.5 text-[13px] font-bold tabular-nums text-sky-200">
                {formatTRY(pkg.annualRevenue)}
              </div>
            </div>
          </div>
          {pkg.reasoning.slice(1, 4).length > 0 && (
            <div className="space-y-1 border-t border-white/[0.05] pt-2">
              {pkg.reasoning.slice(1, 4).map((r) => (
                <div key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-sky-100/70">
                  <span className="shrink-0 text-sky-400">✓</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </InfoCard>

      {/* Expected Revenue */}
      <InfoCard>
        <SectionHeader>Beklenen Gelir</SectionHeader>
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={`text-[13px] font-bold tabular-nums ${probColor}`}>%{probPct}</span>
            <span className={`text-[11px] font-semibold ${confColor}`}>{confLabel} güven</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">Ağırlıklı MRR</div>
              <div className="mt-0.5 text-[13px] font-bold tabular-nums text-amber-200">
                {formatTRY(er.weightedExpectedMonthlyRevenue)}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">Ağırlıklı ARR</div>
              <div className="mt-0.5 text-[13px] font-bold tabular-nums text-amber-200">
                {formatTRY(er.weightedExpectedAnnualRevenue)}
              </div>
            </div>
          </div>
          {er.expectedRevenueReasoning.slice(0, 3).length > 0 && (
            <div className="space-y-1 border-t border-white/[0.05] pt-2">
              {er.expectedRevenueReasoning.slice(0, 3).map((r) => (
                <div key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-100/70">
                  <span className="shrink-0 text-amber-400">·</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </InfoCard>

      {/* ICP / TUGOBO Fit */}
      {icp && (
        <InfoCard>
          <SectionHeader>TUGOBO Uyumu</SectionHeader>
          <div className="p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Operasyonel Uyum Skoru</span>
              <span className={`text-[14px] font-bold tabular-nums ${tugoboFitColor(icp.tugoboFitScore)}`}>
                {icp.tugoboFitScore}
                <span className="text-[9px] font-normal text-zinc-500 ml-0.5">/100</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {icp.operationalFit && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/30">
                  ✓ Yüksek Op. Uyum
                </span>
              )}
              {dem && <span className={dem.cls}>{dem.label}</span>}
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300 ring-1 ring-inset ring-sky-400/20">
                Dijital {lead.digitalMaturity ?? 0}
              </span>
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-400/20">
                Op. Karmaşa {icp.operationalComplexityScore}
              </span>
            </div>
            {icp.operationalValueSummary && (
              <p className="text-[10px] leading-snug text-zinc-400 border-t border-white/[0.05] pt-2">
                {icp.operationalValueSummary}
              </p>
            )}
          </div>
        </InfoCard>
      )}

      {/* Pain Points */}
      {(lead.painPointSummary ?? []).length > 0 && (
        <InfoCard>
          <SectionHeader>Ağrı Noktaları</SectionHeader>
          <ul className="space-y-1.5 p-3">
            {(lead.painPointSummary ?? []).slice(0, 4).map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-snug text-zinc-400">
                <span className="shrink-0 text-rose-400 mt-px">▸</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </InfoCard>
      )}
    </div>
  );
}

// ── Tab 2: Fırsat (Opportunity) ───────────────────────────────────────────

type VerTone = "ok" | "warn" | "miss";

function VerificationRow({
  label,
  status,
  tone,
  confidence,
  sourceUrl,
}: {
  label: string;
  status: string;
  tone: VerTone;
  confidence?: number;
  sourceUrl?: string;
}) {
  const dotCls = tone === "ok" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-zinc-600";
  const textCls = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-zinc-500";
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} />
          <span className={`text-[11px] font-medium ${textCls}`}>
            {status}
            {typeof confidence === "number" && confidence > 0 && (
              <span className="ml-1 text-[9px] text-zinc-600">%{confidence}</span>
            )}
          </span>
        </div>
      </div>
      {sourceUrl && (
        <p className="mt-0.5 truncate text-[9px] text-zinc-600 pl-0.5" title={sourceUrl}>
          {sourceUrl.replace(/^https?:\/\//, "").slice(0, 50)}
        </p>
      )}
    </div>
  );
}

function OpportunityTab({ lead }: { lead: ScoredLead }) {
  const score = lead.verifiedOpportunityScore;
  const tier = lead.opportunityTier;
  const v = lead.signalVerification;

  const tierLabelTr = tier && OPPORTUNITY_TIER_LABELS[tier]
    ? OPPORTUNITY_TIER_LABELS[tier].tr
    : (tier ?? "—");

  const reasonLabels = (lead.opportunityReasons ?? [])
    .map((k) => {
      const m = OPPORTUNITY_REASON_LABELS[k as string];
      return m ? m.tr : null;
    })
    .filter((x): x is string => Boolean(x));

  const waState  = v?.whatsappVerification ?? "not_found";
  const webState = v?.websiteVerification ?? "not_found";
  const igState  = v?.instagramVerification ?? "not_found";
  const resState = v?.reservationSignal ?? "not_found";

  const waLabel  = waState === "verified" ? "Doğrulandı" : waState === "likely" ? "Olası" : waState === "not_found" ? "Bulunamadı" : "Belirsiz";
  const waTone: VerTone  = waState === "verified" ? "ok" : waState === "likely" ? "warn" : "miss";
  const webLabel = webState === "verified" ? "Doğrulandı" : webState === "reachable" ? "Erişilebilir" : webState === "broken" ? "Bozuk" : "Bulunamadı";
  const webTone: VerTone = webState === "verified" ? "ok" : webState === "reachable" ? "warn" : "miss";
  const igLabel  = igState === "verified" ? "Doğrulandı" : igState === "likely" ? "Olası" : igState === "candidate" ? "Aday" : "Bulunamadı";
  const igTone: VerTone  = igState === "verified" ? "ok" : (igState === "likely" || igState === "candidate") ? "warn" : "miss";
  const resLabel = resState === "verified" ? "Doğrulandı" : resState === "detected" ? "Tespit Edildi" : "Bulunamadı";
  const resTone: VerTone = resState === "verified" ? "ok" : resState === "detected" ? "warn" : "miss";

  const waUrl = normalizePhoneForWhatsApp(lead.phone ?? "")
    ? `https://wa.me/${normalizePhoneForWhatsApp(lead.phone ?? "")}`
    : v?.whatsappSourceUrl ?? null;

  const signals = (lead.businessSignals ?? []).slice(0, 8);
  const waConf = lead.acquisitionIntelligence?.whatsappConfidence ?? lead.whatsappConfidence;
  const waSignals = (lead.whatsappSignals?.length
    ? lead.whatsappSignals
    : lead.acquisitionIntelligence?.whatsappSignals ?? []).slice(0, 5);

  const ownership = v?.businessOwnershipType ?? lead.businessOwnershipType;

  return (
    <div className="space-y-3">
      {/* Opportunity Score */}
      {typeof score === "number" && tier && (
        <InfoCard>
          <SectionHeader>Fırsat Değerlendirmesi</SectionHeader>
          <div className="p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className={opportunityTierChip(tier)}>{tierLabelTr}</span>
              <span className={`text-[15px] font-bold tabular-nums ${opportunityTierColor(tier)}`}>
                {score}
                <span className="text-[9px] font-normal text-zinc-500 ml-0.5">/100</span>
              </span>
            </div>
            {reasonLabels.length > 0 && (
              <div className="space-y-1 border-t border-white/[0.05] pt-2">
                {reasonLabels.map((r) => (
                  <div key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-emerald-200">
                    <span className="shrink-0 text-emerald-400">✓</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </InfoCard>
      )}

      {/* Signal Verification */}
      {v && (
        <InfoCard>
          <SectionHeader>Sinyal Doğrulama</SectionHeader>
          <div className="divide-y divide-white/[0.04] px-4">
            <VerificationRow label="WhatsApp"    status={waLabel}  tone={waTone}  confidence={v.whatsappConfidence}    sourceUrl={v.whatsappSourceUrl} />
            <VerificationRow label="Web Sitesi"  status={webLabel} tone={webTone} confidence={v.websiteConfidence}     sourceUrl={v.websiteSourceUrl} />
            <VerificationRow label="Instagram"   status={igLabel}  tone={igTone}  confidence={v.instagramConfidence}   sourceUrl={v.instagramSourceUrl} />
            <VerificationRow label="Rezervasyon" status={resLabel} tone={resTone} confidence={v.reservationConfidence} sourceUrl={v.reservationSourceUrl} />
          </div>
          {(ownership && ownership !== "unknown") || v.discoveredPages.length > 0 ? (
            <div className="border-t border-white/[0.05] px-4 py-2 flex flex-wrap items-center gap-2">
              {ownership && ownership !== "unknown" && (
                <span className={ownership === "chain"
                  ? "rounded-full bg-sky-500/12 px-2 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-inset ring-sky-400/25"
                  : "rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25"
                }>
                  {ownership === "chain"
                    ? `🏢 Kurumsal${v.chainBrand ? ` · ${v.chainBrand}` : ""}`
                    : "🏠 Bağımsız İşletme"}
                </span>
              )}
              {v.discoveredPages.length > 0 && (
                <span className="text-[10px] text-zinc-500">
                  {v.discoveredPages.length} sayfa tarandı
                  {v.verifiedAt ? ` · ${fmtDate(v.verifiedAt)}` : ""}
                </span>
              )}
            </div>
          ) : null}
        </InfoCard>
      )}

      {/* Business Signals */}
      {signals.length > 0 && (
        <InfoCard>
          <SectionHeader>İş Sinyalleri</SectionHeader>
          <div className="flex flex-wrap gap-1.5 p-3">
            {signals.map((sig) => (
              <span key={sig} className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/[0.08]">
                {BUSINESS_SIGNAL_TR[sig] ?? sig}
              </span>
            ))}
          </div>
          {(lead.intelligenceScore ?? 0) > 0 && (
            <div className="border-t border-white/[0.05] px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Zeka Skoru</span>
                <span className="text-[11px] font-semibold text-violet-300">{lead.intelligenceScore}</span>
              </div>
            </div>
          )}
          {lead.heuristicOutreachAngle && (
            <div className="border-t border-white/[0.05] px-4 pb-3 pt-2">
              <p className="mb-1 text-[9px] uppercase tracking-wider text-zinc-500">Danışmanlık Açısı</p>
              <p className="text-[11px] leading-relaxed text-zinc-400">{lead.heuristicOutreachAngle}</p>
            </div>
          )}
        </InfoCard>
      )}

      {/* WhatsApp Detail */}
      {waConf && waConf !== "none" && (
        <InfoCard>
          <SectionHeader>WhatsApp Detayı</SectionHeader>
          <div className="divide-y divide-white/[0.04] px-4">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[11px] text-zinc-500">Güven</span>
              <span className={`text-[11px] font-medium ${
                waConf === "confirmed" ? "text-emerald-300" : waConf === "likely" ? "text-amber-300" : "text-zinc-500"
              }`}>
                {waConf === "confirmed" ? "Yüksek (Onaylı)" : waConf === "likely" ? "Orta (Olası)" : "Düşük (Zayıf)"}
              </span>
            </div>
          </div>
          {waSignals.length > 0 && (
            <div className="border-t border-white/[0.05] px-4 pb-3 pt-2">
              <p className="mb-1.5 text-[9px] uppercase tracking-wider text-zinc-500">Sinyaller</p>
              <div className="space-y-1">
                {waSignals.map((s) => (
                  <p key={s} className="text-[10px] text-zinc-400">· {s}</p>
                ))}
              </div>
            </div>
          )}
        </InfoCard>
      )}

      {/* Contact Channels */}
      <InfoCard>
        <SectionHeader>İletişim Kanalları</SectionHeader>
        <div className="p-3 space-y-2">
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/[0.09] transition">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                <path d="M8 1a7 7 0 0 1 6.06 10.47L15 15l-3.67-.91A7 7 0 1 1 8 1Zm0 1.4a5.6 5.6 0 0 0-4.84 8.39l.15.26-.77 1.92 1.98-.75.25.15A5.6 5.6 0 1 0 8 2.4Zm-1.8 2.7c.14 0 .29.01.41.04.14.04.3.08.44.4l.54 1.33c.1.25.03.46-.1.63l-.33.41c-.12.15-.11.3-.04.45.4.84 1.1 1.55 1.9 1.95.14.07.28.08.4-.05l.37-.44c.15-.18.36-.23.56-.13l1.34.67c.3.15.32.3.31.44-.05.83-.62 1.41-1.46 1.41H11c-.8 0-1.81-.4-3.15-1.7C6.5 9.43 5.9 8.3 5.9 7.48c0-.73.56-1.38 1.3-1.38Z" />
              </svg>
              WhatsApp ile İletişim Kur
            </a>
          )}
          {lead.phone && (
            <a href={`tel:${lead.phone}`}
              className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2 text-[11px] font-medium text-sky-300 hover:bg-sky-500/[0.09] transition">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                <path d="M3 3.5c0 5 4.5 9.5 9.5 9.5l.5-2.5-3-1-1 1.5A7 7 0 0 1 6 7.5L7.5 6l-1-3-3 .5z" />
              </svg>
              {lead.phone}
            </a>
          )}
          {lead.instagram && (
            <a href={lead.instagram.startsWith("http") ? lead.instagram : `https://instagram.com/${lead.instagram.replace(/^@/, "")}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/[0.05] px-3 py-2 text-[11px] font-medium text-fuchsia-300 hover:bg-fuchsia-500/[0.09] transition">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                <rect x="2" y="2" width="12" height="12" rx="3.5" />
                <circle cx="8" cy="8" r="2.5" />
                <circle cx="11.5" cy="4.5" r="0.5" fill="currentColor" stroke="none" />
              </svg>
              Instagram
            </a>
          )}
          {lead.website && (
            <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-500/20 bg-zinc-500/[0.05] px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-zinc-500/[0.09] transition">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                <circle cx="8" cy="8" r="6" />
                <path d="M2 8h12M8 2c-1.5 2-2.5 3.8-2.5 6s1 4 2.5 6M8 2c1.5 2 2.5 3.8 2.5 6S9.5 12 8 14" />
              </svg>
              Web Sitesi
            </a>
          )}
          {!waUrl && !lead.phone && !lead.instagram && !lead.website && (
            <p className="text-[11px] text-zinc-600 px-1 py-2">Kayıtlı iletişim kanalı bulunamadı.</p>
          )}
        </div>
      </InfoCard>

      {/* Why This Lead */}
      {(lead.whyThisLead ?? []).length > 0 && (
        <InfoCard>
          <SectionHeader>Neden Bu Lead?</SectionHeader>
          <ul className="space-y-2 p-3">
            {(lead.whyThisLead ?? []).slice(0, 5).map((reason, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-px text-[9px] font-bold tabular-nums text-indigo-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] leading-snug text-zinc-300">{reason}</span>
              </li>
            ))}
          </ul>
        </InfoCard>
      )}

      {/* AI Insight */}
      {lead.aiInsight && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04]">
          <div className="border-b border-indigo-500/15 px-4 py-2.5 flex items-center justify-between">
            <h4 className="text-[9px] font-bold uppercase tracking-[0.15em] text-indigo-400/70">
              AI İçgörü
            </h4>
            {lead.aiInsightSource && (
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                lead.aiInsightSource === "llm"
                  ? "bg-cyan-500/15 text-cyan-200 ring-cyan-400/35"
                  : "bg-zinc-500/15 text-zinc-300 ring-zinc-400/25"
              }`}>
                {lead.aiInsightSource === "llm" ? "AI" : "Kural"}
              </span>
            )}
          </div>
          <p className="px-4 py-3 text-[11px] leading-relaxed text-zinc-400">{lead.aiInsight}</p>
          {lead.outreachAngle && lead.outreachAngle !== lead.aiInsight && (
            <div className="border-t border-indigo-500/10 px-4 pb-3 pt-2">
              <p className="mb-1 text-[9px] uppercase tracking-wider text-indigo-400/60">Satış Açısı</p>
              <p className="text-[11px] leading-relaxed text-zinc-500">{lead.outreachAngle}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Gelir (Revenue) ─────────────────────────────────────────────────

function RevenueTab({ lead }: { lead: ScoredLead }) {
  const oppLevelMap: Record<string, { label: string; cls: string }> = {
    very_high: { label: "Çok Yüksek", cls: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40" },
    high:      { label: "Yüksek",     cls: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/35" },
    medium:    { label: "Orta",       cls: "bg-amber-500/15 text-amber-200 ring-amber-400/35" },
    low:       { label: "Düşük",      cls: "bg-zinc-500/15 text-zinc-300 ring-zinc-400/25" },
  };
  const oppLevel = lead.opportunityLevel ? oppLevelMap[lead.opportunityLevel] : null;

  const scores = [
    { label: "Lead Skoru", value: lead.leadScore ?? 0, color: scoreColor(lead.leadScore ?? 0) },
    { label: "Hot Skoru",  value: lead.hotScore ?? 0,  color: scoreColor(lead.hotScore ?? 0) },
    { label: "ICP Uyum",   value: lead.icpFitScore ?? 0, color: scoreColor(lead.icpFitScore ?? 0) },
    { label: "VOS",        value: lead.verifiedOpportunityScore ?? 0, color: scoreColor(lead.verifiedOpportunityScore ?? 0) },
  ];

  return (
    <div className="space-y-3">
      {(oppLevel || lead.aiInsightSource) && (
        <div className="flex items-center gap-2 flex-wrap">
          {oppLevel && (
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${oppLevel.cls}`}>
              Fırsat Seviyesi: {oppLevel.label}
            </span>
          )}
          {lead.aiInsightSource && (
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
              lead.aiInsightSource === "llm"
                ? "bg-cyan-500/15 text-cyan-200 ring-cyan-400/35"
                : "bg-zinc-500/15 text-zinc-300 ring-zinc-400/25"
            }`}>
              {lead.aiInsightSource === "llm" ? "AI Analizi" : "Kural Tabanlı"}
            </span>
          )}
        </div>
      )}

      <InfoCard>
        <SectionHeader>Skor Dökümü</SectionHeader>
        <div className="grid grid-cols-2 gap-2 p-3">
          {scores.map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">
              <p className={`text-[16px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
              <p className="mt-0.5 text-[9px] text-zinc-600">{label}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      <InfoCard>
        <SectionHeader>İşletme Metrikleri</SectionHeader>
        <div className="grid grid-cols-2 gap-px divide-x divide-y divide-white/[0.04]">
          {[
            { label: "Birim / Oda",      value: lead.units > 0 ? `${lead.units}` : "—" },
            { label: "Gecelik Fiyat",    value: lead.pricePerNight > 0 ? formatTRY(lead.pricePerNight) : "—" },
            { label: "30G Doluluk",      value: `${Math.round((lead.occupancy30d ?? 0) * 100)}%` },
            { label: "Puan",             value: lead.rating > 0 ? lead.rating.toFixed(1) : "—" },
            { label: "Yorum Sayısı",     value: `${lead.reviewsCount ?? 0}` },
            { label: "Dijital Olgunluk", value: `${lead.digitalMaturity ?? 0}` },
          ].map(({ label, value }) => (
            <div key={label} className="px-3 py-2.5">
              <p className="text-[11px] font-semibold text-zinc-200">{value}</p>
              <p className="text-[9px] text-zinc-600">{label}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {(lead.channels ?? []).length > 0 && (
        <InfoCard>
          <SectionHeader>Satış Kanalları</SectionHeader>
          <div className="flex flex-wrap gap-1.5 p-3">
            {lead.channels.map((ch) => (
              <span key={ch} className="rounded-full bg-zinc-500/12 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/10">
                {ch}
              </span>
            ))}
          </div>
        </InfoCard>
      )}

      {(lead.painPointSummary ?? []).length > 0 && (
        <InfoCard>
          <SectionHeader>Ağrı Noktaları</SectionHeader>
          <ul className="space-y-1.5 p-3">
            {(lead.painPointSummary ?? []).slice(0, 4).map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-snug text-zinc-400">
                <span className="shrink-0 text-rose-400 mt-px">▸</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </InfoCard>
      )}

      {(lead.lastAiReviewAt || (lead.reviewCount ?? 0) > 0) && (
        <InfoCard>
          <SectionHeader>AI İnceleme</SectionHeader>
          <div className="divide-y divide-white/[0.04] px-4">
            {lead.lastAiReviewAt && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">Son AI İncelemesi</span>
                <span className="text-[11px] text-zinc-400">{fmtDate(lead.lastAiReviewAt)}</span>
              </div>
            )}
            {(lead.reviewCount ?? 0) > 0 && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">İnceleme Sayısı</span>
                <span className="text-[11px] text-zinc-400">{lead.reviewCount}</span>
              </div>
            )}
          </div>
        </InfoCard>
      )}

      {lead.outreachAngle && (
        <InfoCard>
          <SectionHeader>Satış Açısı</SectionHeader>
          <p className="px-4 py-3 text-[11px] leading-relaxed text-zinc-400">{lead.outreachAngle}</p>
        </InfoCard>
      )}
    </div>
  );
}

// ── Tab 4: Yürütme (Execution) ─────────────────────────────────────────────

function ExecutionTab(props: ExecProps) {
  const { lead, leadState, mutations, lastAction, onAction, cfResult, cfLoading, cfError,
    onFindContact, reenrichLoading, reenrichMsg, reenrichResult, onReenrich,
    msgResult, msgGeneratedAt, msgLoading, msgError, onGenerateMsg,
    noteDraft, onNoteChange, onNoteSave, noteSaved } = props;

  const vo = computeVerifiedOpportunity(lead);
  const outreach = lead.outreachIntelligence;
  const [msgCopied, setMsgCopied] = useState(false);

  const styleLabels: Record<string, string> = {
    consultative: "Danışmanlık", direct: "Doğrudan", educational: "Eğitici",
    relationship: "İlişki Odaklı", "conversion-focused": "Dönüşüm Odaklı",
  };
  const channelLabels: Record<string, string> = {
    whatsapp: "WhatsApp", instagram: "Instagram DM", phone: "Telefon", "website-form": "Web Formu",
  };
  const urgencyLabels: Record<string, string> = { high: "Yüksek", medium: "Orta", low: "Düşük" };
  const tempLabels: Record<string, string> = { hot: "🔥 Sıcak", warm: "⚡ Ilık", cold: "❄ Soğuk" };

  const v = lead.signalVerification;
  const demoItems = [
    { label: "Web sitesi doğrulandı",  ok: v?.websiteVerification === "verified" },
    { label: "WhatsApp bulundu",        ok: v?.whatsappVerification === "verified" || v?.whatsappVerification === "likely" },
    { label: "Instagram bulundu",       ok: v?.instagramVerification === "verified" || v?.instagramVerification === "likely" || v?.instagramVerification === "candidate" },
    { label: "Rezervasyon CTA bulundu", ok: v?.reservationSignal === "verified" || v?.reservationSignal === "detected" },
    { label: "ICP uyumu yüksek",        ok: typeof lead.icpFitScore === "number" && lead.icpFitScore >= 70 },
  ];
  const demoOk    = demoItems.filter((i) => i.ok).length;
  const demoPct   = Math.round((demoOk / demoItems.length) * 100);
  const demoReady = demoPct >= 80;

  const acq    = lead.acquisitionIntelligence;
  const acqSub = acq?.acquisition;
  const timeline = lead.activityTimeline ?? [];

  const now = Date.now();
  const followUpTs = leadState.nextFollowUpAt;
  const isOverdue  = followUpTs !== null && followUpTs !== undefined && followUpTs > 0 && followUpTs < now;
  const isDueToday = followUpTs !== null && followUpTs !== undefined && followUpTs > 0 && followUpTs >= now && followUpTs < now + 86400000;

  const waUrlForMsg = whatsappLink(lead.phone ?? "");

  async function copyMsg() {
    if (!msgResult) return;
    try {
      await navigator.clipboard.writeText(msgResult);
      setMsgCopied(true);
      setTimeout(() => setMsgCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">

      {/* ── SON İŞLEM ────────────────────────────────────────── */}
      {lastAction && (
        <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.06] px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-indigo-400/70 mb-1">
            Son İşlem
          </p>
          <p className="text-[11px] font-semibold text-indigo-200">{lastAction.label}</p>
          <p className="mt-0.5 text-[9px] text-indigo-400/50">{fmtRelative(lastAction.ts)}</p>
        </div>
      )}

      {/* ── STATUS CHIPS ─────────────────────────────────────── */}
      <InfoCard>
        <SectionHeader>Durum</SectionHeader>
        <div className="flex flex-wrap gap-1.5 p-3">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => { mutations.setStatus(s); onAction(`${STATUS_TR[s]} olarak işaretlendi`); }}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset transition
                ${leadState.status === s
                  ? `${STATUS_CHIP_CLS[s]} opacity-100 shadow-sm`
                  : "bg-zinc-500/[0.06] text-zinc-500 ring-white/[0.08] hover:text-zinc-300"
                }`}
            >
              {STATUS_TR[s]}
            </button>
          ))}
          {leadState.doNotContact && (
            <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-400 ring-1 ring-inset ring-rose-400/30">
              İletişim Engeli
            </span>
          )}
        </div>

        {/* Quick mutation buttons */}
        <div className="border-t border-white/[0.05] flex flex-wrap gap-1.5 p-3 pt-2.5">
          <button
            onClick={() => { mutations.markContacted(); onAction("İletişime geçildi kaydedildi"); }}
            disabled={leadState.doNotContact}
            className="flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1.5 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/[0.14] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            İletişime Geçildi
          </button>
          <button
            onClick={() => { mutations.markNoResponse(); onAction("Yanıt yok olarak işaretlendi"); }}
            className="flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1.5 text-[10px] font-medium text-amber-300 transition hover:bg-amber-500/[0.14]"
          >
            Yanıt Yok
          </button>
          <button
            onClick={() => { mutations.markDoNotContact(); onAction("İletişim engeli eklendi"); }}
            disabled={leadState.doNotContact}
            className="flex items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/[0.07] px-2.5 py-1.5 text-[10px] font-medium text-rose-400 transition hover:bg-rose-500/[0.14] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            İletişim Engelle
          </button>
        </div>
      </InfoCard>

      {/* ── FOLLOW-UP INFO ───────────────────────────────────── */}
      <InfoCard>
        <SectionHeader>Takip & İletişim</SectionHeader>
        <div className="divide-y divide-white/[0.04] px-4">
          <div className="flex items-center justify-between py-2">
            <span className="text-[11px] text-zinc-500">İletişim Denemesi</span>
            <span className={`text-[11px] font-semibold tabular-nums ${(leadState.contactAttempts ?? 0) >= 2 ? "text-rose-400" : "text-zinc-300"}`}>
              {leadState.contactAttempts ?? 0}
            </span>
          </div>
          {leadState.lastContactedAt && leadState.lastContactedAt > 0 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">Son İletişim</span>
              <span className="text-[11px] text-zinc-400">{fmtRelative(leadState.lastContactedAt)}</span>
            </div>
          )}
          {followUpTs && followUpTs > 0 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">Sonraki Takip</span>
              <div className="flex items-center gap-1.5">
                {isOverdue && (
                  <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-rose-400 ring-1 ring-inset ring-rose-400/30">
                    Gecikti
                  </span>
                )}
                {isDueToday && !isOverdue && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-400/30">
                    Bugün
                  </span>
                )}
                <span className="text-[11px] text-zinc-400">{fmtDate(followUpTs)}</span>
              </div>
            </div>
          )}
          {leadState.pipelineStage && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">Pipeline Aşaması</span>
              <span className="text-[11px] text-zinc-400">{leadState.pipelineStage}</span>
            </div>
          )}
        </div>
        {/* Schedule follow-up */}
        <div className="border-t border-white/[0.05] flex flex-wrap gap-1.5 px-3 py-2.5">
          <button
            onClick={() => { mutations.scheduleFollowUp(Date.now() + 86400000); onAction("Takip +1 gün olarak planlandı"); }}
            className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-sky-300 transition hover:bg-sky-500/[0.12]"
          >
            +1 Gün
          </button>
          <button
            onClick={() => { mutations.scheduleFollowUp(Date.now() + 3 * 86400000); onAction("Takip +3 gün olarak planlandı"); }}
            className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-sky-300 transition hover:bg-sky-500/[0.12]"
          >
            +3 Gün
          </button>
          <button
            onClick={() => { mutations.scheduleFollowUp(Date.now() + 7 * 86400000); onAction("Takip +7 gün olarak planlandı"); }}
            className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-sky-300 transition hover:bg-sky-500/[0.12]"
          >
            +7 Gün
          </button>
        </div>
      </InfoCard>

      {/* ── NOTES ───────────────────────────────────────────── */}
      <InfoCard>
        <SectionHeader>Notlar</SectionHeader>
        <div className="p-3 space-y-2">
          <textarea
            value={noteDraft}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            placeholder="Not ekle…"
            className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-[11px] text-zinc-300 placeholder-zinc-600 resize-none focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition"
          />
          <div className="flex items-center justify-between">
            {noteSaved ? (
              <span className="text-[9px] font-semibold text-emerald-400">✓ Kaydedildi</span>
            ) : leadState.updatedAt && leadState.updatedAt > 0 ? (
              <span className="text-[9px] text-zinc-600">
                Son güncelleme: {fmtRelative(leadState.updatedAt)}
              </span>
            ) : null}
            <button
              onClick={onNoteSave}
              className={`ml-auto rounded-lg border px-3 py-1.5 text-[10px] font-medium transition ${
                noteSaved
                  ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300"
                  : "border-indigo-500/30 bg-indigo-500/[0.08] text-indigo-300 hover:bg-indigo-500/[0.15]"
              }`}
            >
              {noteSaved ? "Kaydedildi!" : "Kaydet"}
            </button>
          </div>
          {leadState.note && leadState.note !== noteDraft && (
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Kaydedilen not</p>
              <p className="text-[11px] leading-relaxed text-zinc-500 line-clamp-4">{leadState.note}</p>
            </div>
          )}
        </div>
      </InfoCard>

      {/* ── AI MESSAGE GENERATION ───────────────────────────── */}
      <InfoCard>
        <SectionHeader>AI Mesaj Oluştur</SectionHeader>
        <div className="p-3 space-y-2">
          <button
            onClick={onGenerateMsg}
            disabled={msgLoading}
            className="w-full rounded-lg border border-violet-500/25 bg-violet-500/[0.07] px-3 py-2 text-[11px] font-medium text-violet-300 transition hover:bg-violet-500/[0.14] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {msgLoading ? "Mesaj oluşturuluyor…" : "Mesaj Oluştur"}
          </button>
          {msgError && (
            <p className="text-[10px] text-rose-400">{msgError}</p>
          )}
          {msgResult && (
            <div className="rounded-lg border border-white/[0.07] bg-black/25 p-3 space-y-2">
              {msgGeneratedAt && (
                <p className="text-[9px] text-zinc-600">Oluşturuldu: {fmtRelative(msgGeneratedAt)}</p>
              )}
              <p className="text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{msgResult}</p>
              <div className="flex gap-2 pt-1 border-t border-white/[0.05]">
                <button
                  onClick={copyMsg}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  {msgCopied ? "Kopyalandı!" : "Kopyala"}
                </button>
                {waUrlForMsg && (
                  <a
                    href={`https://wa.me/${normalizePhoneForWhatsApp(lead.phone ?? "") ?? ""}?text=${encodeURIComponent(msgResult)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-1.5 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/[0.14]"
                  >
                    WhatsApp&apos;ta Aç
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </InfoCard>

      {/* ── CONTACT FINDER ──────────────────────────────────── */}
      <InfoCard>
        <SectionHeader>İletişim Bulucu</SectionHeader>
        <div className="p-3 space-y-2">
          <button
            onClick={onFindContact}
            disabled={cfLoading}
            className="w-full rounded-lg border border-sky-500/25 bg-sky-500/[0.07] px-3 py-2 text-[11px] font-medium text-sky-300 transition hover:bg-sky-500/[0.14] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cfLoading ? "Aranıyor…" : "En İyi İletişimi Bul"}
          </button>
          {cfError && (
            <p className="text-[10px] text-rose-400">{cfError}</p>
          )}
          {cfResult && (
            <div className="divide-y divide-white/[0.04] rounded-lg border border-white/[0.07] bg-black/20">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] text-zinc-500">Tip</span>
                <span className="text-[11px] font-medium text-zinc-300">{cfResult.bestContactType}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] text-zinc-500">Değer</span>
                <span className="text-[11px] font-medium text-emerald-300 font-mono">{cfResult.bestContactValue}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] text-zinc-500">Güven</span>
                <span className="text-[11px] font-medium text-sky-300">{cfResult.confidence}</span>
              </div>
              <div className="px-3 py-2">
                <span className="text-[9px] text-zinc-600">{cfResult.source}</span>
              </div>
              {(() => {
                const action = cfResultAction(cfResult);
                return action ? (
                  <div className="px-3 py-2.5 border-t border-white/[0.04]">
                    <a
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-medium transition ${action.cls}`}
                    >
                      {action.label}
                    </a>
                  </div>
                ) : null;
              })()}
              {cfResult.foundWhatsapp.length > 0 && (
                <div className="px-3 pb-2 pt-1">
                  <p className="mb-1 text-[9px] uppercase tracking-wider text-zinc-600">WhatsApp</p>
                  {cfResult.foundWhatsapp.slice(0, 3).map((n) => (
                    <a key={n} href={`https://wa.me/${n.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="block text-[10px] text-emerald-400 hover:underline">{n}</a>
                  ))}
                </div>
              )}
              {cfResult.foundInstagram.length > 0 && (
                <div className="px-3 pb-2 pt-1">
                  <p className="mb-1 text-[9px] uppercase tracking-wider text-zinc-600">Instagram</p>
                  {cfResult.foundInstagram.slice(0, 2).map((h) => (
                    <a key={h} href={`https://instagram.com/${h.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"
                      className="block text-[10px] text-fuchsia-400 hover:underline">{h}</a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </InfoCard>

      {/* ── RE-ENRICH ───────────────────────────────────────── */}
      <InfoCard>
        <SectionHeader>Yeniden Zenginleştir</SectionHeader>
        <div className="p-3 space-y-2">
          <button
            onClick={onReenrich}
            disabled={reenrichLoading}
            className="w-full rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/[0.14] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {reenrichLoading ? "Taranıyor…" : "Web Sitesini Yeniden Tara"}
          </button>
          {reenrichMsg && (
            <p className="text-[10px] text-rose-400">{reenrichMsg}</p>
          )}
          {reenrichResult && (
            <div className="rounded-lg border border-white/[0.07] bg-black/20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/80">Tarama Sonucu</span>
                <span className="text-[9px] text-zinc-500">{fmtRelative(reenrichResult.timestamp)}</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {([
                  { label: "Web Sitesi",      found: reenrichResult.websiteFound },
                  { label: "WhatsApp",         found: reenrichResult.whatsappFound },
                  { label: "Instagram",        found: reenrichResult.instagramFound },
                  { label: "Rezervasyon CTA",  found: reenrichResult.reservationFound },
                ] as const).map(({ label, found }) => (
                  <div key={label} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[10px] text-zinc-500">{label}</span>
                    <span className={`text-[10px] font-medium ${found ? "text-emerald-400" : "text-zinc-600"}`}>
                      {found ? "✓ Bulundu" : "—"}
                    </span>
                  </div>
                ))}
                {reenrichResult.opportunityScore !== null && (
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[10px] text-zinc-500">Fırsat Puanı</span>
                    <span className="text-[10px] font-medium text-amber-300">
                      {reenrichResult.opportunityScore}/100
                      {reenrichResult.opportunityTier ? ` · ${reenrichResult.opportunityTier}` : ""}
                    </span>
                  </div>
                )}
                {reenrichResult.websiteConfidenceScore !== null && (
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[10px] text-zinc-500">Website Güveni</span>
                    <span className="text-[10px] text-zinc-400">{reenrichResult.websiteConfidenceScore}/100</span>
                  </div>
                )}
              </div>
              <p className="px-3 py-2 text-[9px] text-zinc-600 border-t border-white/[0.04]">
                Panel verisi kayıt sonrası canlı güncellenmiyor. Değişiklikler bir sonraki yüklemede görünür.
              </p>
            </div>
          )}
          <div className="divide-y divide-white/[0.04]">
            {lead.lastEnrichedAt && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[10px] text-zinc-600">Son Zenginleştirme</span>
                <span className="text-[10px] text-zinc-500">{fmtDate(lead.lastEnrichedAt)}</span>
              </div>
            )}
            {(lead.enrichmentCount ?? 0) > 0 && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[10px] text-zinc-600">Zenginleştirme Sayısı</span>
                <span className="text-[10px] text-zinc-500">{lead.enrichmentCount}</span>
              </div>
            )}
          </div>
        </div>
      </InfoCard>

      {/* ── NEXT BEST ACTION ────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]">
        <div className="border-b border-emerald-500/15 px-4 py-2.5 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-400/80">
            Sonraki En İyi Aksiyon
          </h4>
          <span className={`text-[10px] font-semibold ${SALES_PRIORITY_COLOR[vo.priority]}`}>
            {SALES_PRIORITY_LABELS[vo.priority]}
          </span>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-[12px] font-bold text-emerald-200">{vo.nextBestAction.label}</p>
          <p className="text-[11px] leading-relaxed text-emerald-300/60">{vo.nextBestAction.reason}</p>
        </div>
        {/* Blockers */}
        {vo.blockers.length > 0 && (
          <div className="border-t border-emerald-500/10 px-4 pb-3 pt-2 space-y-1.5">
            {vo.blockers.map((b) => (
              <div key={b.key} className="flex items-start gap-2">
                <span className="shrink-0 text-[10px] text-rose-400 mt-px">!</span>
                <div>
                  <p className="text-[11px] font-medium text-zinc-300">{b.label}</p>
                  <p className="text-[10px] text-zinc-600 capitalize">{b.severity}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PIPELINE STAGE ──────────────────────────────────── */}
      <InfoCard>
        <SectionHeader>Pipeline Durumu</SectionHeader>
        <div className="divide-y divide-white/[0.04] px-4">
          <div className="flex items-center justify-between py-2">
            <span className="text-[11px] text-zinc-500">Aşama</span>
            <span className="text-[11px] font-semibold text-indigo-300">{OPPORTUNITY_STAGE_LABELS[vo.stage]}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[11px] text-zinc-500">Sağlık</span>
            <span className={`text-[11px] font-semibold ${vo.healthColorClass}`}>{vo.healthLabel}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[11px] text-zinc-500">Güven Skoru</span>
            <span className="text-[11px] tabular-nums text-zinc-300">{vo.confidenceScore}/100</span>
          </div>
        </div>
        {/* Founder Insight */}
        {vo.founderInsight && (
          <div className="border-t border-white/[0.05] px-4 pb-3 pt-2">
            <p className="text-[10px] leading-relaxed text-zinc-500">{vo.founderInsight}</p>
          </div>
        )}
      </InfoCard>

      {/* ── DEMO READINESS ──────────────────────────────────── */}
      <InfoCard>
        <div className="border-b border-white/[0.06] px-4 py-2.5 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Demo Hazırlığı
          </h4>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
            demoReady
              ? "bg-emerald-500/12 text-emerald-200 ring-emerald-400/30"
              : "bg-zinc-500/12 text-zinc-400 ring-white/10"
          }`}>
            {demoPct}%{demoReady ? " — Hazır" : ""}
          </span>
        </div>
        <div className="divide-y divide-white/[0.04] px-4">
          {demoItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1.5">
              <span className="text-[11px] text-zinc-400">{item.label}</span>
              <span className={`text-[10px] font-semibold ${item.ok ? "text-emerald-400" : "text-zinc-600"}`}>
                {item.ok ? "✓" : "—"}
              </span>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* ── OUTREACH INTELLIGENCE ───────────────────────────── */}
      {outreach && (
        <InfoCard>
          <SectionHeader>Temas Zekası</SectionHeader>
          <div className="divide-y divide-white/[0.04] px-4">
            {outreach.outreachStyle && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">Temas Stili</span>
                <span className="text-[11px] font-medium text-zinc-300">
                  {styleLabels[outreach.outreachStyle] ?? outreach.outreachStyle}
                </span>
              </div>
            )}
            {outreach.recommendedChannel && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">Önerilen Kanal</span>
                <span className="text-[11px] font-medium text-sky-300">
                  {channelLabels[outreach.recommendedChannel] ?? outreach.recommendedChannel}
                </span>
              </div>
            )}
            {outreach.urgencyLevel && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">Aciliyet</span>
                <span className={`text-[11px] font-medium ${
                  outreach.urgencyLevel === "high" ? "text-rose-300" : outreach.urgencyLevel === "medium" ? "text-amber-300" : "text-zinc-400"
                }`}>
                  {urgencyLabels[outreach.urgencyLevel] ?? outreach.urgencyLevel}
                </span>
              </div>
            )}
            {outreach.leadTemperature && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">Lead Sıcaklığı</span>
                <span className="text-[11px] font-medium text-zinc-300">
                  {tempLabels[outreach.leadTemperature] ?? outreach.leadTemperature}
                </span>
              </div>
            )}
          </div>
          {(outreach.rationale ?? []).length > 0 && (
            <div className="border-t border-white/[0.05] px-4 pb-3 pt-2">
              <p className="mb-1.5 text-[9px] uppercase tracking-wider text-zinc-600">Gerekçe</p>
              <p className="text-[10px] leading-relaxed text-zinc-600 line-clamp-3">
                {outreach.rationale.filter(Boolean).slice(0, 3).join(" · ")}
              </p>
            </div>
          )}
        </InfoCard>
      )}

      {/* ── ACQUISITION INTELLIGENCE ─────────────────────────── */}
      {acq && (
        <InfoCard>
          <SectionHeader>Edinim İstihbaratı</SectionHeader>
          <div className="divide-y divide-white/[0.04] px-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">Edinim Baskısı</span>
              <span className={`text-[11px] font-medium ${
                acq.acquisitionPressureScore >= 60 ? "text-emerald-300" :
                acq.acquisitionPressureScore >= 35 ? "text-amber-300" : "text-zinc-400"
              }`}>
                {acq.acquisitionPressureScore}
              </span>
            </div>
            {acqSub?.acquisitionIntentScore !== undefined && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">Niyet Skoru</span>
                <span className="text-[11px] font-medium text-zinc-300">{acqSub.acquisitionIntentScore}</span>
              </div>
            )}
            {acqSub?.isAcquisitionActive !== undefined && (
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-zinc-500">Edinim Aktif</span>
                <span className={`text-[11px] font-medium ${acqSub.isAcquisitionActive ? "text-emerald-300" : "text-zinc-500"}`}>
                  {acqSub.isAcquisitionActive ? "Evet" : "Hayır"}
                </span>
              </div>
            )}
          </div>
          {acqSub && acqSub.acquisitionChannels.length > 0 && (
            <div className="border-t border-white/[0.05] px-4 pb-2 pt-2">
              <p className="mb-1.5 text-[9px] uppercase tracking-wider text-zinc-500">Edinim Kanalları</p>
              <div className="flex flex-wrap gap-1">
                {acqSub.acquisitionChannels.slice(0, 5).map((ch) => (
                  <span key={ch} className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/[0.08]">
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          )}
          {acqSub && (acqSub.acquisitionSignals ?? []).length > 0 && (
            <div className="border-t border-white/[0.05] px-4 pb-2 pt-2">
              <p className="mb-1.5 text-[9px] uppercase tracking-wider text-zinc-500">Edinim Sinyalleri</p>
              <div className="space-y-0.5">
                {(acqSub.acquisitionSignals ?? []).slice(0, 4).map((s) => (
                  <p key={s} className="text-[10px] text-zinc-500">· {s}</p>
                ))}
              </div>
            </div>
          )}
          {acqSub && (acqSub.acquisitionWeaknesses ?? []).length > 0 && (
            <div className="border-t border-white/[0.05] px-4 pb-2 pt-2">
              <p className="mb-1.5 text-[9px] uppercase tracking-wider text-zinc-500">Zayıf Noktalar</p>
              <div className="space-y-0.5">
                {(acqSub.acquisitionWeaknesses ?? []).slice(0, 3).map((s) => (
                  <p key={s} className="text-[10px] text-rose-400/70">· {s}</p>
                ))}
              </div>
            </div>
          )}
        </InfoCard>
      )}

      {/* ── ACTIVITY TIMELINE ───────────────────────────────── */}
      {timeline.length > 0 && (
        <InfoCard>
          <SectionHeader>Aktivite Zaman Çizelgesi</SectionHeader>
          <div className="space-y-1.5 p-3">
            {timeline.slice(0, 12).map((entry) => (
              <div key={entry.id} className="flex items-start gap-2">
                <span className="shrink-0 text-[10px] tabular-nums text-zinc-600 pt-px">
                  {fmtDate(entry.timestamp) ?? "—"}
                </span>
                <span className="text-[11px] leading-snug text-zinc-400">
                  {activityLabel(entry)}
                </span>
              </div>
            ))}
          </div>
        </InfoCard>
      )}

      {/* ── ENRICHMENT METADATA ─────────────────────────────── */}
      <InfoCard>
        <SectionHeader>Veri Kaydı</SectionHeader>
        <div className="divide-y divide-white/[0.04] px-4">
          {lead.firstImportedAt && lead.firstImportedAt > 0 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">İlk Ekleme</span>
              <span className="text-[11px] text-zinc-400">{fmtDate(lead.firstImportedAt)}</span>
            </div>
          )}
          {lead.lastVerificationAt && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">Son Doğrulama</span>
              <span className="text-[11px] text-zinc-400">{fmtDate(lead.lastVerificationAt)}</span>
            </div>
          )}
          {(lead.verificationCount ?? 0) > 0 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">Doğrulama Sayısı</span>
              <span className="text-[11px] text-zinc-400">{lead.verificationCount}</span>
            </div>
          )}
          {typeof lead.lastOpportunityScore === "number" && (
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] text-zinc-500">Son Fırsat Puanı</span>
              <span className="text-[11px] text-zinc-400">{lead.lastOpportunityScore}/100</span>
            </div>
          )}
        </div>
      </InfoCard>
    </div>
  );
}

// ── Profile Header ─────────────────────────────────────────────────────────

function ProfileHeader({ lead }: { lead: ScoredLead }) {
  const initials    = hotelInitials(lead.name);
  const avatarColor = AVATAR_COLORS[stableAvatarIdx(lead.id)];

  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${avatarColor}`}>
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-zinc-100 leading-tight">{lead.name}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {lead.city}{lead.type ? ` · ${lead.type}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Tab Navigation ─────────────────────────────────────────────────────────

type IntelligenceTab = "overview" | "opportunity" | "revenue" | "execution";

const TAB_LABELS: Record<IntelligenceTab, string> = {
  overview:    "Genel",
  opportunity: "Fırsat",
  revenue:     "Gelir",
  execution:   "Yürütme",
};

// ── Main Export ────────────────────────────────────────────────────────────

export default function LeadIntelligencePanel({
  lead,
  mode = "full",
}: {
  lead: ScoredLead;
  mode?: IntelligencePanelMode;
}) {
  void mode; // reserved for compact/queue/founder rendering in future sprints

  const [tab, setTab] = useState<IntelligenceTab>("overview");

  // ── Mutation hook ──────────────────────────────────────────────────────
  const mutations = useLeadMutations(lead.id);
  const { leadState } = mutations;

  // ── V2 panel persistence ───────────────────────────────────────────────
  const panelState = useV2PanelState(lead.id);
  const hydratedRef = useRef<string | null>(null);

  // ── Note draft ────────────────────────────────────────────────────────
  const [noteDraft, setNoteDraft] = useState("");
  // Sync from localStorage on mount and whenever the selected lead changes
  useEffect(() => {
    if (mutations.mounted) {
      setNoteDraft(mutations.leadState.note ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, mutations.mounted]);

  // ── Last action feedback ───────────────────────────────────────────────
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);

  function handleAction(label: string) {
    setLastAction({ label, ts: Date.now() });
  }

  function handleNoteSave() {
    mutations.updateNote(noteDraft);
    handleAction("Not kaydedildi");
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  // ── Contact Finder state ───────────────────────────────────────────────
  const [cfResult, setCfResult] = useState<CFResult | null>(null);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);

  // ── Re-enrich result state ─────────────────────────────────────────────
  const [reenrichResult, setReenrichResult] = useState<V2ReenrichSummary | null>(null);

  // ── AI message timestamp ───────────────────────────────────────────────
  const [msgGeneratedAt, setMsgGeneratedAt] = useState<number | null>(null);

  // ── Hydrate from localStorage on mount and when lead switches ──────────
  useEffect(() => {
    if (!panelState.mounted) return;
    if (hydratedRef.current === lead.id) return;
    hydratedRef.current = lead.id;
    // Read directly from storage for the freshest snapshot
    const e = loadV2PanelEntry(lead.id);
    if (e.generatedMessage) {
      setMsgResult(e.generatedMessage);
      setMsgGeneratedAt(e.generatedMessageAt);
    } else {
      setMsgResult(null);
      setMsgGeneratedAt(null);
    }
    setCfResult((e.cfResult ?? null) as CFResult | null);
    setReenrichResult(e.reenrichSummary ?? null);
    // Clear transient error state from previous lead
    setCfError(null);
    setReenrichMsg(null);
    setMsgError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, panelState.mounted]);

  async function handleFindContact() {
    setCfLoading(true);
    setCfError(null);

    // Prefer verified website; fall back to candidate URL from enrichment
    const websiteToUse =
      lead.website?.trim() || lead.websiteCandidateUrl?.trim() || undefined;
    const hasPhone = Boolean(lead.phone?.trim());
    const hasInstagram = Boolean(lead.instagram?.trim());

    if (!websiteToUse && !hasPhone && !hasInstagram) {
      setCfError("Contact Finder için web sitesi, telefon veya Instagram gerekli.");
      setCfLoading(false);
      return;
    }

    async function callCF(payload: { website?: string; phone?: string; instagram?: string }) {
      const r = await fetch("/api/contact-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as CFResult & { error?: string };
      return { res: r, data: d };
    }

    try {
      // Build first payload with all available fields
      const firstPayload: { website?: string; phone?: string; instagram?: string } = {};
      if (websiteToUse) firstPayload.website = websiteToUse;
      if (hasPhone) firstPayload.phone = lead.phone!;
      if (hasInstagram) firstPayload.instagram = lead.instagram!;

      let { res, data } = await callCF(firstPayload);

      // If website fetch failed on the server side, retry using phone/instagram only
      if (!res.ok && res.status === 502 && websiteToUse && (hasPhone || hasInstagram)) {
        const fallback: { phone?: string; instagram?: string } = {};
        if (hasPhone) fallback.phone = lead.phone!;
        if (hasInstagram) fallback.instagram = lead.instagram!;
        const retry = await callCF(fallback);
        if (retry.res.ok && typeof retry.data.bestContactType === "string") {
          res = retry.res;
          data = retry.data;
        }
      }

      if (!res.ok) {
        const apiErr = data.error ?? `Hata (${res.status})`;
        if (res.status === 502) {
          const noFallback = !hasPhone && !hasInstagram;
          throw new Error(
            noFallback
              ? "Web sitesine erişilemedi. Alternatif iletişim bilgisi bulunamadı."
              : "Web sitesine erişilemedi ve telefon/Instagram fallback da başarısız.",
          );
        }
        if (apiErr.includes("website, phone, or instagram is required")) {
          throw new Error("Contact Finder için iletişim bilgisi gerekli.");
        }
        throw new Error(apiErr);
      }

      if (typeof data.bestContactType !== "string") throw new Error("Geçersiz API yanıtı");

      setCfResult(data);
      panelState.saveCfResult(data as import("@/app/hooks/useV2PanelState").V2CFResult);
      handleAction("İletişim bilgisi bulundu");
    } catch (e) {
      setCfError(e instanceof Error ? e.message : "İletişim bulunamadı");
    } finally {
      setCfLoading(false);
    }
  }

  // ── Re-enrich state ────────────────────────────────────────────────────
  const [reenrichLoading, setReenrichLoading] = useState(false);
  const [reenrichMsg, setReenrichMsg] = useState<string | null>(null);

  async function handleReenrich() {
    setReenrichLoading(true);
    setReenrichMsg(null);
    try {
      const res = await fetch("/api/re-enrich-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead }),
      });
      const data = (await res.json()) as { lead?: ScoredLead; error?: string };
      if (!res.ok) {
        const apiErr = data.error ?? `Hata (${res.status})`;
        if (res.status === 400) throw new Error(`Geçersiz istek: ${apiErr}`);
        if (res.status === 500) throw new Error(`Zenginleştirme hatası: ${apiErr}`);
        throw new Error(apiErr);
      }

      const updated = data.lead;
      const sv = updated?.signalVerification;

      const summary: V2ReenrichSummary = {
        websiteFound:
          sv?.websiteVerification === "verified" ||
          sv?.websiteVerification === "reachable" ||
          Boolean(updated?.website),
        whatsappFound:
          sv?.whatsappVerification === "verified" ||
          sv?.whatsappVerification === "likely",
        instagramFound:
          sv?.instagramVerification === "verified" ||
          sv?.instagramVerification === "likely" ||
          sv?.instagramVerification === "candidate",
        reservationFound:
          sv?.reservationSignal === "verified" ||
          sv?.reservationSignal === "detected",
        websiteConfidenceScore: typeof sv?.websiteConfidence === "number" ? sv.websiteConfidence : null,
        opportunityScore: updated?.verifiedOpportunityScore ?? null,
        opportunityTier: updated?.opportunityTier ?? null,
        timestamp: Date.now(),
      };

      setReenrichResult(summary);
      panelState.saveReenrichSummary(summary);
      handleAction("Zenginleştirme tamamlandı");
    } catch (e) {
      setReenrichMsg(e instanceof Error ? e.message : "Zenginleştirme hatası");
    } finally {
      setReenrichLoading(false);
    }
  }

  // ── AI Message state ───────────────────────────────────────────────────
  const [msgResult, setMsgResult] = useState<string | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);

  async function handleGenerateMsg() {
    setMsgLoading(true);
    setMsgError(null);
    try {
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
          followUp: false,
          regenerateNonce: Date.now(),
          intelligenceScore: lead.intelligenceScore ?? 0,
          hasWhatsAppPath: Boolean(normalizePhoneForWhatsApp(lead.phone ?? "")),
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
        message?: string;
        styles?: { direct?: string; soft?: string; premium?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Hata (${res.status})`);
      const msg =
        data.message?.trim() ||
        data.styles?.direct?.trim() ||
        data.styles?.soft?.trim() ||
        "";
      if (!msg) throw new Error("Boş mesaj döndü");
      const generatedAt = Date.now();
      setMsgResult(msg);
      setMsgGeneratedAt(generatedAt);
      panelState.saveGeneratedMessage(msg);
      handleAction("AI mesajı oluşturuldu");
    } catch (e) {
      setMsgError(e instanceof Error ? e.message : "Mesaj oluşturulamadı");
    } finally {
      setMsgLoading(false);
    }
  }

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
      {/* Profile */}
      <ProfileHeader lead={lead} />

      {/* Quick Actions */}
      <QuickActions
        lead={lead}
        cfLoading={cfLoading}
        reenrichLoading={reenrichLoading}
        msgLoading={msgLoading}
        onFindContact={handleFindContact}
        onReenrich={handleReenrich}
        onGenerateMsg={handleGenerateMsg}
      />

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-white/[0.06]">
        {(Object.keys(TAB_LABELS) as IntelligenceTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition ${
              tab === t
                ? "text-indigo-400 border-b-2 border-indigo-400 -mb-px"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "overview"    && <OverviewTab    lead={lead} />}
        {tab === "opportunity" && <OpportunityTab lead={lead} />}
        {tab === "revenue"     && <RevenueTab     lead={lead} />}
        {tab === "execution"   && (
          <ExecutionTab
            lead={lead}
            leadState={leadState}
            mutations={mutations}
            lastAction={lastAction}
            onAction={handleAction}
            cfResult={cfResult}
            cfLoading={cfLoading}
            cfError={cfError}
            onFindContact={handleFindContact}
            reenrichLoading={reenrichLoading}
            reenrichMsg={reenrichMsg}
            reenrichResult={reenrichResult}
            onReenrich={handleReenrich}
            msgResult={msgResult}
            msgGeneratedAt={msgGeneratedAt}
            msgLoading={msgLoading}
            msgError={msgError}
            onGenerateMsg={handleGenerateMsg}
            noteDraft={noteDraft}
            onNoteChange={setNoteDraft}
            onNoteSave={handleNoteSave}
            noteSaved={noteSaved}
          />
        )}
      </div>
    </div>
  );
}
