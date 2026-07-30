import { NextResponse } from "next/server";

import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { generateGroundedOutreach, getLlmProviderStatus } from "@/app/lib/llm/provider";
import {
  accountAngleFor,
  ANGLE_LABELS_TR,
  assignAngles,
  type VariationAngle,
} from "@/app/lib/outreach/angles";
import {
  isTone,
  makeGenerationId,
  NEEDS_RESEARCH_MESSAGE_TR,
  NEEDS_RESEARCH_REASON,
  normalizePreviousMessages,
  type OutreachGenerationResponse,
  type Tone,
} from "@/app/lib/outreach/contract";
import {
  generateOutreachMessage,
  type OutreachProvider,
} from "@/app/lib/outreach/engine";
import {
  buildPersonalizationEvidence,
  computeEvidenceFingerprint,
  selectEvidence,
  type EvidenceSelection,
} from "@/app/lib/outreach/evidence";
import { buildFallbackMessage } from "@/app/lib/outreach/fallback";
import { isOutreachStance, type OutreachStance } from "@/app/lib/outreach/lifecycle";
import { buildOutreachMessageSystem } from "@/app/lib/outreach/prompt";
import { getConfiguredSenderName } from "@/app/lib/outreach/sender-identity";
import { buildOutreachSignals, isLowSignal } from "@/app/lib/outreach/signals";
import { isDuplicate } from "@/app/lib/outreach/text";

/**
 * Personalized outreach message generation (v3.7.6).
 *
 * Replaces the previous "build a template, then ask the LLM to polish it"
 * flow. That design was why the three tones read as paraphrases and why
 * regenerate returned the same copy: the subject was fixed by the template
 * before the model ever saw it.
 *
 * Now the route builds a verified/likely signal split, assigns each tone its
 * own variation angle, and runs the engine per tone. The engine validates,
 * retries on a new angle, and falls back to a deterministic bank — so a
 * response always carries three usable messages.
 *
 * Generates nothing automatically and sends nothing. The founder copies or
 * opens WhatsApp manually.
 */

export const dynamic = "force-dynamic";

const TONE_ORDER: Tone[] = ["soft", "direct", "consultative"];

/** Legacy style key ↔ tone. The UI and stored queue items still use these. */
const TONE_TO_STYLE: Record<Tone, "soft" | "direct" | "premium"> = {
  soft: "soft",
  direct: "direct",
  consultative: "premium",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function readNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Which tones may carry a second, coherent evidence item.
 *
 * Only the direct tone. Its shape is a binary question ("bu iki kanaldan gelen
 * talepler aynı yerde mi ilerliyor, ayrı ayrı mı?") and that question needs
 * two channels to exist at all. Soft and consultative stay on one signal, so
 * the three options differ in structure rather than in adjectives — which is
 * the whole reason to offer three.
 */
const SUPPORTING_EVIDENCE_TONES = new Set<Tone>(["direct"]);

async function handlePOST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  const businessName = typeof body.name === "string" ? body.name.trim() : "";
  const businessType = typeof body.type === "string" ? body.type.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";

  if (!businessName || !businessType || !location) {
    return NextResponse.json(
      { error: "name, type ve location zorunludur" },
      { status: 400 },
    );
  }
  if (!leadId) {
    return NextResponse.json({ error: "leadId zorunludur" }, { status: 400 });
  }

  // An explicitly supplied tone must be valid; absent means "give me all three
  // and treat soft as the primary", which is what the modal opens with.
  if (body.tone !== undefined && !isTone(body.tone)) {
    return NextResponse.json({ error: "Geçersiz ton" }, { status: 400 });
  }
  const requestedTone: Tone = isTone(body.tone) ? body.tone : "soft";

  // `location` arrives as "City, Region"; the city is the part worth using.
  const city = location.split(",")[0]?.trim() || undefined;

  const wi = isRecord(body.websiteIntelligence) ? body.websiteIntelligence : null;

  const signals = buildOutreachSignals({
    city,
    businessType,
    hasWhatsAppPath: readBool(body.hasWhatsAppPath),
    hasInstagram: readBool(body.hasInstagram),
    hasOwnWebsite: readBool(body.hasOwnWebsite),
    channels: readStrings(body.channels),
    businessSignals: readStrings(body.businessSignals),
    reviewsCount: readNum(body.reviewsCount),
    websiteIntelligence: wi
      ? {
          hasBookingCtaText: readBool(wi.hasBookingCtaText),
          hasWhatsAppLink: readBool(wi.hasWhatsAppLink),
          hasBookingEngine: readBool(wi.hasBookingEngine),
        }
      : null,
    bookingFlowStrength: readNum(body.bookingFlowStrength),
    otaDependencyLikelihood: readNum(body.otaDependencyLikelihood),
    socialDemandStrength: readNum(body.socialDemandStrength),
    communicationRisk: readNum(body.communicationRisk),
  });

  const previousMessages = normalizePreviousMessages(body.previousMessages);
  const regenerate = body.regenerate === true;

  /*
   * Relationship position. Defaults to first contact on anything unrecognised:
   * writing "as discussed" to someone we have never messaged is far worse than
   * introducing ourselves to someone we already have.
   */
  const stance: OutreachStance = isOutreachStance(body.stance)
    ? body.stance
    : "first_contact";

  // Rotation drives both the angle assignment and the fallback walk, so a
  // regenerate lands on a different subject rather than a reworded one.
  const nonceRaw = Number(body.regenerateNonce ?? 0);
  const rotation = Number.isFinite(nonceRaw) ? Math.max(0, Math.floor(nonceRaw)) : 0;
  const generationNonce =
    typeof body.generationNonce === "string" && body.generationNonce.trim()
      ? body.generationNonce.trim().slice(0, 64)
      : `${rotation}-${Date.now().toString(36)}`;

  const tugoboFitReasons = readStrings(body.whyThisLead).slice(0, 4);
  const tugoboFit =
    tugoboFitReasons.length > 0 ? { reasons: tugoboFitReasons } : undefined;

  /*
   * The account-specific evidence pack, and the gate it guards (v3.7.9).
   *
   * A first message is only worth sending when it opens on something we
   * actually observed about *this* business. With nothing observed there is no
   * honest message to write — only a respectful, grounded circular that reads
   * as one — so the request ends here: no provider call, no fallback draft, no
   * write. The founder gets an instruction instead of a message.
   */
  const evidencePack = buildPersonalizationEvidence({
    businessType,
    businessSignals: readStrings(body.businessSignals),
    channels: readStrings(body.channels),
    hasInstagram: readBool(body.hasInstagram),
    hasOwnWebsite: readBool(body.hasOwnWebsite),
    websiteIntelligence: wi
      ? {
          hasWhatsAppLink: readBool(wi.hasWhatsAppLink),
          hasBookingCtaText: readBool(wi.hasBookingCtaText),
          hasBookingEngine: readBool(wi.hasBookingEngine),
          // The crawler's field is `hasInquiryForm`; the evidence model calls
          // the same observation a contact form.
          hasContactForm: readBool(wi.hasContactForm) ?? readBool(wi.hasInquiryForm),
          languages: readStrings(wi.languages),
          roomTypeCount: readNum(wi.roomTypeCount),
          offerCount: readNum(wi.offerCount),
          positioning: readStrings(wi.positioning),
          serviceCategories: readStrings(wi.serviceCategories),
          url: readString(wi.url),
          capturedAt: readString(wi.capturedAt),
        }
      : null,
  });

  if (stance === "first_contact" && evidencePack.length === 0) {
    return NextResponse.json({
      ok: true,
      status: "needs_research",
      reason: NEEDS_RESEARCH_REASON,
      notice: NEEDS_RESEARCH_MESSAGE_TR,
      weakSignals: true,
      llm_refined: false,
      meta: {
        name: businessName,
        type: businessType,
        location,
        provider: getLlmProviderStatus().provider_name,
        regenerate,
        stance,
        verifiedSignalCount: signals.verified.length,
        likelySignalCount: signals.likely.length,
        evidenceCount: 0,
      },
    });
  }

  const status = getLlmProviderStatus();
  const provider: OutreachProvider | null = status.llm_enabled
    ? (p) => generateGroundedOutreach(p)
    : null;

  // Server-side only; never returned to the client or logged. Default null →
  // the nameless founder voice (no invented sender name can appear).
  const senderName = getConfiguredSenderName();

  const angles = assignAngles(signals, rotation, stance);
  const systemPrompt = buildOutreachMessageSystem(stance);

  /*
   * All three tones share one primary hook — it is the strongest observation
   * we have, and offering three messages built on three different observations
   * would ask the founder to pick an *observation*, which is not a choice they
   * have any basis to make. They differ in the question they ask off it, and
   * the direct tone additionally gets the coherent supporting item.
   */
  const evidenceFor = (tone: Tone): EvidenceSelection | null =>
    stance === "first_contact"
      ? selectEvidence(evidencePack, {
          rotation,
          allowSupporting: SUPPORTING_EVIDENCE_TONES.has(tone),
        })
      : null;

  // Per-tone generation. Each tone gets its own angle and its own validation
  // and fallback, so one weak result cannot drag the other two down.
  const results = await Promise.all(
    TONE_ORDER.map((tone) => {
      const evidence = evidenceFor(tone);
      return generateOutreachMessage({
        leadId,
        businessName,
        city,
        businessType,
        tone,
        angle: evidence
          ? accountAngleFor(evidence, rotation + TONE_ORDER.indexOf(tone))
          : angles[tone],
        signals,
        tugoboFit,
        // A tone must also avoid what the *other* tones already said this
        // round is handled below; here it only avoids prior rounds.
        previousMessages,
        generationNonce: `${generationNonce}:${tone}`,
        rotation: rotation + TONE_ORDER.indexOf(tone),
        provider,
        systemPrompt,
        stance,
        senderName,
        evidence,
      });
    }),
  );

  const byTone = new Map<Tone, OutreachGenerationResponse>();
  TONE_ORDER.forEach((tone, i) => {
    const result = results[i];
    /*
     * Unreachable: the gate above already returned for an empty pack, so every
     * first-contact call below carries evidence. Handled rather than asserted
     * because a `needs_research` result has no message, and quietly indexing
     * past that would put `undefined` on the founder's screen.
     */
    if (result.status === "generated") byTone.set(tone, result);
  });
  if (byTone.size !== TONE_ORDER.length) {
    return NextResponse.json({
      ok: true,
      status: "needs_research",
      reason: NEEDS_RESEARCH_REASON,
      notice: NEEDS_RESEARCH_MESSAGE_TR,
      weakSignals: true,
      llm_refined: false,
      meta: { name: businessName, type: businessType, location, stance, evidenceCount: 0 },
    });
  }

  /*
   * The three tones run concurrently and therefore cannot see each other. If
   * two land too close, rewrite the later one from the fallback bank on an
   * unused angle — three near-identical options are worse than two good ones
   * plus a plainly different third.
   */
  let collisionFixed = false;
  const accepted: string[] = [];
  const usedAngles: VariationAngle[] = [];
  for (const tone of TONE_ORDER) {
    const current = byTone.get(tone)!;
    if (!isDuplicate(current.message, accepted)) {
      accepted.push(current.message);
      usedAngles.push(current.variationAngle);
      continue;
    }
    const evidence = evidenceFor(tone);
    const replacement = evidence
      ? buildFallbackMessage({
          tone,
          businessName,
          city,
          rotation: rotation + TONE_ORDER.indexOf(tone) + 1,
          exclude: usedAngles,
          evidence,
        })
      : buildFallbackMessage({
          tone,
          businessName,
          city,
          rotation: rotation + TONE_ORDER.indexOf(tone) + 1,
          exclude: usedAngles,
          // Narrowed for the discriminated union; first contact took the
          // branch above, and the gate guarantees it has evidence.
          stance: stance === "demo_confirm" ? "demo_confirm" : "follow_up",
        });
    collisionFixed = true;
    byTone.set(tone, {
      ...current,
      message: replacement.message,
      source: "fallback",
      variationAngle: replacement.variationAngle,
      duplicateAvoided: true,
    });
    accepted.push(replacement.message);
    usedAngles.push(replacement.variationAngle);
  }

  const styles = {
    soft: byTone.get("soft")!.message,
    direct: byTone.get("direct")!.message,
    premium: byTone.get("consultative")!.message,
  };

  const primary = byTone.get(requestedTone)!;
  const generated = [...byTone.values()];
  const anyProvider = generated.some((r) => r.source === "provider");

  return NextResponse.json({
    /* --- v3.7.6 contract (for the requested tone) --- */
    ok: true,
    status: "generated",
    message: primary.message,
    tone: primary.tone,
    source: primary.source,
    variationAngle: primary.variationAngle,
    variationAngleLabel: ANGLE_LABELS_TR[primary.variationAngle],
    usedSignalKeys: primary.usedSignalKeys,
    generationId: makeGenerationId(leadId, generationNonce),
    duplicateAvoided: collisionFixed || generated.some((r) => r.duplicateAvoided),

    /* --- per-tone detail, so the modal can label each tone --- */
    tones: Object.fromEntries(
      TONE_ORDER.map((tone) => [
        tone,
        {
          message: byTone.get(tone)!.message,
          source: byTone.get(tone)!.source,
          variationAngle: byTone.get(tone)!.variationAngle,
          variationAngleLabel: ANGLE_LABELS_TR[byTone.get(tone)!.variationAngle],
          personalization: byTone.get(tone)!.personalization,
        },
      ]),
    ),

    /* --- legacy shape, still consumed by the outreach queue --- */
    styles,
    variations: [styles.soft, styles.direct, styles.premium],
    weakSignals: isLowSignal(signals),
    llm_refined: anyProvider,
    rationaleNote: `Mesaj açısı: ${ANGLE_LABELS_TR[primary.variationAngle]}`,
    meta: {
      name: businessName,
      type: businessType,
      location,
      provider: status.provider_name,
      regenerate,
      stance,
      verifiedSignalCount: signals.verified.length,
      likelySignalCount: signals.likely.length,
      evidenceCount: evidencePack.length,
      styleKey: TONE_TO_STYLE[requestedTone],
      /**
       * v3.8.2: a digest of the evidence pack this generation was built from
       * — see `outreach/evidence.ts`'s `computeEvidenceFingerprint`. The pack
       * is shared across all three tones (only the *selected* item per tone
       * differs), so one value covers the whole response. A saving client
       * stores this on the draft; a later re-enrichment that changes the
       * pack produces a different value, which is how staleness is detected
       * without ever persisting the evidence itself.
       */
      evidenceFingerprint: computeEvidenceFingerprint(evidencePack),
    },
  });
}

/** Protected: unauthenticated callers get a generic JSON 401. */
export const POST = withAdminSession(handlePOST);
