/**
 * The warm-tone contract.
 *
 * These tests exist because "the messages work" and "the messages sound like a
 * person" are different properties, and only the first one was ever checked.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TONES } from "./contract.ts";
import { buildFallbackMessage, FALLBACK_ANGLES } from "./fallback.ts";
import { OUTREACH_MESSAGE_SYSTEM } from "./prompt.ts";
import { buildOutreachSignals } from "./signals.ts";
import { normalizeMessage } from "./text.ts";
import {
  extractCta,
  MAX_CHANNEL_MENTIONS,
  MAX_LENGTH,
  MAX_SENTENCES,
  PREFERRED_MAX,
  PREFERRED_MIN,
  validateOutreachMessage,
} from "./validator.ts";
import {
  applyGeneratedDrafts,
  applyManualDraft,
  CURRENT_COPY_VERSION,
  emptyMessageWorkspace,
  isStaleCopyDraft,
} from "./workspace.ts";

const signals = buildOutreachSignals({ city: "Antalya", businessType: "otel" });

type CheckOverrides = Partial<
  Omit<Parameters<typeof validateOutreachMessage>[0], "message">
>;

function check(message: string, over: CheckOverrides = {}) {
  return validateOutreachMessage({
    message,
    signals,
    businessName: "Kaş Konak",
    ...over,
  });
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

/* -------------------------------------------------------------------------- */
/* length and shape                                                           */
/* -------------------------------------------------------------------------- */

describe("warm-tone length band", () => {
  it("prefers a short WhatsApp note, not a paragraph", () => {
    assert.equal(PREFERRED_MIN, 160);
    assert.equal(PREFERRED_MAX, 300);
    assert.equal(MAX_LENGTH, 380);
  });

  it("rejects a message over the hard cap", () => {
    const long = `Merhaba, Kaş Konak için kısa bir fikir paylaşmak istedim. ${"Talep takibi zorlaşabiliyor. ".repeat(
      14,
    )}Uygun olursa kısa bir örnek gönderebilirim.`;
    const result = check(long);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("too_long"));
  });

  it("rejects an explanation dressed up as a note", () => {
    const wordy =
      "Merhaba, Kaş Konak için yazıyorum. Talep takibi zorlaşabiliyor. Bu da zaman alıyor. Sonra takip gecikiyor. Uygun olursa kısa bir örnek gönderebilirim.";
    const result = check(wordy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("too_many_sentences"));
    assert.ok(sentenceCount(wordy) > MAX_SENTENCES);
  });

  it("rejects a message that lists every channel", () => {
    const listy =
      "Merhaba, Kaş Konak için kısa bir fikir paylaşmak istedim. WhatsApp, Instagram ve telefon üzerinden gelen talepleri TUGOBO tek yerde topluyor. Uygun olursa kısa bir örnek gönderebilirim.";
    const result = check(listy);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("too_many_channels"));
    assert.equal(MAX_CHANNEL_MENTIONS, 2);
  });
});

/* -------------------------------------------------------------------------- */
/* jargon                                                                     */
/* -------------------------------------------------------------------------- */

describe("consultant jargon", () => {
  const jargon = [
    "operasyonel kaldıraç",
    "operasyonel yük",
    "değerlendirme hacmi",
    "dönüşüm optimizasyonu",
    "dijital dönüşüm",
    "uçtan uca",
    "sektör lideri",
    "çözümümüz",
    "ticari fırsat",
  ];

  for (const phrase of jargon) {
    it(`rejects "${phrase}"`, () => {
      const message = `Merhaba, Kaş Konak için kısa bir fikir paylaşmak istedim. ${phrase} konusunda TUGOBO yardımcı oluyor. Uygun olursa kısa bir örnek gönderebilirim.`;
      const result = check(message);
      assert.equal(result.ok, false);
      if (!result.ok) assert.ok(result.failures.includes("jargon"), phrase);
    });
  }

  it("accepts the same message in plain Turkish", () => {
    const result = check(
      "Merhaba, Kaş Konak için kısa bir fikir paylaşmak istedim. Gelen talepleri tek yerde toplamak için TUGOBO üzerinde çalışıyoruz. Uygun olursa size kısa bir örnek gönderebilirim.",
    );
    assert.equal(result.ok, true);
  });
});

/* -------------------------------------------------------------------------- */
/* invented history                                                           */
/* -------------------------------------------------------------------------- */

describe("fake previous contact", () => {
  const withHistory =
    "Merhaba, Kaş Konak için önceki mesajımın üzerine yazıyorum. Bekleyen talepleri TUGOBO tek yerde topluyor. Uygun olursa kısa bir örnek gönderebilirim.";

  it("is rejected when this is a first contact", () => {
    const result = check(withHistory, { stance: "first_contact" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("fake_previous_contact"));
  });

  it("is rejected when no stance is supplied at all", () => {
    const result = check(withHistory);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("fake_previous_contact"));
  });

  it("is allowed once the stance says we actually wrote before", () => {
    const result = check(withHistory, { stance: "follow_up" });
    assert.equal(result.ok, true);
  });
});

/* -------------------------------------------------------------------------- */
/* CTA variety                                                                */
/* -------------------------------------------------------------------------- */

describe("CTA variety", () => {
  it("rejects a new observation closed with the previous ask", () => {
    const prior =
      "Merhaba, Kaş Konak için kısa bir fikir paylaşmak istedim. Talepler dağılabiliyor. Uygun olursa size kısa bir örnek gönderebilirim.";
    const repeat =
      "Merhaba, Kaş Konak tarafında dönüş hızı düşündürdü. Bekleyen talep görünür kalıyor. Uygun olursa size kısa bir örnek gönderebilirim.";
    const result = check(repeat, { previousMessages: [prior] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.failures.includes("repeated_cta"));
  });

  it("accepts the same observation closed a different way", () => {
    const prior =
      "Merhaba, Kaş Konak için kısa bir fikir paylaşmak istedim. Talepler dağılabiliyor. Uygun olursa size kısa bir örnek gönderebilirim.";
    const varied =
      "Merhaba, Kaş Konak tarafında dönüş hızı düşündürdü. Bekleyen talep görünür kalıyor. Nasıl çalıştığını 2 dakikada gösterebilirim.";
    const result = check(varied, { previousMessages: [prior] });
    assert.equal(result.ok, true);
  });

  it("offers several distinct closings across the fallback bank", () => {
    const ctas = new Set(
      FALLBACK_ANGLES.map(
        (_, rotation) =>
          extractCta(
            buildFallbackMessage({
              tone: "soft",
              businessName: "Kaş Konak",
              city: "Antalya",
              rotation,
            }).message,
          ),
      ),
    );
    assert.ok(ctas.size >= 3, `only ${ctas.size} distinct closings`);
  });
});

/* -------------------------------------------------------------------------- */
/* the fallback bank itself                                                   */
/* -------------------------------------------------------------------------- */

describe("fallback bank warmth", () => {
  const all = TONES.flatMap((tone) =>
    FALLBACK_ANGLES.map((_, rotation) =>
      buildFallbackMessage({
        tone,
        businessName: "Kaş Konak",
        city: "Antalya",
        rotation,
      }),
    ),
  );

  it("covers three tones across five angles", () => {
    assert.equal(FALLBACK_ANGLES.length, 5);
    assert.equal(all.length, 15);
  });

  it("keeps every variant inside the warm band", () => {
    for (const { message } of all) {
      assert.ok(
        message.length >= 110 && message.length <= MAX_LENGTH,
        `${message.length} chars: ${message}`,
      );
      assert.ok(sentenceCount(message) <= MAX_SENTENCES, message);
    }
  });

  it("passes the humanness validator without exception", () => {
    for (const { message } of all) {
      const result = check(message);
      assert.equal(result.ok, true, `${message}\n${JSON.stringify(result)}`);
    }
  });

  it("avoids the sector cliché opening", () => {
    for (const { message } of all) {
      assert.ok(!/(birçok|çoğu) tesiste/i.test(message), message);
    }
  });

  it("speaks in the founder's voice", () => {
    // Either a first-person offer ("…gönderebilirim") or a direct question
    // ("…anlamlı olur mu?"). Both are a person talking; neither is a brochure.
    const firstPersonOffer =
      /(paylaşmak istedim|üzerinde çalış|geliştiriyoruz|gönderebilirim|gösterebilirim|paylaşabilirim|anlatabilirim)/i;
    const directQuestion = /(anlamlı olur mu|faydalı olur mu|ilginizi çeker mi)\s*\?/i;
    for (const { message } of all) {
      assert.ok(
        firstPersonOffer.test(message) || directQuestion.test(message),
        message,
      );
    }
  });

  it("changes structure, not just words, when regenerate walks the bank", () => {
    const first = buildFallbackMessage({
      tone: "soft",
      businessName: "Kaş Konak",
      city: "Antalya",
      rotation: 0,
    }).message;
    const next = buildFallbackMessage({
      tone: "soft",
      businessName: "Kaş Konak",
      city: "Antalya",
      rotation: 1,
    }).message;

    assert.notEqual(normalizeMessage(first), normalizeMessage(next));
    assert.notEqual(extractCta(first), extractCta(next), "the closing ask must change too");
  });
});

/* -------------------------------------------------------------------------- */
/* prompt persona                                                             */
/* -------------------------------------------------------------------------- */

describe("provider persona", () => {
  it("casts the model as the founder writing on WhatsApp", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /kurucusu/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /WhatsApp/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /Pazarlama departmanı gibi değil/);
  });

  it("asks for curiosity rather than a product explanation", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /merak uyandırmak/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /2–3 kısa cümle/);
  });

  it("states the one-signal rule and bans the jargon list", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /Tek sinyal/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /operasyonel kaldıraç/);
    assert.match(OUTREACH_MESSAGE_SYSTEM, /Tek fayda/);
  });

  it("forbids inventing a prior conversation", () => {
    assert.match(OUTREACH_MESSAGE_SYSTEM, /first_contact ise geçmiş bir görüşmeye/);
  });
});

/* -------------------------------------------------------------------------- */
/* copy versioning                                                            */
/* -------------------------------------------------------------------------- */

describe("copy versioning", () => {
  const NOW = "2026-07-22T09:00:00.000Z";

  it("stamps new generations with the current copy version", () => {
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [{ tone: "soft", message: "yeni ton mesajı", source: "provider" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(state.drafts.soft?.copyVersion, CURRENT_COPY_VERSION);
    assert.equal(CURRENT_COPY_VERSION, 2);
  });

  it("flags a generated draft written before the rewrite", () => {
    assert.equal(
      isStaleCopyDraft({
        tone: "soft",
        message: "eski uzun mesaj",
        source: "fallback",
        updatedAt: NOW,
      }),
      true,
    );
  });

  it("never flags a draft the founder wrote by hand", () => {
    const manual = applyManualDraft(
      emptyMessageWorkspace(),
      "soft",
      "kendi yazdığım mesaj",
      NOW,
    );
    assert.equal(isStaleCopyDraft(manual.drafts.soft), false);
  });

  it("does not flag a current generated draft", () => {
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [{ tone: "soft", message: "yeni ton mesajı", source: "provider" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(isStaleCopyDraft(state.drafts.soft), false);
  });

  it("preserves an old manual draft's text untouched", () => {
    const old = applyManualDraft(emptyMessageWorkspace(), "soft", "eski elle yazılmış", NOW);
    assert.equal(old.drafts.soft?.message, "eski elle yazılmış");
    assert.equal(old.drafts.soft?.source, "manual");
  });
});
