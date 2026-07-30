import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildPersonalizationEvidence,
  computeEvidenceFingerprint,
} from "./evidence.ts";

/**
 * v3.8.2 — the P0 fix: a deterministic fingerprint over the evidence pack,
 * used to detect when a draft's underlying evidence has changed since it
 * was generated.
 */

describe("computeEvidenceFingerprint", () => {
  test("1. an empty pack has a stable, non-empty fingerprint", () => {
    const fp = computeEvidenceFingerprint([]);
    assert.equal(typeof fp, "string");
    assert.ok(fp.length > 0);
    assert.equal(fp, computeEvidenceFingerprint([]));
  });

  test("2. two packs built from the same inputs produce the same fingerprint", () => {
    const input = {
      hasInstagram: true,
      hasOwnWebsite: true,
      websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true },
    };
    const a = computeEvidenceFingerprint(buildPersonalizationEvidence(input));
    const b = computeEvidenceFingerprint(buildPersonalizationEvidence(input));
    assert.equal(a, b);
  });

  test("3. pack order does not affect the fingerprint", () => {
    const pack = buildPersonalizationEvidence({
      hasInstagram: true,
      channels: ["Booking"],
      websiteIntelligence: { hasWhatsAppLink: true, hasContactForm: true },
    });
    assert.ok(pack.length >= 3, "need at least 3 evidence items to reorder meaningfully");
    const reversed = [...pack].reverse();
    assert.equal(computeEvidenceFingerprint(pack), computeEvidenceFingerprint(reversed));
  });

  test("4. capturedAt-only differences do not change the fingerprint", () => {
    const base = { hasInstagram: false, websiteIntelligence: { hasWhatsAppLink: true } };
    const a = buildPersonalizationEvidence({
      ...base,
      websiteIntelligence: { ...base.websiteIntelligence, capturedAt: "2026-01-01T00:00:00.000Z" },
    });
    const b = buildPersonalizationEvidence({
      ...base,
      websiteIntelligence: { ...base.websiteIntelligence, capturedAt: "2026-07-29T00:00:00.000Z" },
    });
    assert.equal(computeEvidenceFingerprint(a), computeEvidenceFingerprint(b));
  });

  test("5. sourceUrl-only differences do not change the fingerprint", () => {
    const a = buildPersonalizationEvidence({
      websiteIntelligence: { hasWhatsAppLink: true, url: "https://a.example.com" },
    });
    const b = buildPersonalizationEvidence({
      websiteIntelligence: { hasWhatsAppLink: true, url: "https://b.example.com" },
    });
    assert.equal(computeEvidenceFingerprint(a), computeEvidenceFingerprint(b));
  });

  test("6. a materially different pack (new evidence type) changes the fingerprint", () => {
    const before = buildPersonalizationEvidence({
      websiteIntelligence: { hasWhatsAppLink: true },
    });
    const after = buildPersonalizationEvidence({
      websiteIntelligence: { hasWhatsAppLink: true, hasBookingCtaText: true },
    });
    assert.notEqual(computeEvidenceFingerprint(before), computeEvidenceFingerprint(after));
  });

  test("7. a materially different metadata value (room count) changes the fingerprint", () => {
    const before = buildPersonalizationEvidence({
      websiteIntelligence: { roomTypeCount: 3 },
    });
    const after = buildPersonalizationEvidence({
      websiteIntelligence: { roomTypeCount: 8 },
    });
    assert.notEqual(computeEvidenceFingerprint(before), computeEvidenceFingerprint(after));
  });

  test("8. losing all evidence changes the fingerprint from the non-empty one", () => {
    const some = buildPersonalizationEvidence({ hasInstagram: true });
    const none = buildPersonalizationEvidence({ hasInstagram: false });
    assert.notEqual(computeEvidenceFingerprint(some), computeEvidenceFingerprint(none));
  });
});
