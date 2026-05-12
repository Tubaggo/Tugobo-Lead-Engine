import { normalizePhoneForWhatsApp, type ScoredLead } from "@/app/lib/leads";
import type { Locale } from "@/app/lib/i18n";
import type { SignalConfidence } from "@/app/lib/intelligence/confidence";

const MAX_BULLETS = 4;

function isStrongWebsiteConfidence(c: SignalConfidence | undefined): boolean {
  return c === "confirmed" || c === "likely";
}

function instagramMatchIsLowTrust(lead: ScoredLead): boolean {
  if (!lead.hasInstagram && !lead.instagram?.trim()) return false;
  const c = lead.instagramConfidence;
  if (typeof c === "number") return c < 45;
  return c === "weak" || c === "missing" || c === "unknown";
}

function reviewIsStale(daysSince: number): boolean {
  return Number.isFinite(daysSince) && daysSince > 21;
}

function reviewLooksRecent(daysSince: number, reviewsCount: number): boolean {
  return reviewsCount > 0 && Number.isFinite(daysSince) && daysSince <= 7;
}

/**
 * Short bullets derived only from fields present on the lead — no LLM, no guessing beyond labels.
 */
export function buildSalesSignalSourceBullets(lead: ScoredLead, locale: Locale): string[] {
  const tr = locale === "tr";
  const candidates: string[] = [];

  const wi = lead.websiteIntelligence;
  const url = lead.website?.trim();
  const siteConf = lead.websiteConfidence ?? wi?.websiteConfidence;

  if (wi?.hasWhatsAppLink) {
    candidates.push(tr ? "Web sitesinde WhatsApp linki bulundu" : "WhatsApp link found on website");
  }

  const phoneWa =
    normalizePhoneForWhatsApp(lead.phone) !== null && !lead.whatsappInvalid;
  if (phoneWa && !wi?.hasWhatsAppLink) {
    candidates.push(
      tr
        ? "Kayıtlı numara WhatsApp ile açılabilir görünüyor"
        : "Saved number looks usable for WhatsApp",
    );
  }

  if (lead.channels.includes("Booking")) {
    candidates.push(tr ? "Booking görünürlüğü mevcut" : "Listed on Booking");
  }

  if (lead.channels.includes("Airbnb")) {
    candidates.push(tr ? "Airbnb görünürlüğü mevcut" : "Listed on Airbnb");
  }

  if (lead.channels.includes("Tatilsepeti")) {
    candidates.push(tr ? "Tatil Sepeti görünürlüğü mevcut" : "Listed on Tatilsepeti");
  }

  if (wi?.hasBookingCtaText || lead.hasReservationCTA) {
    candidates.push(
      tr
        ? "Sitede rezervasyon çağrısı metni tespit edildi"
        : "Booking CTA text detected on site crawl",
    );
  }

  if (url && isStrongWebsiteConfidence(siteConf)) {
    candidates.push(tr ? "Web sitesi erişilebilir görünüyor" : "Website looks reachable from signals");
  } else if (url && siteConf && !isStrongWebsiteConfidence(siteConf)) {
    candidates.push(tr ? "Web adresi kayıtlı; güven sinyali sınırlı" : "Website URL on file; confidence is limited");
  } else if (url && lead.hasOwnWebsite) {
    candidates.push(tr ? "Web sitesi bilgisi kayıtlı" : "Website URL on record");
  } else if (lead.hasOwnWebsite && !url) {
    candidates.push(tr ? "Kendi sitesi olduğu işaretlenmiş" : "Marked as having own website");
  }

  if (instagramMatchIsLowTrust(lead)) {
    candidates.push(tr ? "Instagram eşleşmesi düşük güven" : "Instagram match is low-confidence");
  } else if (lead.hasInstagram && lead.instagram?.trim()) {
    candidates.push(tr ? "Instagram kullanıcı adı kayıtlı" : "Instagram username on record");
  }

  if (reviewIsStale(lead.daysSinceLastReview)) {
    candidates.push(tr ? "Son yorum eski görünüyor" : "Latest review looks dated");
  } else if (reviewLooksRecent(lead.daysSinceLastReview, lead.reviewsCount)) {
    candidates.push(
      tr ? "Son günlerde yorum aktivitesi var" : "Recent review activity in the last week",
    );
  }

  const out: string[] = [];
  for (const line of candidates) {
    if (out.length >= MAX_BULLETS) break;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}
