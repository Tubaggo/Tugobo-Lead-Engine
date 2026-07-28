/**
 * v3.7.9 — High-Relevance Account-Specific Outreach.
 *
 * The sprint that came before this one made first messages respectful,
 * grounded and honest. They still earned nothing, and the reason turned out to
 * be a property none of the earlier rules measured: the messages were *true of
 * everyone*.
 *
 *   "Merhaba, Türkay Otel için kısa bir not bırakmak istedim.
 *    Gelen talepleri ekip içinde kim takip ediyor?"
 *
 * Swap the name and it is exactly as true — and a hotelier who reads it has no
 * reason to believe anyone looked at them. These tests encode the fix: a first
 * message is built from verified, business-specific public evidence, asks one
 * question that follows from that evidence, and is refused outright when no
 * such evidence exists.
 *
 * The acceptance question behind every case here: *would this message survive
 * having the hotel's name swapped?* If yes, it is a failure.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountAngleFor, accountAnglesFor, ACCOUNT_ANGLES } from "./angles.ts";
import { TONES, NEEDS_RESEARCH_MESSAGE_TR, type Tone } from "./contract.ts";
import {
  expectGeneratedOutreach,
  generateOutreachMessage,
  type GenerateParams,
  type OutreachProvider,
  type ProviderOutput,
} from "./engine.ts";
import {
  buildPersonalizationEvidence,
  isCoherentEvidenceCluster,
  selectEvidence,
  type EvidenceSelection,
  type PersonalizationEvidence,
} from "./evidence.ts";
import { buildAccountFallbackMessage } from "./fallback.ts";
import { isValidLeadId, validateLeadId } from "../operational-state/lead-id.ts";
import { persistWorkspaceChange } from "./draft-persistence.ts";
import { OUTREACH_MESSAGE_SYSTEM } from "./prompt.ts";
import {
  meetsProviderQualityBar,
  MIN_PROVIDER_QUALITY_TOTAL,
  OUTREACH_QUALITY_WEIGHTS,
  scoreOutreachQuality,
} from "./relevance.ts";
import { buildOutreachSignals, type SignalSet } from "./signals.ts";
import { validateOutreachMessage, type ValidationFailure } from "./validator.ts";
import {
  applyGeneratedDrafts,
  applyManualDraft,
  CURRENT_COPY_VERSION,
  draftSourceLabel,
  emptyMessageWorkspace,
  isStaleCopyDraft,
  type LeadMessageWorkspaceState,
} from "./workspace.ts";

const NAME = "Türkay Otel";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function pack(input: Parameters<typeof buildPersonalizationEvidence>[0]) {
  return buildPersonalizationEvidence(input);
}

function pick(
  input: Parameters<typeof buildPersonalizationEvidence>[0],
  allowSupporting = false,
): EvidenceSelection {
  const selection = selectEvidence(pack(input), { allowSupporting });
  assert.ok(selection, "fixture produced no evidence");
  return selection;
}

const WHATSAPP = pick({ websiteIntelligence: { hasWhatsAppLink: true } });

const WHATSAPP_PLUS_BOOKING = pick(
  { websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true } },
  true,
);

const MULTILINGUAL = pick({
  websiteIntelligence: { languages: ["tr", "en", "de"] },
});

const POSITIONING = pick({ businessType: "Termal Otel" });

const ROOM_VARIETY = pick({ websiteIntelligence: { roomTypeCount: 5 } });

const OTA_PLUS_BOOKING = pick(
  { channels: ["Booking"], websiteIntelligence: { hasBookingCtaText: true } },
  true,
);

const SIGNALS_WHATSAPP = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  hasWhatsAppPath: true,
  websiteIntelligence: { hasWhatsAppLink: true },
});

const SIGNALS_WHATSAPP_BOOKING = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  hasWhatsAppPath: true,
  websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true },
});

const SIGNALS_PLAIN = buildOutreachSignals({ city: "Antalya", businessType: "Otel" });

const SIGNALS_OTA = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  channels: ["Booking"],
  websiteIntelligence: { hasBookingCtaText: true },
});

function failuresOf(
  message: string,
  signals: SignalSet = SIGNALS_PLAIN,
  evidence?: EvidenceSelection,
): ValidationFailure[] {
  const result = validateOutreachMessage({
    message,
    signals,
    businessName: NAME,
    evidence,
  });
  return result.ok ? [] : result.failures;
}

function fallbackFor(
  evidence: EvidenceSelection,
  tone: Tone = "soft",
  rotation = 0,
): string {
  return buildAccountFallbackMessage({ tone, businessName: NAME, evidence, rotation })
    .message;
}

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
    tone: "soft",
    angle: "whatsapp_follow_up_visibility",
    signals: SIGNALS_WHATSAPP,
    previousMessages: [],
    generationNonce: "n1",
    rotation: 0,
    provider: null,
    systemPrompt: OUTREACH_MESSAGE_SYSTEM,
    evidence: WHATSAPP,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* 1–4. evidence appears, grounds the question, and clusters coherently        */
/* -------------------------------------------------------------------------- */

describe("evidence reaches the message", () => {
  it("1. the exact hotel evidence appears in the message", () => {
    const message = fallbackFor(WHATSAPP);
    assert.ok(message.includes(NAME), message);
    assert.match(message, /WhatsApp rezervasyon bağlantısını/);
    assert.deepEqual(failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP), []);
  });

  it("2. the question is grounded in the primary evidence", () => {
    const ungrounded =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. " +
      "Önümüzdeki sezon için genel hedeflerinizi ekip içinde nasıl belirliyorsunuz?";
    assert.ok(
      failuresOf(ungrounded, SIGNALS_WHATSAPP, WHATSAPP).includes(
        "question_not_grounded_in_evidence",
      ),
      failuresOf(ungrounded, SIGNALS_WHATSAPP, WHATSAPP).join(","),
    );
  });

  it("3. a coherent supporting evidence is allowed alongside the primary", () => {
    assert.equal(WHATSAPP_PLUS_BOOKING.supporting?.type, "booking_button");
    assert.ok(
      isCoherentEvidenceCluster(
        WHATSAPP_PLUS_BOOKING.primary.type,
        WHATSAPP_PLUS_BOOKING.supporting!.type,
      ),
    );
    const message = fallbackFor(WHATSAPP_PLUS_BOOKING, "direct");
    assert.deepEqual(
      failuresOf(message, SIGNALS_WHATSAPP_BOOKING, WHATSAPP_PLUS_BOOKING),
      [],
      message,
    );
  });

  it("4. an incoherent evidence cluster is rejected", () => {
    // A WhatsApp link and a multilingual site are both verified and both real;
    // they simply do not raise one shared operational question.
    const multilingual: PersonalizationEvidence = MULTILINGUAL.primary;
    assert.equal(
      isCoherentEvidenceCluster(WHATSAPP.primary.type, multilingual.type),
      false,
    );

    const incoherent: EvidenceSelection = {
      primary: WHATSAPP.primary,
      supporting: multilingual,
    };
    const message =
      "Merhaba, Türkay Otel'in hem WhatsApp rezervasyon bağlantısını hem de farklı dil " +
      "seçeneklerini gördüm. Buradan gelen talepler tek yerde mi ilerliyor, ayrı ayrı mı?";
    const failures = failuresOf(message, SIGNALS_WHATSAPP, incoherent);
    assert.ok(failures.includes("incoherent_evidence_cluster"), failures.join(","));
  });
});

/* -------------------------------------------------------------------------- */
/* 5–8. the four shapes that made every message reusable                      */
/* -------------------------------------------------------------------------- */

describe("fabricated and generic openings are rejected", () => {
  it("5. rejects an invented regional conversation", () => {
    const message =
      "Merhaba, Antalya tarafında birkaç işletmeyle konuşuyorum; Türkay Otel'in web " +
      "sitesindeki WhatsApp bağlantısını gördüm. Buradan gelen talepleri kim takip ediyor?";
    assert.ok(
      failuresOf(message, SIGNALS_WHATSAPP).includes("fabricated_social_context"),
      failuresOf(message, SIGNALS_WHATSAPP).join(","),
    );
  });

  it("6. rejects 'Türkay Otel de aklıma geldi'", () => {
    const message =
      "Merhaba, Türkay Otel de aklıma geldi; web sitesindeki WhatsApp bağlantısını " +
      "gördüm. Buradan gelen talepleri ekip içinde kim takip ediyor?";
    assert.ok(
      failuresOf(message, SIGNALS_WHATSAPP).includes("fabricated_social_context"),
      failuresOf(message, SIGNALS_WHATSAPP).join(","),
    );
  });

  it("7. rejects a hotel-name-only opening with nothing specific behind it", () => {
    const message =
      "Merhaba, Türkay Otel için kısa bir not bırakmak istedim. Gelen talepleri ekip " +
      "içinde şu anda kim takip ediyor, nasıl ilerliyor?";
    assert.ok(
      failuresOf(message).includes("generic_reusable_message"),
      failuresOf(message).join(","),
    );
  });

  it("8. rejects the generic tracking question when no evidence backs it", () => {
    const message =
      "Merhaba, Türkay Otel için yazıyorum. Gelen rezervasyon taleplerinin son durumunu " +
      "ekip içinde nasıl takip ediyorsunuz, hangi yöntemi kullanıyorsunuz?";
    assert.ok(
      failuresOf(message).includes("generic_reusable_message"),
      failuresOf(message).join(","),
    );
  });

  it("a hotel named after an evidence keyword is not treated as two signals", () => {
    // "Sandıklı Termal" is a name. Before the business name was stripped from
    // the topic scan, "Termal" counted as a second, undeclared signal and this
    // otherwise-perfect message was rejected.
    const signals = buildOutreachSignals({ city: "Afyon", businessType: "Otel", hasInstagram: true });
    const instagram = selectEvidence(pack({ hasInstagram: true }))!;
    const message =
      "Merhaba, Sandıklı Termal'ın Instagram üzerindeki iletişim seçeneğini gördüm. " +
      "Kısaca merak ettim: bu talepleri ekip içinde nasıl sıraya alıyorsunuz?";
    const result = validateOutreachMessage({
      message,
      signals,
      businessName: "Sandıklı Termal",
      evidence: instagram,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  });

  it("a name that supplies the only specificity is still generic", () => {
    // The flip side: stripping the name must not let the name itself count as
    // the observation.
    const message =
      "Merhaba, Sandıklı Termal için yazıyorum. Gelen rezervasyon taleplerini ekip " +
      "içinde şu anda nasıl takip ediyorsunuz, kim bakıyor?";
    const result = validateOutreachMessage({
      message,
      signals: SIGNALS_PLAIN,
      businessName: "Sandıklı Termal",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("generic_reusable_message"));
  });

  it("the same question stops being generic once it points at real evidence", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. " +
      "Buradan gelen taleplerin son durumunu ekip içinde nasıl takip ediyorsunuz?";
    assert.deepEqual(failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 9–15. one accepted message per evidence type                               */
/* -------------------------------------------------------------------------- */

describe("each evidence type produces a sendable message", () => {
  it("9. a website WhatsApp message passes", () => {
    const message = fallbackFor(WHATSAPP, "soft");
    assert.deepEqual(failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP), [], message);
  });

  it("10. a WhatsApp + booking-button cluster message passes", () => {
    const message = fallbackFor(WHATSAPP_PLUS_BOOKING, "direct");
    assert.match(message, /hem .* hem de /);
    assert.deepEqual(
      failuresOf(message, SIGNALS_WHATSAPP_BOOKING, WHATSAPP_PLUS_BOOKING),
      [],
      message,
    );
  });

  it("11. a multilingual-site message passes", () => {
    const message = fallbackFor(MULTILINGUAL, "soft");
    assert.match(message, /farklı dil seçeneklerini/);
    assert.deepEqual(failuresOf(message, SIGNALS_PLAIN, MULTILINGUAL), [], message);
  });

  it("12. a property-positioning message passes", () => {
    const message = fallbackFor(POSITIONING, "direct");
    assert.match(message, /termal/i);
    assert.deepEqual(failuresOf(message, SIGNALS_PLAIN, POSITIONING), [], message);
  });

  it("13. a room-variety message passes", () => {
    const message = fallbackFor(ROOM_VARIETY, "consultative");
    assert.match(message, /oda/i);
    assert.deepEqual(failuresOf(message, SIGNALS_PLAIN, ROOM_VARIETY), [], message);
  });

  it("14. an OTA message names the listing without implying dependency or loss", () => {
    const message = fallbackFor(OTA_PLUS_BOOKING, "soft");
    assert.match(message, /Booking\.com/);
    assert.doesNotMatch(message, /bağımlı|komisyon|kayb|kaçır/i);
    assert.deepEqual(failuresOf(message, SIGNALS_OTA, OTA_PLUS_BOOKING), [], message);
  });

  it("15. an unsupported pain claim is rejected even with real evidence", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm; " +
      "buradan gelen mesajlarınız kayboluyor. Bunu ekip içinde nasıl takip ediyorsunuz?";
    assert.ok(
      failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP).includes("unsupported_pain_assumption"),
      failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP).join(","),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 16–18. no evidence means no message at all                                 */
/* -------------------------------------------------------------------------- */

describe("a lead with no account-specific evidence", () => {
  it("16. resolves to needs_research rather than a message", async () => {
    const result = await generateOutreachMessage(
      baseParams({ signals: SIGNALS_PLAIN, evidence: null }),
    );
    assert.equal(result.status, "needs_research");
    if (result.status === "needs_research") {
      assert.equal(result.reason, "no_relevant_verified_evidence");
      assert.equal(result.generationId, "gmaps-turkay:n1");
    }
  });

  it("17. makes zero provider calls", async () => {
    const { provider, callCount } = fakeProvider([
      { message: "bu asla istenmemeli" },
    ]);
    const result = await generateOutreachMessage(
      baseParams({ signals: SIGNALS_PLAIN, evidence: null, provider }),
    );
    assert.equal(result.status, "needs_research");
    assert.equal(callCount(), 0, "the gate must run before the provider");
  });

  it("18. produces zero fallback drafts", async () => {
    const result = await generateOutreachMessage(
      baseParams({ signals: SIGNALS_PLAIN, evidence: null }),
    );
    assert.equal("message" in result, false, "needs_research carries no message");
  });

  it("an empty evidence pack is what the route's gate reads", () => {
    assert.equal(pack({ city: "Antalya", businessType: "Otel" } as never).length, 0);
    assert.equal(pack({ businessType: "Otel" }).length, 0);
    assert.ok(NEEDS_RESEARCH_MESSAGE_TR.includes("doğrulanmış sinyal bulunamadı"));
  });

  it("neither a city nor a plain business type counts as evidence", () => {
    assert.deepEqual(pack({ businessType: "Hotel", channels: [] }), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 19–21. the relevance bar and the rejection path                            */
/* -------------------------------------------------------------------------- */

const HOOK =
  "Merhaba, Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm.";

/** A score object whose only interesting field is the total. */
const ZERO_SCORE = {
  total: 0,
  evidenceSpecificity: 0,
  accountRelevance: 0,
  questionGrounding: 0,
  naturalness: 0,
  replyEase: 0,
  truthfulness: 0,
  toneDistinctiveness: 0,
};

/**
 * Correctly shaped and fluent, and rejected anyway — it diagnoses the hotel.
 *
 * Drives the retry/fallback path the way production actually reaches it: by a
 * hard rule, not by a score. A diagnosis is a problem with *what the message is
 * about*, so the retry is expected to rotate onto a different question rather
 * than repair this one.
 */
const RULE_REJECTED_MESSAGE =
  `${HOOK} Yoğun günlerde buradan gelen taleplerin nasıl takip edildiğini merak ettim.`;

/** Consultative and strong — the corrected counterpart to the fixture above. */
const STRONG_CONSULTATIVE_MESSAGE =
  `${HOOK} Buradan gelen taleplerin takibini hangi yöntemle yürüttüğünüzü merak ettim.`;

const STRONG_PROVIDER_MESSAGE =
  `${HOOK} Kısaca merak ettim: buradan gelen taleplerin son durumunu ekip içinde nasıl takip ediyorsunuz?`;

describe("the provider relevance bar", () => {
  it("19. a strong provider message clears the bar and is used", async () => {
    const score = scoreOutreachQuality({
      message: STRONG_PROVIDER_MESSAGE,
      tone: "soft",
      businessName: NAME,
      signals: SIGNALS_WHATSAPP,
      evidence: WHATSAPP,
    });
    assert.ok(
      score.total >= MIN_PROVIDER_QUALITY_TOTAL,
      `${score.total}: ${JSON.stringify(score)}`,
    );

    const { provider, callCount } = fakeProvider([{ message: STRONG_PROVIDER_MESSAGE }]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(baseParams({ provider })),
    );
    assert.equal(result.source, "provider");
    assert.equal(result.message, STRONG_PROVIDER_MESSAGE);
    assert.equal(callCount(), 1, "no needless retry on a good first result");
  });

  it("the bar itself still rejects a low total", () => {
    assert.equal(meetsProviderQualityBar({ ...ZERO_SCORE, total: 81 }), false);
    assert.equal(meetsProviderQualityBar({ ...ZERO_SCORE, total: 82 }), true);
  });

  /*
   * A finding, recorded rather than papered over.
   *
   * Each guard added since the bar was set — evidence grounding, the tone-shape
   * contract, the Turkish fluency guard — rejects outright a class of message
   * that used to merely score badly. What is left is that anything clearing
   * every hard rule now also clears 82: the cheapest valid message this engine
   * can express scores in the mid-eighties. The bar is a backstop for future
   * rule changes, not an active filter, and pretending otherwise with a
   * hand-tuned fixture would be testing arithmetic instead of behaviour.
   */
  it("every rule-passing message currently also clears the bar", () => {
    for (const { evidence, signals } of ALL_SELECTIONS) {
      for (const tone of TONES) {
        const message = buildAccountFallbackMessage({
          tone,
          businessName: NAME,
          evidence,
          rotation: 0,
        }).message;
        const score = scoreOutreachQuality({
          message,
          tone,
          businessName: NAME,
          signals,
          evidence,
        });
        assert.ok(
          score.total >= MIN_PROVIDER_QUALITY_TOTAL,
          `${tone}: ${score.total} — ${message}`,
        );
      }
    }
  });

  it("20. a rejected first result triggers exactly one retry", async () => {
    const { provider, callCount, calls } = fakeProvider([
      { message: RULE_REJECTED_MESSAGE },
      { message: STRONG_CONSULTATIVE_MESSAGE },
    ]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(
        baseParams({
          provider,
          tone: "consultative",
          signals: SIGNALS_WHATSAPP_BOOKING,
          evidence: WHATSAPP_PLUS_BOOKING,
        }),
      ),
    );
    assert.equal(callCount(), 2, "exactly one retry");
    assert.equal(result.source, "provider");
    assert.equal(result.message, STRONG_CONSULTATIVE_MESSAGE);
    assert.notEqual(
      calls[0].user.split("VARIATION ANGLE: ")[1],
      calls[1].user.split("VARIATION ANGLE: ")[1],
      "the retry must move to a different question",
    );
  });

  it("21. a second rejection falls back to the account bank", async () => {
    const { provider, callCount } = fakeProvider([{ message: RULE_REJECTED_MESSAGE }]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(
        baseParams({
          provider,
          tone: "consultative",
          signals: SIGNALS_WHATSAPP_BOOKING,
          evidence: WHATSAPP_PLUS_BOOKING,
        }),
      ),
    );
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.match(result.message, /WhatsApp/);
  });

  it("the weights add up to 100 and the core carries most of it", () => {
    const total = Object.values(OUTREACH_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(total, 100);
    const core =
      OUTREACH_QUALITY_WEIGHTS.evidenceSpecificity +
      OUTREACH_QUALITY_WEIGHTS.accountRelevance +
      OUTREACH_QUALITY_WEIGHTS.questionGrounding;
    assert.equal(core, 60);
  });
});

/* -------------------------------------------------------------------------- */
/* 22–27. what the deterministic bank guarantees                              */
/* -------------------------------------------------------------------------- */

const ALL_SELECTIONS: ReadonlyArray<{ name: string; evidence: EvidenceSelection; signals: SignalSet }> = [
  { name: "whatsapp", evidence: WHATSAPP, signals: SIGNALS_WHATSAPP },
  {
    name: "whatsapp+booking",
    evidence: WHATSAPP_PLUS_BOOKING,
    signals: SIGNALS_WHATSAPP_BOOKING,
  },
  { name: "multilingual", evidence: MULTILINGUAL, signals: SIGNALS_PLAIN },
  { name: "positioning", evidence: POSITIONING, signals: SIGNALS_PLAIN },
  { name: "rooms", evidence: ROOM_VARIETY, signals: SIGNALS_PLAIN },
  { name: "ota+booking", evidence: OTA_PLUS_BOOKING, signals: SIGNALS_OTA },
];

function everyBody(): Array<{ label: string; message: string; tone: Tone; evidence: EvidenceSelection; signals: SignalSet }> {
  const out: Array<{ label: string; message: string; tone: Tone; evidence: EvidenceSelection; signals: SignalSet }> = [];
  for (const { name, evidence, signals } of ALL_SELECTIONS) {
    for (const tone of TONES) {
      for (let rotation = 0; rotation < accountAnglesFor(evidence).length; rotation += 1) {
        out.push({
          label: `${name}/${tone}/${rotation}`,
          message: fallbackFor(evidence, tone, rotation),
          tone,
          evidence,
          signals,
        });
      }
    }
  }
  return out;
}

describe("the account fallback bank", () => {
  const bodies = everyBody();

  it("22. every fallback body is account-specific", () => {
    for (const body of bodies) {
      assert.ok(body.message.includes(NAME), body.label);
      assert.equal(
        failuresOf(body.message, body.signals, body.evidence).includes(
          "generic_reusable_message",
        ),
        false,
        body.label,
      );
      assert.deepEqual(
        failuresOf(body.message, body.signals, body.evidence),
        [],
        `${body.label}: ${body.message}`,
      );
    }
  });

  it("23. no fallback body pitches the product", () => {
    for (const body of bodies) {
      assert.doesNotMatch(body.message, /TUGOBO/i, body.label);
    }
  });

  it("24. no fallback body offers a demo, example or meeting", () => {
    for (const body of bodies) {
      assert.equal(
        failuresOf(body.message, body.signals, body.evidence).includes(
          "first_contact_demo_offer",
        ),
        false,
        body.label,
      );
    }
  });

  it("25. no fallback body invents social context", () => {
    for (const body of bodies) {
      assert.doesNotMatch(body.message, /aklıma gel|birkaç işletme|benzer otel/i, body.label);
      assert.equal(
        failuresOf(body.message, body.signals, body.evidence).includes(
          "fabricated_social_context",
        ),
        false,
        body.label,
      );
    }
  });

  it("26. the three tones differ in structure, not only in wording", () => {
    for (const { name, evidence } of ALL_SELECTIONS) {
      const soft = fallbackFor(evidence, "soft");
      const direct = fallbackFor(evidence, "direct");
      const consultative = fallbackFor(evidence, "consultative");

      assert.match(soft, /merak ettim: /, `${name} soft must lead with curiosity`);
      assert.ok(soft.endsWith("?"), `${name} soft must ask outright`);

      assert.match(direct, /\b(mi|mı|mu|mü)\b/, `${name} direct must be binary`);
      assert.ok(direct.endsWith("?"), `${name} direct must ask outright`);

      assert.match(
        consultative,
        /merak ettim\.$/,
        `${name} consultative must wonder rather than ask`,
      );
      assert.equal(consultative.includes("?"), false, `${name} consultative uses no "?"`);
    }
  });

  it("27. every body carries exactly one question", () => {
    for (const body of bodies) {
      const marks = (body.message.match(/\?/g) ?? []).length;
      const indirect = /merak ettim\.$/.test(body.message);
      assert.ok(marks === 1 || (marks === 0 && indirect), body.label);
    }
  });

  it("every account angle is reachable from some evidence type", () => {
    const reachable = new Set(ALL_SELECTIONS.flatMap(({ evidence }) => accountAnglesFor(evidence)));
    const unreachable = ACCOUNT_ANGLES.filter((angle) => !reachable.has(angle));
    // The fixtures above do not include a contact form or an Instagram
    // account, so those two angles have no selection to come from here; every
    // other angle must be produced by one of them.
    assert.deepEqual(unreachable.sort(), ["contact_form_follow_up", "cross_channel_continuity"]);
  });

  it("rotation moves the question without moving the observation", () => {
    const angles = accountAnglesFor(WHATSAPP);
    assert.ok(angles.length >= 2);
    const first = fallbackFor(WHATSAPP, "soft", 0);
    const second = fallbackFor(WHATSAPP, "soft", 1);
    assert.notEqual(first, second);
    assert.ok(first.includes("WhatsApp rezervasyon bağlantısını"));
    assert.ok(second.includes("WhatsApp rezervasyon bağlantısını"));
    assert.notEqual(accountAngleFor(WHATSAPP, 0), accountAngleFor(WHATSAPP, 1));
  });
});

/* -------------------------------------------------------------------------- */
/* 28–32. the layers this sprint must not break                               */
/* -------------------------------------------------------------------------- */

describe("earlier guards survive the calibration", () => {
  it("28. the sender identity guard still rejects an invented name", () => {
    const message =
      "Merhaba, ben Tuğrul; Türkay Otel'in web sitesindeki WhatsApp rezervasyon " +
      "bağlantısını gördüm. Buradan gelen talepleri nasıl takip ediyorsunuz?";
    assert.ok(
      failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP).includes("invented_sender_identity"),
    );
  });

  it("29. the product truth guard still rejects an autonomous-action claim", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm; " +
      "buradan gelenleri otomatik olarak yanıtlıyoruz. Bunu nasıl takip ediyorsunuz?";
    const failures = failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP);
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("30. the respectful outreach guard still rejects a diagnosis", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. " +
      "Yoğun günlerde buradan gelen talepler nasıl takip ediliyor?";
    assert.ok(
      failuresOf(message, SIGNALS_WHATSAPP, WHATSAPP).includes("condescending_diagnosis"),
    );
  });

  it("31. the persistence retry policy still replays a conflict exactly once", async () => {
    let writes = 0;
    let stored: LeadMessageWorkspaceState = emptyMessageWorkspace();
    const outcome = await persistWorkspaceChange(
      (base) =>
        applyGeneratedDrafts(base, {
          entries: [
            { tone: "soft", message: fallbackFor(WHATSAPP), source: "fallback" },
          ],
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
        isConflict: (err) => err instanceof Error && err.message === "conflict",
      },
    );
    assert.equal(outcome.status, "saved");
    assert.equal(outcome.attempts, 2);
    assert.equal(stored.drafts.soft?.copyVersion, CURRENT_COPY_VERSION);
  });

  it("32. the lead-id integrity guard is untouched", () => {
    assert.equal(isValidLeadId("gmaps-turkay"), true);
    assert.equal(isValidLeadId(""), false);
    assert.equal(validateLeadId("undefined").ok, false);
  });
});

/* -------------------------------------------------------------------------- */
/* 33–37. copy version, staleness and the badge                               */
/* -------------------------------------------------------------------------- */

describe("copy version 6", () => {
  const NOW = "2026-07-27T09:00:00.000Z";

  it("33. new generations are stamped copy version 6", () => {
    assert.equal(CURRENT_COPY_VERSION, 6);
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [{ tone: "soft", message: fallbackFor(WHATSAPP), source: "fallback" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(state.drafts.soft?.copyVersion, 6);
  });

  it("34. a v5 provider or fallback draft becomes stale", () => {
    for (const source of ["provider", "fallback"] as const) {
      assert.equal(
        isStaleCopyDraft({
          tone: "soft",
          message: "v5 taslak",
          source,
          updatedAt: NOW,
          copyVersion: 5,
        }),
        true,
        source,
      );
    }
  });

  it("35. a manual draft is never stale and never overwritten", () => {
    const manual = applyManualDraft(emptyMessageWorkspace(), "soft", "elle yazdım", NOW);
    assert.equal(isStaleCopyDraft(manual.drafts.soft), false);

    const after = applyGeneratedDrafts(manual, {
      entries: [{ tone: "direct", message: fallbackFor(WHATSAPP, "direct"), source: "fallback" }],
      activeTone: "direct",
      now: NOW,
    });
    assert.equal(after.drafts.soft?.message, "elle yazdım");
    assert.equal(after.drafts.soft?.source, "manual");
  });

  it("36. a refresh updates only the active tone", () => {
    const stale: LeadMessageWorkspaceState = {
      activeTone: "soft",
      drafts: {
        soft: { tone: "soft", message: "v5 yumuşak", source: "provider", updatedAt: NOW, copyVersion: 5 },
        direct: { tone: "direct", message: "v5 direkt", source: "provider", updatedAt: NOW, copyVersion: 5 },
      },
      recentMessages: [],
    };
    const refreshed = applyGeneratedDrafts(stale, {
      entries: [{ tone: "soft", message: fallbackFor(WHATSAPP), source: "fallback" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(refreshed.drafts.soft?.copyVersion, 6);
    assert.equal(refreshed.drafts.direct?.message, "v5 direkt");
    assert.equal(refreshed.drafts.direct?.copyVersion, 5);
  });

  it("37. the source badge stays truthful when the provider result is refused", async () => {
    const { provider } = fakeProvider([{ message: RULE_REJECTED_MESSAGE }]);
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(
        baseParams({
          provider,
          tone: "consultative",
          signals: SIGNALS_WHATSAPP_BOOKING,
          evidence: WHATSAPP_PLUS_BOOKING,
        }),
      ),
    );
    assert.equal(result.source, "fallback");
    assert.equal(draftSourceLabel(result.source), "Güvenli şablon");
  });
});

/* -------------------------------------------------------------------------- */
/* 38. explainability                                                         */
/* -------------------------------------------------------------------------- */

describe("38. the draft explains itself", () => {
  it("carries the evidence ids, the angle and the score", async () => {
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(
        baseParams({ signals: SIGNALS_WHATSAPP_BOOKING, evidence: WHATSAPP_PLUS_BOOKING }),
      ),
    );
    assert.equal(result.personalization?.primaryEvidenceId, "ev_website_whatsapp_link");
    assert.equal(result.personalization?.supportingEvidenceId, "ev_booking_button");
    assert.ok(
      ACCOUNT_ANGLES.includes(result.personalization?.angleId as (typeof ACCOUNT_ANGLES)[number]),
    );
    assert.ok((result.personalization?.qualityScore ?? 0) > 0);
  });

  it("round-trips through the workspace record", () => {
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [
        {
          tone: "soft",
          message: fallbackFor(WHATSAPP),
          source: "fallback",
          personalization: {
            primaryEvidenceId: "ev_website_whatsapp_link",
            angleId: "whatsapp_follow_up_visibility",
            qualityScore: 97,
          },
        },
      ],
      activeTone: "soft",
      now: "2026-07-27T09:00:00.000Z",
    });
    assert.deepEqual(state.drafts.soft?.personalization, {
      primaryEvidenceId: "ev_website_whatsapp_link",
      angleId: "whatsapp_follow_up_visibility",
      qualityScore: 97,
    });
  });

  it("a reply-stage draft carries no personalization", async () => {
    const result = expectGeneratedOutreach(
      await generateOutreachMessage(
        baseParams({
          stance: "follow_up",
          angle: "single-screen-visibility",
          evidence: null,
        }),
      ),
    );
    assert.equal(result.personalization, undefined);
  });
});
