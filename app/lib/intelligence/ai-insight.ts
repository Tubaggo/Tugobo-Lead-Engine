import type { BusinessSignal } from "./signals";
import type { OutreachIntelligenceProfile } from "./outreach-intelligence";

export type OpportunityLevel = "low" | "medium" | "high";

export type AiInsightSource = "rules" | "llm";

/** Narrow input so this module does not import `leads.ts` (avoids circular deps). */
export type LeadForAiInsight = {
  businessSignals?: BusinessSignal[];
  reviewPainPoints?: Array<{
    category: string;
    severity: "low" | "medium" | "high";
    summary?: string;
  }>;
  websiteIntelligence?: {
    hasBookingCtaText?: boolean;
    hasWhatsAppLink?: boolean;
    hasBookingEngine?: boolean;
  };
  heuristicOutreachAngle?: string;
  hotScore: number;
  leadScore: number;
  intelligenceScore?: number;
  smartLeadScoreV2?: number;
  reviewIntelligenceScore?: number;
  contactQuality: "high" | "medium" | "low";
  hasWhatsAppPath: boolean;
  hasInstagram: boolean;
  hasOwnWebsite: boolean;
  channels: readonly string[];
  /**
   * Optional outreach intelligence profile.
   * When present, message generation adapts tone (consultative, relationship,
   * conversion-focused, etc.) instead of always defaulting to soft.
   */
  outreachIntelligence?: OutreachIntelligenceProfile;
};

export type LeadAiInsight = {
  aiInsight: string;
  outreachAngle: string;
  painPointSummary: string[];
  opportunityLevel: OpportunityLevel;
  source: AiInsightSource;
};

export type OutreachMessageStyle = "soft" | "direct" | "premium";

export type LeadWhatsAppMessagePack = {
  message: string;
  styles: Record<OutreachMessageStyle, string>;
  weakSignals: boolean;
};

const SEVERITY_RANK: Record<"low" | "medium" | "high", number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function uniqStrings(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function reviewPainToLabel(category: string, summary?: string): string | null {
  const s = summary?.trim();
  switch (category) {
    case "response_delay":
      return "Possible response delay";
    case "unreachable":
      return "Guest reachability concerns in reviews";
    case "reservation":
      return "Reservation or booking friction in reviews";
    case "communication":
      return "Communication gaps mentioned in reviews";
    case "cleanliness":
      return "Operations/cleanliness signals in reviews";
    case "value":
      return "Value-for-money concerns in reviews";
    case "other":
      return s || "Review-flagged guest concern";
    default:
      return s || null;
  }
}

function signalPainLabel(signal: BusinessSignal): string | null {
  switch (signal) {
    case "conversion_gap":
      return "Weak or unclear direct booking flow";
    case "missing_own_website":
      return "No owned website on listing";
    case "weak_digital_presence":
      return "Limited owned digital footprint";
    case "ota_dependency":
      return "Heavy platform dependence";
    case "single_channel_risk":
      return "Revenue concentrated on few channels";
    case "reputation_risk":
      return "Reputation attention may help";
    case "review_recency_stale":
      return "Reviews look less recent online";
    case "instagram_presence_gap":
      return "Social funnel gap for this scale";
    case "premium_without_owned_funnel":
      return "Premium positioning without a strong owned funnel";
    case "landline_or_unclear_phone":
      return "Phone not ideal for instant outreach";
    case "no_listed_phone":
      return "No listed phone";
    case "weak_booking_cta":
      return "Booking CTA appears weak or unclear";
    case "no_booking_flow":
      return "No clear direct booking flow";
    case "external_only_booking_dependency":
      return "Booking path appears external/OTA dependent";
    case "weak_contact_visibility":
      return "Weak contact visibility on public surfaces";
    case "low_operational_activity":
      return "Recent operational activity looks softer";
    default:
      return null;
  }
}

/** Bullet-style pain summary for UI and LLM context. */
export function getPainPointSummary(
  lead: LeadForAiInsight,
  max = 5,
): string[] {
  const collected: string[] = [];

  const sortedReviews = [...(lead.reviewPainPoints ?? [])].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
  for (const p of sortedReviews) {
    const label = reviewPainToLabel(p.category, p.summary);
    if (label) collected.push(label);
  }

  const priority: BusinessSignal[] = [
    "reputation_risk",
    "conversion_gap",
    "ota_dependency",
    "weak_digital_presence",
    "missing_own_website",
    "single_channel_risk",
    "premium_without_owned_funnel",
    "external_only_booking_dependency",
    "no_booking_flow",
    "weak_booking_cta",
    "weak_contact_visibility",
    "low_operational_activity",
    "instagram_presence_gap",
    "review_recency_stale",
    "landline_or_unclear_phone",
    "no_listed_phone",
  ];
  const sigSet = new Set(lead.businessSignals ?? []);
  for (const s of priority) {
    if (!sigSet.has(s)) continue;
    const label = signalPainLabel(s);
    if (label) collected.push(label);
  }

  if (lead.websiteIntelligence?.hasBookingCtaText === false) {
    collected.push("Website may lack a clear booking call-to-action");
  }
  if (
    lead.hasOwnWebsite &&
    lead.websiteIntelligence?.hasBookingEngine === false &&
    sigSet.has("conversion_gap")
  ) {
    collected.push("Owned site present but booking path looks thin");
  }

  if (lead.hasWhatsAppPath && lead.contactQuality === "high") {
    collected.push("Direct outreach available (WhatsApp-ready)");
  } else if (lead.hasInstagram) {
    collected.push("Instagram available as a contact surface");
  }

  return uniqStrings(collected, max);
}

function blendScore(lead: LeadForAiInsight): number {
  if (
    typeof lead.smartLeadScoreV2 === "number" &&
    Number.isFinite(lead.smartLeadScoreV2)
  ) {
    return lead.smartLeadScoreV2;
  }
  const intel = lead.intelligenceScore ?? 0;
  return Math.round(
    lead.hotScore * 0.35 + lead.leadScore * 0.3 + intel * 0.35,
  );
}

export function getOpportunityLevel(lead: LeadForAiInsight): OpportunityLevel {
  const pains = getPainPointSummary(lead, 8);
  const blend = blendScore(lead);
  const reviewIntel = lead.reviewIntelligenceScore ?? 0;
  const reachable =
    (lead.hasWhatsAppPath && lead.contactQuality !== "low") ||
    lead.hasInstagram;

  const strongProblem =
    pains.length >= 2 ||
    (lead.reviewPainPoints?.length ?? 0) > 0 ||
    reviewIntel >= 55;

  if (reachable && strongProblem && blend >= 62) return "high";
  if (reachable && (strongProblem || blend >= 55)) return "medium";
  if (blend >= 48 || pains.length >= 1) return "medium";
  return "low";
}

export function getOutreachAngle(lead: LeadForAiInsight): string {
  const pains = getPainPointSummary(lead, 6);
  const hasCommDelay = pains.some((p) =>
    p.toLowerCase().includes("response delay"),
  );
  const hasBookingWeak = pains.some(
    (p) =>
      p.toLowerCase().includes("booking") ||
      p.toLowerCase().includes("booking flow"),
  );
  const hasOta = (lead.businessSignals ?? []).includes("ota_dependency");
  const hasWhatsapp =
    lead.hasWhatsAppPath && lead.contactQuality !== "low";

  if (hasCommDelay && hasWhatsapp) {
    return "Prevent lost reservations from late or missed WhatsApp replies.";
  }
  if (hasBookingWeak && hasWhatsapp) {
    return "Tighten the path from inquiry to confirmed booking on your fastest channel.";
  }
  if (hasOta && hasWhatsapp) {
    return "Capture more direct demand while guests are already messaging you.";
  }
  if ((lead.businessSignals ?? []).includes("conversion_gap") && hasWhatsapp) {
    return "Close the gap between attention and a clear reservation action.";
  }
  const heuristic = lead.heuristicOutreachAngle?.trim();
  if (heuristic) {
    const sentence = heuristic.split(/[.!?]/)[0]?.trim();
    if (sentence && sentence.length <= 120) return `${sentence}.`;
    return heuristic.length > 140 ? `${heuristic.slice(0, 137)}…` : heuristic;
  }
  if (hasWhatsapp) {
    return "Offer a lightweight way to handle reservation inquiries faster.";
  }
  return "Explore whether inquiry handling and direct booking match guest expectations.";
}

function hasMeaningfulSignals(lead: LeadForAiInsight): boolean {
  const pains = getPainPointSummary(lead, 1);
  if (pains.length > 0) return true;
  if ((lead.reviewPainPoints?.length ?? 0) > 0) return true;
  if ((lead.intelligenceScore ?? 0) >= 32) return true;
  if ((lead.reviewIntelligenceScore ?? 0) >= 28) return true;
  if (lead.hotScore >= 58 || lead.leadScore >= 58) return true;
  return false;
}

type MessageSignalTheme =
  | "communication_risk"
  | "booking_flow_gap"
  | "instagram_demand"
  | "whatsapp_flow"
  | "direct_booking_opportunity"
  | "general_hospitality";

function approachToTheme(
  approach: NonNullable<LeadForAiInsight["outreachIntelligence"]>["salesApproach"],
  lead: LeadForAiInsight,
): MessageSignalTheme | null {
  switch (approach) {
    case "whatsapp-speed":
      return "communication_risk";
    case "direct-booking":
      return "direct_booking_opportunity";
    case "conversion-gap":
      return "booking_flow_gap";
    case "social-demand":
      return "instagram_demand";
    case "guest-experience":
      return "communication_risk";
    case "operational-efficiency":
      if (lead.hasWhatsAppPath && lead.contactQuality !== "low") {
        return "whatsapp_flow";
      }
      return "general_hospitality";
    default:
      return null;
  }
}

function pickMessageSignalTheme(lead: LeadForAiInsight): MessageSignalTheme {
  // Outreach intelligence (when present) is the strongest signal for tone.
  const profile = lead.outreachIntelligence;
  if (profile) {
    const fromApproach = approachToTheme(profile.salesApproach, lead);
    if (fromApproach) return fromApproach;
  }

  const angle = getOutreachAngle(lead).toLowerCase();
  const pains = getPainPointSummary(lead, 4).map((p) => p.toLowerCase());
  const signals = new Set(lead.businessSignals ?? []);
  const hasComm =
    angle.includes("response") ||
    angle.includes("communication") ||
    angle.includes("whatsapp replies") ||
    pains.some(
      (p) =>
        p.includes("response") || p.includes("communication") || p.includes("reachability"),
    );
  if (hasComm) return "communication_risk";

  const hasBookingGap =
    signals.has("conversion_gap") ||
    angle.includes("booking") ||
    angle.includes("reservation") ||
    pains.some((p) => p.includes("booking") || p.includes("reservation"));
  if (hasBookingGap) return "booking_flow_gap";

  const hasInstagramDemand =
    lead.hasInstagram ||
    signals.has("instagram_presence_gap") ||
    angle.includes("instagram");
  if (hasInstagramDemand) return "instagram_demand";

  if (lead.hasWhatsAppPath && lead.contactQuality !== "low") return "whatsapp_flow";

  if (signals.has("ota_dependency") || signals.has("single_channel_risk")) {
    return "direct_booking_opportunity";
  }

  return "general_hospitality";
}

/**
 * Maps an outreach style to the WhatsApp message variant we ship as the
 * default `message`. Other variants stay available in `styles` for the UI.
 */
function styleVariantFor(
  style: NonNullable<LeadForAiInsight["outreachIntelligence"]>["outreachStyle"],
): OutreachMessageStyle {
  switch (style) {
    case "consultative":
      return "premium";
    case "relationship":
      return "soft";
    case "educational":
      return "soft";
    case "direct":
      return "direct";
    case "conversion-focused":
      return "direct";
    default:
      return "soft";
  }
}

/** Short, consultative WhatsApp copy variants for review/copy flow. */
export function generateWhatsAppMessage(
  lead: LeadForAiInsight,
  opts?: { followUp?: boolean },
): LeadWhatsAppMessagePack {
  const followUp = opts?.followUp === true;
  const weakSignals = !hasMeaningfulSignals(lead);
  const theme = pickMessageSignalTheme(lead);
  const preferredVariant: OutreachMessageStyle = lead.outreachIntelligence
    ? styleVariantFor(lead.outreachIntelligence.outreachStyle)
    : "soft";

  if (weakSignals) {
    const soft =
      "Merhaba, konaklama işletmelerinde rezervasyon öncesi mesaj akışını daha düzenli hale getirmeye odaklanıyoruz. Uygun olursa kısa bir örnek paylaşabilirim.";
    const direct =
      "Merhaba, konaklama tarafında ilk talebi kaçırmadan ilerleten kısa bir mesaj akışı kullanıyoruz. İsterseniz nasıl çalıştığını kısaca gösterebilirim.";
    const premium =
      "Merhaba, turizm tarafında rezervasyon öncesi iletişimi daha net hale getiren sade bir çerçeve uyguluyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.";
    const styles = { soft, direct, premium };
    return { message: styles[preferredVariant], styles, weakSignals };
  }

  const templates: Record<
    MessageSignalTheme,
    Record<OutreachMessageStyle, { base: string; followUp: string }>
  > = {
    communication_risk: {
      soft: {
        base: "Merhaba, konaklama işletmelerinde özellikle yoğun saatlerde gelen mesajların kaçmaması için kısa bir akış uyguluyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir not bırakmak istedim. Yoğun saatlerde geciken dönüşleri azaltmak için pratik bir mesaj düzeni kullanıyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
      },
      direct: {
        base: "Merhaba, rezervasyon öncesi mesajlara daha hızlı dönüş almayı sağlayan net bir akış kullanıyoruz. İsterseniz nasıl çalıştığını kısaca gösterebilirim.",
        followUp:
          "Merhaba, hızlı hatırlatma bırakayım. Mesajlara geç dönüşü azaltan kısa bir düzenimiz var. İsterseniz nasıl çalıştığını kısaca gösterebilirim.",
      },
      premium: {
        base: "Merhaba, birçok konaklama işletmesinde talep geliyor fakat geciken yanıtlar dönüşümü düşürüyor. Bu noktayı iyileştiren turizm odaklı bir yaklaşım uyguluyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
        followUp:
          "Merhaba, tekrar rahatsız etmeyeyim diye kısa yazıyorum. Özellikle yoğun dönemlerde yanıt süresini toparlayan bir çerçeveyle ilerliyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
      },
    },
    booking_flow_gap: {
      soft: {
        base: "Merhaba, konaklama işletmelerinde talebin rezervasyona daha net ilerlemesi için sade bir mesaj akışı kuruyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir not bırakayım. Gelen taleplerin rezervasyona dönüşmesini kolaylaştıran pratik bir akışımız var. Uygun olursa kısa bir örnek paylaşabilirim.",
      },
      direct: {
        base: "Merhaba, soru aşamasındaki talepleri daha hızlı rezervasyona çeviren kısa bir yöntem kullanıyoruz. İsterseniz nasıl çalıştığını kısaca gösterebilirim.",
        followUp:
          "Merhaba, tekrar yazıyorum. Talebi rezervasyona taşıyan kısa yöntemi dilerseniz 2 dakikada özetleyebilirim.",
      },
      premium: {
        base: "Merhaba, turizmde çoğu zaman ilgi var ama rezervasyona giden adımlar net kalmıyor. Bu geçişi güçlendiren konaklama odaklı bir sistem kurguluyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir hatırlatma bırakayım. Talepten rezervasyona geçişi sadeleştiren bir çerçevemiz var. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
      },
    },
    instagram_demand: {
      soft: {
        base: "Merhaba, Instagram'dan gelen taleplerin sıcakken rezervasyona dönmesi için kısa bir mesaj düzeni kullanıyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir not bırakayım. Instagram taleplerini bekletmeden rezervasyona taşıyan pratik bir akışımız var. Uygun olursa kısa bir örnek paylaşabilirim.",
      },
      direct: {
        base: "Merhaba, Instagram ve WhatsApp hattındaki talepleri daha hızlı rezervasyona çeviren bir akış kuruyoruz. İsterseniz nasıl çalıştığını kısaca gösterebilirim.",
        followUp:
          "Merhaba, tekrar yazıyorum. Instagram'dan gelen talepler için kullandığımız hızlı rezervasyon akışını isterseniz kısaca paylaşabilirim.",
      },
      premium: {
        base: "Merhaba, konaklama işletmelerinde sosyal medyadan ilgi geliyor fakat rezervasyona dönüş net olmayabiliyor. Bu dönüşümü güçlendiren turizm odaklı bir yaklaşım uyguluyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir hatırlatma bırakayım. Sosyal medya talebinin rezervasyona daha net ilerlemesi için sade bir çerçeveyle ilerliyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
      },
    },
    whatsapp_flow: {
      soft: {
        base: "Merhaba, WhatsApp hattına gelen taleplerin kaybolmaması için konaklama tarafında kısa bir akış kullanıyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir not bırakayım. WhatsApp'ta gelen talepleri daha düzenli takip etmek için pratik bir yapı kuruyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
      },
      direct: {
        base: "Merhaba, WhatsApp'tan gelen rezervasyon sorularını daha hızlı sonuca götüren bir yöntem kullanıyoruz. İsterseniz nasıl çalıştığını kısaca gösterebilirim.",
        followUp:
          "Merhaba, tekrar yazıyorum. WhatsApp akışını hızlandıran kısa yöntemimizi isterseniz 2 dakikada paylaşabilirim.",
      },
      premium: {
        base: "Merhaba, birçok konaklama işletmesinde WhatsApp trafiği güçlü ama akış net olmadığında fırsatlar kaçabiliyor. Bu tarafı sadeleştiren turizm odaklı bir sistem uyguluyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir hatırlatma bırakayım. WhatsApp tarafında talebi daha kontrollü ilerleten bir çerçevemiz var. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
      },
    },
    direct_booking_opportunity: {
      soft: {
        base: "Merhaba, konaklama işletmelerinde doğrudan rezervasyon payını artırmaya odaklanan kısa bir iletişim akışı kuruyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir not bırakayım. Doğrudan rezervasyon payını destekleyen pratik bir akışımız var. Uygun olursa kısa bir örnek paylaşabilirim.",
      },
      direct: {
        base: "Merhaba, üçüncü taraf kanallara bağlı kalmadan daha fazla doğrudan rezervasyon almak için uygulanabilir bir yöntem kullanıyoruz. İsterseniz nasıl çalıştığını kısaca gösterebilirim.",
        followUp:
          "Merhaba, tekrar yazıyorum. Doğrudan rezervasyon tarafını güçlendiren kısa yöntemi isterseniz kısaca paylaşabilirim.",
      },
      premium: {
        base: "Merhaba, turizmde görünürlük yüksek olsa da doğrudan rezervasyona dönen pay çoğu zaman sınırlı kalıyor. Bu dengeyi iyileştiren konaklama odaklı bir yapı uyguluyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir hatırlatma bırakayım. Kanal dengesini doğrudan rezervasyon lehine toparlayan bir çerçeve kullanıyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
      },
    },
    general_hospitality: {
      soft: {
        base: "Merhaba, konaklama işletmelerinde rezervasyon öncesi iletişimi sadeleştiren kısa bir sistem kullanıyoruz. Uygun olursa kısa bir örnek paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir not bırakayım. İlk temas ile rezervasyon arasındaki süreci daha düzenli hale getiren bir akışımız var. Uygun olursa kısa bir örnek paylaşabilirim.",
      },
      direct: {
        base: "Merhaba, konaklama tarafında talebi daha hızlı rezervasyona taşıyan pratik bir yöntem uyguluyoruz. İsterseniz nasıl çalıştığını kısaca gösterebilirim.",
        followUp:
          "Merhaba, tekrar yazıyorum. Talebi rezervasyona taşıyan kısa yöntemi dilerseniz 2 dakikada özetleyebilirim.",
      },
      premium: {
        base: "Merhaba, turizmde rezervasyon öncesi iletişim net olduğunda dönüşüm belirgin şekilde iyileşiyor. Bu alana özel sade bir sistemle ilerliyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
        followUp:
          "Merhaba, kısa bir hatırlatma bırakayım. Rezervasyon öncesi iletişimi daha tutarlı hale getiren bir çerçeve kullanıyoruz. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.",
      },
    },
  };

  const selected = templates[theme];
  if (followUp) {
    const soft = selected.soft.followUp;
    const direct = selected.direct.followUp;
    const premium = selected.premium.followUp;
    const styles = { soft, direct, premium };
    return { message: styles[preferredVariant], styles, weakSignals };
  }

  const soft = selected.soft.base;
  const direct = selected.direct.base;
  const premium = selected.premium.base;
  const styles = { soft, direct, premium };

  return { message: styles[preferredVariant], styles, weakSignals };
}

function buildAiInsightParagraph(lead: LeadForAiInsight): string {
  if (!hasMeaningfulSignals(lead)) return "";

  const parts: string[] = [];
  const opp = getOpportunityLevel(lead);
  const ch = [...lead.channels];
  const hasDirect = ch.includes("Direct") || lead.hasOwnWebsite;
  const hasOtaChannels = ch.some(
    (c) => c === "Booking" || c === "Airbnb" || c === "Tatilsepeti",
  );

  if (hasOtaChannels || (lead.businessSignals ?? []).includes("ota_dependency")) {
    parts.push(
      "This business appears to have direct booking upside alongside platform visibility.",
    );
  } else if (hasDirect) {
    parts.push(
      "This business shows direct-booking potential based on listing signals.",
    );
  } else {
    parts.push(
      "Public signals suggest room to strengthen owned reservation channels.",
    );
  }

  const pains = getPainPointSummary(lead, 3);
  const commPain = pains.find(
    (p) =>
      p.includes("response") ||
      p.includes("Communication") ||
      p.includes("reachability"),
  );
  if (commPain) {
    parts.push(`Review and listing signals hint at ${commPain.toLowerCase()}.`);
  } else if (pains.length > 0) {
    parts.push(`Notable themes include ${pains[0].toLowerCase()}.`);
  }

  if (lead.hasWhatsAppPath && lead.contactQuality !== "low") {
    parts.push("WhatsApp availability makes consultative outreach practical.");
  } else if (lead.hasInstagram) {
    parts.push("Instagram offers a workable surface for a light-touch conversation.");
  }

  if (opp === "high") {
    parts.push("Overall opportunity looks strong for a focused reservation-ops conversation.");
  } else if (opp === "medium") {
    parts.push("Worth a short discovery touch if the channel fit looks right.");
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Full AI-style insight bundle (deterministic; no network). */
export function generateLeadInsight(
  lead: LeadForAiInsight,
  source: AiInsightSource = "rules",
): LeadAiInsight {
  const painPointSummary = getPainPointSummary(lead, 5);
  const opportunityLevel = getOpportunityLevel(lead);
  const outreachAngle = getOutreachAngle(lead);
  const aiInsight = buildAiInsightParagraph(lead);

  return {
    aiInsight,
    outreachAngle,
    painPointSummary,
    opportunityLevel,
    source,
  };
}
