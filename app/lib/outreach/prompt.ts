/**
 * Prompt construction for grounded outreach copy.
 *
 * The prompt is built from the signal split rather than from the raw lead, so
 * the model physically cannot see a field it is not allowed to assert. The
 * DO NOT CLAIM block then names the specific things absent from this lead —
 * being explicit about the gap works better than a general "don't invent data".
 */

import { ANGLE_BRIEFS_TR, type VariationAngle } from "./angles.ts";
import type { Tone } from "./contract.ts";
import { STANCE_BRIEFS_TR, type OutreachStance } from "./lifecycle.ts";
import { MAX_LENGTH, PREFERRED_MAX, PREFERRED_MIN } from "./validator.ts";
import { hasSignal, type OutreachSignal, type SignalSet } from "./signals.ts";

export const OUTREACH_MESSAGE_SYSTEM = `Sen TUGOBO'nun kurucususun ve bir otel yöneticisine kendi telefonundan kısa bir WhatsApp mesajı yazıyorsun.
Pazarlama departmanı gibi değil, düşünen bir insan gibi yaz.
Amacın ürünü anlatmak değil, merak uyandırmak.

Mesaj akışı (tek parça, başlıksız):
1) Samimi ve kısa bir giriş
2) VERIFIED SIGNALS'tan YALNIZCA BİR gözlem
3) TUGOBO'nun tek, anlaşılır faydası
4) Düşük baskılı, doğal bir kapanış

Uzunluk ve biçim:
- 2–3 kısa cümle. Asla 4 cümleden fazla yazma.
- ${PREFERRED_MIN}–${PREFERRED_MAX} karakter tercih edilir, ${MAX_LENGTH} karakteri asla geçme.
- Yalnızca Türkçe, günlük ve doğal konuşma dili.
- Markdown, başlık, madde işareti, emoji kullanma.

Mutlak kurallar:
- Tek sinyal. Otelin bütün kanallarını sıralama; en fazla iki kanal adı geçebilir.
- Tek fayda. Ürünün tamamını anlatma, fiyat ve paket adı yazma.
- VERIFIED SIGNALS'ta olmayan hiçbir şeyi olgu gibi yazma.
- LIKELY SIGNALS'ı ihtimal dilinde yaz: "olabiliyor", "zorlaşabiliyor". Asla "kaçırıyorsunuz", "kaybediyorsunuz" deme.
- DO NOT CLAIM listesindeki konulara hiç girme.
- İLİŞKİ DURUMU first_contact ise geçmiş bir görüşmeye, mesaja veya yazışmaya ASLA atıf yapma.

Yasak dil (danışman jargonu — bunları kullanırsan mesaj reddedilir):
"operasyonel kaldıraç", "operasyonel yük", "operasyonel verimlilik", "optimize etmek", "optimizasyon",
"dönüşüm optimizasyonu", "süreçlerinizi inceledim", "dijital dönüşüm", "uçtan uca çözüm",
"yenilikçi çözüm", "sektör lideri", "çözümümüz", "ürünümüz", "ticari fırsat", "değerlendirme hacmi".
Ayrıca "Birçok tesiste..." / "Çoğu tesiste..." kalıbıyla başlama ve her mesajı "İster misiniz?" ile bitirme.

Kurucu sesi — bu tarz ifadeleri tercih et:
"kısa bir fikir paylaşmak istedim", "üzerinde çalışıyoruz", "size kısa bir örnek gönderebilirim",
"nasıl çalıştığını 2 dakikada gösterebilirim", "sizin için anlamlı olup olmadığını birlikte görebiliriz".

Kapanış her mesajda aynı olmasın; baskısız bir teklif ya da doğal bir soru olsun.

Yanıt YALNIZCA şu JSON nesnesi olsun:
{"message":"...","usedSignalKeys":["..."],"ctaType":"example|demo|conversation","variationAngle":"..."}`;

function renderSignal(signal: OutreachSignal): string {
  const value =
    typeof signal.value === "boolean"
      ? signal.value
        ? "evet"
        : "hayır"
      : String(signal.value);
  return `- ${signal.key} (${signal.label}): ${value}`;
}

/**
 * Names what this lead has *not* got, so the model does not fill the gap.
 *
 * Only topics a model plausibly reaches for are listed; an exhaustive list
 * would dilute the instruction.
 */
function buildDoNotClaim(signals: SignalSet): string[] {
  const out: string[] = [];
  if (!hasSignal(signals, "whatsapp_reachable") && !hasSignal(signals, "website_whatsapp_link")) {
    out.push("WhatsApp kullandıklarını veya WhatsApp'tan talep aldıklarını söyleme.");
  }
  if (!hasSignal(signals, "instagram_present")) {
    out.push("Instagram hesaplarından veya sosyal medya talebinden bahsetme.");
  }
  if (!hasSignal(signals, "own_website")) {
    out.push("Web sitelerinden veya site üzerindeki rezervasyon akışından bahsetme.");
  }
  if (!hasSignal(signals, "ota_listed") && !hasSignal(signals, "ota_dependency")) {
    out.push("OTA / Booking.com bağımlılığından bahsetme.");
  }
  if (!hasSignal(signals, "reviews_count")) {
    out.push("Yorum sayısı veya puanları hakkında bir şey söyleme.");
  }
  out.push("Doluluk, ciro, rezervasyon sayısı gibi göremeyeceğin rakamları söyleme.");
  return out;
}

const TONE_BRIEFS_TR: Record<Tone, string> = {
  soft: "Sıcak, izin isteyen ve güven veren. Kısa bir gözlem, sonra nazik bir teklif. Görüşme isteme; sadece kısa bir örnek göndermeyi öner.",
  direct:
    "Kısa ve net, ama agresif değil. Tek somut faydayı söyle ve doğal bir davet bırak. Lafı dolandırma, baskı da kurma.",
  consultative:
    "Bir gözlem paylaş, teşhis koyma. Merak uyandır ve doğal bir soruyla bitir. Sektör klişesiyle başlama.",
};

export type BuildPromptParams = {
  businessName: string;
  city?: string;
  businessType?: string;
  tone: Tone;
  angle: VariationAngle;
  signals: SignalSet;
  tugoboFit?: { score?: number; reasons: string[] };
  previousMessages: readonly string[];
  generationNonce: string;
  /** Relationship position. Absent means first contact. */
  stance?: OutreachStance;
};

export function buildOutreachUserPrompt(params: BuildPromptParams): string {
  const { signals } = params;
  const lines: string[] = [];

  lines.push(`İŞLETME: ${params.businessName}`);
  if (params.city) lines.push(`ŞEHİR: ${params.city}`);
  if (params.businessType) lines.push(`TİP: ${params.businessType}`);

  lines.push("", "VERIFIED SIGNALS (olgu olarak kullanabilirsin):");
  lines.push(
    signals.verified.length > 0
      ? signals.verified.map(renderSignal).join("\n")
      : "- (yok)",
  );

  lines.push("", "LIKELY SIGNALS (yalnızca ihtimal dilinde kullan):");
  lines.push(
    signals.likely.length > 0 ? signals.likely.map(renderSignal).join("\n") : "- (yok)",
  );

  lines.push("", "DO NOT CLAIM:");
  lines.push(buildDoNotClaim(signals).map((rule) => `- ${rule}`).join("\n"));

  /*
   * Placed before tone and angle: the stance decides whether the message may
   * reference a prior conversation at all, and no tone brief may override it.
   */
  const stance = params.stance ?? "first_contact";
  lines.push("", `İLİŞKİ DURUMU: ${stance}`);
  lines.push(STANCE_BRIEFS_TR[stance]);

  lines.push("", `TONE: ${params.tone}`);
  lines.push(TONE_BRIEFS_TR[params.tone]);

  lines.push("", `VARIATION ANGLE: ${params.angle}`);
  lines.push(
    `Bu mesaj şu konuya odaklanmalı: ${ANGLE_BRIEFS_TR[params.angle]} Başka bir konuya kayma.`,
  );

  if (params.tugoboFit && params.tugoboFit.reasons.length > 0) {
    lines.push("", "TUGOBO FIT (faydayı buradan seç, tek bir tanesini kullan):");
    lines.push(params.tugoboFit.reasons.slice(0, 4).map((r) => `- ${r}`).join("\n"));
  }

  if (params.previousMessages.length > 0) {
    lines.push("", "PREVIOUS MESSAGES TO AVOID (bunlara benzeme, farklı bir açıdan yaz):");
    lines.push(params.previousMessages.map((m, i) => `${i + 1}. ${m}`).join("\n"));
  }

  // Included so an identical request still produces a different completion.
  lines.push("", `VARIATION TOKEN: ${params.generationNonce}`);

  return lines.join("\n");
}
