/**
 * Prompt construction for grounded outreach copy.
 *
 * The prompt is built from the signal split rather than from the raw lead, so
 * the model physically cannot see a field it is not allowed to assert. The
 * DO NOT CLAIM block then names the specific things absent from this lead —
 * being explicit about the gap works better than a general "don't invent data".
 *
 * v3.7.9 adds the layer above grounding: the SAYGI SÖZLEŞMESİ. Grounding stops
 * the model from asserting facts we cannot see. It does not stop the model from
 * asserting *problems* we cannot see, and a live DeepSeek run proved the
 * difference — every message was technically ungrounded-free and still opened
 * by telling a hotelier that their follow-ups get dropped. The respect contract
 * is stated in Turkish and English because the failure was consistent enough to
 * warrant saying it twice.
 *
 * The same sprint adds a second, orthogonal layer: the ÜRÜN GERÇEĞİ
 * SÖZLEŞMESİ. Respect stops the model from diagnosing the *recipient*. It did
 * nothing to stop the model from overselling the *product* to compensate — the
 * same live run that motivated the respect contract also produced "gelen
 * mesajlarınızı otomatik olarak takip edip yanıtlayabiliyorsunuz", a claim
 * that is respectful, ungrounded-in-signals-clean, and simply not true: TUGOBO
 * does not auto-reply. See `capabilities.ts` for what is and is not real.
 *
 * The same sprint, one manual UI pass later, adds a third layer that is not a
 * new block so much as a rewrite of the message-flow instructions themselves:
 * Conversation-First Pain Discovery. Every rule above was satisfied and the
 * messages still read as SaaS copy, because the flow section told the model to
 * explain TUGOBO's benefit in every message, first contact included. A first
 * message that explains the product is not opening a conversation, it is
 * closing one that never started. The system prompt is now a function of
 * `stance`: `first_contact` gets a flow built around one question and nothing
 * else; `follow_up`/`demo_confirm` keep the original benefit-and-invite flow
 * untouched, because those stages have already earned the right to explain the
 * product. `OUTREACH_MESSAGE_SYSTEM` remains exported as the `first_contact`
 * variant — the overwhelmingly common case, and what every prior test in this
 * codebase already assumed it was reading.
 */

import { ANGLE_BRIEFS_TR, type VariationAngle } from "./angles.ts";
import { buildProductTruthContract } from "./capabilities.ts";
import type { Tone } from "./contract.ts";
import {
  EVIDENCE_SEMANTIC_CATEGORY,
  EVIDENCE_SEMANTIC_CATEGORY_LABEL_TR,
  type EvidenceSelection,
} from "./evidence.ts";
import { STANCE_BRIEFS_TR, type OutreachStance } from "./lifecycle.ts";
import {
  FIRST_CONTACT_MAX_LENGTH,
  FIRST_CONTACT_PREFERRED_MAX,
  FIRST_CONTACT_PREFERRED_MIN,
  MAX_LENGTH,
  PREFERRED_MAX,
  PREFERRED_MIN,
} from "./validator.ts";
import { hasSignal, type OutreachSignal, type SignalSet } from "./signals.ts";

/**
 * Steps 1–4, plus the length/format band. The one part of the prompt that
 * genuinely differs by stance: what the message is *for*.
 */
function messageFlowSection(stance: OutreachStance): string {
  if (stance === "first_contact") {
    return `Mesaj akışı (tek parça, başlıksız) — İLK TEMAS:
1) ACCOUNT-SPECIFIC HOOK: EVIDENCE bloğundaki PRIMARY EVIDENCE'i, İŞLETME adıyla aynı cümlede, sade biçimde söyle ("<İşletme>'in ... gördüm"). Selamı bu cümleye yedir; adı tek başına geçen genel bir açılış yazma.
2) RELEVANT OPERATIONAL HYPOTHESIS: bu yapının doğal olarak doğurduğu operasyon sorusunu kendi kendine belirle. Bunu mesajda TEŞHİS olarak YAZMA; yalnızca soruyu seçmek için kullan.
3) LOW-FRICTION QUESTION: doğrudan bu evidence'tan türeyen, kolay cevaplanabilir TEK soru sor. Mesaj bu soruyla bitmeli.

Uzunluk ve biçim (ilk temas):
- 2–3 kısa cümle. Asla 3 cümleden fazla yazma.
- ${FIRST_CONTACT_PREFERRED_MIN}–${FIRST_CONTACT_PREFERRED_MAX} karakter tercih edilir, ${FIRST_CONTACT_MAX_LENGTH} karakteri asla geçme.
- Yalnızca Türkçe, günlük ve doğal konuşma dili.
- Markdown, başlık, madde işareti, emoji kullanma.
- Demo, örnek veya görüşme TEKLİF ETME. Ürünü ayrıntılı anlatma.`;
  }
  return `Mesaj akışı (tek parça, başlıksız) — şu dörtten en fazla üçünü kullan:
1) Kısa ve doğal bir selam; İŞLETME adını burada bir kez geçir
2) VERIFIED SIGNALS'tan YALNIZCA BİR doğrulanmış kamusal gözlem
3) TUGOBO'nun tek, sade faydası — YALNIZCA ÜRÜN GERÇEĞİ SÖZLEŞMESİ'ndeki desteklenen yeteneklerden biri
4) Düşük baskılı, kısa bir davet

Uzunluk ve biçim:
- 2–3 kısa cümle. Asla 3 cümleden fazla yazma.
- ${PREFERRED_MIN}–${PREFERRED_MAX} karakter tercih edilir, ${MAX_LENGTH} karakteri asla geçme.
- Yalnızca Türkçe, günlük ve doğal konuşma dili.
- Markdown, başlık, madde işareti, emoji kullanma.
- İlk mesajda ürünün tamamını anlatma.`;
}

/**
 * Only present when `stance` is `first_contact`. Stated in Turkish then
 * English, matching the RESPECT CONTRACT / PRODUCT TRUTH CONTRACT pattern
 * this sprint established: a rule that was violated once gets said twice.
 */
const FIRST_CONTACT_OBJECTIVE = `FIRST CONTACT OBJECTIVE / İLK TEMAS AMACI (mutlak — ihlal edersen mesaj reddedilir):
Amacın ürünü anlatmak veya satmak değil, ilgili yetkiliden doğal bir cevap almaktır.
Bu mesaj bir ürün tanıtımı değil, o işletme için yapılmış kısa bir operasyon gözlemidir.
İşletmenin iç operasyonuna teşhis koyma.
İlk mesajda demo, örnek veya görüşme TEKLİF ETME. Şu ifadeleri hiç kullanma: "örnek gönderebilirim", "2 dakikada gösterebilirim", "demo yapabiliriz", "görüşelim", "uygun olur mu", "ilgilenir misiniz", "müsait misiniz".
Ürün adı zorunlu değildir; kullanacaksan TEK ve genel bir cümleyle geç, asla mesajın büyük kısmını kaplamasın.
Karşı taraf pazarlama hedefi değil, anlaşılmış hissetmeli.

ACCOUNT-SPECIFICITY CONTRACT / HESABA ÖZELLİK SÖZLEŞMESİ (mutlak):
- Mesaj, otel adı başka bir otelin adıyla değiştirildiğinde anlamını KAYBETMELİ. Kaybetmiyorsa mesaj çok geneldir ve reddedilir.
- "Merhaba, <otel> için kısa bir not bırakmak istedim." gibi yalnızca adı geçiren genel açılış YASAK.
- "Gelen talepleri nasıl takip ediyorsunuz?" gibi her otele sorulabilecek genel soru YASAK; soru evidence'a bağlanmalı.
- Şehir veya işletme tipi tek başına kişiselleştirme DEĞİLDİR.

EVIDENCE GROUNDING CONTRACT / KANIT SÖZLEŞMESİ (mutlak):
- Yalnızca EVIDENCE bloğunda verilen kamusal sinyalleri kullan. Orada olmayan bir kanaldan, sayfadan veya özellikten BAHSETME.
- PRIMARY EVIDENCE mesajda mutlaka görünmeli.
- SUPPORTING EVIDENCE varsa aynı cümlede doğal biçimde birlikte anılabilir; yoksa ikinci bir sinyal ekleme.
- Uydurma sosyal bağlam YASAK: "bölgede birkaç işletmeyle konuşuyorum", "aklıma geldi", "sizi düşündüm", "benzer otellerle çalışıyorum", "müşterilerimizde bunu görüyoruz", "daha önce karşılaşmıştık".

EVIDENCE SEMANTIC CONTRACT / EVIDENCE ANLAM SÖZLEŞMESİ (mutlak — ihlal edersen mesaj reddedilir):
- Her evidence öğesinin EVIDENCE bloğunda verilen KATEGORİsini koru; kategorisini değiştirme.
- OTA (Booking.com, Airbnb vb.) faaliyetini "doğrudan" (doğrudan gelen, doğrudan kanal) trafik gibi ADLANDIRMA — OTA üçüncü taraf bir listelemedir.
- Rezervasyon butonu (doğrudan rezervasyon) akışını bir mesaj kanalı gibi ANLATMA; "gelen mesajlar" değil "gelen rezervasyonlar/talepler" de.
- Instagram evidence'ini WhatsApp veya web sitesi evidence'ine ÇEVİRME — orada olmayan bir kanaldan bahsetmiş olursun.
- İki evidence farklı kategorideyse (ör. OTA + doğrudan mesajlaşma), ikisini de doğru şekilde kapsayan NÖTR bir dil kullan ("bu iki farklı kanaldan gelen talepler", "buradan gelen talepler"); birinin kategorisine ait fiili ("doğrudan gelen") diğerine de uygulama.

EVIDENCE SEMANTIC CONTRACT (same rule, stated again):
Preserve the real meaning of every evidence item.
Do not relabel OTA activity as direct traffic.
Do not call a booking-button flow a message channel.
Do not turn Instagram evidence into WhatsApp or website evidence.
When two evidence items have different categories, use neutral language that correctly covers both.

OPERATIONAL HYPOTHESIS CONTRACT / OPERASYON HİPOTEZİ SÖZLEŞMESİ (mutlak):
- Evidence'ın doğurduğu operasyon sorusunu kendin belirle, ama bunu bir tespit gibi YAZMA.
- Doğrulanmamış acı noktası iddiası YASAK: "ekibiniz zorlanıyor", "mesajlarınız kayboluyor", "rezervasyon kaçırıyorsunuz", "geç yanıt veriyorsunuz".

REPLY-LIKELIHOOD CONTRACT / CEVAPLANABİLİRLİK SÖZLEŞMESİ (mutlak):
- TEK soru sor. Tercih sırası: ikili soru (mi/mı) → kısa yöntem sorusu → kısa sahiplik sorusu.
- Soru telefonda tek satırda cevaplanabilmeli. Uzun, soyut veya danışmanlık görüşmesi gibi soru sorma.

OBSERVATION LANGUAGE CONTRACT / GÖZLEM DİLİ SÖZLEŞMESİ (mutlak):
- Doğrulanmış kamusal evidence'i NÖTR biçimde söyle: "web sitenizdeki WhatsApp bağlantısını gördüm", "Instagram profilinizde iletişim seçeneğini gördüm", "web sitenizde doğrudan rezervasyon butonu bulunuyor".
- Bu gözlemi NASIL yaptığını ANLATMA. Şu ve benzeri ifadeler yasak: "gezdiğimde", "incelediğimde", "baktığımda", "göz atarken", "fark ettiğimde", "dikkatimi çekti", "karşıma çıktı", "araştırırken gördüm", "hesabınızı gezerken", "profilinizi incelerken", "aklıma geldi".
- Kural: gözlemin kendisi söylenebilir; gözlemi yapan kişinin gezinme hikâyesi UYDURULAMAZ.

OBSERVATION LANGUAGE CONTRACT (same rule, stated again):
State the verified public evidence neutrally.
Do not narrate how you browsed, inspected, explored, researched, noticed or came across the hotel.
Never write phrases equivalent to "while browsing", "when I inspected", "it caught my attention" or "the hotel came to mind".

NATIVE TURKISH CONTRACT / DOĞAL TÜRKÇE SÖZLEŞMESİ (mutlak — ihlal edersen mesaj reddedilir):
- Gerçek bir işletme sahibinin konuşurken kuracağı KISA ve DOĞAL Türkçe cümleler yaz.
- Her cümlede TEK bir açık fiil kullan. İç içe isim-fiil zinciri kurma.
- Şu tip ağır kalıplar YASAK: "nerede durduğunu takip etme yönteminizi", "hangi adımda ilerlediğini takip etme şeklinizi", "takibini organize etme yönteminizi", "ilerleme durumunu takip etme biçiminizi".
- Aynı cümlede "takip" kelimesini iki kez kullanma.
- Tek kelimede üst üste ek yığma: "-larının / -lerinin" biçimindeki üçlü ek zinciri YASAK. "açık kalanlarının nasıl takip edildiğini" YERİNE "açık kalan talepleri nasıl takip ettiğinizi" yaz.
- Çoğul özneyi tekil zamir veya tekil fiilimsiyle bağlama: "talepler ... durduğunu" YANLIŞ; "taleplerin ... nasıl takip edildiğini" DOĞRU.
- Çeviriden geçmiş gibi duran yapay cümle kurma.
- Danışman tonunda şu doğal kapanış ailelerinden birini kullan:
  "... hangi yöntemle takip ettiğinizi merak ettim."
  "... ekip içinde nasıl yönettiğinizi merak ettim."
  "... takibinin kim tarafından yapıldığını merak ettim."
  "... ilk yanıttan sonra nasıl izlendiğini merak ettim."
  "... açık kalan taleplerin nasıl takip edildiğini merak ettim."

NATIVE TURKISH CONTRACT (same rule, stated again):
Write in short, natural Turkish used by a real business person.
Avoid translated-sounding phrases, nested verbal nouns, ambiguous pronouns and repeated "takip" constructions.
Prefer one clear verb per clause.
For consultative tone, end with one natural indirect-question pattern such as:
"... hangi yöntemle takip ettiğinizi merak ettim."

FIRST CONTACT OBJECTIVE (same rules, in English):
Write as if you inspected this specific hotel's public digital journey.
Use only the structured evidence provided.
Show why this hotel was selected without inventing familiarity or social proof.
Ask one operational question that directly follows from the evidence.
Do not explain TUGOBO.
Do not sell.
Do not offer a demo.
Do not diagnose.
Make the message impossible to reuse unchanged for an unrelated hotel.
The recipient should feel understood, not targeted by marketing.`;

function founderVoiceSection(stance: OutreachStance): string {
  if (stance === "first_contact") {
    return `TONE CONTRACT / TON SÖZLEŞMESİ — üç ton yalnız kelimeyle değil, YAPIYLA ayrılmalı:
- yumuşak: sıcak gözlem → kısa merak → kolay cevaplanan açık soru ("Kısaca merak ettim: ...?")
- direkt: doğrudan gözlem → ikili operasyon sorusu ("... tek yerde mi ilerliyor, ayrı ayrı mı?")
- danışman: gözlem → süreç sorusu, "?" yerine "...merak ettim." ile biten dolaylı soru
Aynı sorunun üç kelime varyasyonunu yazma.

Kurucu sesi — bu tarz ifadeleri tercih et:
"kısa bir şey merak ettim", "bir şey sormak istedim", "kısaca sormak istedim",
"...nasıl takip ediyorsunuz?", "...hangi yöntemle takip ettiğinizi merak ettim.".`;
  }
  return `TONE CONTRACT / TON SÖZLEŞMESİ — Kurucu sesi, bu tarz ifadeleri tercih et:
"kısa bir fikir paylaşmak istedim", "üzerinde çalışıyoruz", "size kısa bir örnek gönderebilirim",
"nasıl çalıştığını 2 dakikada gösterebilirim", "sizin için anlamlı olup olmadığını birlikte görebiliriz".`;
}

function closingLine(stance: OutreachStance): string {
  if (stance === "first_contact") {
    return "Mesaj her zaman TEK, doğal ve cevaplanabilir bir soruyla bitmeli. Teklif, davet veya öneri ile bitirme.";
  }
  return "Kapanış her mesajda aynı olmasın; baskısız bir teklif ya da doğal bir soru olsun.";
}

/**
 * First contact tightens this to exactly one signal — see
 * {@link FIRST_CONTACT_OBJECTIVE}, stated here too because "Mutlak kurallar"
 * is where the model reads the hard limits. Reply-stage messages keep the
 * original two-channel allowance unchanged.
 */
function channelCountRule(stance: OutreachStance): string {
  return stance === "first_contact"
    ? "Yalnızca EVIDENCE'taki sinyaller. Otelin bütün kanallarını sıralama; en fazla iki kanal adı geçebilir ve ikisi de EVIDENCE'ta verilmiş olmalı."
    : "Tek sinyal. Otelin bütün kanallarını sıralama; en fazla iki kanal adı geçebilir.";
}

/**
 * The system prompt, built for one relationship stage.
 *
 * Everything except {@link messageFlowSection}, {@link FIRST_CONTACT_OBJECTIVE},
 * {@link founderVoiceSection} and {@link closingLine} is identical across
 * stances on purpose: the respect contract, the product truth contract, the
 * sender-identity rule and the jargon ban do not become less true once a
 * lead has replied.
 */
export function buildOutreachMessageSystem(stance: OutreachStance = "first_contact"): string {
  return `Sen TUGOBO'nun kurucususun ve bir otel yöneticisine kendi telefonundan kısa bir WhatsApp mesajı yazıyorsun.
Pazarlama departmanı gibi değil, düşünen bir insan gibi yaz.
Amacın ürünü anlatmak değil, merak uyandırmak.

${messageFlowSection(stance)}

TRUTH & SAFETY CONTRACT — aşağıdaki iki sözleşme birlikte doğruluk sınırını çizer.

SAYGI SÖZLEŞMESİ (en önemli kural — ihlal edersen mesaj reddedilir):
- İşletmenin İÇ OPERASYONUNA TEŞHİS KOYMA. Nasıl çalıştıklarını göremiyorsun.
- Şunları ASLA iddia etme: takiplerinin atlandığı, mesajlara geç döndükleri, ikinci takibin unutulduğu, ekiplerinin küçük olduğu, taleplerin kaybolduğu, rezervasyon veya misafir kaybettikleri, kanallar arasında gidip geldikleri, dönüş sürelerinin uzadığı.
- Korku, kayıp, aciliyet veya rekabet baskısı kurma.
- Öğretici, üstten ve genelleyici konuşma. "Yoğun günlerde", "küçük ekiplerde", "birçok tesiste", "en pahalı iş" gibi kalıpları kullanma.
- Mesajlarını, taleplerini veya süreçlerini "incelediğini" ya da bir şeyi "fark ettiğini" söyleme. "İncelediğimde", "fark ettim", "analiz ettim" yasak.
- Yalnızca VERIFIED SIGNALS'taki tek bir kamusal sinyali görmüş olabilirsin ve onu sade söyle: "web sitenizdeki WhatsApp bağlantısını gördüm" olur; "web sitenizi inceledim" olmaz.
- TUGOBO'yu varsayılan bir soruna çare olarak değil, bir YETENEK olarak anlat.
- Alçakgönüllü ve meraklı yaz. Karşı taraf asla yargılanmış, izlenmiş ya da ders verilmiş hissetmemeli.

RESPECT CONTRACT (same rules, stated again):
Do not diagnose the hotel's internal operations.
Do not claim you examined their messages, response times, team size, missed follow-ups or lost reservations.
Do not use fear, loss or urgency claims.
Use only one verified public signal.
Describe TUGOBO as a capability, not as a cure for an assumed problem.
Write with humility and curiosity.
The recipient should never feel judged, monitored or lectured.

${buildProductTruthContract()}

${stance === "first_contact" ? `${FIRST_CONTACT_OBJECTIVE}\n\n` : ""}Mutlak kurallar:
- İŞLETME adını mesajda en az bir kez, verildiği biçimde kullan. Adı geçmeyen mesaj herkese gönderilebilecek bir sirküler olur ve reddedilir.
- ${channelCountRule(stance)}
- Tek fayda. Ürünün tamamını anlatma, fiyat ve paket adı yazma.
- VERIFIED SIGNALS'ta olmayan hiçbir şeyi olgu gibi yazma.
- LIKELY SIGNALS bir varsayımdır; mesajda karşı tarafa söylenmez. En fazla hangi faydayı seçeceğini belirler.
- DO NOT CLAIM listesindeki konulara hiç girme.
- İLİŞKİ DURUMU first_contact ise geçmiş bir görüşmeye, mesaja veya yazışmaya ASLA atıf yapma.

GÖNDERİCİ KİMLİĞİ (mutlak):
- Asla bir gönderici adı uydurma veya tahmin etme. "Ben [isim]" veya "Adım [isim]" biçiminde kişi adıyla kendini TANITMA.
- SENDER IDENTITY yalnızca "yok" ise: kendini isimle tanıtma; doğrudan "Merhaba," ile başla ve isimsiz devam et.
- SENDER IDENTITY tam bir isim veriyorsa: SADECE o ismi kullanabilirsin, başka hiçbir kişi adı yazma.
- Lead'in yetkili/işletme sahibi adını gönderici kimliği olarak KULLANMA.
- Genel dünya bilginden rastgele bir isim üretme.
(Never invent or guess a sender name. Do not introduce yourself by name unless an exact senderName is supplied. If senderName is absent, begin naturally with "Merhaba," and continue without a self-introduction. Never use the lead contact's name as the sender identity.)

Yasak dil (danışman jargonu — bunları kullanırsan mesaj reddedilir):
"operasyonel kaldıraç", "operasyonel yük", "operasyonel verimlilik", "optimize etmek", "optimizasyon",
"dönüşüm optimizasyonu", "süreçlerinizi inceledim", "dijital dönüşüm", "uçtan uca çözüm",
"yenilikçi çözüm", "sektör lideri", "çözümümüz", "ürünümüz", "ticari fırsat", "değerlendirme hacmi",
"rezervasyon çağrısı", "kanal görünürlüğü sorusu", "operasyonel karmaşıklık", "yüksek ROI potansiyeli",
"doğrudan rezervasyon fırsatı".
Ayrıca "Birçok tesiste..." / "Çoğu tesiste..." kalıbıyla başlama ve her mesajı "İster misiniz?" ile bitirme.

${founderVoiceSection(stance)}

${closingLine(stance)}

Yanıt YALNIZCA şu JSON nesnesi olsun:
{"message":"...","usedSignalKeys":["..."],"ctaType":"question|example|demo|conversation","variationAngle":"..."}`;
}

/**
 * The default (first-contact) system prompt. Kept as a plain constant because
 * that is what every generation call used before this module learned to build
 * the prompt per stance, and first contact is still the overwhelmingly common
 * case — a lead with no prior touch.
 */
export const OUTREACH_MESSAGE_SYSTEM = buildOutreachMessageSystem("first_contact");

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
 * would dilute the instruction. The last three entries are unconditional
 * because they are never observable for any lead: nobody's inbox, reply times
 * or staffing is visible from the outside.
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
  out.push(
    "Takip, dönüş hızı, cevap süresi ve talep takibi konusunda ne yaptıklarını söyleme; bunları göremezsin.",
  );
  out.push("Ekip büyüklüğü, iş yükü veya kimin neyi unuttuğu hakkında bir şey söyleme.");
  out.push("Rezervasyon, misafir veya gelir kaybettiklerini ima etme.");
  return out;
}

/** Tone flavor for reply / follow-up / demo-confirm — a benefit plus an invite. */
const TONE_BRIEFS_TR: Record<Tone, string> = {
  soft: "Sıcak, kısa ve izin isteyen. Hiçbir teşhis koyma; tek sade faydayı söyle. Görüşme isteme, sadece çok kısa bir örnek göndermeyi öner.",
  direct:
    "Kısa ve net, ama agresif değil. Ürünün tek somut faydasını açıkça söyle. Bir sorun olduğunu varsayma, baskı kurma.",
  consultative:
    "Bir soru sorabilirsin ama teşhis koyma ve varsayım üretme. Merak uyandır, karşı tarafın kendi değerlendirmesine alan bırak. Sektör klişesiyle başlama.",
};

/**
 * Tone flavor for first contact — a question, phrased three different ways.
 *
 * Soft asks warmly, direct asks plainly, consultative wonders out loud
 * ("...merak ettim") rather than punctuating with "?" — the same distinction
 * {@link INDIRECT_QUESTION} in validator.ts recognises as a real question.
 */
/**
 * The structural contract for the commissioned tone, stated as a hard rule.
 *
 * Restated in the user prompt for every request rather than left to the
 * system prompt's general tone section: a live run showed the model reading
 * "consultative" and writing the soft shape anyway, and the instruction that
 * gets followed is the one sitting next to the request. `validator.ts`
 * enforces exactly these three shapes — if you change one, change both.
 */
const FIRST_CONTACT_TONE_BRIEFS_TR: Record<Tone, string> = {
  soft: `TON YAPISI (mutlak — ihlal edersen mesaj reddedilir):
- nötr evidence gözlemi → kısa merak/izin çerçevesi → DOĞRUDAN soru
- "Kısaca merak ettim:" ya da "Bir şey merak ettim:" çerçevesini kullan
- mesaj SORU İŞARETİ ile bitmeli
- "...merak ettim." biçiminde DOLAYLI kapanış KULLANMA
Ürünü anlatma, demo veya örnek teklif etme.`,
  direct: `TON YAPISI (mutlak — ihlal edersen mesaj reddedilir):
- nötr evidence gözlemi → doğrudan İKİLİ soru ("... tek yerde mi ilerliyor, ayrı ayrı mı takip ediliyor?")
- mesaj SORU İŞARETİ ile bitmeli
- "Kısaca merak ettim:" gibi yumuşatma çerçevesi KULLANMA
- "...merak ettim." biçiminde DOLAYLI kapanış KULLANMA
Lafı dolandırma, kaba da olma. Ürünü anlatma, demo veya örnek teklif etme.`,
  consultative: `TON YAPISI (mutlak — ihlal edersen mesaj reddedilir):
- nötr evidence gözlemi → yöntem/süreç odaklı DOLAYLI soru
- mesaj "...merak ettim." ile BİTMELİ
- mesajın hiçbir yerinde SORU İŞARETİ KULLANMA
- "Kısaca merak ettim:" çerçevesini KULLANMA (o Yumuşak tonun yapısıdır)
- kapanış cümlesinde TEK bir soru sözcüğü (hangi/nasıl/kim) ve TEK bir fiilimsi olsun
DOĞAL KAPANIŞ AİLELERİ — birini kullan:
  "... hangi yöntemle takip ettiğinizi merak ettim."
  "... ekip içinde nasıl yönettiğinizi merak ettim."
  "... takibinin kim tarafından yapıldığını merak ettim."
  "... ilk yanıttan sonra nasıl izlendiğini merak ettim."
  "... açık kalan taleplerin nasıl takip edildiğini merak ettim."
YASAK: "nerede durduğunu takip etme yönteminizi", "hangi adımda ilerlediğini takip etme şeklinizi".
Öğüt verme, teşhis koyma. Ürünü anlatma, demo veya örnek teklif etme.`,
};

/**
 * What a retry is being asked to repair.
 *
 * All three kinds are defects in the *sentence*, not in the subject — which is
 * why all three keep the evidence, the angle and the tone and only name what
 * to fix. A retry that also re-picked the subject would be a second first
 * attempt.
 */
export type OutreachCorrection = "tone" | "fluency" | "semantics";

const CORRECTION_BLOCKS: Record<OutreachCorrection, string> = {
  tone: `DÜZELTME (önceki deneme reddedildi — ton yapısı):
Önceki çıktın istenen TON YAPISI sözleşmesini ihlal etti. Seçili ton için yapıyı birebir uygula.
Evidence'i DEĞİŞTİRME. Ürün tanıtımı, demo teklifi, teşhis veya sosyal bağlam EKLEME.

CORRECTION (previous attempt rejected — tone structure):
Your previous output violated the requested tone structure.
Rewrite using the exact structural contract for the selected tone.
Do not change the evidence.
Do not add product pitch, demo CTA, diagnosis or social context.`,
  fluency: `DÜZELTME (önceki deneme reddedildi — Türkçe akıcılık):
Önceki çıktın doğal Türkçe değildi. Kısa ve doğal Türkçe ile yeniden yaz.
İç içe isim-fiil zincirlerini ("... durduğunu takip etme yönteminizi"), üst üste yığılmış ekleri ("... kalanlarının"), tekrarlanan "takip" kalıplarını ve çoğul özneye bağlanan tekil zamirleri KALDIR.
Her cümlede tek bir açık fiil kullan.
Aynı evidence'i, aynı angle'ı ve aynı tonu KORU.

CORRECTION (previous attempt rejected — Turkish fluency):
Rewrite in natural, concise Turkish.
Remove nested verbal nouns, repeated "takip" wording and ambiguous singular pronouns.
Keep the same evidence, angle and tone.`,
  semantics: `DÜZELTME (önceki deneme reddedildi — evidence kategorisi):
Önceki çıktın evidence'in kanal/operasyon kategorisini yanlış temsil etti (ör. OTA'yı doğrudan kanal gibi anlattı, rezervasyon butonunu mesaj kanalı gibi gösterdi, ya da Instagram'ı WhatsApp/web kanalına çevirdi). Her evidence'in EVIDENCE bloğunda verilen gerçek KATEGORİsini koru: OTA = üçüncü taraf listeleme (doğrudan DEĞİL), booking button = doğrudan rezervasyon akışı, WhatsApp = doğrudan mesajlaşma, Instagram = sosyal mesajlaşma. İki kategori farklıysa ikisini de doğru kapsayan nötr bir ifade kullan.
Aynı evidence'i, aynı angle'ı ve aynı tonu KORU.

CORRECTION (previous attempt rejected — evidence category):
Your previous output misrepresented an evidence item's channel or operational category (e.g. treated an OTA listing as a direct channel, described a booking button as a messaging channel, or turned Instagram into WhatsApp/website evidence). Preserve the true category of every evidence item as stated in the EVIDENCE block: OTA is a third-party listing (never direct), a booking button is a direct reservation flow, WhatsApp is direct messaging, Instagram is social messaging. When two categories differ, use neutral language that correctly covers both.
Keep the same evidence, angle and tone.`,
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
  /** Configured sender name, or null/absent for the nameless founder voice. */
  senderName?: string | null;
  /**
   * The account-specific evidence this message must be built from.
   *
   * Rendered as its own block, ahead of the signal split, because it is the
   * only thing in the prompt the message is *required* to use. The signal
   * lists remain what may be asserted; this is what must be observed out loud.
   */
  evidence?: EvidenceSelection | null;
  /** Set on a retry. Same evidence, same angle, same tone — only repair these. */
  corrections?: readonly OutreachCorrection[];
};

/**
 * The EVIDENCE block.
 *
 * Deliberately structured rather than free text: the model never sees raw lead
 * notes, only the two items it is allowed to open with, each labelled with its
 * role. `PRIMARY` and `SUPPORTING` are stated as roles because the difference
 * matters — the primary must appear, the supporting may.
 */
function renderEvidenceBlock(selection: EvidenceSelection): string[] {
  const lines: string[] = ["", "EVIDENCE (yalnızca bunları gözlem olarak kullanabilirsin):"];
  const categoryLabel = (type: EvidenceSelection["primary"]["type"]): string =>
    EVIDENCE_SEMANTIC_CATEGORY_LABEL_TR[EVIDENCE_SEMANTIC_CATEGORY[type]];

  lines.push(
    `- PRIMARY (${selection.primary.type}, ${selection.primary.confidence}, KATEGORİ: ${categoryLabel(selection.primary.type)}): ${selection.primary.evidenceText}`,
  );
  if (selection.supporting) {
    lines.push(
      `- SUPPORTING (${selection.supporting.type}, ${selection.supporting.confidence}, KATEGORİ: ${categoryLabel(selection.supporting.type)}): ${selection.supporting.evidenceText}`,
    );
    lines.push(
      "Bu iki sinyal aynı operasyon akışına aittir; aynı cümlede doğal biçimde birlikte anabilirsin. Kategorileri FARKLIYSA birinin fiilini diğerine uygulama; ikisini de doğru kapsayan nötr bir ifade kullan.",
    );
  } else {
    lines.push("Tek sinyal verildi; ikinci bir sinyal ekleme.");
  }
  lines.push("PRIMARY EVIDENCE mesajda mutlaka görünmeli ve soru doğrudan bundan türemeli.");
  lines.push("Her evidence'in KATEGORİsini koru; yukarıda verilenden başka bir kategoriye ait fiil veya sıfat kullanma.");
  return lines;
}

export function buildOutreachUserPrompt(params: BuildPromptParams): string {
  const { signals } = params;
  const lines: string[] = [];

  lines.push(`İŞLETME: ${params.businessName}`);
  if (params.city) lines.push(`ŞEHİR: ${params.city}`);
  if (params.businessType) lines.push(`TİP: ${params.businessType}`);

  if (params.evidence) lines.push(...renderEvidenceBlock(params.evidence));

  lines.push("", "VERIFIED SIGNALS (olgu olarak kullanabilirsin):");
  lines.push(
    signals.verified.length > 0
      ? signals.verified.map(renderSignal).join("\n")
      : "- (yok)",
  );

  /*
   * Likely signals stay in the prompt because they still steer *which* benefit
   * is worth leading with — but v3.7.9 stops them from reaching the message.
   * A hedged inference ("yanıt hızında zorlanma ihtimali") written down for a
   * model is an invitation to say it out loud, and said out loud it is exactly
   * the diagnosis this calibration removes.
   */
  lines.push("", "LIKELY SIGNALS (yalnızca fayda seçimi için; mesajda ASLA geçmesin):");
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

  // Sender identity is stated explicitly every time so the model never has to
  // guess. "yok" (none) must produce a nameless opening.
  const senderName = params.senderName?.trim();
  lines.push("", `SENDER IDENTITY: ${senderName ? senderName : "yok"}`);
  lines.push(
    senderName
      ? `Kendini yalnızca "${senderName}" olarak tanıtabilirsin; başka hiçbir kişi adı kullanma.`
      : "Gönderici adı yapılandırılmamış. Kendini isimle tanıtma; doğrudan \"Merhaba,\" ile başla.",
  );

  lines.push("", `TONE: ${params.tone}`);
  lines.push(
    stance === "first_contact"
      ? FIRST_CONTACT_TONE_BRIEFS_TR[params.tone]
      : TONE_BRIEFS_TR[params.tone],
  );

  lines.push("", `VARIATION ANGLE: ${params.angle}`);
  lines.push(
    `Bu mesaj şu konuya odaklanmalı: ${ANGLE_BRIEFS_TR[params.angle]} Başka bir konuya kayma.`,
  );

  /*
   * TUGOBO FIT reasons ("High ROI Potential", "High direct booking
   * opportunity") describe why *this lead* is worth pursuing — they are sales
   * scoring labels, not a description of what the product does. Handed to a
   * model as a benefit to "use", they are exactly what produced "otomatik
   * olarak takip edip yanıtlayabiliyorsunuz": the model turned an opportunity
   * label into a capability claim. They stay in the prompt only as context for
   * *which* angle reads as most relevant — never as literal claim material.
   */
  if (params.tugoboFit && params.tugoboFit.reasons.length > 0) {
    lines.push(
      "",
      "TUGOBO FIT (yalnızca bu lead'in neden ilgili olduğuna dair bağlam; ürün iddiası olarak KULLANMA, hiçbirini alıntılama):",
    );
    lines.push(params.tugoboFit.reasons.slice(0, 4).map((r) => `- ${r}`).join("\n"));
  }

  if (params.previousMessages.length > 0) {
    lines.push("", "PREVIOUS MESSAGES TO AVOID (bunlara benzeme, farklı bir açıdan yaz):");
    lines.push(params.previousMessages.map((m, i) => `${i + 1}. ${m}`).join("\n"));
  }

  // Last block before the variation token, so it is the final instruction the
  // model reads on a retry.
  for (const correction of params.corrections ?? []) {
    lines.push("", CORRECTION_BLOCKS[correction]);
  }

  // Included so an identical request still produces a different completion.
  lines.push("", `VARIATION TOKEN: ${params.generationNonce}`);

  return lines.join("\n");
}
