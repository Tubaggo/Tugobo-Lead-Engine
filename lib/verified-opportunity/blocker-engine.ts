import type { ScoredLead } from "@/app/lib/leads";

export type BlockerKey =
  | "no_website"
  | "no_whatsapp"
  | "no_booking_engine"
  | "weak_instagram"
  | "low_review_count"
  | "unknown_contact"
  | "outdated_enrichment"
  | "no_response"
  | "do_not_contact";

export type Blocker = {
  key: BlockerKey;
  label: string;
  severity: "critical" | "major" | "minor";
};

const BLOCKER_META: Record<BlockerKey, { label: string; severity: Blocker["severity"] }> = {
  no_website: { label: "Web sitesi yok", severity: "critical" },
  no_whatsapp: { label: "WhatsApp bulunamadı", severity: "critical" },
  no_booking_engine: { label: "Rezervasyon motoru yok", severity: "major" },
  weak_instagram: { label: "Zayıf Instagram varlığı", severity: "minor" },
  low_review_count: { label: "Düşük inceleme sayısı", severity: "minor" },
  unknown_contact: { label: "Doğrulanmış iletişim yok", severity: "critical" },
  outdated_enrichment: { label: "Zenginleştirme güncel değil", severity: "major" },
  no_response: { label: "Yanıt alınamadı", severity: "major" },
  do_not_contact: { label: "İletişim engeli var", severity: "critical" },
};

export function computeBlockers(lead: ScoredLead): Blocker[] {
  const blockers: Blocker[] = [];
  const v = lead.signalVerification;
  const add = (key: BlockerKey) =>
    blockers.push({ key, ...BLOCKER_META[key] });

  if (lead.doNotContact) {
    add("do_not_contact");
    return blockers;
  }

  // Website presence
  const webOk = v
    ? v.websiteVerification === "verified" || v.websiteVerification === "reachable"
    : lead.hasOwnWebsite;
  if (!webOk) add("no_website");

  // WhatsApp reachability
  const waOk = v
    ? v.whatsappVerification === "verified" || v.whatsappVerification === "likely"
    : false;
  if (!waOk) add("no_whatsapp");

  // Booking / reservation capability
  const hasBooking =
    v?.reservationSignal === "verified" ||
    v?.reservationSignal === "detected" ||
    (lead.channels ?? []).some((c) => ["Direct", "Booking", "Airbnb"].includes(c));
  if (!hasBooking) add("no_booking_engine");

  // Instagram quality
  const igVerified =
    v?.instagramVerification === "verified" || v?.instagramVerification === "likely";
  const igConfidence =
    typeof lead.instagramConfidence === "number" ? lead.instagramConfidence : 0;
  const igOk = igVerified || (lead.hasInstagram && igConfidence >= 50);
  if (!igOk) add("weak_instagram");

  // Review count threshold
  if ((lead.reviewsCount ?? 0) < 5) add("low_review_count");

  // Contact identity gap
  const hasContactInfo =
    !!lead.contactName ||
    (lead.extractedPhones ?? []).length > 0 ||
    (lead.extractedEmails ?? []).length > 0;
  if (!hasContactInfo) add("unknown_contact");

  // Enrichment staleness (> 30 days)
  if (lead.lastEnrichedAt) {
    const daysSince =
      (Date.now() - new Date(lead.lastEnrichedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) add("outdated_enrichment");
  }

  // No reply after repeated attempts
  const attempts = lead.contactAttempts ?? 0;
  if (attempts >= 2 && typeof lead.lastContactedAt === "number") {
    const daysSince =
      (Date.now() - lead.lastContactedAt) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) add("no_response");
  }

  return blockers.slice(0, 6);
}
