/**
 * Rule-based Turkish summaries for extracted website/contact signals (LLM fallback).
 * Does not fetch URLs or call external social APIs.
 */

export type ExtractedSignalsInterpretationInput = {
  websiteConfidence?: string | null;
  extractedPhones?: readonly string[];
  turkishGsmNumbers?: readonly string[];
  emails?: readonly string[];
  socialLinks?: readonly string[];
  hasReservationCTA?: boolean;
  hasContactPage?: boolean;
  whatsappConfidence?: string | null;
  instagramConfidence?: string | number | null;
};

export type WebsiteContactSignalsInterpretation = {
  source: "llm" | "rules";
  turkishSummary: string;
  websiteCredibility: string;
  whatsappLikelihood: string;
  instagramLikelihood: string;
  /** Turkish prose about booking/contact path signals (not the numeric lead score). */
  bookingFlowStrength: string;
  manualCheckRecommendation: string;
};

function listPreview(items: readonly string[] | undefined, max = 6): string {
  if (!items?.length) return "liste yok";
  const slice = items.slice(0, max).join(", ");
  return items.length > max ? `${slice} … (+${items.length - max})` : slice;
}

function websiteCredibilityFromLabel(conf?: string | null): string {
  switch (conf) {
    case "confirmed":
      return "Ana sayfa sinyalleri açısından web görünürlüğü muhtemelen güçlü; yine de DNS/SSL ve güncel içerik doğrulanmalı.";
    case "likely":
      return "Web adresi muhtemelen geçerli ve içerik alınabildi; tam güvenilirlik için teknik kontrol olası fayda sağlar.";
    case "weak":
      return "URL kayıtlı ancak ana sayfa doğrulanamadı veya sınırlı sinyal var; manuel doğrulama önerilir.";
    case "unknown":
      return "Web güvenilirliği belirsiz; ek kontrol gerekebilir.";
    case "missing":
      return "Kayıtlı URL yoksa bu alan geçerli değildir; URL varsa asla 'eksik' varsayılmamalıdır.";
    default:
      return "Web güvenilirliği etiketi net değil; muhtemel durum için manuel kontrol önerilir.";
  }
}

function whatsappFromSignals(input: ExtractedSignalsInterpretationInput): string {
  const conf = typeof input.whatsappConfidence === "string" ? input.whatsappConfidence : "";
  const gsm = input.turkishGsmNumbers?.length ?? 0;
  const waInSocial =
    input.socialLinks?.some((u) => /wa\.me|whatsapp\.com/i.test(u)) ?? false;
  if (conf === "confirmed") {
    return "WhatsApp bağlantısı wa.me / site üzerinden doğrulanmış görünüyor; yine de canlı mesaj testi önerilir.";
  }
  if (conf === "likely" || gsm > 0 || waInSocial) {
    return "WhatsApp erişimi olası; numara veya bağlantı manuel doğrulanmalı.";
  }
  if (conf === "weak") {
    return "WhatsApp sinyali zayıf veya link sorunlu; doğrulama gerekli.";
  }
  if (conf === "none" || conf === "missing" || conf === "unknown") {
    return "Kayıtlarda net bir WhatsApp kanalı görünmüyor; varsa manuel kontrol önerilir.";
  }
  return "WhatsApp durumu özetlenemedi; manuel kontrol önerilir.";
}

function instagramFromSignals(input: ExtractedSignalsInterpretationInput): string {
  const ic = input.instagramConfidence;
  const igLinks =
    input.socialLinks?.filter((u) => /instagram\.com/i.test(u)) ?? [];
  if (typeof ic === "number") {
    return `Instagram yüzey skoru ${ic} (sayısal özet); profil gerçekliği doğrulanmalı.`;
  }
  switch (ic) {
    case "confirmed":
      return "Instagram bağlantısı veya keşif sinyali muhtemelen güçlü; yine de hesap sahipliği doğrulanmalı.";
    case "likely":
      return "Instagram varlığı olası; handle veya link eşleşmesi manuel teyit edilmeli.";
    case "weak":
    case "unknown":
      return "Instagram sinyali zayıf veya belirsiz; manuel kontrol önerilir.";
    case "missing":
      return "Instagram sinyali eksik görünüyor; varsa linkler doğrulanmalı.";
    default:
      if (igLinks.length)
        return "HTML içinde Instagram URL’leri bulundu; hesap doğruluğu kesin değil, doğrulanmalı.";
      return "Instagram durumu net değil; manuel kontrol önerilir.";
  }
}

function bookingFlowFromSignals(input: ExtractedSignalsInterpretationInput): string {
  const parts: string[] = [];
  if (input.hasReservationCTA) parts.push("rezervasyon/rezervasyon çağrısı metni olası");
  if (input.hasContactPage) parts.push("iletişim sayfası bağlantısı olası");
  if ((input.emails?.length ?? 0) > 0) parts.push("e-posta sinyali mevcut");
  if (!parts.length)
    return "Rezervasyon/iletişim kanalı hakkında sınırlı doğrudan sinyal; akış muhtemelen zayıf veya doğrulanmalı.";
  return `${parts.join("; ")} — rezervasyon akışı muhtemelen bu ipuçlarıyla sınırlı yorumlanabilir; tam resim için sayfa içeriği doğrulanmalı.`;
}

function manualCheck(input: ExtractedSignalsInterpretationInput): string {
  const weakWeb = input.websiteConfidence === "weak" || input.websiteConfidence === "unknown";
  const weakIg =
    input.instagramConfidence === "weak" ||
    input.instagramConfidence === "unknown" ||
    input.instagramConfidence === "missing";
  const weakWa =
    input.whatsappConfidence === "weak" ||
    input.whatsappConfidence === "unknown" ||
    input.whatsappConfidence === "missing";
  const hints: string[] = [];
  if (weakWeb) hints.push("web/ana sayfa erişimi ve URL");
  if (weakWa) hints.push("WhatsApp numarası veya wa.me bağlantıları");
  if (weakIg) hints.push("Instagram profili veya listedeki IG URL’leri");
  if (!hints.length)
    return "Sinyaller görece tutarlı görünüyor; yine de canlı iletişim testi ve sahiplik teyidi önerilir.";
  return `Muhtemel manuel kontrol alanları: ${hints.join(", ")} — kesin hüküm için doğrulanmalı.`;
}

/** Deterministic Turkish copy when LLM is unavailable or rejects constraints. */
export function buildRuleBasedWebsiteSignalsInterpretation(
  input: ExtractedSignalsInterpretationInput,
): WebsiteContactSignalsInterpretation {
  const phones = listPreview(input.extractedPhones);
  const gsm = listPreview(input.turkishGsmNumbers);
  const mails = listPreview(input.emails);
  const social = listPreview(input.socialLinks, 5);

  const turkishSummary = [
    `Web güven etiketi: ${input.websiteConfidence ?? "bilinmiyor"}.`,
    `Telefon örnekleri: ${phones}. GSM (90…): ${gsm}.`,
    `E-postalar: ${mails}. Sosyal bağlantılar (örnek): ${social}.`,
    `Rezervasyon CTA: ${input.hasReservationCTA ? "olası" : "tespit edilmedi veya zayıf"}.`,
    `İletişim sayfası sinyali: ${input.hasContactPage ? "olası" : "tespit edilmedi veya zayıf"}.`,
    "Bu özet yalnızca verilen çıkarımlara dayanır; dış kaynak uydurulmadı.",
  ].join(" ");

  return {
    source: "rules",
    turkishSummary,
    websiteCredibility: websiteCredibilityFromLabel(input.websiteConfidence),
    whatsappLikelihood: whatsappFromSignals(input),
    instagramLikelihood: instagramFromSignals(input),
    bookingFlowStrength: bookingFlowFromSignals(input),
    manualCheckRecommendation: manualCheck(input),
  };
}
