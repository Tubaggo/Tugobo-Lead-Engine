import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ACCOUNT_ANGLES } from "./angles.ts";
import { buildFallbackMessage, REPLY_FALLBACK_ANGLES } from "./fallback.ts";
import { buildPersonalizationEvidence, selectEvidence } from "./evidence.ts";

const MAX_BANK_SIZE = Math.max(ACCOUNT_ANGLES.length, REPLY_FALLBACK_ANGLES.length);

/** A first-contact lead with one verified, account-specific hook. */
const EVIDENCE = selectEvidence(
  buildPersonalizationEvidence({ websiteIntelligence: { hasWhatsAppLink: true } }),
)!;
import {
  checkSenderIdentity,
  detectSenderIntroduction,
  getConfiguredSenderName,
  normalizeSenderName,
} from "./sender-identity.ts";
import { TONES } from "./contract.ts";

describe("detectSenderIntroduction", () => {
  it("catches 'Merhaba, ben <Name>'", () => {
    assert.equal(detectSenderIntroduction("Merhaba, ben Tuğrul."), "tuğrul");
  });
  it("catches a sentence-initial 'Ben <Name>'", () => {
    assert.equal(detectSenderIntroduction("Ben Ahmet, size kısa bir not."), "ahmet");
  });
  it("catches 'Adım <Name>' and 'ismim <Name>'", () => {
    assert.equal(detectSenderIntroduction("Adım Mehmet."), "mehmet");
    assert.equal(detectSenderIntroduction("Merhaba, ismim Ayşe."), "ayşe");
  });
  it("catches the reversed '<Name> ben'", () => {
    assert.equal(detectSenderIntroduction("Tuğrul ben, kısa bir fikir."), "tuğrul");
  });
  it("does not fire on nameless openings", () => {
    assert.equal(detectSenderIntroduction("Merhaba, kısa bir fikir paylaşmak istedim."), null);
    assert.equal(detectSenderIntroduction("Merhaba,"), null);
  });
  it("does not treat the company as a personal name", () => {
    assert.equal(detectSenderIntroduction("Merhaba, TUGOBO'nun kurucusuyum."), null);
    assert.equal(detectSenderIntroduction("ben Tugobo'nun kurucusuyum"), null);
  });
  it("does not fire on lowercase words after 'ben'", () => {
    assert.equal(detectSenderIntroduction("Merhaba, ben size kısa bir örnek göndereyim."), null);
    assert.equal(detectSenderIntroduction("Benzer tesislerde de oluyor."), null);
  });
});

describe("checkSenderIdentity — no configured sender name", () => {
  it("1. rejects 'Merhaba, ben Tuğrul.'", () => {
    assert.equal(checkSenderIdentity("Merhaba, ben Tuğrul.", null).ok, false);
  });
  it("2. rejects 'Ben Ahmet, ...'", () => {
    assert.equal(checkSenderIdentity("Ben Ahmet, size yazıyorum.", null).ok, false);
  });
  it("3. rejects 'Adım Mehmet.'", () => {
    assert.equal(checkSenderIdentity("Adım Mehmet, kısa bir fikir.", undefined).ok, false);
  });
  it("4. passes a nameless 'Merhaba,' opening", () => {
    assert.equal(checkSenderIdentity("Merhaba, kısa bir fikir paylaşmak istedim.", null).ok, true);
  });
  it("7. rejects the lead contact's name used as sender", () => {
    // "Türkay" is the hotel's authorised contact — never a sender identity.
    assert.equal(checkSenderIdentity("Merhaba, ben Türkay.", null).ok, false);
  });
  it("8. a business name containing a person name is not a false positive", () => {
    const msg = "Merhaba, Ahmet Konağı için kısa bir fikir paylaşmak istedim.";
    assert.equal(checkSenderIdentity(msg, null).ok, true);
  });
});

describe("checkSenderIdentity — configured sender name", () => {
  it("5. passes the exact configured name", () => {
    assert.equal(checkSenderIdentity("Merhaba, ben Ayşe.", "Ayşe").ok, true);
  });
  it("passes the configured name regardless of suffix/case", () => {
    assert.equal(checkSenderIdentity("Ben AYŞE, kısa bir not.", "ayşe").ok, true);
  });
  it("6. rejects any other name even when one is configured", () => {
    const verdict = checkSenderIdentity("Merhaba, ben Tuğrul.", "Ayşe");
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.found, "tuğrul");
  });
});

describe("9. fallback bank carries no sender identity", () => {
  it("no fallback body introduces a personal name", () => {
    for (const stance of ["first_contact", "follow_up", "demo_confirm"] as const) {
      for (const tone of TONES) {
        for (let rotation = 0; rotation < MAX_BANK_SIZE + 2; rotation++) {
          const common = {
            tone,
            businessName: "Ahmet Konağı Butik Otel",
            city: "Fethiye",
            rotation,
          };
          const fb =
            stance === "first_contact"
              ? buildFallbackMessage({ ...common, evidence: EVIDENCE })
              : buildFallbackMessage({ ...common, stance });
          assert.equal(
            checkSenderIdentity(fb.message, null).ok,
            true,
            `fallback ${stance}/${tone}/${rotation} introduced a sender name`,
          );
        }
      }
    }
  });
});

describe("normalizeSenderName", () => {
  it("folds case and strips non-letters", () => {
    assert.equal(normalizeSenderName("Ayşe"), "ayşe");
    assert.equal(normalizeSenderName("  AYŞE'yim "), "ayşeyim");
  });
});

describe("getConfiguredSenderName", () => {
  const saved = process.env.OUTREACH_SENDER_NAME;
  afterEach(() => {
    if (saved === undefined) delete process.env.OUTREACH_SENDER_NAME;
    else process.env.OUTREACH_SENDER_NAME = saved;
  });

  it("defaults to null (nameless founder voice)", () => {
    delete process.env.OUTREACH_SENDER_NAME;
    assert.equal(getConfiguredSenderName(), null);
  });
  it("treats a blank value as null", () => {
    process.env.OUTREACH_SENDER_NAME = "   ";
    assert.equal(getConfiguredSenderName(), null);
  });
  it("returns the trimmed configured name", () => {
    process.env.OUTREACH_SENDER_NAME = "  Ayşe ";
    assert.equal(getConfiguredSenderName(), "Ayşe");
  });
});
