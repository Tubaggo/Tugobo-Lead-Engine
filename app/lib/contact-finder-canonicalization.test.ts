import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildContactFinderCanonicalPatch } from "./contact-finder-canonicalization.ts";

const emptyWebsiteIntelligence = () => ({});

describe("buildContactFinderCanonicalPatch — WhatsApp", () => {
  test("1. a verified link (real wa.me/whatsapp.com href) yields confirmed", () => {
    const patch = buildContactFinderCanonicalPatch(
      { whatsappConfidence: null },
      {
        verifiedWhatsAppLink: true,
        generatedWhatsAppOnly: false,
        instagramLinkFound: false,
        websiteIntelligence: emptyWebsiteIntelligence(),
      },
    );
    assert.equal(patch.whatsappConfidence, "confirmed");
  });

  test("2. a phone-derived guess never reads confirmed — only likely", () => {
    const patch = buildContactFinderCanonicalPatch(
      { whatsappConfidence: null },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: true,
        instagramLinkFound: false,
        websiteIntelligence: emptyWebsiteIntelligence(),
      },
    );
    assert.equal(patch.whatsappConfidence, "likely");
  });

  test("3. nothing found this run leaves whatsappConfidence untouched (absent from the patch)", () => {
    const patch = buildContactFinderCanonicalPatch(
      { whatsappConfidence: "likely" },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: false,
        instagramLinkFound: false,
        websiteIntelligence: emptyWebsiteIntelligence(),
      },
    );
    assert.equal(patch.whatsappConfidence, undefined);
  });

  test("4. a weaker finding never downgrades a stronger existing confidence", () => {
    const patch = buildContactFinderCanonicalPatch(
      { whatsappConfidence: "confirmed" },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: true, // would propose "likely"
        instagramLinkFound: false,
        websiteIntelligence: emptyWebsiteIntelligence(),
      },
    );
    assert.equal(patch.whatsappConfidence, undefined);
  });

  test("5. an equal-or-stronger finding is applied", () => {
    const patch = buildContactFinderCanonicalPatch(
      { whatsappConfidence: "weak" },
      {
        verifiedWhatsAppLink: true,
        generatedWhatsAppOnly: false,
        instagramLinkFound: false,
        websiteIntelligence: emptyWebsiteIntelligence(),
      },
    );
    assert.equal(patch.whatsappConfidence, "confirmed");
  });
});

describe("buildContactFinderCanonicalPatch — Instagram, never becomes WhatsApp", () => {
  test("6. Instagram evidence only ever sets instagramConfidence, never whatsappConfidence", () => {
    const patch = buildContactFinderCanonicalPatch(
      { whatsappConfidence: null, instagramConfidence: null },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: false,
        instagramLinkFound: true,
        websiteIntelligence: emptyWebsiteIntelligence(),
      },
    );
    assert.equal(patch.instagramConfidence, "confirmed");
    assert.equal(patch.whatsappConfidence, undefined);
  });

  test("7. a weaker Instagram finding never downgrades stronger existing confidence", () => {
    const patch = buildContactFinderCanonicalPatch(
      { instagramConfidence: "confirmed" },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: false,
        instagramLinkFound: false,
        websiteIntelligence: emptyWebsiteIntelligence(),
      },
    );
    assert.equal(patch.instagramConfidence, undefined);
  });
});

describe("buildContactFinderCanonicalPatch — website intelligence merge", () => {
  test("8. booleans OR together — a previously-observed true is never regressed to false", () => {
    const patch = buildContactFinderCanonicalPatch(
      { websiteIntelligence: { hasBookingCtaText: true, confidence: 40, websiteConfidence: "weak" } },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: false,
        instagramLinkFound: false,
        websiteIntelligence: { hasBookingCtaText: false, confidence: 20, websiteConfidence: "missing" },
      },
    );
    assert.equal(patch.websiteIntelligence.hasBookingCtaText, true);
  });

  test("9. fields Contact Finder does not compute survive from the existing record", () => {
    const patch = buildContactFinderCanonicalPatch(
      { websiteIntelligence: { directBookingMaturity: "high" } },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: false,
        instagramLinkFound: false,
        websiteIntelligence: { hasWhatsAppLink: true },
      },
    );
    assert.equal(patch.websiteIntelligence.directBookingMaturity, "high");
    assert.equal(patch.websiteIntelligence.hasWhatsAppLink, true);
  });

  test("10. booking CTA / OTA are never conflated — an OTA outbound link does not set hasBookingCtaText", () => {
    const patch = buildContactFinderCanonicalPatch(
      { websiteIntelligence: {} },
      {
        verifiedWhatsAppLink: false,
        generatedWhatsAppOnly: false,
        instagramLinkFound: false,
        websiteIntelligence: { hasOtaOutboundLinks: true, hasBookingCtaText: false },
      },
    );
    assert.equal(patch.websiteIntelligence.hasOtaOutboundLinks, true);
    assert.equal(patch.websiteIntelligence.hasBookingCtaText, false);
  });
});
