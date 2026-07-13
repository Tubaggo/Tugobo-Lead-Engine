import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTREACH_STATUS_LABELS_TR,
  buildOutreachAuditEvent,
  deriveLanguage,
  deriveNextAction,
  derivePersonalization,
  deriveRecommendedChannel,
  deriveTemplate,
  deriveTone,
  evaluateAutonomousOutreach,
  sortOutreach,
  summarizeOutreach,
  type AutonomousOutreachDecision,
  type OutreachInput,
  type OutreachLeadLike,
  type OutreachQualificationLike,
} from "./hermes-autonomous-outreach-runtime.ts";
import {
  DEFAULT_OUTREACH_POLICY,
  type HermesOutreachPolicy,
} from "./hermes-outreach-policy.ts";

const NOW = Date.UTC(2026, 6, 13, 9, 0, 0);

function policy(overrides: Partial<HermesOutreachPolicy> = {}): HermesOutreachPolicy {
  return { ...DEFAULT_OUTREACH_POLICY, enabled: true, ...overrides };
}

/** Enrichment'tan geçmiş, güvenilir WhatsApp kanalı olan satışa hazır bir lead. */
function strongLead(overrides: Partial<OutreachLeadLike> = {}): OutreachLeadLike {
  return {
    id: "lead-1",
    name: "Mersin Marina Hotel",
    city: "Mersin",
    phone: "+90 532 100 00 01",
    website: "https://marina.example",
    leadType: "Hotel",
    units: 24,
    adsLikelihood: "likely",
    otaDependencyLikelihood: 70,
    signalVerification: {
      whatsappVerification: "verified",
      websiteVerification: "verified",
      reservationSignal: "detected",
      instagramVerification: "likely",
    },
    icpAlignment: {
      estimatedPropertySize: "medium",
      estimatedDemandVolume: "high",
      otaDependencyLevel: "high",
    },
    websiteIntelligence: { hasWhatsAppLink: true, hasBookingEngine: true, hasOtaOutboundLinks: true },
    ...overrides,
  };
}

function salesReadyQual(overrides: Partial<OutreachQualificationLike> = {}): OutreachQualificationLike {
  return {
    leadId: "lead-1",
    status: "sales_ready",
    eligibleForMission: true,
    eligibleForOutreachDraft: true,
    founderSummaryTr: "Hermes bu işletmeyi satışa hazır gördü.",
    positiveReasons: ["strong_icp_fit"],
    ...overrides,
  };
}

function input(overrides: Partial<OutreachInput> = {}): OutreachInput {
  return {
    qualification: salesReadyQual(),
    lead: strongLead(),
    mission: null,
    existingDraft: false,
    acquisitionRunId: "run-1",
    policy: policy(),
    currentTime: NOW,
    ...overrides,
  };
}

test("sales_ready + güvenilir kanal → approval_required, gönderim değil onay hazırlığı", () => {
  const d = evaluateAutonomousOutreach(input());
  assert.equal(d.status, "approval_required");
  assert.equal(d.eligible, true);
  assert.equal(d.draftNeeded, true);
  assert.equal(d.approvalNeeded, true);
  assert.equal(d.blockedReason, null);
  assert.equal(d.nextAction, "await_founder_approval");
  assert.equal(d.recommendedChannel, "whatsapp");
});

test("YAPISAL: çıktıda sendAllowed/founderApproved alanı yoktur — onay/gönderim üretilemez", () => {
  const d = evaluateAutonomousOutreach(input()) as Record<string, unknown>;
  assert.equal("sendAllowed" in d, false);
  assert.equal("founderApproved" in d, false);
  assert.equal("messageText" in d, false);
  assert.equal("body" in d, false);
});

test("audit event'leri ASLA gönderim/message_sent tipini içermez", () => {
  const d = evaluateAutonomousOutreach(input());
  for (const e of d.auditEvents) {
    assert.notEqual(e.type as string, "message_sent");
    assert.ok(!e.type.includes("sent") || e.type === "hermes_outreach_ready");
  }
  // approval_created eventi vardır (mevcut onay akışına düşürüldü), send eventi yoktur.
  assert.ok(d.auditEvents.some((e) => e.type === "hermes_outreach_approval_created"));
});

test("sales_ready değil → not_eligible (blocked değil), hazırlanmaz", () => {
  const d = evaluateAutonomousOutreach(
    input({ qualification: salesReadyQual({ status: "review_required" }) }),
  );
  assert.equal(d.status, "not_eligible");
  assert.equal(d.eligible, false);
  assert.equal(d.blockedReason, "not_sales_ready");
  assert.equal(d.draftNeeded, false);
  assert.equal(d.approvalNeeded, false);
});

test("mission yok (eligibleForMission false, mission null) → not_eligible/no_mission", () => {
  const d = evaluateAutonomousOutreach(
    input({ qualification: salesReadyQual({ eligibleForMission: false }) }),
  );
  assert.equal(d.blockedReason, "no_mission");
  assert.equal(d.eligible, false);
});

test("duplicate taslak → not_eligible/duplicate_draft", () => {
  const d = evaluateAutonomousOutreach(input({ existingDraft: true }));
  assert.equal(d.blockedReason, "duplicate_draft");
  assert.equal(d.eligible, false);
});

test("iletişim yolu yok (eligibleForOutreachDraft false + kanal yok) → waiting, hazırlanmaz", () => {
  const noChannel = strongLead({
    phone: undefined,
    signalVerification: { websiteVerification: "verified", reservationSignal: "detected" },
    websiteIntelligence: { hasBookingEngine: true },
  });
  const d = evaluateAutonomousOutreach(
    input({ lead: noChannel, qualification: salesReadyQual({ eligibleForOutreachDraft: false }) }),
  );
  // güvenilir kanal yok → önce no_contact_path bloğu (not_eligible)
  assert.equal(d.eligible, false);
  assert.equal(d.blockedReason, "no_contact_path");
});

test("DNC → blocked (hard block)", () => {
  const d = evaluateAutonomousOutreach(input({ lead: strongLead({ doNotContact: true }) }));
  assert.equal(d.status, "blocked");
  assert.equal(d.blockedReason, "do_not_contact");
});

test("policy kapalı → blocked/policy_disabled", () => {
  const d = evaluateAutonomousOutreach(input({ policy: policy({ enabled: false }) }));
  assert.equal(d.status, "blocked");
  assert.equal(d.blockedReason, "policy_disabled");
});

test("geçersiz lead (id/isim yok) → blocked/invalid_lead", () => {
  const d = evaluateAutonomousOutreach(
    input({ lead: strongLead({ id: undefined }), qualification: salesReadyQual({ leadId: null }) }),
  );
  assert.equal(d.status, "blocked");
  assert.equal(d.blockedReason, "invalid_lead");
});

test("kanal önceliği: doğrulanmış WhatsApp > telefon > Instagram > website > bilinmiyor", () => {
  const p = policy();
  assert.equal(deriveRecommendedChannel(strongLead(), p), "whatsapp");
  assert.equal(
    deriveRecommendedChannel(
      strongLead({ signalVerification: {}, websiteIntelligence: {}, whatsappConfidence: undefined }),
      p,
    ),
    "phone",
  );
  const igOnly: OutreachLeadLike = {
    id: "l",
    name: "n",
    instagram: "@hotel",
    signalVerification: { instagramVerification: "verified" },
  };
  assert.equal(deriveRecommendedChannel(igOnly, p), "instagram");
  const webOnly: OutreachLeadLike = { id: "l", name: "n", website: "https://x.example" };
  assert.equal(deriveRecommendedChannel(webOnly, p), "website");
  assert.equal(deriveRecommendedChannel({ id: "l", name: "n" }, p), "unknown");
});

test("policy Instagram/website kanallarını kapatabilir → alt seçeneğe düşer", () => {
  const igOnly: OutreachLeadLike = { id: "l", name: "n", instagram: "@hotel" };
  assert.equal(deriveRecommendedChannel(igOnly, policy({ allowInstagramChannel: false })), "unknown");
  const webOnly: OutreachLeadLike = { id: "l", name: "n", website: "https://x.example" };
  assert.equal(deriveRecommendedChannel(webOnly, policy({ allowWebsiteChannel: false })), "unknown");
});

test("template SEÇİMİ kanaldan türer — yeni template metni üretmez", () => {
  assert.equal(deriveTemplate("whatsapp"), "whatsapp-intro");
  assert.equal(deriveTemplate("phone"), "whatsapp-intro");
  assert.equal(deriveTemplate("instagram"), "instagram-intro");
  assert.equal(deriveTemplate("website"), "email-intro");
  assert.equal(deriveTemplate("unknown"), "generic-intro");
});

test("ton mevcut sinyallerden türer (danışman/doğrudan/yumuşak)", () => {
  assert.equal(deriveTone(strongLead()), "consultative"); // yüksek OTA + rezervasyon
  assert.equal(
    deriveTone({ id: "l", name: "n", adsLikelihood: "likely" }),
    "direct",
  );
  assert.equal(deriveTone({ id: "l", name: "n" }), "soft");
});

test("dil policy default'undan gelir (TR)", () => {
  assert.equal(deriveLanguage(strongLead(), policy()), "tr");
  assert.equal(deriveLanguage(strongLead(), policy({ defaultLanguage: "en" })), "en");
});

test("personalization YALNIZ mevcut veriden; ham telefon sızmaz", () => {
  const signals = derivePersonalization(strongLead(), "whatsapp");
  const labels = signals.map((s) => s.labelTr).join(" | ");
  assert.ok(labels.includes("Otel adı: Mersin Marina Hotel"));
  assert.ok(labels.includes("Şehir: Mersin"));
  assert.ok(labels.includes("OTA bağımlılığı"));
  assert.ok(labels.includes("İletişim kanalı: WhatsApp"));
  // ham telefon numarası personalization'a asla girmez
  assert.ok(!labels.includes("532"));
  assert.ok(!labels.includes("+90"));
});

test("deriveNextAction durumla tutarlı", () => {
  assert.equal(deriveNextAction("approval_required"), "await_founder_approval");
  assert.equal(deriveNextAction("waiting"), "verify_contact");
  assert.equal(deriveNextAction("blocked"), "review_qualification");
  assert.equal(deriveNextAction("completed"), "none");
});

test("deterministik: aynı girdi + aynı zaman → aynı sonuç", () => {
  const a = evaluateAutonomousOutreach(input());
  const b = evaluateAutonomousOutreach(input());
  assert.deepEqual(a, b);
});

test("summarizeOutreach doğru sayar (awaitingFounder = draft_ready + approval_required)", () => {
  const decisions: AutonomousOutreachDecision[] = [
    evaluateAutonomousOutreach(input()),
    evaluateAutonomousOutreach(input({ lead: strongLead({ id: "l2", doNotContact: true }), qualification: salesReadyQual({ leadId: "l2" }) })),
  ];
  const s = summarizeOutreach(decisions);
  assert.equal(s.total, 2);
  assert.equal(s.approvalRequired, 1);
  assert.equal(s.blocked, 1);
  assert.equal(s.awaitingFounder, 1);
});

test("sortOutreach: approval_required önce, girdi mutate edilmez", () => {
  const blocked = evaluateAutonomousOutreach(
    input({ lead: strongLead({ id: "lb", doNotContact: true }), qualification: salesReadyQual({ leadId: "lb" }) }),
  );
  const ready = evaluateAutonomousOutreach(input());
  const arr = [blocked, ready];
  const sorted = sortOutreach(arr);
  assert.equal(sorted[0].status, "approval_required");
  assert.equal(arr[0], blocked); // orijinal dizinin sırası korunur
});

test("buildOutreachAuditEvent telefon/secret görünümlerini temizler", () => {
  const e = buildOutreachAuditEvent({
    type: "hermes_outreach_prepared",
    at: NOW,
    detailTr: "Numara +90 532 100 00 01 ve token=abc123 gizlenmeli",
  });
  assert.ok(e.detailTr.includes("[numara gizli]"));
  assert.ok(e.detailTr.includes("token=[gizli]"));
});

test("founder etiketleri Türkçe ve founder-güvenli", () => {
  assert.equal(OUTREACH_STATUS_LABELS_TR.approval_required, "Founder Onayı Bekliyor");
  assert.equal(OUTREACH_STATUS_LABELS_TR.waiting, "Hazırlanıyor");
});
