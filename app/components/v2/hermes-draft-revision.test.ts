import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectExternalActionIntent,
  buildAvailableSignalLabels,
  parseDraftRevisionResponse,
  buildExternalActionSafetyMessage,
  type DraftRevisionBusinessContextLike,
} from "./hermes-draft-revision.ts";
import { applyDraftEdit, applyDraftApproval, type HermesOutboundDraft } from "./hermes-courier.ts";

function buildContext(overrides: Partial<DraftRevisionBusinessContextLike> = {}): DraftRevisionBusinessContextLike {
  return {
    hotelName: "Nook Hotel Mersin",
    city: "Mersin",
    hotelType: "Boutique Hotel",
    website: "https://nookhotel.example",
    websiteVerified: true,
    whatsappNumber: "+90 555 111 2233",
    whatsappVerified: true,
    instagramHandle: "@nookhotelmersin",
    instagramVerified: false,
    reservationCtaVerified: true,
    otaDependency: "high",
    icpScore: 78,
    opportunityScore: 82,
    opportunityTier: "hot",
    opportunityReasons: ["Doğrulanmış WhatsApp", "Yüksek talep"],
    channel: "whatsapp",
    ...overrides,
  };
}

/* ── detectExternalActionIntent ── */

test("external action: 'WhatsApp üzerinden gönder' is intercepted", () => {
  assert.equal(detectExternalActionIntent("WhatsApp üzerinden gönder"), true);
});

test("external action: 'Bu mesajı şimdi gönder' is intercepted", () => {
  assert.equal(detectExternalActionIntent("Bu mesajı şimdi gönder"), true);
});

test("external action: 'İşletmeye mesaj at' is intercepted", () => {
  assert.equal(detectExternalActionIntent("İşletmeye mesaj at"), true);
});

test("external action: 'send it now' (English) is intercepted", () => {
  assert.equal(detectExternalActionIntent("send it now"), true);
});

test("external action: revise instructions never match", () => {
  assert.equal(detectExternalActionIntent("Mesajı daha kısa ve daha samimi yaz."), false);
  assert.equal(detectExternalActionIntent("Genel Müdüre hitap et."), false);
  assert.equal(detectExternalActionIntent("İngilizce hazırla."), false);
});

test("external action: explain instructions never match", () => {
  assert.equal(detectExternalActionIntent("Bu mesajı neden böyle yazdın?"), false);
  assert.equal(detectExternalActionIntent("Hangi verileri kullandın?"), false);
});

test("external action: empty instruction never matches", () => {
  assert.equal(detectExternalActionIntent(""), false);
  assert.equal(detectExternalActionIntent("   "), false);
});

/* ── buildAvailableSignalLabels ── */

test("signal labels: only reflect real, verified fields", () => {
  const labels = buildAvailableSignalLabels(buildContext());
  assert.ok(labels.includes("Doğrulanmış web sitesi"));
  assert.ok(labels.includes("Doğrulanmış WhatsApp"));
  assert.ok(labels.includes("Doğrulanmış rezervasyon çağrısı (CTA)"));
  assert.ok(labels.includes("Yüksek OTA bağımlılığı"));
  // Instagram not verified in this fixture — must never appear as a verified-Instagram claim.
  assert.ok(!labels.includes("Doğrulanmış Instagram"));
});

test("signal labels: missing data never hallucinates a label", () => {
  const labels = buildAvailableSignalLabels(
    buildContext({
      websiteVerified: false,
      website: null,
      whatsappVerified: false,
      whatsappNumber: null,
      reservationCtaVerified: false,
      otaDependency: null,
      icpScore: null,
      opportunityScore: null,
      opportunityTier: null,
      opportunityReasons: [],
    }),
  );
  assert.ok(!labels.includes("Doğrulanmış web sitesi"));
  assert.ok(!labels.includes("Doğrulanmış WhatsApp"));
  assert.ok(!labels.includes("Doğrulanmış rezervasyon çağrısı (CTA)"));
  assert.ok(!labels.includes("ICP uyum skoru"));
  assert.ok(!labels.includes("Doğrulanmış fırsat skoru"));
});

test("signal labels: deduplicated even with overlapping opportunity reasons", () => {
  const labels = buildAvailableSignalLabels(
    buildContext({ opportunityReasons: ["Şehir", "Şehir", "Doğrulanmış WhatsApp"] }),
  );
  const cityCount = labels.filter((l) => l === "Şehir").length;
  assert.equal(cityCount, 1);
});

/* ── parseDraftRevisionResponse ── */

test("parse: valid revise_draft response parses and filters signals to allowed set", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  const raw = JSON.stringify({
    intent: "revise_draft",
    revisedBody: "Merhaba, kısa bir not bırakmak istedim.",
    language: "tr",
    changeSummary: "Mesaj kısaltıldı ve tonu yumuşatıldı.",
    usedSignals: [allowed[0], "Uydurma Sinyal Adı"],
    warnings: [],
  });
  const result = parseDraftRevisionResponse(raw, allowed);
  assert.ok(result);
  assert.equal(result!.intent, "revise_draft");
  assert.equal(result!.revisedBody, "Merhaba, kısa bir not bırakmak istedim.");
  assert.deepEqual(result!.usedSignals, [allowed[0]]); // hallucinated label dropped
});

test("parse: valid explain_draft response never carries a revisedBody", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  const raw = JSON.stringify({
    intent: "explain_draft",
    revisedBody: "bu alan olsa bile göz ardı edilmeli değil, ama explain'de kullanılmamalı",
    language: "tr",
    changeSummary: "Doğrulanmış WhatsApp ve rezervasyon sinyaline dayanarak yazıldı.",
    usedSignals: [allowed[0]],
    warnings: [],
  });
  const result = parseDraftRevisionResponse(raw, allowed);
  assert.ok(result);
  assert.equal(result!.intent, "explain_draft");
  assert.equal(result!.revisedBody, null);
});

test("parse: invalid JSON returns null", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  assert.equal(parseDraftRevisionResponse("not json {{{", allowed), null);
});

test("parse: empty revisedBody on revise_draft returns null (never saved)", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  const raw = JSON.stringify({
    intent: "revise_draft",
    revisedBody: "   ",
    language: "tr",
    changeSummary: "…",
    usedSignals: [],
    warnings: [],
  });
  assert.equal(parseDraftRevisionResponse(raw, allowed), null);
});

test("parse: missing changeSummary returns null", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  const raw = JSON.stringify({
    intent: "revise_draft",
    revisedBody: "Merhaba",
    language: "tr",
    usedSignals: [],
    warnings: [],
  });
  assert.equal(parseDraftRevisionResponse(raw, allowed), null);
});

test("parse: unknown intent returns null", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  const raw = JSON.stringify({
    intent: "send_now",
    revisedBody: "Merhaba",
    language: "tr",
    changeSummary: "…",
  });
  assert.equal(parseDraftRevisionResponse(raw, allowed), null);
});

test("parse: non-object JSON (array/string/number) returns null", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  assert.equal(parseDraftRevisionResponse("[]", allowed), null);
  assert.equal(parseDraftRevisionResponse('"just a string"', allowed), null);
  assert.equal(parseDraftRevisionResponse("42", allowed), null);
});

test("parse: unknown language falls back to 'other'", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  const raw = JSON.stringify({
    intent: "revise_draft",
    revisedBody: "Hallo, kurze Nachricht.",
    language: "fr",
    changeSummary: "…",
  });
  const result = parseDraftRevisionResponse(raw, allowed);
  assert.equal(result?.language, "other");
});

test("parse: oversized revisedBody is truncated, never rejected outright", () => {
  const allowed = buildAvailableSignalLabels(buildContext());
  const huge = "a".repeat(10000);
  const raw = JSON.stringify({
    intent: "revise_draft",
    revisedBody: huge,
    language: "tr",
    changeSummary: "…",
  });
  const result = parseDraftRevisionResponse(raw, allowed);
  assert.ok(result);
  assert.ok(result!.revisedBody!.length <= 4000);
});

/* ── buildExternalActionSafetyMessage ── */

test("external action safety message: never claims a send happened", () => {
  const msg = buildExternalActionSafetyMessage({
    draftStatusLabel: "Onaylandı",
    phoneLabel: "+90 555 111 2233",
    controlledSendReady: false,
    controlledSendLabel: "Bloke",
    nextStepLabel: "Founder onayı bekleniyor.",
  });
  assert.ok(msg.includes("hiçbir zaman otomatik gönderilmez"));
  assert.ok(msg.includes("ayrı, açık bir founder onayıyla"));
  assert.ok(!msg.toLowerCase().includes("gönderildi"));
});

test("external action safety message: handles missing readiness gracefully", () => {
  const msg = buildExternalActionSafetyMessage(null);
  assert.ok(msg.length > 0);
  assert.ok(!msg.toLowerCase().includes("gönderildi"));
});

/* ── full pipeline: reusing the existing draft-edit path (hermes-courier.ts) ── */

function buildDraft(overrides: Partial<HermesOutboundDraft> = {}): HermesOutboundDraft {
  return {
    id: "draft:mission-1",
    missionId: "mission-1",
    leadId: "lead-1",
    hotelName: "Nook Hotel Mersin",
    channel: "whatsapp",
    status: "draft_ready",
    createdAt: 1000,
    updatedAt: 1000,
    createdByAgent: "scribe",
    approvedByFounderAt: null,
    rejectedByFounderAt: null,
    editedAt: null,
    body: "Orijinal taslak metni.",
    originalBody: "Orijinal taslak metni.",
    reason: "test",
    evidence: [],
    confidence: "high",
    source: "pipeline-complete",
    ...overrides,
  };
}

test("pipeline: applying an AI-revised body preserves draft id/missionId/channel/createdAt", () => {
  const original = buildDraft();
  const revised = applyDraftEdit(original, "Hermes tarafından yeniden hazırlanan kısa mesaj.");
  assert.equal(revised.id, original.id);
  assert.equal(revised.missionId, original.missionId);
  assert.equal(revised.channel, original.channel);
  assert.equal(revised.createdAt, original.createdAt);
  assert.equal(revised.body, "Hermes tarafından yeniden hazırlanan kısa mesaj.");
  assert.equal(revised.status, "edited");
});

test("pipeline: revising a previously-approved draft resets it to 'edited' (re-approval required)", () => {
  const approved = applyDraftApproval(buildDraft());
  assert.equal(approved.status, "approved");
  const revised = applyDraftEdit(approved, "Yeni içerik — onay artık geçersiz olmalı.");
  assert.equal(revised.status, "edited");
  assert.equal(revised.approvedByFounderAt, approved.approvedByFounderAt); // timestamp kept for history, but status no longer "approved"
  assert.notEqual(revised.status, "approved");
});
