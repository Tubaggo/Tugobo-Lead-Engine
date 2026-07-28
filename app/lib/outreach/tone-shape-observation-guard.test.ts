/**
 * v3.7.9 — Live Output Tone Shape & Observation Language Guard.
 *
 * Two defects that only a live provider run could surface. Both had passed
 * every offline test, because both are things the deterministic bank cannot do
 * to itself.
 *
 * 1. A consultative message wrote itself in the *soft* shape — "Kısaca merak
 *    ettim: …?" — and was accepted. `toneDistinctiveness` scored it 2 out of 5
 *    and the total still came to 94, well over the 82 bar. That is the flaw in
 *    scoring a structural property: every other dimension was genuinely good,
 *    so the average absorbed the one thing that was wrong. Three tones that
 *    collapse into one shape are not three options, and no weighted total can
 *    say so. Shape is a rule here now.
 *
 * 2. "Instagram hesabını **gezdiğimde** iletişime açık olduğunuzu gördüm."
 *    Nobody browsed anything; a crawler recorded a public link. The evidence
 *    was real and the little story about finding it was invented — the same
 *    family as "incelediğimde", which was already banned, reached through a
 *    verb nobody had listed.
 *
 * Everything else in the engine is deliberately untouched by this file.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
import { accountAnglesFor } from "./angles.ts";
import { isValidLeadId } from "../operational-state/lead-id.ts";
import { persistWorkspaceChange } from "./draft-persistence.ts";
import {
  buildOutreachMessageSystem,
  buildOutreachUserPrompt,
  OUTREACH_MESSAGE_SYSTEM,
} from "./prompt.ts";
import { scoreOutreachQuality, MIN_PROVIDER_QUALITY_TOTAL } from "./relevance.ts";
import { buildOutreachSignals, type SignalSet } from "./signals.ts";
import { validateOutreachMessage, type ValidationFailure } from "./validator.ts";
import {
  applyGeneratedDrafts,
  emptyMessageWorkspace,
  type LeadMessageWorkspaceState,
} from "./workspace.ts";

const NAME = "Türkay Otel";

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

const HOOK = `Merhaba, ${NAME}'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm.`;

function check(message: string, tone?: Tone, evidence: EvidenceSelection = WHATSAPP) {
  return validateOutreachMessage({
    message,
    signals: SIGNALS,
    businessName: NAME,
    evidence,
    tone,
  });
}

function failuresOf(
  message: string,
  tone?: Tone,
  evidence: EvidenceSelection = WHATSAPP,
): ValidationFailure[] {
  const result = check(message, tone, evidence);
  return result.ok ? [] : result.failures;
}

/* -------------------------------------------------------------------------- */
/* 1–8. the tone shape hard contract                                          */
/* -------------------------------------------------------------------------- */

describe("consultative tone shape", () => {
  it("1. rejects a consultative message that ends on a question mark", () => {
    const message = `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürütüyorsunuz?`;
    assert.ok(
      failuresOf(message, "consultative").includes("tone_shape_mismatch"),
      failuresOf(message, "consultative").join(","),
    );
    // …and the very same sentence is correct for the soft/direct tones' job.
    assert.equal(failuresOf(message, "direct").includes("tone_shape_mismatch"), false);
  });

  it("2. rejects a consultative message using the soft curiosity frame", () => {
    const message = `${HOOK} Kısaca merak ettim: buradan gelen taleplerin takibini nasıl yürüttüğünüzü merak ettim.`;
    assert.ok(
      failuresOf(message, "consultative").includes("tone_shape_mismatch"),
      failuresOf(message, "consultative").join(","),
    );
  });

  it("3. accepts a consultative message that closes indirectly", () => {
    const message = `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.`;
    assert.deepEqual(failuresOf(message, "consultative"), []);
  });

  it("the live failure that motivated this rule is now rejected", () => {
    // Verbatim shape from the live run: consultative tone, soft structure.
    const message = `${HOOK} Kısaca merak ettim: gelen rezervasyon taleplerinin takibini nasıl organize ediyorsunuz?`;
    assert.ok(failuresOf(message, "consultative").includes("tone_shape_mismatch"));
  });
});

describe("soft tone shape", () => {
  it("4. accepts a framed, directly-asked question", () => {
    const message = `${HOOK} Kısaca merak ettim: buradan gelen taleplerin son durumunu nasıl takip ediyorsunuz?`;
    assert.deepEqual(failuresOf(message, "soft"), []);
  });

  it("5. rejects a soft message that closes like a consultative one", () => {
    const message = `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.`;
    assert.ok(
      failuresOf(message, "soft").includes("tone_shape_mismatch"),
      failuresOf(message, "soft").join(","),
    );
  });

  it("rejects a soft message with no curiosity frame at all", () => {
    const message = `${HOOK} Buradan gelen taleplerin son durumunu nasıl takip ediyorsunuz?`;
    assert.ok(failuresOf(message, "soft").includes("tone_shape_mismatch"));
  });
});

describe("direct tone shape", () => {
  it("6. accepts a binary question with no preamble", () => {
    const message = `${HOOK} Buradan gelen talepler tek yerde mi ilerliyor, ayrı ayrı mı takip ediliyor?`;
    assert.deepEqual(failuresOf(message, "direct"), []);
  });

  it("7. rejects a direct message wrapped in a soft preamble", () => {
    const message = `${HOOK} Kısaca merak ettim: buradan gelen talepler tek yerde mi ilerliyor, ayrı ayrı mı?`;
    assert.ok(
      failuresOf(message, "direct").includes("tone_shape_mismatch"),
      failuresOf(message, "direct").join(","),
    );
  });

  it("rejects a direct message that closes indirectly", () => {
    const message = `${HOOK} Buradan gelen taleplerin tek yerde mi ilerlediğini merak ettim.`;
    assert.ok(failuresOf(message, "direct").includes("tone_shape_mismatch"));
  });
});

describe("shape outranks the score", () => {
  it("8. a mis-shaped message is refused even when its total clears the bar", () => {
    // The live message: consultative tone, soft shape, everything else strong.
    const message =
      `Merhaba, ${NAME}'in web sitesindeki doğrudan rezervasyon butonunu gördüm. ` +
      "Kısaca merak ettim: bu talepleri ekip içinde nasıl sıraya alıyorsunuz?";
    const booking = selectEvidence(
      buildPersonalizationEvidence({ websiteIntelligence: { hasBookingCtaText: true } }),
    )!;

    // Scored as the soft tone it is shaped like, it is a very good message.
    const asSoft = scoreOutreachQuality({
      message,
      tone: "soft",
      businessName: NAME,
      signals: SIGNALS,
      evidence: booking,
    });
    assert.ok(asSoft.total >= MIN_PROVIDER_QUALITY_TOTAL, `${asSoft.total}`);

    // Commissioned as consultative, it is refused outright — no total can buy
    // the wrong structure.
    assert.ok(failuresOf(message, "consultative", booking).includes("tone_shape_mismatch"));
  });

  it("the score on its own would still have let the live failure through", () => {
    // This is the whole argument for making shape a rule. Scored as the
    // consultative tone it was commissioned as, the live message loses
    // `truthfulness` and most of `toneDistinctiveness` — and *still* clears
    // 82, because everything else about it is genuinely good. A weighted total
    // cannot express "this is the wrong kind of message"; only a rule can.
    const message = `${HOOK} Kısaca merak ettim: buradan gelen talepleri nasıl takip ediyorsunuz?`;
    const asConsultative = scoreOutreachQuality({
      message,
      tone: "consultative",
      businessName: NAME,
      signals: SIGNALS,
      evidence: WHATSAPP,
    });
    assert.equal(asConsultative.truthfulness, 0, "the validator already refuses it");
    assert.equal(asConsultative.toneDistinctiveness, 2);
    assert.ok(
      asConsultative.total >= MIN_PROVIDER_QUALITY_TOTAL,
      `score alone would accept it at ${asConsultative.total} — hence the hard rule`,
    );
    assert.ok(failuresOf(message, "consultative").includes("tone_shape_mismatch"));
  });

  it("a message validated without a commissioned tone is not asked about shape", () => {
    const message = `${HOOK} Buradan gelen taleplerin son durumunu nasıl takip ediyorsunuz?`;
    assert.deepEqual(failuresOf(message), [], "no tone supplied → no shape rule");
  });
});

/* -------------------------------------------------------------------------- */
/* 9–12. the tone-corrected retry                                             */
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
    generationNonce: "shape",
    rotation: 0,
    provider: null,
    systemPrompt: OUTREACH_MESSAGE_SYSTEM,
    evidence: WHATSAPP,
    ...overrides,
  };
}

const MISSHAPED = `${HOOK} Kısaca merak ettim: buradan gelen talepleri nasıl takip ediyorsunuz?`;
const WELL_SHAPED = `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.`;

/** The angle line only, so an assertion about the angle is about the angle. */
function angleOf(prompt: string): string {
  return prompt.split("VARIATION ANGLE: ")[1]?.split("\n")[0] ?? "";
}

describe("provider retry after a tone-shape rejection", () => {
  it("9. retries exactly once and uses the corrected result", async () => {
    const { provider, callCount } = fakeProvider([
      { message: MISSHAPED },
      { message: WELL_SHAPED },
    ]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(baseParams({ provider })),
    );
    assert.equal(callCount(), 2, "exactly one retry");
    assert.equal(result.source, "provider");
    assert.equal(result.message, WELL_SHAPED);
  });

  it("10. a second mis-shaped result falls back to the deterministic bank", async () => {
    const { provider, callCount } = fakeProvider([{ message: MISSHAPED }]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(baseParams({ provider })),
    );
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.deepEqual(failuresOf(result.message, "consultative"), []);
  });

  it("11. the retry keeps the same evidence", async () => {
    const { provider, calls } = fakeProvider([
      { message: MISSHAPED },
      { message: WELL_SHAPED },
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

  it("12. the retry keeps the same angle", async () => {
    const { provider, calls } = fakeProvider([
      { message: MISSHAPED },
      { message: WELL_SHAPED },
    ]);
    await generateOutreachMessage(baseParams({ provider }));
    assert.equal(angleOf(calls[0].user), "whatsapp_follow_up_visibility");
    assert.equal(
      angleOf(calls[1].user),
      angleOf(calls[0].user),
      "a fixable shape defect must not cost the message its subject",
    );
  });

  it("the retry states the correction and forbids changing anything else", async () => {
    const { provider, calls } = fakeProvider([
      { message: MISSHAPED },
      { message: WELL_SHAPED },
    ]);
    await generateOutreachMessage(baseParams({ provider }));
    assert.equal(calls[0].user.includes("CORRECTION"), false, "no hint on the first try");
    assert.match(calls[1].user, /Your previous output violated the requested tone structure\./);
    assert.match(calls[1].user, /Do not change the evidence\./);
    assert.match(calls[1].user, /Do not add product pitch, demo CTA, diagnosis or social context\./);
  });

  it("a non-shape rejection still rotates onto a different angle", async () => {
    // Correctly shaped for its tone, so the ONLY defect is the diagnosis —
    // which is a problem with the subject, not with the sentence.
    const DIAGNOSING = `${HOOK} Yoğun günlerde buradan gelen taleplerin nasıl takip edildiğini merak ettim.`;
    assert.equal(failuresOf(DIAGNOSING, "consultative").includes("tone_shape_mismatch"), false);
    const { provider, calls } = fakeProvider([
      { message: DIAGNOSING },
      { message: WELL_SHAPED },
    ]);
    await generateOutreachMessage(baseParams({ provider }));
    assert.equal(calls.length, 2);
    assert.notEqual(
      angleOf(calls[1].user),
      angleOf(calls[0].user),
      "a bad subject deserves a different question",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 13–17. the observation language guard                                      */
/* -------------------------------------------------------------------------- */

describe("fabricated browsing context", () => {
  const CASES: ReadonlyArray<readonly [string, string]> = [
    ["13. Instagram hesabını gezdiğimde", "Instagram hesabını gezdiğimde iletişime açık olduğunuzu gördüm."],
    ["14. profilinizi incelerken", "Instagram profilinizi incelerken iletişim seçeneğinizi gördüm."],
    ["15. dikkatimi çekti", "Web sitenizdeki WhatsApp bağlantısı dikkatimi çekti."],
    ["baktığımda", "Web sitenize baktığımda WhatsApp bağlantısını gördüm."],
    ["göz atarken", "Web sitenize göz atarken WhatsApp bağlantısını gördüm."],
    ["karşıma çıktı", "Web sitenizdeki WhatsApp bağlantısı karşıma çıktı."],
    ["araştırırken", "Bölgeyi araştırırken web sitenizdeki WhatsApp bağlantısını gördüm."],
  ];

  for (const [label, fragment] of CASES) {
    it(`${label} → rejected`, () => {
      const message = `Merhaba, ${NAME} için yazıyorum. ${fragment} Buradan gelen talepleri kim takip ediyor?`;
      assert.ok(
        failuresOf(message, undefined).includes("fabricated_browsing_context"),
        `${fragment} → ${failuresOf(message).join(",")}`,
      );
    });
  }

  it("16. 'aklıma geldi' is still rejected (as fabricated social context)", () => {
    const message =
      `Merhaba, ${NAME} de aklıma geldi; web sitenizdeki WhatsApp bağlantısını gördüm. ` +
      "Buradan gelen talepleri kim takip ediyor?";
    const failures = failuresOf(message);
    assert.ok(failures.includes("fabricated_social_context"), failures.join(","));
  });

  it("17. a neutral evidence sentence passes", () => {
    const neutral = [
      `${HOOK} Buradan gelen talepleri ekip içinde kim takip ediyor?`,
      `Merhaba, ${NAME}'in Instagram profilinde iletişim seçeneğini gördüm. Buradan gelen talepleri kim takip ediyor?`,
    ];
    for (const message of neutral) {
      assert.equal(
        failuresOf(message).includes("fabricated_browsing_context"),
        false,
        message,
      );
    }
  });

  it("does not fire on ordinary uses of the same verbs", () => {
    // "bakıyor" is what a team does to a request, not how we found the hotel.
    const message = `${HOOK} Buradan gelen taleplere ekip içinde kim bakıyor?`;
    assert.equal(failuresOf(message).includes("fabricated_browsing_context"), false);
  });

  it("the system prompt states the observation-language contract in both languages", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /OBSERVATION LANGUAGE CONTRACT/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /GÖZLEM DİLİ SÖZLEŞMESİ/);
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes("State the verified public evidence neutrally."),
    );
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes(
        "Do not narrate how you browsed, inspected, explored, researched, noticed or came across the hotel.",
      ),
    );
  });

  it("the reply stage is untouched by the browsing guard", () => {
    const message =
      `Merhaba, ${NAME} için yazdığım notun üzerine kısa bir ekleme yapayım. Sitenize ` +
      "baktığımda aklıma geldi; TUGOBO gelen talepleri tek ekranda topluyor. Kısa bir örnek paylaşabilirim.";
    const result = validateOutreachMessage({
      message,
      signals: SIGNALS,
      businessName: NAME,
      stance: "follow_up",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});

/* -------------------------------------------------------------------------- */
/* 18–24. everything this sprint must not have broken                         */
/* -------------------------------------------------------------------------- */

describe("existing guards are preserved", () => {
  it("18. the fabricated social context guard still fires", () => {
    const message =
      `Merhaba, Antalya tarafında birkaç işletmeyle konuşuyorum; ${NAME}'in web sitesindeki ` +
      "WhatsApp bağlantısını gördüm. Buradan gelen talepleri kim takip ediyor?";
    assert.ok(failuresOf(message).includes("fabricated_social_context"));
  });

  it("19. the account-specific evidence guard still fires", () => {
    const message =
      `Merhaba, ${NAME} için yazıyorum. Gelen talepleri ekip içinde şu anda kim takip ` +
      "ediyor, nasıl ilerliyor?";
    assert.ok(failuresOf(message).includes("generic_reusable_message"));
  });

  it("20. the product truth guard still fires", () => {
    const message = `${HOOK} Buradan gelenleri otomatik olarak yanıtlıyoruz, nasıl takip ediyorsunuz?`;
    const failures = failuresOf(message);
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("21. the respectful outreach guard still fires", () => {
    const message = `${HOOK} Yoğun günlerde buradan gelen talepler nasıl takip ediliyor?`;
    assert.ok(failuresOf(message).includes("condescending_diagnosis"));
  });

  it("22. the no-evidence gate still returns needs_research with no provider call", async () => {
    const { provider, callCount } = fakeProvider([{ message: "istenmemeli" }]);
    const result = await generateOutreachMessage(
      baseParams({ provider, evidence: null, signals: buildOutreachSignals({ city: "Mersin" }) }),
    );
    assert.equal(result.status, "needs_research");
    assert.equal(callCount(), 0);
  });

  it("23. the persistence retry policy still replays a conflict once", async () => {
    let writes = 0;
    let stored: LeadMessageWorkspaceState = emptyMessageWorkspace();
    const outcome = await persistWorkspaceChange(
      (base) =>
        applyGeneratedDrafts(base, {
          entries: [{ tone: "soft", message: WELL_SHAPED, source: "fallback" }],
          activeTone: "soft",
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

  it("24. the lead-id integrity guard is untouched", () => {
    assert.equal(isValidLeadId("gmaps-turkay"), true);
    assert.equal(isValidLeadId(""), false);
  });
});

/* -------------------------------------------------------------------------- */
/* 25. the whole deterministic bank obeys the hard contract                    */
/* -------------------------------------------------------------------------- */

describe("25. every fallback body hard-passes its own tone contract", () => {
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
        buildPersonalizationEvidence({ websiteIntelligence: { languages: ["tr", "en", "de"] } }),
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

  it("passes the validator with its tone commissioned", () => {
    for (const { name, ev, signals } of SELECTIONS) {
      for (const tone of TONES) {
        for (let rotation = 0; rotation < accountAnglesFor(ev).length; rotation += 1) {
          const { message } = buildAccountFallbackMessage({
            tone,
            businessName: NAME,
            evidence: ev,
            rotation,
          });
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

  it("carries no browsing narrative anywhere in the bank", () => {
    for (const { ev } of SELECTIONS) {
      for (const tone of TONES) {
        const { message } = buildAccountFallbackMessage({
          tone,
          businessName: NAME,
          evidence: ev,
          rotation: 0,
        });
        assert.doesNotMatch(
          message,
          /(gezdi|incele|baktığımda|göz at|dikkatimi çekti|karşıma çıktı|aklıma geldi)/i,
          message,
        );
      }
    }
  });

  it("keeps the three shapes mutually exclusive", () => {
    for (const { name, ev, signals } of SELECTIONS) {
      const soft = buildAccountFallbackMessage({ tone: "soft", businessName: NAME, evidence: ev, rotation: 0 }).message;
      const direct = buildAccountFallbackMessage({ tone: "direct", businessName: NAME, evidence: ev, rotation: 0 }).message;
      const consultative = buildAccountFallbackMessage({ tone: "consultative", businessName: NAME, evidence: ev, rotation: 0 }).message;

      // Each body is valid for its own tone and invalid for the other two.
      const shapeOnly = (message: string, tone: Tone) =>
        validateOutreachMessage({ message, signals, businessName: NAME, evidence: ev, tone });

      const softVerdict = shapeOnly(soft, "soft");
      assert.equal(softVerdict.ok, true, `${name} soft: ${JSON.stringify(softVerdict)}`);
      for (const other of ["direct", "consultative"] as const) {
        const v = shapeOnly(soft, other);
        assert.ok(!v.ok && v.failures.includes("tone_shape_mismatch"), `${name} soft passed as ${other}`);
      }
      const dv = shapeOnly(direct, "consultative");
      assert.ok(!dv.ok && dv.failures.includes("tone_shape_mismatch"), `${name} direct passed as consultative`);
      const cv = shapeOnly(consultative, "soft");
      assert.ok(!cv.ok && cv.failures.includes("tone_shape_mismatch"), `${name} consultative passed as soft`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 26. the prompt commissions the shape it enforces                            */
/* -------------------------------------------------------------------------- */

describe("26. the prompt states the contract the validator checks", () => {
  it("names the tone structure for the commissioned tone", () => {
    for (const tone of TONES) {
      const prompt = buildOutreachUserPrompt({
        businessName: NAME,
        city: "Antalya",
        businessType: "Otel",
        tone,
        angle: "whatsapp_follow_up_visibility",
        signals: SIGNALS,
        previousMessages: [],
        generationNonce: "n",
        stance: "first_contact",
        evidence: WHATSAPP,
      });
      assert.match(prompt, /TON YAPISI \(mutlak/, tone);
    }
  });

  it("tells consultative not to use a question mark, and soft to use one", () => {
    const base = {
      businessName: NAME,
      city: "Antalya",
      businessType: "Otel",
      angle: "whatsapp_follow_up_visibility" as const,
      signals: SIGNALS,
      previousMessages: [],
      generationNonce: "n",
      stance: "first_contact" as const,
      evidence: WHATSAPP,
    };
    assert.match(
      buildOutreachUserPrompt({ ...base, tone: "consultative" }),
      /SORU İŞARETİ KULLANMA/,
    );
    assert.match(
      buildOutreachUserPrompt({ ...base, tone: "soft" }),
      /SORU İŞARETİ ile bitmeli/,
    );
  });

  it("the reply-stage system prompt is unchanged by the tone contract", () => {
    const reply = buildOutreachMessageSystem("follow_up");
    assert.equal(reply.includes("OBSERVATION LANGUAGE CONTRACT"), false);
  });
});
