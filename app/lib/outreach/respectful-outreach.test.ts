/**
 * v3.7.9 — the respectful, curiosity-first contract.
 *
 * The warm-tone work (v3.7.6) made the copy sound like a person. A live
 * DeepSeek run then showed what was still wrong: the messages a person was
 * sending told hoteliers, on the strength of a business name and a website
 * flag, that their follow-ups get dropped, their replies are slow, their team
 * is small and their guests are going elsewhere.
 *
 * These tests encode the rule that replaced it: never describe the
 * recipient's operation — not asserted, not hedged, not implied through a
 * knowing generality. That rule is stance-independent (it applies to a reply
 * or a follow-up exactly as much as to a first message), so every fixture
 * here pins `stance: "follow_up"` and uses the reply-stage capability
 * language it was written against. First contact gained its own, stricter
 * contract one sprint later — see `pain-discovery-outreach.test.ts` — which
 * this file does not re-test.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ANGLE_BRIEFS_TR, VARIATION_ANGLES } from "./angles.ts";
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
import { buildOutreachMessageSystem, OUTREACH_MESSAGE_SYSTEM } from "./prompt.ts";
import { buildOutreachSignals } from "./signals.ts";
import {
  MAX_LENGTH,
  MAX_SENTENCES,
  PREFERRED_MAX,
  PREFERRED_MIN,
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

/** A hotel with a website whose WhatsApp link we actually resolved. */
const VERIFIED = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  hasWhatsAppPath: true,
  websiteIntelligence: { hasWhatsAppLink: true },
});

/** Name and city only — the common case, and the one models hallucinate into. */
const SPARSE = buildOutreachSignals({ city: "Antalya", businessType: "Otel" });

function check(message: string, signals = SPARSE) {
  return validateOutreachMessage({
    message,
    signals,
    businessName: "Türkay Otel",
    stance: "follow_up",
  });
}

function failuresOf(message: string, signals = SPARSE): ValidationFailure[] {
  const result = check(message, signals);
  return result.ok ? [] : result.failures;
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

/** Every reply-stage fallback body, across tones and angles. */
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
/* 1–5. the five shapes that came out of the live run                         */
/* -------------------------------------------------------------------------- */

describe("unsupported claims about the recipient", () => {
  it("1. rejects claiming to have examined their messages", () => {
    const failures = failuresOf(
      "Merhaba, Türkay Otel'in mesajlarınızı incelediğimde bir şey dikkatimi çekti. " +
        "TUGOBO talepleri tek ekranda topluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
    );
    assert.ok(failures.includes("false_observation"), failures.join(","));
  });

  it("2. rejects claiming their second follow-up is forgotten", () => {
    const failures = failuresOf(
      "Merhaba, Türkay Otel için yazıyorum. İlk yanıt verilir ama ikinci takip çoğu zaman " +
        "unutuluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
    );
    assert.ok(
      failures.includes("unsupported_operational_claim"),
      failures.join(","),
    );
  });

  it("3. rejects the knowing generality about small teams", () => {
    const failures = failuresOf(
      "Merhaba, Türkay Otel için yazıyorum. Küçük ekiplerde en pahalı iş, işleri takip " +
        "etmek oluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
    );
    assert.ok(failures.includes("condescending_diagnosis"), failures.join(","));
  });

  it("4. rejects telling them their guests go elsewhere", () => {
    const failures = failuresOf(
      "Merhaba, Türkay Otel için yazıyorum. Misafir başka yere bakıyor ve ilgisi soğuyor. " +
        "Uygun olursa kısa bir örnek paylaşabilirim.",
    );
    assert.ok(failures.includes("fear_based_claim"), failures.join(","));
  });

  it("5. rejects asserting their response time is slipping", () => {
    const failures = failuresOf(
      "Merhaba, Türkay Otel için yazıyorum. Gelen mesaj sayısı arttıkça dönüş süreniz " +
        "uzuyor. Uygun olursa kısa bir örnek paylaşabilirim.",
    );
    assert.ok(
      failures.includes("unsupported_operational_claim"),
      failures.join(","),
    );
  });

  it("rejects the whole live-run sample, message for message", () => {
    const observed = [
      "Merhaba, Türkay Otel için yazıyorum. Yoğun günlerde ilk mesajdan sonraki takip kolayca atlanabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      "Merhaba, Türkay Otel'in web sitesinden WhatsApp'a gelen talepleri incelediğimde bir şey gördüm. TUGOBO bunu tek yerde topluyor. Kısa bir örnek paylaşabilirim.",
      "Merhaba, Türkay Otel için yazıyorum. Küçük ekiplerde en pahalı iş, hangi talebin nerede kaldığını hatırlamak oluyor. Kısa bir örnek paylaşabilirim.",
      "Merhaba, Türkay Otel için yazıyorum. Gelen mesaj sayısı arttıkça dönüş süresinin uzaması misafir ilgisini soğutabiliyor. Kısa bir örnek paylaşabilirim.",
      "Merhaba, Türkay Otel için yazıyorum. Booking'e yönlendirilen misafirlerin bir kısmı WhatsApp üzerinden de size ulaşıyor olabilir. Kısa bir örnek paylaşabilirim.",
    ];
    for (const message of observed) {
      assert.equal(check(message, VERIFIED).ok, false, message);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 6–8. what the new contract accepts                                         */
/* -------------------------------------------------------------------------- */

describe("what a respectful first contact may say", () => {
  it("6. accepts a verified public channel observation", () => {
    const message =
      "Merhaba, Türkay Otel için kısa bir fikir paylaşmak istedim. Web sitenizdeki " +
      "WhatsApp bağlantısını gördüm. TUGOBO bu tür talepleri tek ekranda topluyor ve size çok kısa bir örnek paylaşabilirim.";
    assert.deepEqual(failuresOf(message, VERIFIED), []);
  });

  it("6b. still rejects the same observation when it was never verified", () => {
    const message =
      "Merhaba, Türkay Otel için kısa bir fikir paylaşmak istedim. Web sitenizdeki " +
      "WhatsApp bağlantısını gördüm. TUGOBO bu tür talepleri tek ekranda topluyor ve size çok kısa bir örnek paylaşabilirim.";
    const failures = failuresOf(message, SPARSE);
    assert.ok(failures.includes("unverified_claim"), failures.join(","));
  });

  it("7. accepts capability language with no claim about the hotel", () => {
    const message =
      "Merhaba, Türkay Otel için kısa bir fikir paylaşmak istedim. TUGOBO, gelen " +
      "rezervasyon taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek paylaşabilirim.";
    assert.deepEqual(failuresOf(message), []);
  });

  it("8. accepts a respectful question that leaves room to disagree", () => {
    const message =
      "Merhaba, Türkay Otel için kısaca yazmak istedim. TUGOBO, rezervasyon taleplerini " +
      "tek ekranda topluyor. Bu tür bir görünürlük sizin için anlamlı olur mu?";
    assert.deepEqual(failuresOf(message), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 9–11. the fallback bank obeys the same contract                            */
/* -------------------------------------------------------------------------- */

describe("fallback bank", () => {
  it("9. diagnoses nothing about the recipient", () => {
    for (const { message } of FALLBACK_BODIES) {
      const failures = failuresOf(message);
      assert.equal(failures.includes("unsupported_operational_claim"), false, message);
      assert.equal(failures.includes("condescending_diagnosis"), false, message);
      assert.equal(failures.includes("false_observation"), false, message);
    }
  });

  it("10. carries no fear, loss or urgency language", () => {
    for (const { message } of FALLBACK_BODIES) {
      assert.equal(failuresOf(message).includes("fear_based_claim"), false, message);
    }
  });

  it("11. every variant passes the validator outright", () => {
    assert.equal(FALLBACK_BODIES.length, 15);
    for (const { message } of FALLBACK_BODIES) {
      assert.deepEqual(failuresOf(message), [], message);
    }
  });

  it("11b. the demo-confirmation bank passes too", () => {
    for (const tone of TONES) {
      const { message } = buildFallbackMessage({
        tone,
        businessName: "Türkay Otel",
        city: "Antalya",
        rotation: 0,
        stance: "demo_confirm",
      });
      assert.deepEqual(failuresOf(message), [], message);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 12–13. the provider path                                                   */
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

const DIAGNOSING =
  "Merhaba, Türkay Otel için yazıyorum. Yoğun günlerde ilk mesajdan sonraki takip kolayca " +
  "atlanabiliyor. Uygun olursa kısa bir örnek paylaşabilirim.";

const RESPECTFUL =
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
    signals: SPARSE,
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
  it("12. retries once on a different angle after a diagnosing message", async () => {
    const { provider, callCount, calls } = fakeProvider([
      { message: DIAGNOSING },
      { message: RESPECTFUL },
    ]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(callCount(), 2, "exactly one retry");
    assert.equal(result.source, "provider");
    assert.equal(result.message, RESPECTFUL);
    assert.notEqual(
      calls[0].user.split("VARIATION ANGLE: ")[1],
      calls[1].user.split("VARIATION ANGLE: ")[1],
      "the retry must move to a different angle",
    );
  });

  it("13. falls back to the safe bank when both attempts diagnose", async () => {
    const { provider, callCount } = fakeProvider([{ message: DIAGNOSING }]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.deepEqual(failuresOf(result.message), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 14–15. shape                                                               */
/* -------------------------------------------------------------------------- */

describe("message shape (reply stage)", () => {
  it("14. caps a reply-stage message at 300 characters", () => {
    assert.equal(MAX_LENGTH, 300);
    assert.equal(PREFERRED_MIN, 140);
    assert.equal(PREFERRED_MAX, 240);

    const long = `${RESPECTFUL} ${"Ek bir cümle daha. ".repeat(10)}`;
    assert.ok(failuresOf(long).includes("too_long"));
  });

  it("15. caps a reply-stage message at three sentences", () => {
    assert.equal(MAX_SENTENCES, 3);
    const four =
      "Merhaba, Türkay Otel için yazıyorum. TUGOBO talepleri tek ekranda topluyor. " +
      "Kurulum kısa sürüyor. Uygun olursa çok kısa bir örnek paylaşabilirim.";
    assert.ok(failuresOf(four).includes("too_many_sentences"));
    assert.equal(sentenceCount(four), 4);
  });

  it("keeps every fallback variant inside the shape rules", () => {
    for (const { message } of FALLBACK_BODIES) {
      assert.ok(message.length <= MAX_LENGTH, `${message.length}: ${message}`);
      assert.ok(sentenceCount(message) <= MAX_SENTENCES, message);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 16–17. copy version and the founder's own words                            */
/* -------------------------------------------------------------------------- */

describe("copy version", () => {
  const NOW = "2026-07-24T09:00:00.000Z";

  /*
   * Not hardcoded to a specific number: this file predates the Product
   * Capability Truth Guard sprint, which bumped CURRENT_COPY_VERSION again
   * (3 → 4). What this test actually protects — every fresh generation is
   * stamped with whatever "current" is — does not change with the bump.
   */
  it("16. stamps new generations with the current copy version", () => {
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [{ tone: "soft", message: RESPECTFUL, source: "provider" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(state.drafts.soft?.copyVersion, CURRENT_COPY_VERSION);
  });

  it("17. never rewrites or discards a manual draft", () => {
    const handwritten = "Kendi yazdığım mesaj, aynen kalmalı.";
    const state = applyManualDraft(
      emptyMessageWorkspace(),
      "soft",
      handwritten,
      NOW,
    );
    assert.equal(state.drafts.soft?.message, handwritten);
    assert.equal(state.drafts.soft?.source, "manual");

    // A later generation for another tone must not touch it either.
    const after = applyGeneratedDrafts(state, {
      entries: [{ tone: "direct", message: RESPECTFUL, source: "provider" }],
      activeTone: "direct",
      now: NOW,
    });
    assert.equal(after.drafts.soft?.message, handwritten);
    assert.equal(after.drafts.soft?.source, "manual");
  });
});

/* -------------------------------------------------------------------------- */
/* 18–19. guards that must survive the calibration                            */
/* -------------------------------------------------------------------------- */

describe("existing guards still hold", () => {
  it("18. the sender identity guard still rejects an invented name", () => {
    const invented =
      "Merhaba, ben Tuğrul. Türkay Otel için kısa bir fikir paylaşmak istedim; TUGOBO " +
      "gelen rezervasyon taleplerini tek ekranda topluyor. Çok kısa bir örnek gönderebilirim.";
    const failures = failuresOf(invented);
    assert.deepEqual(failures, ["invented_sender_identity"]);
  });

  it("18b. a configured sender name is still allowed through", () => {
    const named =
      "Merhaba, ben Ayşe. Türkay Otel için kısa bir fikir paylaşmak istedim; TUGOBO " +
      "gelen rezervasyon taleplerini tek ekranda topluyor. Çok kısa bir örnek gönderebilirim.";
    const result = validateOutreachMessage({
      message: named,
      signals: SPARSE,
      businessName: "Türkay Otel",
      senderName: "Ayşe",
      stance: "follow_up",
    });
    assert.equal(result.ok, true);
  });

  it("19. the source badge stays truthful", async () => {
    assert.equal(draftSourceLabel("provider"), "AI üretimi");
    assert.equal(draftSourceLabel("fallback"), "Güvenli şablon");
    assert.equal(draftSourceLabel("manual"), "Manuel düzenleme");

    const { provider } = fakeProvider([{ message: DIAGNOSING }]);
    const rejected = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(
      draftSourceLabel(rejected.source),
      "Güvenli şablon",
      "a rejected provider result must never be labelled AI üretimi",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* the prompt and the angle bank                                              */
/* -------------------------------------------------------------------------- */

describe("prompt guard", () => {
  it("states the respect contract in Turkish", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /SAYGI SÖZLEŞMESİ/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /İÇ OPERASYONUNA TEŞHİS KOYMA/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /Korku, kayıp, aciliyet/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /YETENEK olarak anlat/);
  });

  it("states the same contract in English", () => {
    for (const line of [
      "Do not diagnose the hotel's internal operations.",
      "Do not claim you examined their messages, response times, team size, missed follow-ups or lost reservations.",
      "Do not use fear, loss or urgency claims.",
      "Use only one verified public signal.",
      "Describe TUGOBO as a capability, not as a cure for an assumed problem.",
      "Write with humility and curiosity.",
      "The recipient should never feel judged, monitored or lectured.",
    ]) {
      assert.ok(OUTREACH_MESSAGE_SYSTEM.includes(line), line);
    }
  });

  it("keeps likely signals out of the message body", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /LIKELY SIGNALS bir varsayımdır/);
  });
});

describe("angle bank", () => {
  it("names no angle after an assumed problem", () => {
    for (const angle of VARIATION_ANGLES) {
      assert.equal(
        /(missed|response-speed|workload|lost|abandon|operations)/i.test(angle),
        false,
        angle,
      );
    }
  });

  it("gives every angle a brief that forbids a diagnosis", () => {
    for (const angle of VARIATION_ANGLES) {
      const brief = ANGLE_BRIEFS_TR[angle];
      assert.ok(brief.length > 0, angle);
      assert.match(
        brief,
        /(etme|söyleme|yapma|kayma|iddia etme|ima etme)/,
        `${angle} brief must state a boundary`,
      );
    }
  });
});
