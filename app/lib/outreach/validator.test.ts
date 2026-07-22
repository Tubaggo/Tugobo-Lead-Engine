import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildOutreachSignals } from "./signals.ts";
import { MAX_LENGTH, validateOutreachMessage } from "./validator.ts";

const RICH = buildOutreachSignals({
  city: "Antalya",
  businessType: "Boutique Hotel",
  hasWhatsAppPath: true,
  hasInstagram: true,
  hasOwnWebsite: true,
  channels: ["Booking"],
  otaDependencyLikelihood: 80,
});

const SPARSE = buildOutreachSignals({ city: "Bodrum", businessType: "Hotel" });

/** A message that passes every rule; individual tests mutate one thing. */
const GOOD =
  "Merhaba, Lara Sunset Boutique için kısa bir not bırakayım. Farklı kanallardan gelen " +
  "mesajların tek yerden takibi zaman içinde zorlaşabiliyor. Uygun olursa bunu nasıl " +
  "toparladığımıza dair kısa bir örnek paylaşabilirim.";

function check(message: string, signals = RICH) {
  return validateOutreachMessage({
    message,
    signals,
    businessName: "Lara Sunset Boutique",
  });
}

describe("baseline", () => {
  test("a well-formed message passes", () => {
    assert.deepEqual(check(GOOD), { ok: true });
  });
});

describe("length", () => {
  test("rejects an empty message", () => {
    const result = check("");
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.failures, ["empty"]);
  });

  test("rejects a message that is too short", () => {
    const result = check("Merhaba, işletmeniz için yazıyorum. Paylaşabilirim.");
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("too_short"));
  });

  test("rejects a message over the hard cap", () => {
    const result = check(`${GOOD} ${"Ek cümle. ".repeat(60)}`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("too_long"));
  });

  test("the hard cap is 380 characters", () => {
    assert.equal(MAX_LENGTH, 380);
  });
});

describe("formatting rules", () => {
  test("rejects markdown", () => {
    const result = check(GOOD.replace("Merhaba", "**Merhaba**"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("markdown"));
  });

  test("rejects a URL", () => {
    const result = check(`${GOOD} Detay: https://tugobo.com`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("url"));
  });

  test("rejects a bare domain", () => {
    const result = check(`${GOOD} Sitemiz tugobo.com.tr adresinde.`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("url"));
  });

  test("rejects a price", () => {
    const result = check(`${GOOD} Aylık 5000 TL.`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("price"));
  });

  test("rejects a currency symbol", () => {
    const result = check(`${GOOD} Sadece ₺4900.`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("price"));
  });

  test("rejects an unfilled placeholder", () => {
    const result = check(GOOD.replace("Lara Sunset Boutique", "{{name}}"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("placeholder"));
  });

  test("rejects startup-pitch vocabulary", () => {
    const result = check(GOOD.replace("Uygun olursa", "AI destekli platformumuz ile"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("banned_phrase"));
  });

  test("rejects urgency spam", () => {
    const result = check(`${GOOD} Son fırsat.`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("banned_phrase"));
  });
});

describe("CTA", () => {
  test("rejects a message with no offer", () => {
    const result = check(
      "Merhaba, Lara Sunset Boutique için kısa bir not bırakayım. Farklı kanallardan " +
        "gelen mesajların tek yerden takibi zaman içinde zorlaşabiliyor. İyi günler dilerim efendim.",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("no_cta"));
  });
});

describe("grounding", () => {
  test("rejects a WhatsApp claim when WhatsApp is unverified", () => {
    const result = check(
      "Merhaba, Bodrum tarafındaki işletmeniz için yazıyorum. WhatsApp'ınızdan gelen " +
        "talepleri takip etmek zorlaşabiliyor diye düşündüm. Uygun olursa kısa bir örnek paylaşabilirim.",
      SPARSE,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  test("allows a WhatsApp mention when WhatsApp is verified", () => {
    const result = check(
      "Merhaba, Lara Sunset Boutique için kısa yazıyorum. WhatsApp'ınızdan gelen " +
        "taleplerin takibi yoğun günlerde zorlaşabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, true);
  });

  test("rejects an OTA claim with no listing evidence", () => {
    const result = check(
      "Merhaba, Bodrum tarafındaki işletmeniz için yazıyorum. Booking.com üzerinden gelen " +
        "rezervasyonların komisyonu ciddi yer tutabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      SPARSE,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  test("rejects a website claim when there is no website", () => {
    const result = check(
      "Merhaba, Bodrum tarafındaki işletmeniz için yazıyorum. Web siteniz üzerinden gelen " +
        "taleplerin rezervasyona dönmesi zorlaşabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      SPARSE,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  test("rejects a definite-loss assertion even with rich signals", () => {
    const result = check(
      "Merhaba, Lara Sunset Boutique için yazıyorum. Yoğun saatlerde taleplerinizi " +
        "kaçırıyorsunuz ve rezervasyon kaybediyorsunuz. Uygun olursa kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  test("accepts hedged language about the same topic", () => {
    const result = check(
      "Merhaba, Lara Sunset Boutique için yazıyorum. Yoğun saatlerde gelen taleplere " +
        "dönüş süresi uzayabiliyor ve bu ilgiyi soğutabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, true);
  });
});

describe("specificity", () => {
  test("rejects a message that names neither the property nor its city", () => {
    const result = check(
      "Merhaba, konaklama sektöründe çalışan pek çok yerde talep takibi zorlaşabiliyor " +
        "ve dönüşler gecikebiliyor. Uygun olursa kısa bir örnek paylaşabilirim size.",
      RICH,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("not_specific"));
  });

  test("accepts a message that addresses the property generically", () => {
    const result = check(
      "Merhaba, işletmenizi incelerken bir şey dikkatimi çekti. Farklı kanallardan gelen " +
        "mesajların takibi zaman içinde zorlaşabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, true);
  });
});

describe("duplicates", () => {
  test("rejects a message already shown", () => {
    const result = validateOutreachMessage({
      message: GOOD,
      signals: RICH,
      businessName: "Lara Sunset Boutique",
      previousMessages: [GOOD],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("duplicate"));
  });

  test("accepts a genuinely different message", () => {
    const result = validateOutreachMessage({
      message:
        "Merhaba, Lara Sunset Boutique özelinde kısaca yazmak istedim. İlk mesajdan " +
        "sonraki takip yoğun günlerde kolayca atlanabiliyor. İsterseniz 10 dakikada özetleyebilirim.",
      signals: RICH,
      businessName: "Lara Sunset Boutique",
      previousMessages: [GOOD],
    });
    assert.equal(result.ok, true);
  });
});
