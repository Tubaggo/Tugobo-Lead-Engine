import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildOutreachSignals,
  hasSignal,
  isLowSignal,
  signalKeys,
  type SignalInput,
} from "./signals.ts";

/** A lead with everything observable confirmed. */
const RICH: SignalInput = {
  city: "Antalya",
  businessType: "Boutique Hotel",
  hasWhatsAppPath: true,
  hasInstagram: true,
  hasOwnWebsite: true,
  channels: ["Booking", "Airbnb", "Instagram"],
  reviewsCount: 240,
  websiteIntelligence: { hasBookingCtaText: true, hasWhatsAppLink: false },
  bookingFlowStrength: 40,
  otaDependencyLikelihood: 80,
  socialDemandStrength: 75,
  communicationRisk: 70,
};

/** A lead we know almost nothing about. */
const SPARSE: SignalInput = { city: "Bodrum", businessType: "Hotel" };

describe("verified signals", () => {
  test("records only what was actually observed", () => {
    const set = buildOutreachSignals(RICH);
    const keys = set.verified.map((s) => s.key);
    assert.ok(keys.includes("whatsapp_reachable"));
    assert.ok(keys.includes("instagram_present"));
    assert.ok(keys.includes("own_website"));
    assert.ok(keys.includes("ota_listed"));
    assert.ok(keys.includes("reviews_count"));
  });

  test("does not invent a WhatsApp path when there is none", () => {
    const set = buildOutreachSignals({ ...RICH, hasWhatsAppPath: false });
    assert.equal(hasSignal(set, "whatsapp_reachable"), false);
  });

  test("does not claim Instagram when absent", () => {
    const set = buildOutreachSignals({ ...RICH, hasInstagram: false });
    assert.equal(hasSignal(set, "instagram_present"), false);
  });

  test("records a missing site WhatsApp link only when the site was inspected", () => {
    const inspected = buildOutreachSignals(RICH);
    assert.equal(hasSignal(inspected, "no_website_whatsapp_link"), true);

    const notInspected = buildOutreachSignals({
      ...RICH,
      hasOwnWebsite: false,
      websiteIntelligence: null,
    });
    assert.equal(hasSignal(notInspected, "no_website_whatsapp_link"), false);
  });

  test("every verified entry is marked verified", () => {
    const set = buildOutreachSignals(RICH);
    assert.ok(set.verified.every((s) => s.confidence === "verified"));
  });
});

describe("likely signals", () => {
  test("every likely entry is marked likely, never verified", () => {
    const set = buildOutreachSignals(RICH);
    assert.ok(set.likely.length > 0);
    assert.ok(set.likely.every((s) => s.confidence === "likely"));
  });

  test("OTA dependency needs channel evidence, not just a score", () => {
    const scoreOnly = buildOutreachSignals({
      city: "İzmir",
      otaDependencyLikelihood: 90,
      channels: [],
    });
    assert.equal(
      hasSignal(scoreOnly, "ota_dependency"),
      false,
      "a high score with no listing is not evidence",
    );

    const withListing = buildOutreachSignals({
      city: "İzmir",
      otaDependencyLikelihood: 90,
      channels: ["Booking"],
    });
    assert.equal(hasSignal(withListing, "ota_dependency"), true);
  });

  test("weak direct booking requires a website to be weak on", () => {
    const noSite = buildOutreachSignals({ bookingFlowStrength: 20, hasOwnWebsite: false });
    assert.equal(hasSignal(noSite, "weak_direct_booking"), false);
  });

  test("social demand requires an actual Instagram presence", () => {
    const noIg = buildOutreachSignals({ socialDemandStrength: 90, hasInstagram: false });
    assert.equal(hasSignal(noIg, "social_demand"), false);
  });
});

describe("sparse leads", () => {
  test("a low-signal lead produces no substantive signals", () => {
    const set = buildOutreachSignals(SPARSE);
    assert.equal(isLowSignal(set), true);
  });

  test("city and business type alone do not count as substance", () => {
    const set = buildOutreachSignals(SPARSE);
    assert.deepEqual(signalKeys(set).sort(), ["business_type", "city"]);
  });

  test("a lead with a website is no longer low-signal", () => {
    const set = buildOutreachSignals({ ...SPARSE, hasOwnWebsite: true });
    assert.equal(isLowSignal(set), false);
  });
});
