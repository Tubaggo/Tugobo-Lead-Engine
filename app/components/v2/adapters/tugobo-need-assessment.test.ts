import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTugoboNeedAssessment,
  buildTugoboNeedFounderSentence,
  type TugoboNeedLeadLike,
  type TugoboNeedReasonCode,
} from "./tugobo-need-assessment.ts";

const ALL_REASON_CODES: TugoboNeedReasonCode[] = [
  "MULTI_CHANNEL_DEMAND",
  "WHATSAPP_ACTIVE",
  "INSTAGRAM_ACTIVE",
  "WEBSITE_ACTIVE",
  "BOOKING_CTA_PRESENT",
  "DIRECT_BOOKING_GAP",
  "OTA_DEPENDENCY",
  "HIGH_REVIEW_VOLUME",
  "CHAIN_COMPLEXITY",
  "REVENUE_OPPORTUNITY",
  "INSUFFICIENT_VERIFIED_SIGNALS",
];

function lead(overrides: Partial<TugoboNeedLeadLike> = {}): TugoboNeedLeadLike {
  return { name: "Test Otel", ...overrides };
}

/* ── #17/18/19/20 — geography and segment never decide level ────── */

test("#17 a weak-signal business never reaches high need on its own (no city input exists to bias it)", () => {
  const weak = lead({
    website: undefined,
    signalVerification: {
      whatsappVerification: "not_found",
      websiteVerification: "not_found",
      instagramVerification: "not_found",
      reservationSignal: "not_found",
    },
    hasInstagram: false,
    reviewsCount: 3,
  });
  const result = computeTugoboNeedAssessment(weak);
  assert.notEqual(result.level, "high");
});

test("#18 strong verified multi-channel signals reach high need regardless of any city label", () => {
  const strong = lead({
    website: "https://oteldeniz.com",
    hasInstagram: true,
    reviewsCount: 120,
    verifiedOpportunityScore: 88,
    signalVerification: {
      whatsappVerification: "verified",
      websiteVerification: "verified",
      instagramVerification: "verified",
      reservationSignal: "verified",
    },
    icpAlignment: { otaDependencyLevel: "high" },
  });
  const result = computeTugoboNeedAssessment(strong);
  assert.equal(result.level, "high");
});

test("#19 an independent/budget business with strong digital signals can reach high or medium need", () => {
  const altSegment = lead({
    businessOwnershipType: "independent",
    website: "https://ucuzpansiyon.com",
    hasInstagram: true,
    reviewsCount: 45,
    signalVerification: {
      whatsappVerification: "likely",
      websiteVerification: "reachable",
    },
  });
  const result = computeTugoboNeedAssessment(altSegment);
  assert.ok(result.level === "high" || result.level === "medium");
});

test("#20 a luxury-style business with weak digital-demand evidence is not automatically high need", () => {
  // No luxury/star field exists on the input type at all — this lead simply
  // carries weak evidence, which is the only thing that can matter.
  const weakLuxury = lead({
    businessOwnershipType: "chain",
    signalVerification: { whatsappVerification: "not_found", websiteVerification: "not_found" },
    hasInstagram: false,
    reviewsCount: 2,
  });
  const result = computeTugoboNeedAssessment(weakLuxury);
  assert.notEqual(result.level, "high");
});

/* ── #21/22/23 — evidence dimensions genuinely move the score ───── */

test("#21 multi-channel verified signals raise the score vs. a single-channel business", () => {
  const singleChannel = computeTugoboNeedAssessment(
    lead({ signalVerification: { whatsappVerification: "verified" } }),
  );
  const multiChannel = computeTugoboNeedAssessment(
    lead({
      hasInstagram: true,
      website: "https://a.com",
      signalVerification: { whatsappVerification: "verified" },
    }),
  );
  assert.ok(multiChannel.score > singleChannel.score);
  assert.ok(multiChannel.reasonCodes.includes("MULTI_CHANNEL_DEMAND"));
});

test("#22 OTA dependency plus a direct-booking gap raises the score", () => {
  const withoutGap = computeTugoboNeedAssessment(lead({ hasInstagram: true }));
  const withGap = computeTugoboNeedAssessment(
    lead({
      hasInstagram: true,
      icpAlignment: { otaDependencyLevel: "high", directBookingReadiness: "low" },
    }),
  );
  assert.ok(withGap.score > withoutGap.score);
  assert.ok(withGap.reasonCodes.includes("OTA_DEPENDENCY"));
  assert.ok(withGap.reasonCodes.includes("DIRECT_BOOKING_GAP"));
});

test("#23 high review volume is used as a demand proxy", () => {
  const lowReviews = computeTugoboNeedAssessment(lead({ hasInstagram: true, reviewsCount: 5 }));
  const highReviews = computeTugoboNeedAssessment(lead({ hasInstagram: true, reviewsCount: 90 }));
  assert.ok(highReviews.score > lowReviews.score);
  assert.ok(highReviews.reasonCodes.includes("HIGH_REVIEW_VOLUME"));
});

/* ── #24/25 — missing evidence vs. insufficient evidence ─────────── */

test("#24 an undefined field is never read as a negative signal", () => {
  const knownPositiveOnly = computeTugoboNeedAssessment(
    lead({ hasInstagram: true, website: "https://a.com" }),
  );
  const sameButWithMoreUndefinedFields = computeTugoboNeedAssessment(
    lead({ hasInstagram: true, website: "https://a.com", reviewsCount: undefined, verifiedOpportunityScore: undefined }),
  );
  assert.equal(knownPositiveOnly.score, sameButWithMoreUndefinedFields.score);
  assert.ok(sameButWithMoreUndefinedFields.missingEvidence.length > 0);
});

test("#25 too little checked evidence produces insufficient_evidence, not a rejection", () => {
  const barelyAnything = computeTugoboNeedAssessment(lead({ reviewsCount: 12 }));
  assert.equal(barelyAnything.level, "insufficient_evidence");
  assert.equal(barelyAnything.confidence, "low");
  assert.deepEqual(barelyAnything.reasonCodes, ["INSUFFICIENT_VERIFIED_SIGNALS"]);
});

test("a genuinely empty lead (nothing ever checked) is insufficient_evidence, never low", () => {
  const empty = computeTugoboNeedAssessment(lead());
  assert.equal(empty.level, "insufficient_evidence");
  assert.ok(empty.missingEvidence.length >= 6);
});

test("checked-and-confirmed-absent evidence (not merely missing) legitimately produces low, not insufficient_evidence", () => {
  const confirmedWeak = computeTugoboNeedAssessment(
    lead({
      signalVerification: {
        whatsappVerification: "not_found",
        websiteVerification: "not_found",
        instagramVerification: "not_found",
        reservationSignal: "not_found",
      },
      hasInstagram: false,
      reviewsCount: 2,
    }),
  );
  assert.equal(confirmedWeak.level, "low");
});

/* ── #26 — score and confidence are independent axes ─────────────── */

test("#26 a high score with only inferred (never verified) signals carries lower confidence, not automatic trust", () => {
  const inferredOnly = computeTugoboNeedAssessment(
    lead({
      hasInstagram: true,
      website: "https://a.com",
      signalVerification: { whatsappVerification: "likely", reservationSignal: "detected" },
      icpAlignment: { otaDependencyLevel: "high" },
    }),
  );
  assert.equal(inferredOnly.level, "high");
  assert.notEqual(inferredOnly.confidence, "high");
});

test("multiple verified channels plus demand evidence together reach high confidence", () => {
  const wellVerified = computeTugoboNeedAssessment(
    lead({
      reviewsCount: 50,
      signalVerification: { whatsappVerification: "verified", websiteVerification: "verified" },
    }),
  );
  assert.equal(wellVerified.confidence, "high");
});

/* ── #27 — geography/segment fields, even if present via duck-typing, are ignored ── */

test("#27 extra city/region/star fields on a real ScoredLead-shaped object never change the result", () => {
  const base = { name: "Otel", hasInstagram: true, website: "https://a.com" };
  const withoutGeo = computeTugoboNeedAssessment(base as TugoboNeedLeadLike);
  const withGeo = computeTugoboNeedAssessment({
    ...base,
    city: "Antalya",
    region: "Akdeniz",
    starRating: 5,
  } as TugoboNeedLeadLike);
  assert.deepEqual(withoutGeo, withGeo);
});

/* ── #28/29 — reasons are grounded, never fabricated ─────────────── */

test("#28 a reason code appears only when its underlying evidence is actually present", () => {
  const noWhatsapp = computeTugoboNeedAssessment(
    lead({ hasInstagram: true, website: "https://a.com", reviewsCount: 40 }),
  );
  assert.ok(!noWhatsapp.reasonCodes.includes("WHATSAPP_ACTIVE"));

  const withWhatsapp = computeTugoboNeedAssessment(
    lead({
      hasInstagram: true,
      website: "https://a.com",
      reviewsCount: 40,
      signalVerification: { whatsappVerification: "verified" },
    }),
  );
  assert.ok(withWhatsapp.reasonCodes.includes("WHATSAPP_ACTIVE"));
});

test("#29 reason codes are always drawn from the fixed vocabulary — never a hallucinated ad-spend or message-volume code", () => {
  const leads = [
    lead(),
    lead({ hasInstagram: true, website: "https://a.com", reviewsCount: 90, verifiedOpportunityScore: 80 }),
    lead({ businessOwnershipType: "chain", icpAlignment: { operationalComplexityScore: 80 }, hasInstagram: true, website: "https://a.com" }),
  ];
  for (const l of leads) {
    const result = computeTugoboNeedAssessment(l);
    for (const code of result.reasonCodes) {
      assert.ok(ALL_REASON_CODES.includes(code));
    }
  }
});

test("chain complexity is informational only — never moves the score by itself", () => {
  const independentStrong = computeTugoboNeedAssessment(
    lead({ hasInstagram: true, website: "https://a.com", reviewsCount: 40, businessOwnershipType: "independent" }),
  );
  const chainSameSignals = computeTugoboNeedAssessment(
    lead({ hasInstagram: true, website: "https://a.com", reviewsCount: 40, businessOwnershipType: "chain" }),
  );
  assert.equal(independentStrong.score, chainSameSignals.score);
  assert.ok(!independentStrong.reasonCodes.includes("CHAIN_COMPLEXITY"));
  assert.ok(chainSameSignals.reasonCodes.includes("CHAIN_COMPLEXITY"));
});

/* ── founder sentence: geography as context only, never as the reason ── */

test("founder sentence states geography as sourcing context, never as the reason itself", () => {
  const strong = computeTugoboNeedAssessment(
    lead({
      website: "https://a.com",
      hasInstagram: true,
      signalVerification: { whatsappVerification: "verified" },
    }),
  );
  const sentence = buildTugoboNeedFounderSentence(strong, "Antalya");
  assert.ok(sentence.startsWith("Antalya pazarında bulundu; ancak"));
  assert.ok(!sentence.match(/^Antalya'da olduğu için/));
  assert.ok(sentence.includes(strong.reasonsTr[0]));
});

test("founder sentence never claims a reason with insufficient evidence", () => {
  const empty = computeTugoboNeedAssessment(lead());
  const sentence = buildTugoboNeedFounderSentence(empty, "Antalya");
  assert.ok(sentence.includes("yeterli doğrulanmış sinyal henüz yok"));
});

/* ── manual QA fixtures A–D, encoded as tests ─────────────────────── */

test("Fixture A — weak digital evidence: not high need, geography alone is never the reason", () => {
  const fixtureA = lead({
    website: undefined,
    hasInstagram: false,
    signalVerification: {
      whatsappVerification: "not_found",
      websiteVerification: "not_found",
      instagramVerification: "not_found",
      reservationSignal: "not_found",
    },
    reviewsCount: 4,
  });
  const result = computeTugoboNeedAssessment(fixtureA);
  assert.notEqual(result.level, "high");
});

test("Fixture B — verified multi-channel + demand + OTA dependency: high need, city plays no role", () => {
  const fixtureB = lead({
    website: "https://grandistanbul.com",
    hasInstagram: true,
    reviewsCount: 340,
    verifiedOpportunityScore: 91,
    signalVerification: {
      whatsappVerification: "verified",
      websiteVerification: "verified",
      instagramVerification: "verified",
      reservationSignal: "verified",
    },
    icpAlignment: { otaDependencyLevel: "high" },
  });
  const result = computeTugoboNeedAssessment(fixtureB);
  assert.equal(result.level, "high");
});

test("Fixture C — independent budget hotel with strong digital signals stays in the running, segment never eliminates it", () => {
  const fixtureC = lead({
    businessOwnershipType: "independent",
    website: "https://kucukpansiyon.com",
    hasInstagram: true,
    reviewsCount: 65,
    signalVerification: { whatsappVerification: "verified" },
    icpAlignment: { otaDependencyLevel: "high", directBookingReadiness: "low" },
  });
  const result = computeTugoboNeedAssessment(fixtureC);
  assert.notEqual(result.level, "low");
  assert.notEqual(result.level, "insufficient_evidence");
});

test("Fixture D — luxury-labeled but weak verified digital-demand evidence: not automatic high need", () => {
  const fixtureD = lead({
    businessOwnershipType: "chain",
    signalVerification: { whatsappVerification: "not_found", websiteVerification: "not_found" },
    hasInstagram: false,
    reviewsCount: 8,
  });
  const result = computeTugoboNeedAssessment(fixtureD);
  assert.notEqual(result.level, "high");
});
