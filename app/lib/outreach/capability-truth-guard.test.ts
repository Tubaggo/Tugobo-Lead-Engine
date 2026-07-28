/**
 * v3.7.9 — Product Capability Truth Guard.
 *
 * The respectful-outreach calibration (same sprint, `respectful-outreach.test.ts`)
 * stopped the model from diagnosing the recipient. It did nothing to stop the
 * model from overselling the *product* to compensate: a live DeepSeek run with
 * the respect contract already active produced "gelen mesajlarınızı otomatik
 * olarak takip edip yanıtlayabiliyorsunuz" — respectful in tone, grounded in
 * no signal about the hotel, and simply untrue. TUGOBO does not auto-reply;
 * every outbound message is a human opening WhatsApp themselves.
 *
 * These tests encode the boundary: a message may describe visibility,
 * organization and AI-assisted support (what `capabilities.ts` calls
 * supported), and may never claim automatic sending, autonomous replying, or
 * a guaranteed business outcome (conversion, revenue, avoided loss). That
 * boundary is stance-independent, so every fixture here pins `stance:
 * "follow_up"` and uses reply-stage capability language — first contact's own,
 * stricter contract (no product pitch at all) lives in
 * `pain-discovery-outreach.test.ts`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OUTREACH_CAPABILITIES,
  SAFE_CAPABILITY_CLAIMS_TR,
  UNSUPPORTED_CAPABILITY_CLAIMS_TR,
  buildProductTruthContract,
} from "./capabilities.ts";
import { TONES, type Tone } from "./contract.ts";
import {
  expectGeneratedOutreach,
  generateOutreachMessage as generateRaw,
  type GenerateParams,
  type OutreachProvider,
  type ProviderOutput,
} from "./engine.ts";
import { buildFallbackMessage, REPLY_FALLBACK_ANGLES } from "./fallback.ts";

/** Reply-stage only: every generation here returns a message. */
const generateOutreachMessage = (params: GenerateParams) =>
  generateRaw(params).then(expectGeneratedOutreach);
import {
  buildOutreachMessageSystem,
  buildOutreachUserPrompt,
  OUTREACH_MESSAGE_SYSTEM,
} from "./prompt.ts";
import { buildOutreachSignals } from "./signals.ts";
import {
  validateOutreachMessage,
  type ValidationFailure,
} from "./validator.ts";
import {
  applyGeneratedDrafts,
  applyManualDraft,
  CURRENT_COPY_VERSION,
  draftSourceLabel,
  emptyMessageWorkspace,
} from "./workspace.ts";

const SIGNALS = buildOutreachSignals({ city: "Antalya", businessType: "Otel" });

function check(message: string) {
  return validateOutreachMessage({
    message,
    signals: SIGNALS,
    businessName: "Türkay Otel",
    stance: "follow_up",
  });
}

function failuresOf(message: string): ValidationFailure[] {
  const result = check(message);
  return result.ok ? [] : result.failures;
}

/** Wraps a bare claim fragment in an otherwise-clean, on-topic message. */
function messageWithClaim(claim: string): string {
  return `Merhaba, Türkay Otel için kısa bir fikir paylaşmak istedim. TUGOBO ${claim}. Uygun olursa çok kısa bir örnek paylaşabilirim.`;
}

const FALLBACK_BODIES = TONES.flatMap((tone) =>
  REPLY_FALLBACK_ANGLES.map((_, rotation) =>
    buildFallbackMessage({
      tone,
      businessName: "Türkay Otel",
      city: "Antalya",
      rotation,
      stance: "follow_up",
    }),
  ),
);

/* -------------------------------------------------------------------------- */
/* 1–9. the required rejections                                               */
/* -------------------------------------------------------------------------- */

describe("unsupported product claims", () => {
  it("1. rejects 'otomatik yanıtlar'", () => {
    const failures = failuresOf(messageWithClaim("gelen mesajlara otomatik yanıtlar"));
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("2. rejects 'otomatik gönderir'", () => {
    const failures = failuresOf(messageWithClaim("takip mesajını otomatik gönderir"));
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("3. rejects 'kendiliğinden cevap verir'", () => {
    const failures = failuresOf(messageWithClaim("gelen taleplere kendiliğinden cevap verir"));
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("4. rejects 'insan müdahalesi olmadan'", () => {
    const failures = failuresOf(
      messageWithClaim("insan müdahalesi olmadan talepleri yönetir"),
    );
    assert.ok(failures.includes("autonomous_action_claim"), failures.join(","));
  });

  it("5. rejects 'rezervasyona dönüştürür'", () => {
    const failures = failuresOf(messageWithClaim("gelen talebi rezervasyona dönüştürür"));
    assert.ok(failures.includes("guaranteed_business_outcome"), failures.join(","));
  });

  it("6. rejects 'satışa çevirir'", () => {
    const failures = failuresOf(messageWithClaim("gelen ilgiyi satışa çevirir"));
    assert.ok(failures.includes("guaranteed_business_outcome"), failures.join(","));
  });

  it("7. rejects 'geliri artırır'", () => {
    const failures = failuresOf(messageWithClaim("otelin gelirini artırır"));
    assert.ok(failures.includes("guaranteed_business_outcome"), failures.join(","));
  });

  it("8. rejects 'kaybı önler'", () => {
    const failures = failuresOf(messageWithClaim("rezervasyon kaybını önler"));
    assert.ok(failures.includes("guaranteed_business_outcome"), failures.join(","));
  });

  it("9. rejects 'garanti eder'", () => {
    const failures = failuresOf(messageWithClaim("daha fazla rezervasyon garanti eder"));
    assert.ok(failures.includes("guaranteed_business_outcome"), failures.join(","));
  });

  it("covers the language variations the spec calls out explicitly", () => {
    const variants = [
      "gelen talebi rezervasyona dönüştürebilirsiniz",
      "gelirinizi artırabilirsiniz",
      "rezervasyon kaybını önleyebilirsiniz",
      "talepleri otomatik olarak takip edip yanıtlayabiliyorsunuz",
      "işleri kendiliğinden hallediyor",
    ];
    for (const variant of variants) {
      const failures = failuresOf(messageWithClaim(variant));
      assert.ok(
        failures.includes("guaranteed_business_outcome") ||
          failures.includes("autonomous_action_claim") ||
          failures.includes("unsupported_product_capability"),
        `${variant}: ${failures.join(",")}`,
      );
    }
  });

  it("rejects the exact live-run claim that motivated this guard", () => {
    const observed =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. TUGOBO ile " +
      "gelen mesajlarınızı otomatik olarak takip edip yanıtlayabiliyorsunuz. Size 2 dakikalık " +
      "bir örnek gönderebilir miyim?";
    const failures = failuresOf(observed);
    assert.ok(failures.includes("autonomous_action_claim"), failures.join(","));
  });
});

/* -------------------------------------------------------------------------- */
/* 10–13. safe claims must not false-positive                                 */
/* -------------------------------------------------------------------------- */

describe("safe product claims", () => {
  it("10. accepts 'talepleri tek ekranda toplar'", () => {
    assert.deepEqual(failuresOf(messageWithClaim("talepleri tek ekranda toplar")), []);
  });

  it("11. accepts 'takip bekleyenleri gösterir'", () => {
    assert.deepEqual(failuresOf(messageWithClaim("takip bekleyenleri gösterir")), []);
  });

  it("12. accepts 'yanıt hazırlamayı kolaylaştırır'", () => {
    assert.deepEqual(failuresOf(messageWithClaim("yanıt hazırlamayı kolaylaştırır")), []);
  });

  it("13. accepts 'insan gözetimiyle ilerler'", () => {
    assert.deepEqual(failuresOf(messageWithClaim("insan gözetimiyle ilerler")), []);
  });

  it("every entry in the safe capability bank passes on its own", () => {
    for (const claim of SAFE_CAPABILITY_CLAIMS_TR) {
      const failures = failuresOf(messageWithClaim(claim));
      assert.deepEqual(failures, [], `${claim}: ${failures.join(",")}`);
    }
  });

  it("every entry in the unsupported bank is rejected on its own", () => {
    for (const claim of UNSUPPORTED_CAPABILITY_CLAIMS_TR) {
      const failures = failuresOf(messageWithClaim(claim));
      assert.ok(failures.length > 0, `${claim} should have been rejected`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 14–15. the fallback bank obeys the same contract                           */
/* -------------------------------------------------------------------------- */

describe("fallback bank", () => {
  it("14. carries no unsupported product claim", () => {
    for (const { message } of FALLBACK_BODIES) {
      const failures = failuresOf(message);
      assert.equal(failures.includes("unsupported_product_capability"), false, message);
      assert.equal(failures.includes("guaranteed_business_outcome"), false, message);
      assert.equal(failures.includes("autonomous_action_claim"), false, message);
    }
  });

  it("15. every fallback variant passes the validator outright", () => {
    assert.equal(FALLBACK_BODIES.length, 15);
    for (const { message } of FALLBACK_BODIES) {
      assert.deepEqual(failuresOf(message), [], message);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 16–17. provider retry and fallback                                         */
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
  return { provider, callCount: () => calls.length, calls };
}

const OVERSELLING =
  "Merhaba, Türkay Otel için kısa bir fikir paylaşmak istedim. TUGOBO ile gelen " +
  "mesajlarınızı otomatik olarak takip edip yanıtlayabiliyorsunuz. Uygun olursa çok kısa " +
  "bir örnek paylaşabilirim.";

const TRUTHFUL =
  "Merhaba, Türkay Otel için kısa bir fikir paylaşmak istedim. TUGOBO, gelen rezervasyon " +
  "taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek paylaşabilirim.";

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    leadId: "gmaps-turkay",
    businessName: "Türkay Otel",
    city: "Antalya",
    businessType: "Otel",
    tone: "soft" as Tone,
    angle: "single-screen-visibility" as const,
    signals: SIGNALS,
    previousMessages: [] as string[],
    generationNonce: "n1",
    rotation: 0,
    provider: null as OutreachProvider | null,
    systemPrompt: buildOutreachMessageSystem("follow_up"),
    stance: "follow_up" as const,
    ...overrides,
  };
}

describe("provider retry and fallback", () => {
  it("16. retries once on a different angle after an unsupported claim", async () => {
    const { provider, callCount, calls } = fakeProvider([
      { message: OVERSELLING },
      { message: TRUTHFUL },
    ]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(callCount(), 2, "exactly one retry");
    assert.equal(result.source, "provider");
    assert.equal(result.message, TRUTHFUL);
    assert.notEqual(
      calls[0].user.split("VARIATION ANGLE: ")[1],
      calls[1].user.split("VARIATION ANGLE: ")[1],
      "the retry must move to a different angle",
    );
  });

  it("17. falls back to the safe bank when both attempts oversell", async () => {
    const { provider, callCount } = fakeProvider([{ message: OVERSELLING }]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.deepEqual(failuresOf(result.message), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 18–19. copy version and manual drafts                                      */
/* -------------------------------------------------------------------------- */

describe("copy version", () => {
  const NOW = "2026-07-24T09:00:00.000Z";

  /*
   * Not hardcoded: this file predates the Conversation-First Pain Discovery
   * sprint, which bumped CURRENT_COPY_VERSION again (4 → 5). What this test
   * protects — every fresh generation stamped with whatever "current" is —
   * does not change with the bump.
   */
  it("18. stamps new generations with the current copy version", () => {
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [{ tone: "soft", message: TRUTHFUL, source: "provider" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(state.drafts.soft?.copyVersion, CURRENT_COPY_VERSION);
  });

  it("19. never rewrites or discards a manual draft", () => {
    const handwritten = "Kendi yazdığım mesaj, aynen kalmalı.";
    const state = applyManualDraft(emptyMessageWorkspace(), "soft", handwritten, NOW);
    assert.equal(state.drafts.soft?.message, handwritten);
    assert.equal(state.drafts.soft?.source, "manual");

    const after = applyGeneratedDrafts(state, {
      entries: [{ tone: "direct", message: TRUTHFUL, source: "provider" }],
      activeTone: "direct",
      now: NOW,
    });
    assert.equal(after.drafts.soft?.message, handwritten);
    assert.equal(after.drafts.soft?.source, "manual");
  });
});

/* -------------------------------------------------------------------------- */
/* 20–22. guards that must survive this sprint                                */
/* -------------------------------------------------------------------------- */

describe("existing guards still hold", () => {
  it("20. the sender identity guard still rejects an invented name", () => {
    const invented =
      "Merhaba, ben Tuğrul. Türkay Otel için kısa bir fikir paylaşmak istedim; TUGOBO " +
      "gelen rezervasyon taleplerini tek ekranda topluyor. Çok kısa bir örnek gönderebilirim.";
    const failures = failuresOf(invented);
    assert.deepEqual(failures, ["invented_sender_identity"]);
  });

  it("21. the respectful-outreach guard still rejects a diagnosis", () => {
    const diagnosing =
      "Merhaba, Türkay Otel için yazıyorum. Yoğun günlerde ilk mesajdan sonraki takip " +
      "kolayca atlanabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.";
    const failures = failuresOf(diagnosing);
    assert.ok(failures.includes("unsupported_operational_claim"), failures.join(","));
  });

  it("22. the source badge stays truthful when a claim is rejected", async () => {
    assert.equal(draftSourceLabel("provider"), "AI üretimi");
    assert.equal(draftSourceLabel("fallback"), "Güvenli şablon");

    const { provider } = fakeProvider([{ message: OVERSELLING }]);
    const rejected = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(
      draftSourceLabel(rejected.source),
      "Güvenli şablon",
      "a rejected provider result must never be labelled AI üretimi",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* the capability contract itself                                             */
/* -------------------------------------------------------------------------- */

describe("capability contract", () => {
  it("names auto-send and autonomous reply as unsupported", () => {
    assert.equal(OUTREACH_CAPABILITIES.automaticSend, false);
    assert.equal(OUTREACH_CAPABILITIES.autonomousReply, false);
    assert.equal(OUTREACH_CAPABILITIES.guaranteedConversion, false);
    assert.equal(OUTREACH_CAPABILITIES.guaranteedRevenueLift, false);
    assert.equal(OUTREACH_CAPABILITIES.guaranteedLossPrevention, false);
  });

  it("names channel aggregation and human supervision as supported", () => {
    assert.equal(OUTREACH_CAPABILITIES.channelAggregation, true);
    assert.equal(OUTREACH_CAPABILITIES.followUpVisibility, true);
    assert.equal(OUTREACH_CAPABILITIES.humanSupervision, true);
  });

  it("the system prompt states the contract in Turkish and English", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /ÜRÜN GERÇEĞİ SÖZLEŞMESİ/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /PRODUCT TRUTH CONTRACT/);
    assert.match(
      OUTREACH_MESSAGE_SYSTEM,
      /Never claim automatic sending, autonomous replying, guaranteed conversion/,
    );
    assert.match(OUTREACH_MESSAGE_SYSTEM, /TUGOBO operates with human supervision/);
  });

  it("the prompt's contract text is generated from the capability flags, not duplicated by hand", () => {
    assert.ok(OUTREACH_MESSAGE_SYSTEM.includes(buildProductTruthContract()));
  });

  it("free-text TUGOBO FIT reasons are marked as context only, never as claim material", () => {
    // The vector that produced the live-run failure: raw sales-scoring labels
    // ("High ROI Potential", "High direct booking opportunity") handed to the
    // model as if they were things the product does.
    const prompt = buildOutreachUserPrompt({
      businessName: "Türkay Otel",
      city: "Antalya",
      tone: "soft",
      angle: "single-screen-visibility",
      signals: SIGNALS,
      tugoboFit: { reasons: ["High ROI Potential", "High direct booking opportunity"] },
      previousMessages: [],
      generationNonce: "n1",
    });
    assert.match(prompt, /ürün iddiası olarak KULLANMA/);
    assert.match(prompt, /hiçbirini alıntılama/);
  });
});
