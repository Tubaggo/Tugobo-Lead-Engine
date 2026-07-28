import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { assignAngles, availableAngles, VARIATION_ANGLES } from "./angles.ts";
import { isTone, normalizePreviousMessages, TONES, type Tone } from "./contract.ts";
import {
  expectGeneratedOutreach,
  generateOutreachMessage as generateRaw,
  type GenerateParams,
  type OutreachProvider,
  type ProviderOutput,
} from "./engine.ts";

/**
 * Every generation in this file is reply-stage, so every one of them returns a
 * message. Narrowing once here keeps the assertions about *orchestration* —
 * retry, dedup, fallback — instead of about the result union; the
 * `needs_research` branch is covered in `account-specific-outreach.test.ts`,
 * which is where the first-contact contract lives.
 */
const generateOutreachMessage = (params: GenerateParams) =>
  generateRaw(params).then(expectGeneratedOutreach);
import {
  buildFallbackMessage,
  deClitic,
  possessive,
  REPLY_FALLBACK_ANGLES,
  REPLY_FALLBACK_VARIANT_COUNT,
} from "./fallback.ts";
import { buildOutreachMessageSystem } from "./prompt.ts";
import { buildOutreachSignals } from "./signals.ts";
import { normalizeMessage, similarity } from "./text.ts";
import { validateOutreachMessage } from "./validator.ts";

const SIGNALS = buildOutreachSignals({
  city: "Antalya",
  businessType: "Boutique Hotel",
  hasWhatsAppPath: true,
  hasInstagram: true,
  hasOwnWebsite: true,
  channels: ["Booking", "Instagram"],
  otaDependencyLikelihood: 80,
  bookingFlowStrength: 40,
  communicationRisk: 70,
});

const SPARSE = buildOutreachSignals({ city: "Bodrum", businessType: "Hotel" });

/*
 * Defaults to `stance: "follow_up"` deliberately. This file tests the
 * engine's orchestration mechanics — retry, dedup, fallback, prompt plumbing —
 * using capability-language fixtures (VALID_PROVIDER_MESSAGE, INVENTED,
 * etc.) written for the reply-stage contract. Those mechanics are stance-
 * agnostic; pinning the stance keeps the fixtures valid without duplicating
 * what `pain-discovery-outreach.test.ts` already covers for `first_contact`.
 */
function baseParams(overrides: Partial<GenerateParams> = {}): GenerateParams {
  return {
    leadId: "gmaps-abc",
    businessName: "Lara Sunset Boutique",
    city: "Antalya",
    businessType: "Boutique Hotel",
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

/** A provider that returns whatever it is told, and counts its calls. */
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

const VALID_PROVIDER_MESSAGE =
  "Merhaba, Lara Sunset Boutique için kısa bir fikir paylaşmak istedim. TUGOBO, gelen " +
  "rezervasyon taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek paylaşabilirim.";

describe("tone contract", () => {
  test("accepts the three supported tones", () => {
    assert.deepEqual([...TONES], ["soft", "direct", "consultative"]);
    for (const tone of TONES) assert.equal(isTone(tone), true);
  });

  test("rejects an unknown tone", () => {
    assert.equal(isTone("aggressive"), false);
    assert.equal(isTone(""), false);
    assert.equal(isTone(null), false);
  });
});

describe("previous message handling", () => {
  test("keeps at most the five most recent", () => {
    const many = Array.from({ length: 9 }, (_, i) => `mesaj ${i}`);
    const kept = normalizePreviousMessages(many);
    assert.equal(kept.length, 5);
    assert.equal(kept[kept.length - 1], "mesaj 8", "newest is retained");
  });

  test("drops non-strings and blanks", () => {
    assert.deepEqual(normalizePreviousMessages(["a", "", null, 5, "  "]), ["a"]);
  });

  test("returns empty for a non-array", () => {
    assert.deepEqual(normalizePreviousMessages("nope"), []);
  });
});

/*
 * Reply-stage bank only (`stance: "follow_up"`). Mechanics that are shared
 * with the first-contact bank — vowel harmony, token replacement, city
 * omission — are proven once here; the first-contact bank's own content
 * safety (one question, no product pitch) is covered in
 * `pain-discovery-outreach.test.ts`.
 */
describe("fallback bank (reply stage)", () => {
  test("offers 15 distinct variants (3 tones x 5 angles)", () => {
    assert.equal(REPLY_FALLBACK_VARIANT_COUNT, 15);

    const seen = new Set<string>();
    for (const tone of TONES) {
      for (let r = 0; r < REPLY_FALLBACK_ANGLES.length; r += 1) {
        const { message } = buildFallbackMessage({
          tone,
          businessName: "Test Otel",
          city: "Antalya",
          rotation: r,
          stance: "follow_up",
        });
        seen.add(normalizeMessage(message));
      }
    }
    assert.equal(seen.size, 15, "no two fallback variants collapse to the same text");
  });

  test("every fallback variant passes the quality validator", () => {
    for (const tone of TONES) {
      for (let r = 0; r < REPLY_FALLBACK_ANGLES.length; r += 1) {
        const { message } = buildFallbackMessage({
          tone,
          businessName: "Lara Sunset Boutique",
          city: "Antalya",
          rotation: r,
          stance: "follow_up",
        });
        const verdict = validateOutreachMessage({
          message,
          signals: SPARSE,
          businessName: "Lara Sunset Boutique",
          stance: "follow_up",
        });
        assert.equal(
          verdict.ok,
          true,
          `tone=${tone} rotation=${r} failed: ${
            verdict.ok ? "" : verdict.failures.join(",")
          }`,
        );
      }
    }
  });

  test("rotation changes the angle", () => {
    const a = buildFallbackMessage({ tone: "soft", businessName: "X", rotation: 0, stance: "follow_up" });
    const b = buildFallbackMessage({ tone: "soft", businessName: "X", rotation: 1, stance: "follow_up" });
    assert.notEqual(a.variationAngle, b.variationAngle);
  });

  test("excluded angles are not reused", () => {
    const result = buildFallbackMessage({
      tone: "soft",
      businessName: "X",
      rotation: 0,
      stance: "follow_up",
      exclude: ["single-screen-visibility"],
    });
    assert.notEqual(result.variationAngle, "single-screen-visibility");
  });

  test("applies Turkish vowel harmony to the de/da clitic", () => {
    // Back vowel ending -> "da"; front vowel ending -> "de".
    assert.equal(deClitic("Kaş Konak"), "da");
    assert.equal(deClitic("Lara Sunset Boutique"), "de");
    assert.equal(deClitic("Bodrum Marina Suites"), "de");
    assert.equal(deClitic("Alanya Otel"), "de");
    assert.equal(deClitic("Çeşme Marina"), "da");
  });

  test("harmonises the genitive suffix, with the buffer n after a vowel", () => {
    assert.equal(possessive("Türkay Otel"), "Türkay Otel'in");
    assert.equal(possessive("Kaş Konak"), "Kaş Konak'ın");
    assert.equal(possessive("Çeşme Marina"), "Çeşme Marina'nın");
    assert.equal(possessive("Bodrum Konfor"), "Bodrum Konfor'un");
    assert.equal(possessive("Ürgüp Köşk"), "Ürgüp Köşk'ün");
  });

  test("leaves no unreplaced template token", () => {
    for (const tone of TONES) {
      for (let r = 0; r < 4; r += 1) {
        const { message } = buildFallbackMessage({
          tone,
          businessName: "Kaş Konak",
          city: "Kaş",
          rotation: r,
          stance: "follow_up",
        });
        assert.equal(/\{[a-z]+\}/.test(message), false, `token left in: ${message}`);
      }
    }
  });

  test("omits the city opening when no city is known", () => {
    const { message } = buildFallbackMessage({
      tone: "soft",
      businessName: "Test Otel",
      rotation: 2,
      stance: "follow_up",
    });
    assert.equal(message.includes("{city}"), false);
    assert.equal(message.includes("  "), false, "no double space from an empty city");
  });
});

describe("variation angles — reply stage", () => {
  test("assigns a different angle to each tone when signals allow", () => {
    const angles = assignAngles(SIGNALS, 0, "follow_up");
    const unique = new Set([angles.soft, angles.direct, angles.consultative]);
    assert.equal(unique.size, 3);
  });

  test("regenerating rotates every tone onto a new angle", () => {
    const first = assignAngles(SIGNALS, 0, "follow_up");
    const second = assignAngles(SIGNALS, 1, "follow_up");
    assert.notEqual(first.soft, second.soft);
    assert.notEqual(first.direct, second.direct);
  });

  test("a low-signal lead still gets usable ungated angles", () => {
    const angles = availableAngles(SPARSE, "follow_up");
    assert.ok(angles.length > 0);
    assert.ok(angles.includes("founder-note"));
    assert.ok(angles.includes("short-demo-invitation"));
    assert.ok(
      angles.every((a) => (VARIATION_ANGLES as readonly string[]).includes(a)),
    );
  });

  test("evidence-gated angles are withheld from a low-signal lead", () => {
    const angles = availableAngles(SPARSE, "follow_up");
    assert.equal(angles.includes("verified-channel-observation"), false);
    assert.equal(angles.includes("direct-booking-clarity"), false);
  });
});

describe("variation angles — first contact (default)", () => {
  test("assigns a different angle to each tone when signals allow", () => {
    const angles = assignAngles(SIGNALS, 0);
    const unique = new Set([angles.soft, angles.direct, angles.consultative]);
    assert.equal(unique.size, 3);
  });

  test("regenerating rotates every tone onto a new angle", () => {
    const first = assignAngles(SIGNALS, 0);
    const second = assignAngles(SIGNALS, 1);
    assert.notEqual(first.soft, second.soft);
    assert.notEqual(first.direct, second.direct);
  });

  test("a low-signal lead still gets usable ungated question angles", () => {
    const angles = availableAngles(SPARSE);
    assert.ok(angles.length > 0);
    assert.ok(angles.includes("open-request-question"));
    assert.ok(angles.includes("ownership-question"));
    assert.ok(angles.includes("follow-up-method-question"));
    assert.ok(
      angles.every((a) => (VARIATION_ANGLES as readonly string[]).includes(a)),
    );
  });

  test("evidence-gated angles are withheld from a low-signal lead", () => {
    const angles = availableAngles(SPARSE);
    assert.equal(angles.includes("channel-workflow-question"), false);
    assert.equal(angles.includes("multi-channel-visibility-question"), false);
  });

  test("multi-channel question needs both a website and a WhatsApp path", () => {
    const websiteOnly = buildOutreachSignals({ city: "Bodrum", hasOwnWebsite: true });
    assert.equal(availableAngles(websiteOnly).includes("multi-channel-visibility-question"), false);
    assert.ok(availableAngles(SIGNALS).includes("multi-channel-visibility-question"));
  });
});

describe("generation without a provider", () => {
  test("still returns a message, marked as fallback", async () => {
    const result = await generateOutreachMessage(baseParams());
    assert.equal(result.ok, true);
    assert.equal(result.source, "fallback");
    assert.ok(result.message.length > 0);
  });

  test("reports the tone it was asked for", async () => {
    for (const tone of TONES) {
      const result = await generateOutreachMessage(baseParams({ tone }));
      assert.equal(result.tone, tone);
    }
  });

  test("the three tones are materially different", async () => {
    const angles = assignAngles(SIGNALS, 0);
    const messages = await Promise.all(
      TONES.map((tone) =>
        generateOutreachMessage(baseParams({ tone, angle: angles[tone] })),
      ),
    );
    const texts = messages.map((m) => m.message);
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        assert.ok(
          similarity(texts[i], texts[j]) < 0.6,
          `tones ${TONES[i]} and ${TONES[j]} are too similar`,
        );
      }
    }
  });

  test("regenerating produces a different message", async () => {
    const first = await generateOutreachMessage(baseParams({ rotation: 0 }));
    const second = await generateOutreachMessage(
      baseParams({ rotation: 1, previousMessages: [first.message] }),
    );
    assert.notEqual(normalizeMessage(first.message), normalizeMessage(second.message));
    assert.ok(similarity(first.message, second.message) < 0.6);
  });

  test("walks the bank to avoid everything already shown", async () => {
    const seen: string[] = [];
    for (let round = 0; round < 4; round += 1) {
      const result = await generateOutreachMessage(
        baseParams({ rotation: round, previousMessages: [...seen] }),
      );
      assert.ok(
        !seen.some((prior) => similarity(prior, result.message) >= 0.6),
        `round ${round} repeated an earlier message`,
      );
      seen.push(result.message);
    }
  });
});

describe("generation with a provider", () => {
  test("uses a valid provider message and marks the source", async () => {
    const { provider, callCount } = fakeProvider([
      { message: VALID_PROVIDER_MESSAGE, variationAngle: "channel-consolidation" },
    ]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(result.source, "provider");
    assert.equal(result.message, VALID_PROVIDER_MESSAGE);
    assert.equal(callCount(), 1, "no needless retry on a good first result");
  });

  test("parses usedSignalKeys and drops ones we never had", async () => {
    const { provider } = fakeProvider([
      {
        message: VALID_PROVIDER_MESSAGE,
        usedSignalKeys: ["own_website", "invented_key"],
      },
    ]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.deepEqual(result.usedSignalKeys, ["own_website"]);
  });

  test("falls back when the provider returns null", async () => {
    const { provider } = fakeProvider([null]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(result.source, "fallback");
  });

  test("falls back when the provider throws", async () => {
    const provider: OutreachProvider = async () => {
      throw new Error("network down");
    };
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(result.source, "fallback");
    assert.ok(result.message.length > 0);
  });

  test("falls back when the provider output fails validation", async () => {
    const { provider } = fakeProvider([
      { message: "Fiyatımız aylık 5000 TL, hemen başlayalım." },
    ]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(result.source, "fallback");
  });

  test("falls back when the provider makes an unverified claim", async () => {
    const { provider } = fakeProvider([
      {
        message:
          "Merhaba, Bodrum'daki işletmeniz için yazıyorum. Booking.com üzerinden gelen " +
          "talepleri TUGOBO tek ekranda topluyor. Uygun olursa kısa bir örnek paylaşabilirim.",
      },
    ]);
    const result = await generateOutreachMessage(
      baseParams({ provider, signals: SPARSE }),
    );
    assert.equal(result.source, "fallback", "OTA claim without evidence is rejected");
  });

  test("retries once on a new angle when the first result is a duplicate", async () => {
    const alternative =
      "Merhaba, Lara Sunset Boutique için kısa bir not bırakmak istedim. TUGOBO'yu, cevap " +
      "bekleyen talebin görünür kalması için geliştiriyoruz. İsterseniz 10 dakikada özetleyebilirim.";
    const { provider, callCount } = fakeProvider([
      { message: VALID_PROVIDER_MESSAGE },
      { message: alternative },
    ]);
    const result = await generateOutreachMessage(
      baseParams({ provider, previousMessages: [VALID_PROVIDER_MESSAGE] }),
    );
    assert.equal(callCount(), 2, "retried exactly once");
    assert.equal(result.source, "provider");
    assert.equal(result.message, alternative);
    assert.equal(result.duplicateAvoided, true);
  });

  test("gives up to the fallback when both provider attempts duplicate", async () => {
    const { provider, callCount } = fakeProvider([{ message: VALID_PROVIDER_MESSAGE }]);
    const result = await generateOutreachMessage(
      baseParams({ provider, previousMessages: [VALID_PROVIDER_MESSAGE] }),
    );
    assert.ok(callCount() <= 2, "never more than one retry");
    assert.equal(result.source, "fallback");
    assert.equal(result.duplicateAvoided, true);
  });

  test("the nonce reaches the prompt so identical inputs still vary", async () => {
    const { provider, calls } = fakeProvider([{ message: VALID_PROVIDER_MESSAGE }]);
    await generateOutreachMessage(
      baseParams({ provider, generationNonce: "unique-token-42" }),
    );
    assert.ok(calls[0].user.includes("unique-token-42"));
  });

  test("previous messages are sent to the provider to avoid", async () => {
    const { provider, calls } = fakeProvider([{ message: VALID_PROVIDER_MESSAGE }]);
    await generateOutreachMessage(
      baseParams({ provider, previousMessages: ["önceki mesaj metni"] }),
    );
    assert.ok(calls[0].user.includes("PREVIOUS MESSAGES TO AVOID"));
    assert.ok(calls[0].user.includes("önceki mesaj metni"));
  });

  test("the prompt separates verified from likely signals", async () => {
    const { provider, calls } = fakeProvider([{ message: VALID_PROVIDER_MESSAGE }]);
    await generateOutreachMessage(baseParams({ provider }));
    const prompt = calls[0].user;
    assert.ok(prompt.includes("VERIFIED SIGNALS"));
    assert.ok(prompt.includes("LIKELY SIGNALS"));
    assert.ok(prompt.includes("DO NOT CLAIM"));
    assert.ok(prompt.includes("TONE"));
  });

  test("the DO NOT CLAIM block names what this lead lacks", async () => {
    const { provider, calls } = fakeProvider([{ message: VALID_PROVIDER_MESSAGE }]);
    await generateOutreachMessage(baseParams({ provider, signals: SPARSE }));
    const prompt = calls[0].user;
    assert.ok(prompt.includes("WhatsApp kullandıklarını"));
    assert.ok(prompt.includes("Instagram"));
    assert.ok(prompt.includes("Web sitelerinden"));
  });

  test("each tone gets its own tone brief", async () => {
    for (const tone of TONES) {
      const { provider, calls } = fakeProvider([{ message: VALID_PROVIDER_MESSAGE }]);
      await generateOutreachMessage(baseParams({ provider, tone }));
      assert.ok(calls[0].user.includes(`TONE: ${tone}`));
    }
  });
});

describe("response contract", () => {
  test("carries source, angle and a generation id", async () => {
    const result = await generateOutreachMessage(
      baseParams({ generationNonce: "abc" }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.generationId, "gmaps-abc:abc");
    assert.ok((VARIATION_ANGLES as readonly string[]).includes(result.variationAngle));
    assert.ok(result.source === "provider" || result.source === "fallback");
    assert.equal(typeof result.duplicateAvoided, "boolean");
  });
});

describe("sender identity guard", () => {
  // Passes every other validator rule; the ONLY defect is the invented name.
  const INVENTED =
    "Merhaba, ben Tuğrul. Lara Sunset Boutique için kısa bir fikir paylaşmak istedim; TUGOBO " +
    "gelen rezervasyon taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek gönderebilirim.";

  test("the invented message is rejected only for the sender identity", () => {
    const verdict = validateOutreachMessage({
      message: INVENTED,
      signals: SIGNALS,
      businessName: "Lara Sunset Boutique",
      stance: "follow_up",
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.deepEqual(verdict.failures, ["invented_sender_identity"]);
    }
  });

  test("10. retries once after an invented name, then uses the clean result", async () => {
    const { provider, callCount } = fakeProvider([
      { message: INVENTED },
      { message: VALID_PROVIDER_MESSAGE },
    ]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(callCount(), 2, "retried exactly once");
    assert.equal(result.source, "provider");
    assert.equal(result.message, VALID_PROVIDER_MESSAGE);
  });

  test("11. falls back when both attempts invent a name", async () => {
    const { provider } = fakeProvider([{ message: INVENTED }]);
    const result = await generateOutreachMessage(baseParams({ provider }));
    assert.equal(result.source, "fallback");
    // 12. the badge stays truthful — a fallback is never labelled provider.
    assert.notEqual(result.source, "provider");
    // 9. and the fallback body itself carries no invented identity.
    assert.equal(validateOutreachMessage({
      message: result.message,
      signals: SIGNALS,
      businessName: "Lara Sunset Boutique",
      stance: "follow_up",
    }).ok, true);
  });

  test("a configured sender name passes the exact name through the provider", async () => {
    const named =
      "Merhaba, ben Ayşe. Lara Sunset Boutique için kısa bir fikir paylaşmak istedim; TUGOBO " +
      "gelen rezervasyon taleplerini tek ekranda topluyor. Uygun olursa çok kısa bir örnek gönderebilirim.";
    const { provider } = fakeProvider([{ message: named }]);
    const result = await generateOutreachMessage(baseParams({ provider, senderName: "Ayşe" }));
    assert.equal(result.source, "provider");
    assert.equal(result.message, named);
  });
});
