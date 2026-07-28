/**
 * v3.7.9 — Evidence Semantic Coherence Guard.
 *
 * The final UI acceptance run produced a message that passed every existing
 * guard — grounding, tone shape, fluency, observation language — and scored
 * 100:
 *
 *   "Merhaba, Türkay Otel'in hem Booking.com görünürlüğünü hem de WhatsApp
 *    rezervasyon bağlantısını gördüm. Doğrudan gelen bu talepler ayrı mı
 *    takip ediliyor, aynı yerde mi ilerliyor?"
 *
 * Both evidence items were correctly *identified*. Neither was correctly
 * *characterised*: Booking.com is a third-party OTA listing, not a direct
 * channel, and "doğrudan gelen bu talepler" folds it into a claim about the
 * whole request stream being direct — a claim that is false the moment an OTA
 * source is part of the picture. Grounding answers "did it name the right
 * evidence"; this guard answers the question grounding cannot: "did it
 * describe that evidence as the kind of thing it actually is".
 *
 * These tests encode the fix at three levels: the pure category-mismatch
 * detector in `evidence.ts`, its wiring into `validateOutreachMessage` as a
 * hard failure regardless of score, and the provider-retry path that repairs
 * a mismatch without discarding the evidence, angle or tone.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountAnglesFor, accountAngleFor } from "./angles.ts";
import { TONES, type Tone } from "./contract.ts";
import {
  expectGeneratedOutreach,
  generateOutreachMessage,
  type GenerateParams,
  type OutreachProvider,
  type ProviderOutput,
} from "./engine.ts";
import {
  buildPersonalizationEvidence,
  EVIDENCE_SEMANTIC_CATEGORY,
  findEvidenceSemanticMismatches,
  selectEvidence,
  type EvidenceSelection,
} from "./evidence.ts";
import { buildAccountFallbackMessage } from "./fallback.ts";
import { validateTurkishFluency } from "./fluency.ts";
import { isValidLeadId } from "../operational-state/lead-id.ts";
import { persistWorkspaceChange } from "./draft-persistence.ts";
import { OUTREACH_MESSAGE_SYSTEM } from "./prompt.ts";
import { scoreOutreachQuality } from "./relevance.ts";
import { buildOutreachSignals, type SignalSet } from "./signals.ts";
import { validateOutreachMessage, type ValidationFailure } from "./validator.ts";
import {
  applyGeneratedDrafts,
  emptyMessageWorkspace,
  type LeadMessageWorkspaceState,
} from "./workspace.ts";

const NAME = "Türkay Otel";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function pick(
  input: Parameters<typeof buildPersonalizationEvidence>[0],
  allowSupporting = false,
): EvidenceSelection {
  const selection = selectEvidence(buildPersonalizationEvidence(input), { allowSupporting });
  assert.ok(selection, "fixture produced no evidence");
  return selection;
}

/** primary=website_whatsapp_link, supporting=ota_presence — the reported bug's shape. */
const OTA_PLUS_WHATSAPP = pick(
  { channels: ["Booking"], websiteIntelligence: { hasWhatsAppLink: true } },
  true,
);
/** primary=booking_button, supporting=ota_presence. */
const OTA_PLUS_BOOKING = pick(
  { channels: ["Booking"], websiteIntelligence: { hasBookingCtaText: true } },
  true,
);
const OTA_ONLY = pick({ channels: ["Booking"] });
const BOOKING_BUTTON_ONLY = pick({ websiteIntelligence: { hasBookingCtaText: true } });
const INSTAGRAM_ONLY = pick({ hasInstagram: true });
/** primary=website_whatsapp_link, supporting=booking_button — no OTA at all. */
const BOOKING_PLUS_WHATSAPP = pick(
  { websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true } },
  true,
);

const SIGNALS_OTA_WHATSAPP = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  hasWhatsAppPath: true,
  channels: ["Booking"],
  websiteIntelligence: { hasWhatsAppLink: true },
});
const SIGNALS_OTA = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  channels: ["Booking"],
});
const SIGNALS_BOOKING = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  websiteIntelligence: { hasBookingCtaText: true },
});
const SIGNALS_INSTAGRAM = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasInstagram: true,
});
const SIGNALS_BOOKING_WHATSAPP = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  hasWhatsAppPath: true,
  websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true },
});
const SIGNALS_OTA_BOOKING = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  channels: ["Booking"],
  websiteIntelligence: { hasBookingCtaText: true },
});

function failuresOf(
  message: string,
  signals: SignalSet,
  evidence: EvidenceSelection,
  tone?: Tone,
): ValidationFailure[] {
  const result = validateOutreachMessage({
    message,
    signals,
    businessName: NAME,
    evidence,
    tone,
  });
  return result.ok ? [] : result.failures;
}

/* -------------------------------------------------------------------------- */
/* 1–2. the reported bug: OTA relabeled as direct traffic                     */
/* -------------------------------------------------------------------------- */

describe("OTA evidence must never be called direct", () => {
  it("1. 'Doğrudan gelen bu talepler' for OTA+WhatsApp is rejected", () => {
    const message =
      `Merhaba, ${NAME}'in hem Booking.com görünürlüğünü hem de WhatsApp rezervasyon ` +
      "bağlantısını gördüm. Doğrudan gelen bu talepler ayrı mı takip ediliyor, aynı yerde mi ilerliyor?";

    const issues = findEvidenceSemanticMismatches(message, OTA_PLUS_WHATSAPP);
    assert.ok(issues.includes("ota_labeled_direct"), issues.join(","));

    const failures = failuresOf(message, SIGNALS_OTA_WHATSAPP, OTA_PLUS_WHATSAPP, "direct");
    assert.ok(failures.includes("evidence_semantic_mismatch"), failures.join(","));
  });

  it("2. the neutral 'iki farklı kanal' phrasing passes outright", () => {
    const message =
      `Merhaba, ${NAME}'in hem Booking.com görünürlüğünü hem de WhatsApp rezervasyon ` +
      "bağlantısını gördüm. Bu iki farklı kanaldan gelen talepler ayrı mı takip ediliyor, aynı yerde mi ilerliyor?";

    assert.deepEqual(findEvidenceSemanticMismatches(message, OTA_PLUS_WHATSAPP), []);
    const result = validateOutreachMessage({
      message,
      signals: SIGNALS_OTA_WHATSAPP,
      businessName: NAME,
      evidence: OTA_PLUS_WHATSAPP,
      tone: "direct",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});

/* -------------------------------------------------------------------------- */
/* 3–4. booking button must not become a message channel                      */
/* -------------------------------------------------------------------------- */

describe("a booking button is a reservation flow, not a message channel", () => {
  it("3. 'gelen mesajlar' for booking-button-only evidence is rejected", () => {
    const message =
      `Merhaba, ${NAME}'in web sitesindeki doğrudan rezervasyon butonunu gördüm. ` +
      "Buradan gelen mesajları ekip içinde kim takip ediyor?";

    const issues = findEvidenceSemanticMismatches(message, BOOKING_BUTTON_ONLY);
    assert.ok(issues.includes("booking_flow_labeled_message"), issues.join(","));
    assert.ok(
      failuresOf(message, SIGNALS_BOOKING, BOOKING_BUTTON_ONLY).includes(
        "evidence_semantic_mismatch",
      ),
    );
  });

  it("4. 'web sitesinden başlayan rezervasyonlar' passes", () => {
    const message =
      `Merhaba, ${NAME}'in web sitesindeki doğrudan rezervasyon butonunu gördüm. ` +
      "Web sitesinden başlayan bu rezervasyonların takibini ekip içinde kim üstleniyor?";

    assert.deepEqual(findEvidenceSemanticMismatches(message, BOOKING_BUTTON_ONLY), []);
    assert.equal(
      failuresOf(message, SIGNALS_BOOKING, BOOKING_BUTTON_ONLY).includes(
        "evidence_semantic_mismatch",
      ),
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 5–6. Instagram must not become WhatsApp                                    */
/* -------------------------------------------------------------------------- */

describe("Instagram evidence must not be recast as a direct channel", () => {
  it("5. WhatsApp wording for Instagram-only evidence is rejected", () => {
    const message =
      `Merhaba, ${NAME}'in Instagram üzerindeki iletişim seçeneğini gördüm. ` +
      "WhatsApp'tan gelen talepleri kim takip ediyor?";

    const issues = findEvidenceSemanticMismatches(message, INSTAGRAM_ONLY);
    assert.ok(
      issues.includes("social_evidence_recast_as_direct_channel"),
      issues.join(","),
    );
    // Belt-and-suspenders: the pre-existing grounding guard already catches an
    // undeclared "whatsapp" topic too — both are allowed to fire together.
    assert.ok(
      failuresOf(message, SIGNALS_INSTAGRAM, INSTAGRAM_ONLY).includes(
        "evidence_semantic_mismatch",
      ),
    );
  });

  it("6. Instagram messaging wording for Instagram-only evidence passes", () => {
    const message =
      `Merhaba, ${NAME}'in Instagram üzerindeki iletişim seçeneğini gördüm. ` +
      "Instagram'dan gelen mesajları ekip içinde kim takip ediyor?";

    assert.deepEqual(findEvidenceSemanticMismatches(message, INSTAGRAM_ONLY), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. "doğrudan kanallar" is legitimate when both members ARE direct          */
/* -------------------------------------------------------------------------- */

describe("direct_booking + direct_messaging may be called direct", () => {
  it("7. 'doğrudan kanallardan' with no OTA present passes outright", () => {
    const message =
      `Merhaba, ${NAME}'in hem WhatsApp rezervasyon bağlantısını hem de doğrudan ` +
      "rezervasyon butonunu gördüm. Bu doğrudan kanallardan gelen talepler tek yerde mi takip ediliyor, ayrı ayrı mı?";

    assert.deepEqual(findEvidenceSemanticMismatches(message, BOOKING_PLUS_WHATSAPP), []);
    const result = validateOutreachMessage({
      message,
      signals: SIGNALS_BOOKING_WHATSAPP,
      businessName: NAME,
      evidence: BOOKING_PLUS_WHATSAPP,
      tone: "direct",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});

/* -------------------------------------------------------------------------- */
/* 8. OTA alone does not imply a direct booking flow                          */
/* -------------------------------------------------------------------------- */

describe("OTA-only evidence grounds no direct claim at all", () => {
  it("8. 'doğrudan talep alıp almadığınızı' for OTA-only evidence is rejected", () => {
    const message =
      `Merhaba, ${NAME}'in Booking.com üzerindeki görünürlüğünü gördüm. ` +
      "Buradan doğrudan talep alıp almadığınızı merak ettim.";

    const issues = findEvidenceSemanticMismatches(message, OTA_ONLY);
    assert.ok(issues.includes("ungrounded_direct_claim"), issues.join(","));
    assert.ok(
      failuresOf(message, SIGNALS_OTA, OTA_ONLY).includes("evidence_semantic_mismatch"),
    );
  });

  it("a neutral OTA-only question grounds no direct claim and passes", () => {
    const message =
      `Merhaba, ${NAME}'in Booking.com üzerindeki görünürlüğünü gördüm. ` +
      "Buradan gelen talepleri ekip içinde kim takip ediyor?";
    assert.deepEqual(findEvidenceSemanticMismatches(message, OTA_ONLY), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 9. the score cannot buy past the mismatch                                  */
/* -------------------------------------------------------------------------- */

describe("9. evidence semantic mismatch outranks the score", () => {
  it("every other dimension is full marks; the mismatch still fails the message", () => {
    const message =
      `Merhaba, ${NAME}'in hem Booking.com görünürlüğünü hem de WhatsApp rezervasyon ` +
      "bağlantısını gördüm. Doğrudan gelen bu talepler ayrı mı takip ediliyor, aynı yerde mi ilerliyor?";

    const score = scoreOutreachQuality({
      message,
      tone: "direct",
      businessName: NAME,
      signals: SIGNALS_OTA_WHATSAPP,
      evidence: OTA_PLUS_WHATSAPP,
    });
    // Evidence is named, the ask is grounded via anaphora ("bu talep"), and the
    // shape is a clean binary direct question — every dimension the scorer can
    // see independently of `validateOutreachMessage` is full marks.
    assert.equal(score.evidenceSpecificity, 20);
    assert.equal(score.accountRelevance, 20);
    assert.equal(score.questionGrounding, 20);
    // Truthfulness delegates wholesale to the validator, which is where the
    // mismatch actually lives — this is the number that must go to zero.
    assert.equal(score.truthfulness, 0);
    // The bar is not even the real gate here: `tryProvider` in engine.ts
    // rejects on `verdict.ok` before a mismatched candidate ever reaches
    // `meetsProviderQualityBar`. What matters is that the validator itself
    // says no, independent of any total.
    const verdict = validateOutreachMessage({
      message,
      signals: SIGNALS_OTA_WHATSAPP,
      businessName: NAME,
      evidence: OTA_PLUS_WHATSAPP,
      tone: "direct",
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.ok(verdict.failures.includes("evidence_semantic_mismatch"));
  });
});

/* -------------------------------------------------------------------------- */
/* 10–11. the provider retry                                                  */
/* -------------------------------------------------------------------------- */

function fakeProvider(outputs: Array<ProviderOutput | null>) {
  const calls: Array<{ system: string; user: string }> = [];
  let index = 0;
  const provider: OutreachProvider = async (params) => {
    calls.push(params);
    const out = outputs[Math.min(index, outputs.length - 1)];
    index += 1;
    return out;
  };
  return { provider, calls, callCount: () => calls.length };
}

function baseParams(overrides: Partial<GenerateParams> = {}): GenerateParams {
  return {
    leadId: "gmaps-turkay",
    businessName: NAME,
    city: "Antalya",
    businessType: "Otel",
    tone: "direct",
    angle: accountAngleFor(OTA_PLUS_WHATSAPP, 0),
    signals: SIGNALS_OTA_WHATSAPP,
    previousMessages: [],
    generationNonce: "semantics",
    rotation: 0,
    provider: null,
    systemPrompt: OUTREACH_MESSAGE_SYSTEM,
    evidence: OTA_PLUS_WHATSAPP,
    ...overrides,
  };
}

const MISMATCHED =
  `Merhaba, ${NAME}'in hem Booking.com görünürlüğünü hem de WhatsApp rezervasyon ` +
  "bağlantısını gördüm. Doğrudan gelen bu talepler ayrı mı takip ediliyor, aynı yerde mi ilerliyor?";
const CORRECTED =
  `Merhaba, ${NAME}'in hem Booking.com görünürlüğünü hem de WhatsApp rezervasyon ` +
  "bağlantısını gördüm. Bu iki farklı kanaldan gelen talepler ayrı mı takip ediliyor, aynı yerde mi ilerliyor?";

function angleOf(prompt: string): string {
  return prompt.split("VARIATION ANGLE: ")[1]?.split("\n")[0] ?? "";
}

describe("provider retry after a semantic-mismatch rejection", () => {
  it("10. retries exactly once and uses the corrected result", async () => {
    const { provider, callCount, calls } = fakeProvider([
      { message: MISMATCHED },
      { message: CORRECTED },
    ]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(baseParams({ provider })),
    );
    assert.equal(callCount(), 2, "exactly one retry");
    assert.equal(result.source, "provider");
    assert.equal(result.message, CORRECTED);

    assert.match(calls[0].user, /PRIMARY \(website_whatsapp_link/);
    assert.match(calls[0].user, /SUPPORTING \(ota_presence/);
    assert.equal(calls[0].user.includes("CORRECTION"), false, "no hint on the first try");
    assert.equal(angleOf(calls[1].user), angleOf(calls[0].user), "the retry keeps the angle");
    assert.match(calls[1].user, /PRIMARY \(website_whatsapp_link/);
    assert.match(calls[1].user, /SUPPORTING \(ota_presence/);
    assert.match(
      calls[1].user,
      /Your previous output misrepresented an evidence item's channel or operational category/,
    );
    assert.match(calls[1].user, /Keep the same evidence, angle and tone\./);
  });

  it("11. a second mismatch falls back to the deterministic bank", async () => {
    const { provider, callCount } = fakeProvider([{ message: MISMATCHED }]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(baseParams({ provider })),
    );
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.deepEqual(findEvidenceSemanticMismatches(result.message, OTA_PLUS_WHATSAPP), []);
    assert.deepEqual(
      failuresOf(result.message, SIGNALS_OTA_WHATSAPP, OTA_PLUS_WHATSAPP, "direct"),
      [],
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 12. the deterministic bank never mischaracterises its own evidence         */
/* -------------------------------------------------------------------------- */

describe("12. the fallback bank passes the semantic guard", () => {
  const SELECTIONS: ReadonlyArray<{ name: string; ev: EvidenceSelection; signals: SignalSet }> = [
    { name: "ota+whatsapp", ev: OTA_PLUS_WHATSAPP, signals: SIGNALS_OTA_WHATSAPP },
    { name: "ota+booking", ev: OTA_PLUS_BOOKING, signals: SIGNALS_OTA_BOOKING },
    { name: "booking+whatsapp", ev: BOOKING_PLUS_WHATSAPP, signals: SIGNALS_BOOKING_WHATSAPP },
    { name: "instagram-only", ev: INSTAGRAM_ONLY, signals: SIGNALS_INSTAGRAM },
    { name: "booking-only", ev: BOOKING_BUTTON_ONLY, signals: SIGNALS_BOOKING },
  ];

  it("every tone, every angle, every listed combo is semantically clean", () => {
    for (const { name, ev, signals } of SELECTIONS) {
      for (const tone of TONES) {
        for (let rotation = 0; rotation < accountAnglesFor(ev).length; rotation += 1) {
          const { message } = buildAccountFallbackMessage({
            tone,
            businessName: NAME,
            evidence: ev,
            rotation,
          });
          const issues = findEvidenceSemanticMismatches(message, ev);
          assert.deepEqual(issues, [], `${name}/${tone}/${rotation}: ${message}`);

          const verdict = validateOutreachMessage({
            message,
            signals,
            businessName: NAME,
            evidence: ev,
            tone,
          });
          assert.equal(
            verdict.ok,
            true,
            `${name}/${tone}/${rotation}: ${message}\n${JSON.stringify(verdict)}`,
          );
        }
      }
    }
  });

  it("the fixed direct_request_follow_up body no longer says 'doğrudan gelen'", () => {
    for (const { ev } of [
      { ev: OTA_PLUS_WHATSAPP },
      { ev: OTA_PLUS_BOOKING },
      { ev: OTA_ONLY },
    ]) {
      for (const tone of TONES) {
        const { message, variationAngle } = buildAccountFallbackMessage({
          tone,
          businessName: NAME,
          evidence: ev,
          rotation: 0,
        });
        if (variationAngle === "direct_request_follow_up") {
          assert.doesNotMatch(message, /doğrudan\s+gelen/iu, message);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the category map and the prompt                                            */
/* -------------------------------------------------------------------------- */

describe("the evidence category map matches the brief", () => {
  it("maps every type to the category named in the spec", () => {
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.website_whatsapp_link, "direct_messaging");
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.instagram_channel, "social_messaging");
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.booking_button, "direct_booking");
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.ota_presence, "ota");
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.contact_form, "website_inquiry");
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.multilingual_site, "multilingual");
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.property_positioning, "property_positioning");
    assert.equal(EVIDENCE_SEMANTIC_CATEGORY.room_or_offer_variety, "offer_or_room_variety");
  });
});

describe("the prompt states the evidence semantic contract", () => {
  it("in Turkish and English, and labels each evidence item by category", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /EVIDENCE SEMANTIC CONTRACT/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /EVIDENCE ANLAM SÖZLEŞMESİ/);
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes("Do not relabel OTA activity as direct traffic."),
    );
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes("Do not call a booking-button flow a message channel."),
    );
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes(
        "Do not turn Instagram evidence into WhatsApp or website evidence.",
      ),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 13–18. everything this sprint must not have touched                        */
/* -------------------------------------------------------------------------- */

describe("existing guards are preserved", () => {
  it("13. the tone-shape guard still fires", () => {
    const message =
      `Merhaba, ${NAME}'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. ` +
      "Buradan gelen taleplerin takibini hangi yöntemle yürütüyorsunuz?";
    const ev = pick({ websiteIntelligence: { hasWhatsAppLink: true } });
    assert.ok(failuresOf(message, SIGNALS_OTA_WHATSAPP, ev, "consultative").includes(
      "tone_shape_mismatch",
    ));
  });

  it("14. the Turkish fluency guard still fires", () => {
    const message =
      `Merhaba, ${NAME}'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. ` +
      "Buradan gelen talepler nerede durduğunu merak ettim.";
    assert.equal(validateTurkishFluency(message, "consultative").ok, false);
  });

  it("15. the observation-language guard still fires", () => {
    const message =
      `Merhaba, ${NAME}'in web sitesini gezdiğimde WhatsApp bağlantısını gördüm. ` +
      "Buradan gelen talepleri kim takip ediyor?";
    const ev = pick({ websiteIntelligence: { hasWhatsAppLink: true } });
    assert.ok(
      failuresOf(message, SIGNALS_OTA_WHATSAPP, ev).includes("fabricated_browsing_context"),
    );
  });

  it("16. the product-truth guard still fires", () => {
    const message =
      `Merhaba, ${NAME}'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. ` +
      "Buradan gelenleri otomatik olarak yanıtlıyoruz, nasıl takip ediyorsunuz?";
    const ev = pick({ websiteIntelligence: { hasWhatsAppLink: true } });
    const failures = failuresOf(message, SIGNALS_OTA_WHATSAPP, ev);
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("17. the persistence retry policy still replays a conflict once", async () => {
    let writes = 0;
    let stored: LeadMessageWorkspaceState = emptyMessageWorkspace();
    const outcome = await persistWorkspaceChange(
      (base) =>
        applyGeneratedDrafts(base, {
          entries: [{ tone: "direct", message: CORRECTED, source: "fallback" }],
          activeTone: "direct",
          now: "2026-07-28T09:00:00.000Z",
        }),
      {
        read: () => stored,
        write: async (next) => {
          writes += 1;
          if (writes === 1) throw new Error("conflict");
          stored = next;
          return next;
        },
        isConflict: (e) => e instanceof Error && e.message === "conflict",
      },
    );
    assert.equal(outcome.status, "saved");
    assert.equal(outcome.attempts, 2);
  });

  it("18. the lead-id integrity guard is untouched", () => {
    assert.equal(isValidLeadId("gmaps-turkay"), true);
    assert.equal(isValidLeadId(""), false);
  });
});
