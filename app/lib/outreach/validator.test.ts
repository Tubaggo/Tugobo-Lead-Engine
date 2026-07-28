import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildOutreachSignals } from "./signals.ts";
import { MAX_LENGTH, validateOutreachMessage } from "./validator.ts";

/*
 * This file covers the generic quality gate — length, formatting, jargon,
 * grounding, duplicates — using capability-language fixtures. Those rules are
 * shared across every relationship stage, so `check()` pins `stance:
 * "follow_up"` to keep the fixtures out of the first-contact-only rules
 * (single question required, no product pitch, no demo offer). Those rules
 * get their own dedicated coverage in `pain-discovery-outreach.test.ts`.
 */

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
  "Merhaba, Lara Sunset Boutique için kısa bir fikir paylaşmak istedim. TUGOBO, gelen " +
  "rezervasyon taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek paylaşabilirim.";

function check(message: string, signals = RICH) {
  return validateOutreachMessage({
    message,
    signals,
    businessName: "Lara Sunset Boutique",
    stance: "follow_up",
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

  test("the hard cap is 300 characters", () => {
    assert.equal(MAX_LENGTH, 300);
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
      "Merhaba, Lara Sunset Boutique için kısa bir not bırakayım. TUGOBO, gelen " +
        "rezervasyon taleplerini tek ekranda topluyor. İyi günler dilerim efendim.",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("no_cta"));
  });
});

describe("grounding", () => {
  test("rejects a WhatsApp claim when WhatsApp is unverified", () => {
    const result = check(
      "Merhaba, Bodrum tarafındaki işletmeniz için yazıyorum. WhatsApp'ınızdan gelen " +
        "talepleri TUGOBO tek ekranda topluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      SPARSE,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  test("allows a WhatsApp mention when WhatsApp is verified", () => {
    const result = check(
      "Merhaba, Lara Sunset Boutique için kısaca yazıyorum. WhatsApp'ınızdan gelen " +
        "talepleri TUGOBO tek ekranda topluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, true);
  });

  test("rejects an OTA claim with no listing evidence", () => {
    const result = check(
      "Merhaba, Bodrum tarafındaki işletmeniz için yazıyorum. Booking.com üzerinden gelen " +
        "talepleri TUGOBO tek ekranda topluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      SPARSE,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  test("rejects a website claim when there is no website", () => {
    const result = check(
      "Merhaba, Bodrum tarafındaki işletmeniz için yazıyorum. Web sitenizden gelen " +
        "talepleri TUGOBO tek ekranda topluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      SPARSE,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  test("rejects a definite-loss assertion even with rich signals", () => {
    const result = check(
      "Merhaba, Lara Sunset Boutique için yazıyorum. Taleplerinizi " +
        "kaçırıyorsunuz ve rezervasyon kaybediyorsunuz. Uygun olursa kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("unverified_claim"));
  });

  /*
   * v3.7.9 reversal. Hedging used to make this acceptable: "dönüş süresi
   * uzayabiliyor" asserts nothing we can be caught out on. It is still a
   * statement about how they answer their messages, made to a stranger who
   * never asked, and that is the thing the calibration removes.
   */
  test("rejects hedged operational language about their reply speed", () => {
    const result = check(
      "Merhaba, Lara Sunset Boutique için yazıyorum. Yoğun saatlerde gelen taleplere " +
        "dönüş süresi uzayabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.failures.includes("condescending_diagnosis"));
      assert.ok(result.failures.includes("unsupported_operational_claim"));
    }
  });
});

describe("specificity", () => {
  test("rejects a message that names neither the property nor its city", () => {
    const result = check(
      "Merhaba, kısa bir fikir paylaşmak istedim. TUGOBO, gelen rezervasyon " +
        "taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek paylaşabilirim.",
      RICH,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("not_specific"));
  });

  test("accepts a message that addresses the property generically", () => {
    const result = check(
      "Merhaba, işletmeniz için kısa bir fikir paylaşmak istedim. TUGOBO, gelen " +
        "rezervasyon taleplerini tek ekranda topluyor. Uygun olursa kısa bir örnek gönderebilirim.",
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
      stance: "follow_up",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("duplicate"));
  });

  test("accepts a genuinely different message", () => {
    const result = validateOutreachMessage({
      message:
        "Merhaba, Lara Sunset Boutique için kısa bir not bırakmak istedim. TUGOBO'yu, " +
        "cevap bekleyen talebin görünür kalması için geliştiriyoruz. Bu düzen sizin için faydalı olur mu?",
      signals: RICH,
      businessName: "Lara Sunset Boutique",
      previousMessages: [GOOD],
      stance: "follow_up",
    });
    assert.equal(result.ok, true);
  });
});
