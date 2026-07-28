/**
 * v3.7.9 — Conversation-First Pain Discovery.
 *
 * Every rule from the respectful and product-truth calibrations (same sprint)
 * was already satisfied and a manual UI pass still found the messages weak:
 * they read as SaaS copy because they explained TUGOBO in the very first
 * message instead of asking the recipient anything. A message that explains
 * the product is not opening a conversation, it is trying to close one that
 * never started.
 *
 * These tests encode that fix and, where the High-Relevance Account-Specific
 * calibration later superseded it, the replacement. Two things changed under
 * this file:
 *
 *  - the exact-single-signal rule became an evidence-cluster contract (one
 *    primary, plus one supporting item in the same operational flow), so the
 *    two-signal rejections here now assert the *undeclared* second signal is
 *    what fails, not the second signal as such;
 *  - a respectful question that could be asked of any hotel is no longer a
 *    pass. The three "accepts a generic question" cases below became
 *    rejections, which is the single most load-bearing change of that sprint:
 *    those exact messages went out and earned nothing.
 *
 * `follow_up` and `demo_confirm` remain untouched by both calibrations —
 * those stages have already earned the right to explain the product and ask
 * for a demo.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCOUNT_ANGLES,
  ANGLE_BRIEFS_TR,
  FIRST_CONTACT_ANGLES,
} from "./angles.ts";
import { TONES, type Tone } from "./contract.ts";
import {
  expectGeneratedOutreach,
  generateOutreachMessage as generateRaw,
  type GenerateParams,
  type OutreachProvider,
  type ProviderOutput,
} from "./engine.ts";
import {
  buildPersonalizationEvidence,
  selectEvidence,
  type EvidenceSelection,
} from "./evidence.ts";
import { buildAccountFallbackMessage, buildFallbackMessage } from "./fallback.ts";
import { buildOutreachMessageSystem, OUTREACH_MESSAGE_SYSTEM } from "./prompt.ts";
import { buildOutreachSignals } from "./signals.ts";
import {
  FIRST_CONTACT_MAX_LENGTH,
  FIRST_CONTACT_MAX_SENTENCES,
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

/** Name and city only. */
const SPARSE = buildOutreachSignals({ city: "Antalya", businessType: "Otel" });

/** A hotel with BOTH a verified WhatsApp link and a verified booking CTA. */
const VERIFIED_MULTI = buildOutreachSignals({
  city: "Antalya",
  businessType: "Otel",
  hasOwnWebsite: true,
  hasWhatsAppPath: true,
  websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true },
});

const WHATSAPP_EVIDENCE = selectEvidence(
  buildPersonalizationEvidence({ websiteIntelligence: { hasWhatsAppLink: true } }),
)!;

function check(message: string, signals = SPARSE, evidence?: EvidenceSelection) {
  return validateOutreachMessage({
    message,
    signals,
    businessName: "Türkay Otel",
    evidence,
  });
}

function failuresOf(
  message: string,
  signals = SPARSE,
  evidence?: EvidenceSelection,
): ValidationFailure[] {
  const result = check(message, signals, evidence);
  return result.ok ? [] : result.failures;
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

/** The account bank, across tones and the angles a WhatsApp hook supports. */
const FIRST_CONTACT_BODIES = TONES.flatMap((tone) =>
  [0, 1, 2].map((rotation) =>
    buildAccountFallbackMessage({
      tone,
      businessName: "Türkay Otel",
      evidence: WHATSAPP_EVIDENCE,
      rotation,
    }),
  ),
);

/* -------------------------------------------------------------------------- */
/* 1–4. product pitch and demo-offer rejections                               */
/* -------------------------------------------------------------------------- */

describe("first contact rejects the old capability-pitch shape", () => {
  it("1. rejects a message whose body is a product pitch", () => {
    const message =
      "Merhaba, Türkay Otel için yazıyorum. TUGOBO, cevap bekleyen talebi siz kapatana " +
      "kadar görünür tutuyor.";
    assert.ok(failuresOf(message).includes("first_contact_product_pitch"), failuresOf(message).join(","));
  });

  it("2. rejects a message that offers a demo", () => {
    const message =
      "Merhaba, Türkay Otel için yazıyorum. Kısa bir görüşmede TUGOBO'nun nasıl çalıştığını " +
      "gösterebilirim; demo yapabiliriz mi?";
    assert.ok(failuresOf(message).includes("first_contact_demo_offer"), failuresOf(message).join(","));
  });

  it("3. rejects 'örnek gönderebilirim'", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Size kısa " +
      "bir örnek gönderebilirim.";
    assert.ok(
      failuresOf(message, VERIFIED).includes("first_contact_demo_offer"),
      failuresOf(message, VERIFIED).join(","),
    );
  });

  it("4. rejects '2 dakikada gösterebilirim'", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Nasıl " +
      "çalıştığını 2 dakikada gösterebilirim.";
    assert.ok(
      failuresOf(message, VERIFIED).includes("first_contact_demo_offer"),
      failuresOf(message, VERIFIED).join(","),
    );
  });

  it("rejects the exact shapes a manual UI pass flagged as weak", () => {
    const observed = [
      "Merhaba, Türkay Otel için yazıyorum. TUGOBO, cevap bekleyen talebi siz kapatana kadar görünür tutuyor.",
      "Merhaba, Türkay Otel için yazıyorum. TUGOBO, rezervasyon taleplerini web ve WhatsApp'tan tek ekranda topluyor.",
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Kısa bir örnek gönderebilirim, sizin için anlamlı olur mu?",
    ];
    for (const message of observed) {
      assert.equal(check(message, VERIFIED).ok, false, message);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5–6. the question requirement                                              */
/* -------------------------------------------------------------------------- */

describe("first contact requires exactly one question", () => {
  it("5. rejects a message with no question at all", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Kısa bir " +
      "not bırakmak istedim.";
    assert.ok(
      failuresOf(message, VERIFIED).includes("missing_operational_question"),
      failuresOf(message, VERIFIED).join(","),
    );
  });

  it("6. rejects a message with two questions", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Buradan gelen " +
      "talepleri nasıl takip ediyorsunuz? Ekipte kaç kişi bakıyor?";
    assert.ok(
      failuresOf(message, VERIFIED).includes("too_many_questions"),
      failuresOf(message, VERIFIED).join(","),
    );
  });

  it("recognises '...merak ettim.' as a question with no '?' needed", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Buradan gelen " +
      "talepleri hangi yöntemle takip ettiğinizi merak ettim.";
    assert.equal(failuresOf(message, VERIFIED).includes("missing_operational_question"), false);
  });
});

/* -------------------------------------------------------------------------- */
/* 7–9. what a respectful first contact may say                               */
/* -------------------------------------------------------------------------- */

describe("first contact accepts a genuine operational question", () => {
  /*
   * SUPERSEDED by the account-specificity contract. This message was the
   * v5 gold standard and it is exactly what the High-Relevance sprint
   * removed: respectful, grounded, honest — and sendable verbatim to any
   * hotel in the country, which is why it earned nothing.
   */
  it("7. rejects a respectful question that could be asked of any hotel", () => {
    const message =
      "Merhaba, Türkay Otel için kısa bir şey merak ettim. Gelen talepleri ekip içinde " +
      "şu anda kim takip ediyor, nasıl ilerliyor?";
    assert.ok(
      failuresOf(message).includes("generic_reusable_message"),
      failuresOf(message).join(","),
    );
  });

  it("8. accepts a question grounded in a verified WhatsApp signal", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Buradan gelen " +
      "taleplerin son durumunu nasıl takip ediyorsunuz?";
    assert.deepEqual(failuresOf(message, VERIFIED), []);
  });

  it("8b. asserting a WhatsApp channel outright is still unverified_claim without the signal", () => {
    const message =
      "Merhaba, Türkay Otel için yazıyorum. WhatsApp'ınızdan gelen taleplerin son durumunu " +
      "nasıl takip ediyorsunuz?";
    assert.ok(failuresOf(message, SPARSE).includes("unverified_claim"));
  });

  /* Also superseded: no diagnosis, and no reason for the reader to reply. */
  it("9. rejects an ungrounded follow-up-method question", () => {
    const message =
      "Merhaba, Türkay Otel için yazıyorum. İlk yanıttan sonra açık kalan talepleri hangi " +
      "yöntemle takip ediyorsunuz?";
    assert.ok(
      failuresOf(message).includes("generic_reusable_message"),
      failuresOf(message).join(","),
    );
  });

  it("accepts an optional, single short product mention", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm; bu akışı " +
      "görünür kılan bir sistem üzerinde çalışıyorum. Buradan gelen talepleri nasıl takip ediyorsunuz?";
    assert.deepEqual(failuresOf(message, VERIFIED), []);
  });
});

/* -------------------------------------------------------------------------- */
/* 10–12. the earlier guards still apply to first contact                     */
/* -------------------------------------------------------------------------- */

describe("earlier guards still apply inside a question", () => {
  it("10. no diagnosis smuggled into the question", () => {
    const message =
      "Merhaba, Türkay Otel için yazıyorum. Yoğun günlerde ikinci takip unutuluyor mu?";
    const failures = failuresOf(message);
    assert.ok(
      failures.includes("condescending_diagnosis") ||
        failures.includes("unsupported_operational_claim"),
      failures.join(","),
    );
  });

  it("11. no fear language smuggled into the question", () => {
    const message =
      "Merhaba, Türkay Otel için yazıyorum. Misafirleriniz başka yere bakıyor mu?";
    assert.ok(failuresOf(message).includes("fear_based_claim"), failuresOf(message).join(","));
  });

  it("12. no unsupported capability smuggled into the optional product mention", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm; TUGOBO gelen " +
      "mesajlarınızı otomatik olarak yanıtlıyor. Bu sizin için anlamlı olur mu?";
    const failures = failuresOf(message, VERIFIED);
    assert.ok(
      failures.includes("autonomous_action_claim") ||
        failures.includes("unsupported_product_capability"),
      failures.join(","),
    );
  });

  it("13. the sender identity guard still rejects an invented name", () => {
    const message =
      "Merhaba, ben Tuğrul; Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. " +
      "Buradan gelen talepleri nasıl takip ediyorsunuz?";
    const failures = failuresOf(message, VERIFIED);
    assert.deepEqual(failures, ["invented_sender_identity"]);
  });
});

/* -------------------------------------------------------------------------- */
/* 14–17. the first-contact fallback bank                                     */
/* -------------------------------------------------------------------------- */

describe("first-contact fallback bank", () => {
  it("14. every variant closes on exactly one question", () => {
    for (const { message } of FIRST_CONTACT_BODIES) {
      const questionMarks = (message.match(/\?/g) ?? []).length;
      const indirect = /merak ettim\.?\s*$/i.test(message);
      assert.ok(questionMarks === 1 || (questionMarks === 0 && indirect), message);
      assert.ok(questionMarks <= 1, message);
    }
  });

  it("15. no fallback variant pitches the product", () => {
    for (const { message } of FIRST_CONTACT_BODIES) {
      assert.equal(
        failuresOf(message, VERIFIED, WHATSAPP_EVIDENCE).includes("first_contact_product_pitch"),
        false,
        message,
      );
    }
  });

  it("16. no fallback variant offers a demo, example or meeting", () => {
    for (const { message } of FIRST_CONTACT_BODIES) {
      assert.equal(
        failuresOf(message, VERIFIED, WHATSAPP_EVIDENCE).includes("first_contact_demo_offer"),
        false,
        message,
      );
    }
  });

  it("17. all 9 variants pass the validator outright", () => {
    assert.equal(FIRST_CONTACT_BODIES.length, 9);
    for (const { message } of FIRST_CONTACT_BODIES) {
      assert.deepEqual(failuresOf(message, VERIFIED, WHATSAPP_EVIDENCE), [], message);
    }
  });

  it("covers the WhatsApp hook's three angles across 3 tones with real variety", () => {
    const seen = new Set(FIRST_CONTACT_BODIES.map((b) => b.message));
    assert.equal(seen.size, 9, "no two variants collapse to the same text");
  });
});

/* -------------------------------------------------------------------------- */
/* 18–19. provider retry and fallback                                         */
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

const generateOutreachMessage = (params: GenerateParams) =>
  generateRaw(params).then(expectGeneratedOutreach);

const PITCHING =
  "Merhaba, Türkay Otel için yazıyorum. TUGOBO, cevap bekleyen talebi siz kapatana kadar " +
  "görünür tutuyor.";

const GROUNDED_QUESTION =
  "Merhaba, Türkay Otel'in web sitesindeki WhatsApp rezervasyon bağlantısını gördüm. " +
  "Kısaca merak ettim: buradan gelen talepleri ekip içinde nasıl takip ediyorsunuz?";

function baseParams(overrides: Partial<GenerateParams> = {}): GenerateParams {
  return {
    leadId: "gmaps-turkay",
    businessName: "Türkay Otel",
    city: "Antalya",
    businessType: "Otel",
    tone: "soft" as Tone,
    angle: "whatsapp_follow_up_visibility" as const,
    signals: VERIFIED,
    previousMessages: [] as string[],
    generationNonce: "n1",
    rotation: 0,
    provider: null as OutreachProvider | null,
    systemPrompt: OUTREACH_MESSAGE_SYSTEM,
    evidence: WHATSAPP_EVIDENCE,
    ...overrides,
  };
}

describe("provider retry and fallback (first contact)", () => {
  it("18. retries once on a different question angle after a product pitch", async () => {
    const { provider, callCount, calls } = fakeProvider([
      { message: PITCHING },
      { message: GROUNDED_QUESTION },
    ]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(callCount(), 2, "exactly one retry");
    assert.equal(result.source, "provider");
    assert.equal(result.message, GROUNDED_QUESTION);
    assert.notEqual(
      calls[0].user.split("VARIATION ANGLE: ")[1],
      calls[1].user.split("VARIATION ANGLE: ")[1],
      "the retry must move to a different angle",
    );
    for (const call of calls) {
      assert.match(call.user, /İLİŞKİ DURUMU: first_contact/);
    }
  });

  it("19. falls back to the account bank after a second invalid output", async () => {
    const { provider, callCount } = fakeProvider([{ message: PITCHING }]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.deepEqual(failuresOf(result.message, VERIFIED, WHATSAPP_EVIDENCE), []);
    assert.ok((result.message.match(/\?/g) ?? []).length <= 1);
  });
});

/* -------------------------------------------------------------------------- */
/* 20–21. shape                                                               */
/* -------------------------------------------------------------------------- */

describe("first-contact shape", () => {
  it("20. caps a first-contact message at 320 characters", () => {
    assert.equal(FIRST_CONTACT_MAX_LENGTH, 320);
    const long =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm; " +
      "buradan gelen talebi hangi ekip üyesinin hangi aşamada, ne sıklıkla, hangi araçla, " +
      "hangi saatte, hangi öncelikle, hangi sırayla, hangi listede, hangi kanalda ve hangi " +
      "yöntemle takip ettiğini, ayrıca bunu kimin ne zaman kontrol ettiğini gerçekten çok " +
      "merak ediyorum, anlatır mısınız?";
    assert.ok(long.length > FIRST_CONTACT_MAX_LENGTH, `fixture must exceed the cap (${long.length})`);
    assert.ok(failuresOf(long, VERIFIED).includes("too_long"));
  });

  it("21. caps a first-contact message at three sentences", () => {
    assert.equal(FIRST_CONTACT_MAX_SENTENCES, 3);
    const four =
      "Merhaba, Türkay Otel için yazıyorum. Web sitenizdeki WhatsApp bağlantısını gördüm. " +
      "Kısa bir şey merak ettim. Buradan gelen talepleri nasıl takip ediyorsunuz?";
    assert.equal(sentenceCount(four), 4);
    assert.ok(failuresOf(four, VERIFIED).includes("too_many_sentences"));
  });

  it("keeps every fallback variant inside the shape rules", () => {
    for (const { message } of FIRST_CONTACT_BODIES) {
      assert.ok(message.length <= FIRST_CONTACT_MAX_LENGTH, `${message.length}: ${message}`);
      assert.ok(sentenceCount(message) <= FIRST_CONTACT_MAX_SENTENCES, message);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 22–23. copy version and manual drafts                                      */
/* -------------------------------------------------------------------------- */

describe("copy version 6", () => {
  const NOW = "2026-07-24T09:00:00.000Z";

  it("22. stamps new first-contact generations with copy version 6", () => {
    assert.equal(CURRENT_COPY_VERSION, 6);
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [{ tone: "soft", message: GROUNDED_QUESTION, source: "provider" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(state.drafts.soft?.copyVersion, 6);
  });

  it("23. never rewrites or discards a manual draft", () => {
    const handwritten = "Kendi yazdığım soru, aynen kalmalı.";
    const state = applyManualDraft(emptyMessageWorkspace(), "soft", handwritten, NOW);
    assert.equal(state.drafts.soft?.message, handwritten);
    assert.equal(state.drafts.soft?.source, "manual");

    const after = applyGeneratedDrafts(state, {
      entries: [{ tone: "direct", message: GROUNDED_QUESTION, source: "provider" }],
      activeTone: "direct",
      now: NOW,
    });
    assert.equal(after.drafts.soft?.message, handwritten);
    assert.equal(after.drafts.soft?.source, "manual");
  });
});

/* -------------------------------------------------------------------------- */
/* 24–25. reply/follow-up stages keep their own contract; badge stays honest  */
/* -------------------------------------------------------------------------- */

describe("later stages are untouched by this calibration", () => {
  it("24. a follow_up message may still explain the product and offer an example", () => {
    const message =
      "Merhaba, Türkay Otel için yazdığım notun üzerine kısa bir ekleme yapayım. TUGOBO, " +
      "gelen rezervasyon taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek " +
      "paylaşabilirim.";
    const result = validateOutreachMessage({
      message,
      signals: SPARSE,
      businessName: "Türkay Otel",
      stance: "follow_up",
    });
    assert.equal(result.ok, true);
  });

  it("24b. a demo_confirm message may still ask for a meeting time", () => {
    const { message } = buildFallbackMessage({
      tone: "soft",
      businessName: "Türkay Otel",
      rotation: 0,
      stance: "demo_confirm",
    });
    const result = validateOutreachMessage({
      message,
      signals: SPARSE,
      businessName: "Türkay Otel",
      stance: "demo_confirm",
    });
    assert.equal(result.ok, true);
  });

  it("25. the source badge stays truthful when a first-contact pitch is rejected", async () => {
    assert.equal(draftSourceLabel("provider"), "AI üretimi");
    assert.equal(draftSourceLabel("fallback"), "Güvenli şablon");

    const { provider } = fakeProvider([{ message: PITCHING }]);
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
  it("states the first-contact objective in Turkish and English", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /FIRST CONTACT OBJECTIVE/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /İLK TEMAS AMACI/);
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes(
        "Write as if you inspected this specific hotel's public digital journey.",
      ),
    );
    assert.ok(OUTREACH_MESSAGE_SYSTEM.includes("Use only the structured evidence provided."));
    assert.ok(OUTREACH_MESSAGE_SYSTEM.includes("Do not diagnose."));
    assert.ok(OUTREACH_MESSAGE_SYSTEM.includes("Do not offer a demo."));
    assert.ok(OUTREACH_MESSAGE_SYSTEM.includes("Do not explain TUGOBO."));
    assert.ok(
      OUTREACH_MESSAGE_SYSTEM.includes(
        "The recipient should feel understood, not targeted by marketing.",
      ),
    );
  });

  it("the first-contact prompt uses its own length band", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /2–3 kısa cümle/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /120–280 karakter tercih edilir, 320 karakteri asla geçme/);
  });

  it("the reply-stage prompt does not carry the first-contact objective", () => {
    const replyPrompt = buildOutreachMessageSystem("follow_up");
    assert.equal(replyPrompt.includes("FIRST CONTACT OBJECTIVE"), false);
    assert.match(replyPrompt, /2–3 kısa cümle/);
    assert.match(replyPrompt, /140–240 karakter tercih edilir, 300 karakteri asla geçme/);
  });

  it("the demo-confirm prompt also skips the first-contact objective", () => {
    const demoPrompt = buildOutreachMessageSystem("demo_confirm");
    assert.equal(demoPrompt.includes("FIRST CONTACT OBJECTIVE"), false);
  });

  it("still states the respect and product-truth contracts regardless of stance", () => {
    for (const stance of ["first_contact", "follow_up", "demo_confirm"] as const) {
      const prompt = buildOutreachMessageSystem(stance);
      assert.match(prompt, /SAYGI SÖZLEŞMESİ/);
      assert.match(prompt, /ÜRÜN GERÇEĞİ SÖZLEŞMESİ/);
    }
  });
});

describe("angle bank", () => {
  it("the legacy first-contact angles are all questions, not capabilities", () => {
    for (const angle of FIRST_CONTACT_ANGLES) {
      assert.match(angle, /question$/, angle);
    }
  });

  it("every first-contact angle brief forbids a product pitch", () => {
    for (const angle of [...FIRST_CONTACT_ANGLES, ...ACCOUNT_ANGLES]) {
      assert.match(ANGLE_BRIEFS_TR[angle], /Ürünü anlatma/, angle);
      assert.match(ANGLE_BRIEFS_TR[angle], /demo veya örnek teklif etme/, angle);
    }
  });

  it("multi-channel-visibility-question no longer permits naming two channels", () => {
    assert.doesNotMatch(
      ANGLE_BRIEFS_TR["multi-channel-visibility-question"],
      /en fazla iki kanal adı geçebilir/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* the evidence-cluster rule (supersedes the exact-single-signal rule)         */
/* -------------------------------------------------------------------------- */

describe("first contact allows one primary plus one coherent supporting signal", () => {
  it("rejects a second signal that was never declared as supporting", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını ve rezervasyon " +
      "butonunu gördüm. Buradan gelen talepleri ayrı ayrı mı takip ediyorsunuz?";
    const failures = failuresOf(message, VERIFIED_MULTI, WHATSAPP_EVIDENCE);
    assert.ok(failures.includes("ungrounded_account_reference"), failures.join(","));
    assert.ok(failures.includes("too_many_verified_signals"), failures.join(","));
  });

  it("rejects the same two signals when no evidence is declared at all", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını ve rezervasyon " +
      "butonunu gördüm. Buradan gelen talepleri ayrı ayrı mı takip ediyorsunuz?";
    const failures = failuresOf(message, VERIFIED_MULTI);
    assert.ok(failures.includes("too_many_verified_signals"), failures.join(","));
  });

  it("rejects a website-plus-Instagram combination the same way", () => {
    const richer = buildOutreachSignals({
      city: "Antalya",
      businessType: "Otel",
      hasOwnWebsite: true,
      hasInstagram: true,
    });
    const message =
      "Merhaba, Türkay Otel'in web sitesini ve Instagram hesabını gördüm. Bu talepleri " +
      "nasıl takip ediyorsunuz?";
    const failures = failuresOf(message, richer);
    assert.ok(failures.includes("too_many_verified_signals"), failures.join(","));
  });

  it("does not reject the website itself as a second signal — 'sitesindeki' is a modifier, not a second fact", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Buradan gelen " +
      "talepleri nasıl takip ediyorsunuz?";
    assert.equal(failuresOf(message, VERIFIED_MULTI).includes("too_many_verified_signals"), false);
  });

  it("accepts a single-signal message even when a second signal is also verified", () => {
    const message =
      "Merhaba, Türkay Otel'in web sitesindeki WhatsApp bağlantısını gördüm. Buradan gelen " +
      "talepleri nasıl takip ediyorsunuz?";
    assert.deepEqual(failuresOf(message, VERIFIED_MULTI), []);
  });

  it("does not apply to reply-stage messages, which may still name two channels", () => {
    const message =
      "Merhaba, Türkay Otel için yazdığım notun üzerine kısa bir ekleme yapayım. TUGOBO, " +
      "WhatsApp ve web sitesinden gelen talepleri tek ekranda topluyor. Uygun olursa " +
      "çok kısa bir örnek paylaşabilirim.";
    const result = validateOutreachMessage({
      message,
      signals: VERIFIED_MULTI,
      businessName: "Türkay Otel",
      stance: "follow_up",
    });
    assert.equal(result.ok, true);
  });

  it("the booking-CTA signal label reads as natural Turkish, not a literal CTA translation", () => {
    const signals = buildOutreachSignals({
      city: "Antalya",
      businessType: "Otel",
      hasOwnWebsite: true,
      websiteIntelligence: { hasBookingCtaText: true },
    });
    const label = signals.verified.find((s) => s.key === "booking_cta")?.label;
    assert.equal(label, "Sitede rezervasyon butonu var");
    assert.doesNotMatch(label ?? "", /çağrısı/);
  });

  it("a solo-evidence generation through the full engine stays single-signal", async () => {
    const provider: OutreachProvider = async () => null; // force the deterministic bank
    const result = await generateOutreachMessage(
      baseParams({
        tone: "direct",
        angle: "whatsapp_ownership",
        signals: VERIFIED_MULTI,
        generationNonce: "direct-single-signal",
        provider,
      }),
    );
    const verdict = validateOutreachMessage({
      message: result.message,
      signals: VERIFIED_MULTI,
      businessName: "Türkay Otel",
      stance: "first_contact",
      evidence: WHATSAPP_EVIDENCE,
    });
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });

  it("the system prompt states the evidence-grounding rule", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /EVIDENCE GROUNDING CONTRACT/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /PRIMARY EVIDENCE mesajda mutlaka görünmeli/);
    assert.match(
      OUTREACH_MESSAGE_SYSTEM,
      /SUPPORTING EVIDENCE varsa aynı cümlede doğal biçimde birlikte anılabilir/,
    );
  });

  it("the reply-stage prompt keeps the two-channel allowance unchanged", () => {
    const replyPrompt = buildOutreachMessageSystem("follow_up");
    assert.match(replyPrompt, /en fazla iki kanal adı geçebilir/);
  });

  it("the first-contact prompt limits channel names to the evidence pack", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /ikisi de EVIDENCE'ta verilmiş olmalı/);
  });
});
