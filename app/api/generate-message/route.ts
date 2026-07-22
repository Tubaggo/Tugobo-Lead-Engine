import { NextResponse } from "next/server";

import { withAdminSession } from "@/app/lib/auth/require-admin-session";
import { generateGroundedOutreach, getLlmProviderStatus } from "@/app/lib/llm/provider";
import {
  ANGLE_LABELS_TR,
  assignAngles,
  type VariationAngle,
} from "@/app/lib/outreach/angles";
import {
  isTone,
  makeGenerationId,
  normalizePreviousMessages,
  type OutreachGenerationResponse,
  type Tone,
} from "@/app/lib/outreach/contract";
import {
  generateOutreachMessage,
  type OutreachProvider,
} from "@/app/lib/outreach/engine";
import { buildFallbackMessage } from "@/app/lib/outreach/fallback";
import { isOutreachStance, type OutreachStance } from "@/app/lib/outreach/lifecycle";
import { OUTREACH_MESSAGE_SYSTEM } from "@/app/lib/outreach/prompt";
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

  const signals = buildOutreachSignals({
    city,
    businessType,
    hasWhatsAppPath: readBool(body.hasWhatsAppPath),
    hasInstagram: readBool(body.hasInstagram),
    hasOwnWebsite: readBool(body.hasOwnWebsite),
    channels: readStrings(body.channels),
    businessSignals: readStrings(body.businessSignals),
    reviewsCount: readNum(body.reviewsCount),
    websiteIntelligence: isRecord(body.websiteIntelligence)
      ? {
          hasBookingCtaText: readBool(body.websiteIntelligence.hasBookingCtaText),
          hasWhatsAppLink: readBool(body.websiteIntelligence.hasWhatsAppLink),
          hasBookingEngine: readBool(body.websiteIntelligence.hasBookingEngine),
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

  const status = getLlmProviderStatus();
  const provider: OutreachProvider | null = status.llm_enabled
    ? (p) => generateGroundedOutreach(p)
    : null;

  const angles = assignAngles(signals, rotation);

  // Per-tone generation. Each tone gets its own angle and its own validation
  // and fallback, so one weak result cannot drag the other two down.
  const results = await Promise.all(
    TONE_ORDER.map((tone) =>
      generateOutreachMessage({
        leadId,
        businessName,
        city,
        businessType,
        tone,
        angle: angles[tone],
        signals,
        tugoboFit,
        // A tone must also avoid what the *other* tones already said this
        // round is handled below; here it only avoids prior rounds.
        previousMessages,
        generationNonce: `${generationNonce}:${tone}`,
        rotation: rotation + TONE_ORDER.indexOf(tone),
        provider,
        systemPrompt: OUTREACH_MESSAGE_SYSTEM,
        stance,
      }),
    ),
  );

  const byTone = new Map<Tone, OutreachGenerationResponse>();
  TONE_ORDER.forEach((tone, i) => byTone.set(tone, results[i]));

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
    const replacement = buildFallbackMessage({
      tone,
      businessName,
      city,
      rotation: rotation + TONE_ORDER.indexOf(tone) + 1,
      exclude: usedAngles,
      stance,
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
  const anyProvider = results.some((r) => r.source === "provider");

  return NextResponse.json({
    /* --- v3.7.6 contract (for the requested tone) --- */
    ok: true,
    message: primary.message,
    tone: primary.tone,
    source: primary.source,
    variationAngle: primary.variationAngle,
    variationAngleLabel: ANGLE_LABELS_TR[primary.variationAngle],
    usedSignalKeys: primary.usedSignalKeys,
    generationId: makeGenerationId(leadId, generationNonce),
    duplicateAvoided: collisionFixed || results.some((r) => r.duplicateAvoided),

    /* --- per-tone detail, so the modal can label each tone --- */
    tones: Object.fromEntries(
      TONE_ORDER.map((tone) => [
        tone,
        {
          message: byTone.get(tone)!.message,
          source: byTone.get(tone)!.source,
          variationAngle: byTone.get(tone)!.variationAngle,
          variationAngleLabel: ANGLE_LABELS_TR[byTone.get(tone)!.variationAngle],
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
      styleKey: TONE_TO_STYLE[requestedTone],
    },
  });
}

/** Protected: unauthenticated callers get a generic JSON 401. */
export const POST = withAdminSession(handlePOST);
