/**
 * v3.7.9 — Native Turkish Fluency Guard.
 *
 * The last live defect, and the one no earlier layer could have caught. This
 * message passed evidence grounding, the tone-shape contract, the observation
 * language guard, the product truth guard, and scored 100:
 *
 *   "WhatsApp üzerinden gelen talepler ilk yanıttan sonra açık kaldığında
 *    nerede durduğunu takip etme yönteminizi merak ettim."
 *
 * Every rule it was asked about, it satisfied. It is still not Turkish anyone
 * writes: a bare plural subject bound to a singular participle, a verbal noun
 * stacked onto a method noun, and a clause that has to be read twice. The
 * recipient cannot name the defect — they just know a machine produced it,
 * which is the single impression this engine exists to prevent.
 *
 * These tests encode fluency as a rule rather than a score, because the score
 * had already called that sentence perfect.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountAnglesFor } from "./angles.ts";
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
  selectEvidence,
  type EvidenceSelection,
} from "./evidence.ts";
import { buildAccountFallbackMessage } from "./fallback.ts";
import { validateTurkishFluency } from "./fluency.ts";
import { isValidLeadId } from "../operational-state/lead-id.ts";
import { persistWorkspaceChange } from "./draft-persistence.ts";
import { OUTREACH_MESSAGE_SYSTEM } from "./prompt.ts";
import { scoreOutreachQuality, MIN_PROVIDER_QUALITY_TOTAL } from "./relevance.ts";
import { buildOutreachSignals, type SignalSet } from "./signals.ts";
import { validateOutreachMessage, type ValidationFailure } from "./validator.ts";
import {
  applyGeneratedDrafts,
  emptyMessageWorkspace,
  type LeadMessageWorkspaceState,
} from "./workspace.ts";

const NAME = "Türkay Otel";
const HOOK = `Merhaba, ${NAME}'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm.`;

const SIGNALS = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  hasWhatsAppPath: true,
  websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true },
});

const WHATSAPP = selectEvidence(
  buildPersonalizationEvidence({ websiteIntelligence: { hasWhatsAppLink: true } }),
)!;

const WHATSAPP_PLUS_BOOKING = selectEvidence(
  buildPersonalizationEvidence({
    websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true },
  }),
  { allowSupporting: true },
)!;

function failuresOf(
  message: string,
  tone?: Tone,
  evidence: EvidenceSelection = WHATSAPP,
): ValidationFailure[] {
  const result = validateOutreachMessage({
    message,
    signals: SIGNALS,
    businessName: NAME,
    evidence,
    tone,
  });
  return result.ok ? [] : result.failures;
}

/* -------------------------------------------------------------------------- */
/* 1–4. the constructions a Turkish speaker would not produce                 */
/* -------------------------------------------------------------------------- */

/** Verbatim from the live run — the sentence this whole guard exists for. */
const LIVE_DEFECT =
  `${NAME}'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. ` +
  "WhatsApp üzerinden gelen talepler ilk yanıttan sonra açık kaldığında nerede " +
  "durduğunu takip etme yönteminizi merak ettim.";

describe("unnatural Turkish is rejected", () => {
  it("1. a bare plural subject bound to a singular participle", () => {
    const message = `${HOOK} Buradan gelen talepler nerede durduğunu merak ettim.`;
    const verdict = validateTurkishFluency(message, "consultative");
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.ok(verdict.issues.includes("plural_singular_mismatch"));
    assert.ok(failuresOf(message, "consultative").includes("unnatural_turkish_construction"));
  });

  it("2. a verbal noun stacked onto a method noun", () => {
    const message = `${HOOK} Buradan gelen taleplerin takip etme yönteminizi merak ettim.`;
    const verdict = validateTurkishFluency(message, "consultative");
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.ok(verdict.issues.includes("heavy_nominalization"));
  });

  it("3. 'takip' twice in one sentence", () => {
    const message =
      `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle takip ettiğinizi merak ettim.`;
    const verdict = validateTurkishFluency(message, "consultative");
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.ok(verdict.issues.includes("repeated_takip"));
  });

  it("4. a nested verbal-noun chain", () => {
    const message =
      `${HOOK} Buradan gelen taleplerin nasıl ilerlediğini ve nerede beklediğini merak ettim.`;
    const verdict = validateTurkishFluency(message, "consultative");
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.ok(verdict.issues.includes("nested_verbal_nouns"));
  });

  it("a three-suffix stack like 'kalanlarının' is rejected", () => {
    // Verbatim from the second live run. Grammatical, and three suffixes deep
    // on the clause's second genitive — the reader has to unpack it.
    const message =
      `${HOOK} WhatsApp üzerinden gelen taleplerin ilk yanıttan sonra açık ` +
      "kalanlarının nasıl takip edildiğini merak ettim.";
    const verdict = validateTurkishFluency(message, "consultative");
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.ok(verdict.issues.includes("stacked_possessive_chain"));
    assert.ok(failuresOf(message, "consultative").includes("unnatural_turkish_construction"));
  });

  it("the shorter way to say the same thing passes", () => {
    const message =
      `${HOOK} Buradan gelen ve ilk yanıttan sonra açık kalan talepleri nasıl takip ettiğinizi merak ettim.`;
    assert.equal(validateTurkishFluency(message, "consultative").ok, true);
    assert.deepEqual(failuresOf(message, "consultative"), []);
  });

  it("the same suffix chain on a plain noun is left alone", () => {
    // "türlerinin" is the identical morphology and reads naturally — only the
    // participle stem makes the stack heavy.
    for (const ok of ["talep türlerinin", "taleplerin", "kalanları", "seçeneklerini"]) {
      const message = `${HOOK} Buradan gelen ${ok} nasıl ilerlediğini merak ettim.`;
      const verdict = validateTurkishFluency(message, "consultative");
      assert.equal(
        !verdict.ok && verdict.issues.includes("stacked_possessive_chain"),
        false,
        `${ok} → ${JSON.stringify(verdict)}`,
      );
    }
  });

  it("the exact live message is rejected", () => {
    const verdict = validateTurkishFluency(LIVE_DEFECT, "consultative");
    assert.equal(verdict.ok, false, "the message that started this sprint must not pass");
    assert.ok(
      failuresOf(LIVE_DEFECT, "consultative").includes("unnatural_turkish_construction"),
    );
  });

  it("every banned pattern from the brief is rejected", () => {
    const banned = [
      "nerede durduğunu takip etme yönteminizi",
      "hangi adımda ilerlediğini takip etme şeklinizi",
      "takibini organize etme yönteminizi",
      "sürecin ilerleme durumunu takip etme biçiminizi",
    ];
    for (const fragment of banned) {
      const message = `${HOOK} Buradan gelen taleplerin ${fragment} merak ettim.`;
      assert.equal(
        validateTurkishFluency(message, "consultative").ok,
        false,
        fragment,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5–7. natural Turkish passes, in all three tones                            */
/* -------------------------------------------------------------------------- */

describe("natural Turkish passes", () => {
  it("5. a natural consultative indirect question", () => {
    const message =
      `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.`;
    assert.equal(validateTurkishFluency(message, "consultative").ok, true);
    assert.deepEqual(failuresOf(message, "consultative"), []);
  });

  it("6. a natural soft question", () => {
    const message =
      `${HOOK} Kısaca merak ettim: buradan gelen taleplerin son durumunu ekip içinde nasıl takip ediyorsunuz?`;
    assert.equal(validateTurkishFluency(message, "soft").ok, true);
    assert.deepEqual(failuresOf(message, "soft"), []);
  });

  it("7. a natural direct question", () => {
    const message =
      `${HOOK} Buradan gelen talepler tek yerde mi ilerliyor, ayrı ayrı mı takip ediliyor?`;
    assert.equal(validateTurkishFluency(message, "direct").ok, true);
    assert.deepEqual(failuresOf(message, "direct"), []);
  });

  it("every natural closing family from the brief passes", () => {
    const families = [
      "Buradan gelen taleplerin hangi yöntemle takip ettiğinizi merak ettim.",
      "Buradan gelen talepleri ekip içinde nasıl yönettiğinizi merak ettim.",
      "Buradan gelen taleplerin takibinin kim tarafından yapıldığını merak ettim.",
      "Buradan gelen taleplerin ilk yanıttan sonra nasıl izlendiğini merak ettim.",
      "Buradan açık kalan taleplerin nasıl takip edildiğini merak ettim.",
    ];
    for (const closing of families) {
      const message = `${HOOK} ${closing}`;
      const verdict = validateTurkishFluency(message, "consultative");
      assert.equal(verdict.ok, true, `${closing} → ${JSON.stringify(verdict)}`);
    }
  });

  it("the genitive subject is what makes the singular participle correct", () => {
    // Same participle, same sentence — only the subject's case changes.
    const wrong = `${HOOK} Buradan gelen talepler nasıl ilerlediğini merak ettim.`;
    const right = `${HOOK} Buradan gelen taleplerin nasıl ilerlediğini merak ettim.`;
    assert.equal(validateTurkishFluency(wrong, "consultative").ok, false);
    assert.equal(validateTurkishFluency(right, "consultative").ok, true);
  });
});

/* -------------------------------------------------------------------------- */
/* 8. shape and score cannot buy fluency                                      */
/* -------------------------------------------------------------------------- */

describe("8. fluency outranks the score", () => {
  it("the live defect scored 100 before this guard, and is refused now", () => {
    const score = scoreOutreachQuality({
      message: LIVE_DEFECT,
      tone: "consultative",
      businessName: NAME,
      signals: SIGNALS,
      evidence: WHATSAPP,
    });
    // Everything the score can see is still good; only `naturalness` and the
    // validator-derived `truthfulness` now reflect the defect.
    assert.equal(score.evidenceSpecificity, 20);
    assert.equal(score.accountRelevance, 20);
    assert.equal(score.questionGrounding, 20);
    assert.equal(score.naturalness, 0, "naturalness must agree with the hard verdict");
    assert.equal(score.truthfulness, 0);
    assert.ok(score.total < MIN_PROVIDER_QUALITY_TOTAL);
    assert.ok(
      failuresOf(LIVE_DEFECT, "consultative").includes("unnatural_turkish_construction"),
    );
  });

  it("a correctly shaped message is still refused when it is not fluent", () => {
    const message = `${HOOK} Buradan gelen taleplerin takip etme yönteminizi merak ettim.`;
    const failures = failuresOf(message, "consultative");
    assert.equal(failures.includes("tone_shape_mismatch"), false, "shape is fine");
    assert.ok(failures.includes("unnatural_turkish_construction"), "fluency is not");
  });
});

/* -------------------------------------------------------------------------- */
/* 9–13. the fluency-corrected retry                                          */
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
    tone: "consultative",
    angle: "whatsapp_follow_up_visibility",
    signals: SIGNALS,
    previousMessages: [],
    generationNonce: "fluency",
    rotation: 0,
    provider: null,
    systemPrompt: OUTREACH_MESSAGE_SYSTEM,
    evidence: WHATSAPP,
    ...overrides,
  };
}

const FLUENT =
  `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.`;

function angleOf(prompt: string): string {
  return prompt.split("VARIATION ANGLE: ")[1]?.split("\n")[0] ?? "";
}

function toneOf(prompt: string): string {
  return prompt.split("TONE: ")[1]?.split("\n")[0] ?? "";
}

describe("provider retry after a fluency rejection", () => {
  it("9. retries exactly once and uses the corrected result", async () => {
    const { provider, callCount } = fakeProvider([
      { message: LIVE_DEFECT },
      { message: FLUENT },
    ]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(baseParams({ provider })),
    );
    assert.equal(callCount(), 2, "exactly one retry");
    assert.equal(result.source, "provider");
    assert.equal(result.message, FLUENT);
  });

  it("10. the retry keeps the same evidence", async () => {
    const { provider, calls } = fakeProvider([
      { message: LIVE_DEFECT },
      { message: FLUENT },
    ]);
    await generateOutreachMessage(
      baseParams({ provider, evidence: WHATSAPP_PLUS_BOOKING }),
    );
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.user, /PRIMARY \(website_whatsapp_link/);
      assert.match(call.user, /SUPPORTING \(booking_button/);
    }
  });

  it("11. the retry keeps the same angle", async () => {
    const { provider, calls } = fakeProvider([
      { message: LIVE_DEFECT },
      { message: FLUENT },
    ]);
    await generateOutreachMessage(baseParams({ provider }));
    assert.equal(angleOf(calls[0].user), "whatsapp_follow_up_visibility");
    assert.equal(angleOf(calls[1].user), angleOf(calls[0].user));
  });

  it("12. the retry keeps the same tone", async () => {
    const { provider, calls } = fakeProvider([
      { message: LIVE_DEFECT },
      { message: FLUENT },
    ]);
    await generateOutreachMessage(baseParams({ provider }));
    assert.equal(toneOf(calls[0].user), "consultative");
    assert.equal(toneOf(calls[1].user), "consultative");
  });

  it("13. a second fluency failure falls back to the deterministic bank", async () => {
    const { provider, callCount } = fakeProvider([{ message: LIVE_DEFECT }]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(baseParams({ provider })),
    );
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.equal(validateTurkishFluency(result.message, "consultative").ok, true);
  });

  it("the retry names what to repair and forbids changing anything else", async () => {
    const { provider, calls } = fakeProvider([
      { message: LIVE_DEFECT },
      { message: FLUENT },
    ]);
    await generateOutreachMessage(baseParams({ provider }));
    assert.equal(calls[0].user.includes("CORRECTION"), false);
    assert.match(calls[1].user, /Rewrite in natural, concise Turkish\./);
    assert.match(
      calls[1].user,
      /Remove nested verbal nouns, repeated "takip" wording and ambiguous singular pronouns\./,
    );
    assert.match(calls[1].user, /Keep the same evidence, angle and tone\./);
  });

  it("the prompt states the native Turkish contract in both languages", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /NATIVE TURKISH CONTRACT/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /DOĞAL TÜRKÇE SÖZLEŞMESİ/);
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes(
        "Write in short, natural Turkish used by a real business person.",
      ),
    );
    assert.ok(OUTREACH_MESSAGE_SYSTEM.includes("Prefer one clear verb per clause."));
    assert.match(OUTREACH_MESSAGE_SYSTEM, /hangi yöntemle takip ettiğinizi merak ettim/);
  });
});

/* -------------------------------------------------------------------------- */
/* 14–16. the whole deterministic bank is fluent                              */
/* -------------------------------------------------------------------------- */

const SELECTIONS: ReadonlyArray<{ name: string; ev: EvidenceSelection; signals: SignalSet }> = [
  { name: "whatsapp", ev: WHATSAPP, signals: SIGNALS },
  { name: "whatsapp+booking", ev: WHATSAPP_PLUS_BOOKING, signals: SIGNALS },
  {
    name: "instagram",
    ev: selectEvidence(buildPersonalizationEvidence({ hasInstagram: true }))!,
    signals: buildOutreachSignals({ city: "Antalya", businessType: "Otel", hasInstagram: true }),
  },
  {
    name: "multilingual",
    ev: selectEvidence(
      buildPersonalizationEvidence({ websiteIntelligence: { languages: ["tr", "en"] } }),
    )!,
    signals: buildOutreachSignals({ city: "Antalya", businessType: "Otel" }),
  },
  {
    name: "positioning",
    ev: selectEvidence(buildPersonalizationEvidence({ businessType: "Termal Otel" }))!,
    signals: buildOutreachSignals({ city: "Afyon", businessType: "Otel" }),
  },
  {
    name: "rooms",
    ev: selectEvidence(
      buildPersonalizationEvidence({ websiteIntelligence: { roomTypeCount: 5 } }),
    )!,
    signals: buildOutreachSignals({ city: "Antalya", businessType: "Otel" }),
  },
  {
    name: "contact form",
    ev: selectEvidence(
      buildPersonalizationEvidence({ websiteIntelligence: { hasContactForm: true } }),
    )!,
    signals: buildOutreachSignals({ city: "Antalya", businessType: "Otel", hasOwnWebsite: true }),
  },
  {
    name: "ota+booking",
    ev: selectEvidence(
      buildPersonalizationEvidence({
        channels: ["Booking"],
        websiteIntelligence: { hasBookingCtaText: true },
      }),
      { allowSupporting: true },
    )!,
    signals: buildOutreachSignals({
      city: "Antalya",
      businessType: "Otel",
      hasOwnWebsite: true,
      channels: ["Booking"],
      websiteIntelligence: { hasBookingCtaText: true },
    }),
  },
];

describe("14–16. every fallback variant is fluent Turkish", () => {
  for (const tone of TONES) {
    it(`${tone}: all variants pass the fluency guard and the validator`, () => {
      for (const { name, ev, signals } of SELECTIONS) {
        for (let rotation = 0; rotation < accountAnglesFor(ev).length; rotation += 1) {
          const { message } = buildAccountFallbackMessage({
            tone,
            businessName: NAME,
            evidence: ev,
            rotation,
          });
          const fluency = validateTurkishFluency(message, tone);
          assert.equal(
            fluency.ok,
            true,
            `${name}/${tone}/${rotation}: ${message}\n${JSON.stringify(fluency)}`,
          );
          const verdict = validateOutreachMessage({
            message,
            signals,
            businessName: NAME,
            evidence: ev,
            tone,
          });
          assert.equal(verdict.ok, true, `${name}/${tone}/${rotation}: ${JSON.stringify(verdict)}`);
        }
      }
    });
  }

  it("no fallback body says 'takip' twice or stacks a method noun", () => {
    for (const { ev } of SELECTIONS) {
      for (const tone of TONES) {
        const { message } = buildAccountFallbackMessage({
          tone,
          businessName: NAME,
          evidence: ev,
          rotation: 0,
        });
        assert.ok((message.match(/taki[pb]/giu) ?? []).length <= 1, message);
        assert.doesNotMatch(message, /\p{L}+m[ae]\s+(yöntem|şekil|şekl|biçim)/iu, message);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 17–22. the layers this sprint must not have touched                        */
/* -------------------------------------------------------------------------- */

describe("existing guards are preserved", () => {
  it("17. the tone-shape guard still fires", () => {
    const message = `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürütüyorsunuz?`;
    assert.ok(failuresOf(message, "consultative").includes("tone_shape_mismatch"));
  });

  it("18. the observation-language guard still fires", () => {
    const message =
      `${HOOK} Sitenize baktığımda buradan gelen taleplerin nasıl ilerlediğini merak ettim.`;
    assert.ok(failuresOf(message, "consultative").includes("fabricated_browsing_context"));
  });

  it("19. evidence grounding still fires", () => {
    const message =
      `${HOOK} Önümüzdeki sezon hedeflerinizi nasıl belirlediğinizi merak ettim.`;
    assert.ok(
      failuresOf(message, "consultative").includes("question_not_grounded_in_evidence"),
    );
  });

  it("20. the product truth guard still fires", () => {
    const message =
      `${HOOK} Buradan gelenleri otomatik olarak yanıtladığımız için nasıl ilerlediğini merak ettim.`;
    const failures = failuresOf(message, "consultative");
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("21. the persistence retry policy still replays a conflict once", async () => {
    let writes = 0;
    let stored: LeadMessageWorkspaceState = emptyMessageWorkspace();
    const outcome = await persistWorkspaceChange(
      (base) =>
        applyGeneratedDrafts(base, {
          entries: [{ tone: "consultative", message: FLUENT, source: "fallback" }],
          activeTone: "consultative",
          now: "2026-07-27T09:00:00.000Z",
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

  it("22. the lead-id integrity guard is untouched", () => {
    assert.equal(isValidLeadId("gmaps-turkay"), true);
    assert.equal(isValidLeadId(""), false);
  });

  it("the reply stage is untouched by the fluency guard", () => {
    const message =
      `Merhaba, ${NAME} için yazdığım notun üzerine kısa bir ekleme yapayım. TUGOBO, ` +
      "gelen talepleri tek ekranda topluyor. Kısa bir örnek paylaşabilirim.";
    const result = validateOutreachMessage({
      message,
      signals: SIGNALS,
      businessName: NAME,
      stance: "follow_up",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});
