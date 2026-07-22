import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFallbackMessage } from "./fallback.ts";
import {
  computeGuideAction,
  computeOutreachStance,
  GUIDE_ACTION_LABELS,
  isOutreachStance,
  STANCE_BRIEFS_TR,
  type OutreachLifecycleContext,
} from "./lifecycle.ts";
import { buildOutreachUserPrompt } from "./prompt.ts";
import { buildOutreachSignals } from "./signals.ts";

function ctx(over: Partial<OutreachLifecycleContext> = {}): OutreachLifecycleContext {
  return { hasPreviousContact: false, ...over };
}

/* -------------------------------------------------------------------------- */
/* stance                                                                     */
/* -------------------------------------------------------------------------- */

describe("computeOutreachStance", () => {
  it("treats an untouched lead as first contact", () => {
    assert.equal(computeOutreachStance(ctx()), "first_contact");
  });

  it("does not turn a queued lead into a follow-up", () => {
    assert.equal(
      computeOutreachStance(ctx({ isQueued: true, salesStage: "new" })),
      "first_contact",
    );
  });

  it("keeps first-contact language when a follow-up is due but nobody was contacted", () => {
    assert.equal(
      computeOutreachStance(
        ctx({ followUpDue: true, salesStage: "needs_follow_up", hasPreviousContact: false }),
      ),
      "first_contact",
    );
  });

  it("uses follow-up language only once contact actually happened", () => {
    assert.equal(
      computeOutreachStance(ctx({ followUpDue: true, hasPreviousContact: true })),
      "follow_up",
    );
  });

  it("treats a contacted lead as a follow-up even before the due date", () => {
    assert.equal(
      computeOutreachStance(ctx({ salesStage: "contacted", hasPreviousContact: true })),
      "follow_up",
    );
  });

  it("switches to demo confirmation for a booked meeting", () => {
    assert.equal(
      computeOutreachStance(
        ctx({ salesStage: "meeting", hasPreviousContact: true, followUpDue: true }),
      ),
      "demo_confirm",
    );
  });

  it("validates stance strings off the wire", () => {
    assert.equal(isOutreachStance("follow_up"), true);
    assert.equal(isOutreachStance("smalltalk"), false);
    assert.equal(isOutreachStance(undefined), false);
  });
});

/* -------------------------------------------------------------------------- */
/* today's action                                                             */
/* -------------------------------------------------------------------------- */

describe("computeGuideAction", () => {
  const reachable = { hasVerifiedChannel: true, doNotContact: false };

  it("blocks everything for a do-not-contact lead", () => {
    assert.equal(
      computeGuideAction(ctx({ followUpDue: true, hasPreviousContact: true }), {
        hasVerifiedChannel: true,
        doNotContact: true,
      }),
      "do_not_contact",
    );
  });

  it("asks for channel verification before any outreach action", () => {
    assert.equal(
      computeGuideAction(ctx(), { hasVerifiedChannel: false, doNotContact: false }),
      "verify_channel",
    );
  });

  it("asks for first contact on a reachable untouched lead", () => {
    assert.equal(computeGuideAction(ctx(), reachable), "first_contact");
  });

  it("asks for first contact on a queued untouched lead", () => {
    assert.equal(
      computeGuideAction(ctx({ isQueued: true, followUpDue: true }), reachable),
      "first_contact",
    );
  });

  it("asks for a follow-up only with real prior contact", () => {
    assert.equal(
      computeGuideAction(ctx({ followUpDue: true, hasPreviousContact: true }), reachable),
      "follow_up",
    );
  });

  it("holds a contacted lead whose follow-up is not due", () => {
    assert.equal(
      computeGuideAction(ctx({ hasPreviousContact: true, followUpDue: false }), reachable),
      "hold",
    );
  });

  it("asks for demo confirmation at the meeting stage", () => {
    assert.equal(
      computeGuideAction(ctx({ salesStage: "meeting", hasPreviousContact: true }), reachable),
      "demo_confirm",
    );
  });

  it("holds a closed lead", () => {
    assert.equal(
      computeGuideAction(ctx(), { ...reachable, closed: true }),
      "hold",
    );
  });

  it("labels every action in both locales", () => {
    for (const key of Object.keys(GUIDE_ACTION_LABELS)) {
      const label = GUIDE_ACTION_LABELS[key as keyof typeof GUIDE_ACTION_LABELS];
      assert.ok(label.tr.length > 0, `${key} tr`);
      assert.ok(label.en.length > 0, `${key} en`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* stance reaches the copy                                                    */
/* -------------------------------------------------------------------------- */

describe("stance in the generated copy", () => {
  const signals = buildOutreachSignals({ city: "Antalya", businessType: "otel" });

  const promptFor = (stance: "first_contact" | "follow_up" | "demo_confirm") =>
    buildOutreachUserPrompt({
      businessName: "Kaş Konak",
      city: "Antalya",
      businessType: "otel",
      tone: "soft",
      angle: "channel-consolidation",
      signals,
      previousMessages: [],
      generationNonce: "n1",
      stance,
    });

  it("tells the model not to invent a prior conversation on first contact", () => {
    const prompt = promptFor("first_contact");
    assert.ok(prompt.includes("İLİŞKİ DURUMU: first_contact"));
    assert.ok(prompt.includes(STANCE_BRIEFS_TR.first_contact));
  });

  it("carries the follow-up brief when asked", () => {
    assert.ok(promptFor("follow_up").includes(STANCE_BRIEFS_TR.follow_up));
  });

  it("defaults to first contact when no stance is supplied", () => {
    const prompt = buildOutreachUserPrompt({
      businessName: "Kaş Konak",
      tone: "soft",
      angle: "channel-consolidation",
      signals,
      previousMessages: [],
      generationNonce: "n1",
    });
    assert.ok(prompt.includes("İLİŞKİ DURUMU: first_contact"));
  });
});

describe("stance in the fallback bank", () => {
  const base = { tone: "soft" as const, businessName: "Kaş Konak", city: "Antalya" };

  it("never references a prior message on first contact", () => {
    for (let rotation = 0; rotation < 8; rotation += 1) {
      const { message } = buildFallbackMessage({ ...base, rotation });
      assert.ok(
        !/önceki|yazmıştım|görüşmemiz/i.test(message),
        `rotation ${rotation}: ${message}`,
      );
    }
  });

  it("opens as a follow-up only when the stance says so", () => {
    const { message } = buildFallbackMessage({ ...base, rotation: 0, stance: "follow_up" });
    assert.match(message, /yazdığım notun üzerine/);
  });

  it("confirms rather than pitches at the demo stage", () => {
    const { message } = buildFallbackMessage({
      ...base,
      rotation: 0,
      stance: "demo_confirm",
    });
    assert.match(message, /görüşme/i);
    assert.ok(message.includes("Kaş Konak"));
  });

  it("still produces distinct first-contact bodies across rotations", () => {
    const seen = new Set(
      [0, 1, 2, 3].map((rotation) => buildFallbackMessage({ ...base, rotation }).message),
    );
    assert.equal(seen.size, 4);
  });
});
