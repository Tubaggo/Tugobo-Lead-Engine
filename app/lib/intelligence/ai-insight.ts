import type { BusinessSignal } from "./signals";
import type { OutreachIntelligenceProfile } from "./outreach-intelligence";

export type OpportunityLevel = "low" | "medium" | "high" | "very_high";

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

  if (reachable && strongProblem && blend >= 78) return "very_high";
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

function listSurfaceFromChannels(channels: readonly string[]): string | null {
  const order = ["Booking", "Airbnb", "Tatilsepeti"] as const;
  const hit = order.find((c) => channels.includes(c));
  return hit ?? null;
}

function buildObservationLine(theme: MessageSignalTheme, lead: LeadForAiInsight): string {
  const sig = new Set(lead.businessSignals ?? []);
  const ota = listSurfaceFromChannels(lead.channels);
  const hasOta = Boolean(ota) || sig.has("ota_dependency") || sig.has("single_channel_risk");
  const hasWhatsapp = lead.hasWhatsAppPath && lead.contactQuality !== "low";
  const hasInsta = lead.hasInstagram || sig.has("instagram_presence_gap");
  const hasWeakBooking =
    sig.has("conversion_gap") ||
    sig.has("no_booking_flow") ||
    sig.has("weak_booking_cta") ||
    sig.has("external_only_booking_dependency") ||
    sig.has("missing_own_website") ||
    lead.websiteIntelligence?.hasBookingEngine === false ||
    lead.websiteIntelligence?.hasBookingCtaText === false;

  switch (theme) {
    case "direct_booking_opportunity": {
      if (ota) return `İşletmenizi incelerken özellikle ${ota} tarafında görünürlüğün güçlü olduğunu gördüm.`;
      if (hasOta) return "İşletmenizi incelerken OTA tarafının güçlü göründüğünü fark ettim.";
      return "İşletmenizin görünürlüğü fena değil; asıl kazanım çoğu zaman doğrudan tarafta oluyor.";
    }
    case "instagram_demand": {
      if (hasInsta) return "İşletmenizin Instagram tarafı aktif görünüyor.";
      return "Sosyal tarafta bir ilgi sinyali var gibi görünüyor.";
    }
    case "whatsapp_flow": {
      if (hasWhatsapp) return "İşletmenizde WhatsApp hattının erişilebilir olduğu görünüyor.";
      return "İletişim tarafında misafirlerin hızlı dönüş beklediği bir yüzey var gibi.";
    }
    case "booking_flow_gap": {
      if (hasWeakBooking) return "İşletmenizi incelerken rezervasyona giden adımın bazı noktalarda net olmayabileceğini düşündüm.";
      return "İşletmenizi incelerken ilgi var ama rezervasyona giden yol her zaman net olmayabiliyor.";
    }
    case "communication_risk": {
      if (hasWhatsapp) return "İşletmenizde WhatsApp üzerinden talep almak mümkün görünüyor.";
      return "İşletmenizi incelerken iletişim tarafında hızın kritik olduğu bir tablo var gibi.";
    }
    case "general_hospitality":
    default: {
      if (hasOta) return "İşletmenizi incelerken kanallar tarafında görünürlüğün iyi olduğunu gördüm.";
      if (hasInsta) return "İşletmenizi incelerken sosyal tarafta hareket olduğunu gördüm.";
      return "İşletmenizi incelerken birkaç küçük iyileştirmeyle gelir tarafında alan olabileceğini düşündüm.";
    }
  }
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

function hashSeed(seed: string): number {
  // Small deterministic hash, used for stable variation picking (no crypto).
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVariant(seed: string | undefined, salt: string, items: readonly string[]): string {
  if (items.length === 0) return "";
  const h = hashSeed(`${seed ?? "default"}|${salt}`);
  return items[h % items.length] ?? items[0] ?? "";
}

function buildRationaleSignalClause(lead: LeadForAiInsight): string {
  const sig = new Set(lead.businessSignals ?? []);
  const pieces: string[] = [];
  if (sig.has("ota_dependency") || sig.has("external_only_booking_dependency")) {
    pieces.push("OTA ağırlığını dengeleme");
  }
  if (
    sig.has("conversion_gap") ||
    sig.has("no_booking_flow") ||
    sig.has("weak_booking_cta") ||
    sig.has("missing_own_website")
  ) {
    pieces.push("talep → rezervasyon geçişini netleştirme");
  }
  if (lead.hasInstagram || sig.has("instagram_presence_gap")) {
    pieces.push("Instagram talebini rezervasyona çevirme");
  }
  if (lead.hasWhatsAppPath && lead.contactQuality !== "low") {
    pieces.push("WhatsApp dönüş hızını artırma");
  }
  return pieces.slice(0, 2).join(" / ");
}

function varyOutreachText(params: {
  text: string;
  seed?: string;
  style: OutreachMessageStyle;
  followUp: boolean;
  lead: LeadForAiInsight;
}): string {
  const { text, seed, style, followUp, lead } = params;
  let out = text.trim();
  if (!out) return out;

  const opener = pickVariant(seed, `opener|${style}|${followUp ? "fu" : "new"}`, [
    "Merhaba",
    "Selam",
    "Merhaba, kısa bir not bırakayım",
    "Merhaba, müsaitseniz kısaca yazayım",
  ]);
  out = out.replace(/^Merhaba,?/i, opener);

  const signal = buildRationaleSignalClause(lead);
  if (signal && (style === "direct" || style === "premium")) {
    const insert = pickVariant(seed, `signal|${style}|${followUp ? "fu" : "new"}`, [
      `(${signal})`,
      `(${signal} odağıyla)`,
      `(${signal} tarafında)`,
    ]);
    // Insert after first comma, or after opener.
    const commaIdx = out.indexOf(",");
    if (commaIdx >= 0 && commaIdx < 42) {
      out = `${out.slice(0, commaIdx + 1)} ${insert} ${out.slice(commaIdx + 1).trim()}`;
    } else {
      out = `${insert} ${out}`;
    }
  }

  const cta = pickVariant(seed, `cta|${style}|${followUp ? "fu" : "new"}`, [
    "Uygun olursa kısa bir örnek paylaşabilirim.",
    "İsterseniz 2 dakikada özetleyebilirim.",
    "Uygun görürseniz işletmeniz özelinde kısa bir fikir paylaşabilirim.",
  ]);
  if (/Uygun olursa kısa bir örnek paylaşabilirim\.\s*$/i.test(out)) {
    out = out.replace(/Uygun olursa kısa bir örnek paylaşabilirim\.\s*$/i, cta);
  } else if (/İsterseniz nasıl çalıştığını kısaca gösterebilirim\.\s*$/i.test(out)) {
    out = out.replace(/İsterseniz nasıl çalıştığını kısaca gösterebilirim\.\s*$/i, cta);
  } else if (/Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim\.\s*$/i.test(out)) {
    out = out.replace(/Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim\.\s*$/i, cta);
  } else if (/Uygun olursa kısa bir fikir paylaşabilirim\.\s*$/i.test(out)) {
    out = out.replace(/Uygun olursa kısa bir fikir paylaşabilirim\.\s*$/i, cta);
  } else {
    // Ensure a clear, non-spam CTA exists.
    if (!/[.!?]\s*$/.test(out)) out += ".";
    out = `${out} ${cta}`.replace(/\s+/g, " ").trim();
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Short, consultative WhatsApp copy variants for review/copy flow. */
export function generateWhatsAppMessage(
  lead: LeadForAiInsight,
  opts?: { followUp?: boolean; variationSeed?: string },
): LeadWhatsAppMessagePack {
  const followUp = opts?.followUp === true;
  const weakSignals = !hasMeaningfulSignals(lead);
  const theme = pickMessageSignalTheme(lead);
  const preferredVariant: OutreachMessageStyle = lead.outreachIntelligence
    ? styleVariantFor(lead.outreachIntelligence.outreachStyle)
    : "soft";
  const seed = opts?.variationSeed;

  if (weakSignals) {
    const soft =
      "Merhaba, işletmenizi incelerken iletişim ve rezervasyon tarafında küçük dokunuşlarla hızlanabilecek alanlar olabileceğini düşündüm. Uygun olursa 2 dakikada bir örnek paylaşabilirim.";
    const direct =
      "Merhaba, işletmenizi incelerken talebin rezervasyona daha hızlı ilerlemesini etkileyen birkaç nokta olabileceğini gördüm. İsterseniz 2 dakikada kısaca paylaşabilirim.";
    const premium =
      "Merhaba, işletmenizi incelerken görünürlük iyi olsa bile dönüşümü etkileyen küçük sürtünmeler olabileceğini düşündüm. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.";
    const styles = {
      soft: varyOutreachText({ text: soft, seed, style: "soft", followUp, lead }),
      direct: varyOutreachText({ text: direct, seed, style: "direct", followUp, lead }),
      premium: varyOutreachText({ text: premium, seed, style: "premium", followUp, lead }),
    };
    return { message: styles[preferredVariant], styles, weakSignals };
  }

  const templates: Record<
    MessageSignalTheme,
    Record<OutreachMessageStyle, { base: string; followUp: string }>
  > = {
    communication_risk: {
      soft: {
        base: `${buildObservationLine("communication_risk", lead)} Birçok tesiste özellikle yoğun saatlerde (ve gece) gelen talepler kaçabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.`,
        followUp:
          `${buildObservationLine("communication_risk", lead)} Kısa bir not bırakayım: yoğun saatlerde geciken dönüşler genelde dönüşümü düşürüyor. Uygun olursa kısa bir örnek paylaşabilirim.`,
      },
      direct: {
        base: `${buildObservationLine("communication_risk", lead)} Genelde sorun “talep yok” değil, hızlı dönüş verememek oluyor. İsterseniz 2 dakikada nasıl toparladığımızı paylaşabilirim.`,
        followUp:
          `${buildObservationLine("communication_risk", lead)} Hızlı bir hatırlatma bırakayım: mesajlara geç dönüşü azaltan kısa bir akış var. İsterseniz 2 dakikada paylaşabilirim.`,
      },
      premium: {
        base: `${buildObservationLine("communication_risk", lead)} Talep geliyor ama yanıt gecikince dönüşüm düşüyor; özellikle WhatsApp tarafında bu çok sık oluyor. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.`,
        followUp:
          `${buildObservationLine("communication_risk", lead)} Tekrar rahatsız etmeyeyim diye kısa yazıyorum: yanıt süresini toparlamak çoğu tesiste hızlı etki ediyor. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.`,
      },
    },
    booking_flow_gap: {
      soft: {
        base: `${buildObservationLine("booking_flow_gap", lead)} Genelde sorun trafik değil; “talep → rezervasyon” adımının net olmaması oluyor. Uygun olursa kısa bir örnek paylaşabilirim.`,
        followUp:
          `${buildObservationLine("booking_flow_gap", lead)} Kısa bir not bırakayım: gelen taleplerin rezervasyona dönüşmesini kolaylaştıran küçük bir akış var. Uygun olursa paylaşabilirim.`,
      },
      direct: {
        base: `${buildObservationLine("booking_flow_gap", lead)} Soru aşamasındaki talepleri net bir “sonraki adım”la hızlıca rezervasyona taşımak mümkün. İsterseniz 2 dakikada paylaşabilirim.`,
        followUp:
          `${buildObservationLine("booking_flow_gap", lead)} Tekrar yazıyorum: talebi rezervasyona taşıyan kısa yöntemi dilerseniz 2 dakikada özetleyebilirim.`,
      },
      premium: {
        base: `${buildObservationLine("booking_flow_gap", lead)} İlgi var ama rezervasyona giden adımlar netleşmeyince dönüşüm kaçıyor. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.`,
        followUp:
          `${buildObservationLine("booking_flow_gap", lead)} Kısa bir hatırlatma bırakayım: talepten rezervasyona geçişi sadeleştiren bir çerçeve var. Uygun olursa işletmeniz özelinde paylaşabilirim.`,
      },
    },
    instagram_demand: {
      soft: {
        base: `${buildObservationLine("instagram_demand", lead)} Bu durumda genelde sorun içerik değil; DM/WhatsApp tarafında dönüşüm akışı oluyor. Uygun olursa kısa bir örnek paylaşabilirim.`,
        followUp:
          `${buildObservationLine("instagram_demand", lead)} Kısa bir not bırakayım: Instagram talepleri sıcakken “sonraki adım” net olmazsa kaçabiliyor. Uygun olursa örnek paylaşabilirim.`,
      },
      direct: {
        base: `${buildObservationLine("instagram_demand", lead)} Instagram’dan gelen talebi hızlıca rezervasyona bağlayan kısa bir akış var. İsterseniz 2 dakikada paylaşabilirim.`,
        followUp:
          `${buildObservationLine("instagram_demand", lead)} Tekrar yazıyorum: Instagram’dan gelen talepler için kullandığımız kısa akışı isterseniz paylaşabilirim.`,
      },
      premium: {
        base: `${buildObservationLine("instagram_demand", lead)} Sosyal medya ilgisi var ama rezervasyona dönüş net olmayabiliyor; çoğu zaman mesele “cevap” değil “yönlendirme”. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.`,
        followUp:
          `${buildObservationLine("instagram_demand", lead)} Kısa bir hatırlatma bırakayım: sosyal talepten rezervasyona geçişi netleştiren sade bir çerçeve var. Uygun olursa işletmeniz özelinde paylaşabilirim.`,
      },
    },
    whatsapp_flow: {
      soft: {
        base: `${buildObservationLine("whatsapp_flow", lead)} WhatsApp tarafında özellikle gece gelen sorular bazen arada kaybolabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.`,
        followUp:
          `${buildObservationLine("whatsapp_flow", lead)} Kısa bir not bırakayım: WhatsApp’ta gelen talepleri düzenli takip edince kaçan rezervasyon azalıyor. Uygun olursa örnek paylaşabilirim.`,
      },
      direct: {
        base: `${buildObservationLine("whatsapp_flow", lead)} WhatsApp’taki rezervasyon sorularını daha hızlı sonuca götüren pratik bir akış var. İsterseniz 2 dakikada paylaşabilirim.`,
        followUp:
          `${buildObservationLine("whatsapp_flow", lead)} Tekrar yazıyorum: WhatsApp akışını hızlandıran kısa yöntemi isterseniz 2 dakikada paylaşabilirim.`,
      },
      premium: {
        base: `${buildObservationLine("whatsapp_flow", lead)} WhatsApp trafiği güçlü olduğunda mesele genelde “kaç talep geldiği” değil, hangisinin rezervasyona gittiği oluyor. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.`,
        followUp:
          `${buildObservationLine("whatsapp_flow", lead)} Kısa bir hatırlatma bırakayım: WhatsApp’ta talebi daha kontrollü ilerleten sade bir çerçeve var. Uygun olursa işletmeniz özelinde paylaşabilirim.`,
      },
    },
    direct_booking_opportunity: {
      soft: {
        base: `${buildObservationLine("direct_booking_opportunity", lead)} Bu tabloda genelde kaçan yer “doğrudan” tarafta oluyor (misafir soruyor ama yönlendirme net değil). Uygun olursa kısa bir örnek paylaşabilirim.`,
        followUp:
          `${buildObservationLine("direct_booking_opportunity", lead)} Kısa bir not bırakayım: OTA görünürlüğünü bozmadan doğrudan payı destekleyen küçük dokunuşlar var. Uygun olursa örnek paylaşabilirim.`,
      },
      direct: {
        base: `${buildObservationLine("direct_booking_opportunity", lead)} OTA’ya gelen ilgiyi doğrudan rezervasyona daha sık bağlayan pratik bir akış var. İsterseniz 2 dakikada paylaşabilirim.`,
        followUp:
          `${buildObservationLine("direct_booking_opportunity", lead)} Tekrar yazıyorum: doğrudan rezervasyon tarafını güçlendiren kısa yöntemi isterseniz paylaşabilirim.`,
      },
      premium: {
        base: `${buildObservationLine("direct_booking_opportunity", lead)} Görünürlük yüksek olsa da doğrudan rezervasyona dönen pay çoğu tesiste sınırlı kalıyor; genelde sebep yönlendirme/akış. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.`,
        followUp:
          `${buildObservationLine("direct_booking_opportunity", lead)} Kısa bir hatırlatma bırakayım: kanal dengesini doğrudan lehine toparlayan sade bir çerçeve var. Uygun olursa işletmeniz özelinde paylaşabilirim.`,
      },
    },
    general_hospitality: {
      soft: {
        base: `${buildObservationLine("general_hospitality", lead)} Genelde küçük bir iletişim/rezervasyon akışı düzeltmesi bile dönüşümü hissedilir etkiliyor. Uygun olursa kısa bir örnek paylaşabilirim.`,
        followUp:
          `${buildObservationLine("general_hospitality", lead)} Kısa bir not bırakayım: ilk temas ile rezervasyon arasını netleştiren küçük bir akış var. Uygun olursa örnek paylaşabilirim.`,
      },
      direct: {
        base: `${buildObservationLine("general_hospitality", lead)} Talebi daha hızlı rezervasyona taşıyan pratik bir yöntem var. İsterseniz 2 dakikada paylaşabilirim.`,
        followUp:
          `${buildObservationLine("general_hospitality", lead)} Tekrar yazıyorum: talebi rezervasyona taşıyan kısa yöntemi dilerseniz 2 dakikada özetleyebilirim.`,
      },
      premium: {
        base: `${buildObservationLine("general_hospitality", lead)} Rezervasyon öncesi iletişim net olduğunda dönüşüm belirgin iyileşiyor; çoğu zaman 2-3 küçük dokunuş yetiyor. Uygun olursa işletmeniz özelinde kısa bir fikir paylaşabilirim.`,
        followUp:
          `${buildObservationLine("general_hospitality", lead)} Kısa bir hatırlatma bırakayım: rezervasyon öncesi iletişimi tutarlı hale getiren sade bir çerçeve var. Uygun olursa işletmeniz özelinde paylaşabilirim.`,
      },
    },
  };

  const selected = templates[theme];
  if (followUp) {
    const styles = {
      soft: varyOutreachText({
        text: selected.soft.followUp,
        seed,
        style: "soft",
        followUp: true,
        lead,
      }),
      direct: varyOutreachText({
        text: selected.direct.followUp,
        seed,
        style: "direct",
        followUp: true,
        lead,
      }),
      premium: varyOutreachText({
        text: selected.premium.followUp,
        seed,
        style: "premium",
        followUp: true,
        lead,
      }),
    };
    return { message: styles[preferredVariant], styles, weakSignals };
  }

  const styles = {
    soft: varyOutreachText({
      text: selected.soft.base,
      seed,
      style: "soft",
      followUp: false,
      lead,
    }),
    direct: varyOutreachText({
      text: selected.direct.base,
      seed,
      style: "direct",
      followUp: false,
      lead,
    }),
    premium: varyOutreachText({
      text: selected.premium.base,
      seed,
      style: "premium",
      followUp: false,
      lead,
    }),
  };

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

  if (opp === "very_high") {
    parts.push("Overall opportunity is very high for immediate outreach.");
  } else if (opp === "high") {
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
