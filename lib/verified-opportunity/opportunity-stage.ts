import type { ScoredLead } from "@/app/lib/leads";

export type OpportunityStage =
  | "DISCOVERED"
  | "QUALIFIED"
  | "VERIFIED"
  | "CONTACT_READY"
  | "CONTACTED"
  | "REPLIED"
  | "DEMO_BOOKED"
  | "NEGOTIATION"
  | "CUSTOMER"
  | "LOST";

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  DISCOVERED: "Keşfedildi",
  QUALIFIED: "Uygun Bulundu",
  VERIFIED: "Doğrulandı",
  CONTACT_READY: "İletişime Hazır",
  CONTACTED: "İletişime Geçildi",
  REPLIED: "Yanıt Alındı",
  DEMO_BOOKED: "Demo Planlandı",
  NEGOTIATION: "Müzakere",
  CUSTOMER: "Müşteri",
  LOST: "Kaybedildi",
};

export const OPPORTUNITY_STAGE_RANK: Record<OpportunityStage, number> = {
  LOST: -1,
  DISCOVERED: 0,
  QUALIFIED: 1,
  VERIFIED: 2,
  CONTACT_READY: 3,
  CONTACTED: 4,
  REPLIED: 5,
  DEMO_BOOKED: 6,
  NEGOTIATION: 7,
  CUSTOMER: 8,
};

export function deriveOpportunityStage(lead: ScoredLead): OpportunityStage {
  if (lead.doNotContact) return "LOST";

  const ps = (lead.pipelineStage ?? "").toLowerCase();
  if (ps.includes("lost") || ps.includes("kaybedildi")) return "LOST";
  if (
    ps.includes("customer") ||
    ps.includes("won") ||
    ps.includes("musteri") ||
    ps.includes("müşteri")
  ) return "CUSTOMER";
  if (
    ps.includes("negotiation") ||
    ps.includes("muzakere") ||
    ps.includes("müzakere")
  ) return "NEGOTIATION";
  if (ps.includes("demo")) return "DEMO_BOOKED";
  if (
    ps.includes("replied") ||
    ps.includes("yanit") ||
    ps.includes("yanıt") ||
    ps.includes("reply")
  ) return "REPLIED";

  const hasContact =
    typeof lead.lastContactedAt === "number" && lead.lastContactedAt > 0;
  const attempts = lead.contactAttempts ?? 0;

  if (hasContact || attempts > 0) {
    if (attempts > 2) return "REPLIED";
    return "CONTACTED";
  }

  const v = lead.signalVerification;
  const hasVerifiedChannel =
    v?.whatsappVerification === "verified" ||
    v?.websiteVerification === "verified";
  const hasIcp = (lead.icpFitScore ?? 0) >= 40;
  const hasVos = (lead.verifiedOpportunityScore ?? 0) >= 55;

  if (hasVerifiedChannel && hasIcp && hasVos) return "CONTACT_READY";

  const hasAnySignal =
    v?.whatsappVerification === "verified" ||
    v?.whatsappVerification === "likely" ||
    v?.websiteVerification === "verified" ||
    v?.websiteVerification === "reachable";

  if (hasAnySignal && hasIcp) return "VERIFIED";

  const hasScore =
    (lead.leadScore ?? 0) >= 45 && (lead.icpFitScore ?? 0) >= 30;
  if (hasScore) return "QUALIFIED";

  return "DISCOVERED";
}
