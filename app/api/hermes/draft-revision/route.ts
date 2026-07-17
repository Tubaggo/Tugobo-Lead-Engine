import { NextResponse } from "next/server";
import { generateDraftRevision, getLlmProviderStatus } from "@/app/lib/llm/provider";
import {
  detectExternalActionIntent,
  buildAvailableSignalLabels,
  parseDraftRevisionResponse,
  buildExternalActionSafetyMessage,
  type DraftRevisionBusinessContextLike,
  type ExternalActionReadinessLike,
} from "@/app/components/v2/hermes-draft-revision";

/**
 * Founder Conversational Message Revision (v1.0).
 *
 * Thin server-side wrapper only — every actual decision (external-action
 * interception, allowed-signal filtering, response validation) lives in the
 * dependency-free `hermes-draft-revision.ts` module so it can run under
 * plain `node --test`. This route's own job is limited to: parse/validate
 * the HTTP body, run the deterministic external-action gate before ever
 * calling the LLM, call the existing provider abstraction, and return a
 * clean JSON contract — never a raw provider error, never a secret.
 *
 * Never mutates a draft, never calls WhatsApp, never approves anything —
 * the client is the only place `applyDraftEdit` (via `onEditDraft`) runs.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readOptionalString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readBoolean(v: unknown): boolean {
  return v === true;
}

function readOtaDependency(v: unknown): "high" | "medium" | "low" | null {
  return v === "high" || v === "medium" || v === "low" ? v : null;
}

function readStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function parseBusinessContext(raw: unknown): DraftRevisionBusinessContextLike | null {
  if (!isRecord(raw)) return null;
  const hotelName = readString(raw.hotelName);
  const city = readString(raw.city);
  if (!hotelName || !city) return null;
  return {
    hotelName,
    city,
    hotelType: readOptionalString(raw.hotelType),
    website: readOptionalString(raw.website),
    websiteVerified: readBoolean(raw.websiteVerified),
    whatsappNumber: readOptionalString(raw.whatsappNumber),
    whatsappVerified: readBoolean(raw.whatsappVerified),
    instagramHandle: readOptionalString(raw.instagramHandle),
    instagramVerified: readBoolean(raw.instagramVerified),
    reservationCtaVerified: readBoolean(raw.reservationCtaVerified),
    otaDependency: readOtaDependency(raw.otaDependency),
    icpScore: typeof raw.icpScore === "number" && Number.isFinite(raw.icpScore) ? raw.icpScore : null,
    opportunityScore:
      typeof raw.opportunityScore === "number" && Number.isFinite(raw.opportunityScore) ? raw.opportunityScore : null,
    opportunityTier: readOptionalString(raw.opportunityTier),
    opportunityReasons: readStringArray(raw.opportunityReasons).slice(0, 6),
    channel: readOptionalString(raw.channel) ?? "unknown",
  };
}

function parseReadiness(raw: unknown): ExternalActionReadinessLike | null {
  if (!isRecord(raw)) return null;
  const draftStatusLabel = readString(raw.draftStatusLabel);
  const phoneLabel = readString(raw.phoneLabel);
  const controlledSendLabel = readString(raw.controlledSendLabel);
  const nextStepLabel = readString(raw.nextStepLabel);
  if (!draftStatusLabel || !phoneLabel || !controlledSendLabel || !nextStepLabel) return null;
  return {
    draftStatusLabel,
    phoneLabel,
    controlledSendReady: raw.controlledSendReady === true,
    controlledSendLabel,
    nextStepLabel,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const instruction = readString(body.instruction);
  const draftBody = readString(body.draftBody);
  if (!instruction) {
    return NextResponse.json({ error: "instruction zorunludur" }, { status: 400 });
  }
  if (!draftBody) {
    return NextResponse.json({ error: "draftBody zorunludur — gerçek bir taslak olmadan revizyon çalıştırılamaz" }, { status: 400 });
  }
  const businessContext = parseBusinessContext(body.businessContext);
  if (!businessContext) {
    return NextResponse.json({ error: "businessContext zorunludur" }, { status: 400 });
  }

  // Deterministic gate — never left to the LLM. A matching instruction never
  // reaches the provider at all: no call is made, nothing is sent, nothing
  // is approved.
  if (detectExternalActionIntent(instruction)) {
    const readiness = parseReadiness(body.readiness);
    return NextResponse.json({
      blocked: true,
      safetyMessage: buildExternalActionSafetyMessage(readiness),
    });
  }

  const status = getLlmProviderStatus();
  if (!status.llm_enabled) {
    return NextResponse.json({ error: "AI sağlayıcı yapılandırılmamış" }, { status: 503 });
  }

  const availableSignalLabels = buildAvailableSignalLabels(businessContext);

  let raw: string | null;
  try {
    raw = await generateDraftRevision({
      founderInstruction: instruction,
      currentDraftBody: draftBody,
      channel: businessContext.channel,
      businessContext,
      availableSignalLabels,
    });
  } catch (err) {
    console.error("[draft-revision] provider call failed", err);
    return NextResponse.json({ error: "Hermes şu anda mesajı yeniden hazırlayamadı" }, { status: 502 });
  }

  if (!raw) {
    return NextResponse.json({ error: "Hermes şu anda mesajı yeniden hazırlayamadı" }, { status: 502 });
  }

  const result = parseDraftRevisionResponse(raw, availableSignalLabels);
  if (!result) {
    console.error("[draft-revision] invalid/unparseable provider response");
    return NextResponse.json({ error: "Hermes'in yanıtı geçersizdi — taslak değiştirilmedi" }, { status: 502 });
  }

  return NextResponse.json({ blocked: false, result });
}
