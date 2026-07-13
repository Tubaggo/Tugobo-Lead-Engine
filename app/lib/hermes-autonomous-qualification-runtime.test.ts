import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUALIFICATION_NEXT_ACTION_LABELS_TR,
  QUALIFICATION_REASON_LABELS_TR,
  QUALIFICATION_STATUS_LABELS_TR,
  buildQualificationAuditEvent,
  buildQualificationPreview,
  deriveQualificationConfidence,
  deriveQualificationNextAction,
  deriveQualificationPriority,
  deriveQualificationReasons,
  deriveQualificationStatus,
  evaluateHermesQualification,
  sortQualificationResults,
  summarizeQualificationResults,
  type QualificationInput,
  type QualificationLeadLike,
  type QualificationResult,
} from "./hermes-autonomous-qualification-runtime.ts";
import {
  DEFAULT_QUALIFICATION_POLICY,
  deriveQualificationPolicy,
  type HermesQualificationPolicy,
} from "./hermes-qualification-policy.ts";
import { DEFAULT_ACQUISITION_POLICY } from "./hermes-autonomous-acquisition-policy.ts";

const NOW = Date.UTC(2026, 6, 13, 9, 0, 0);
const FRESH_ISO = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
const STALE_ISO = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();

function policy(overrides: Partial<HermesQualificationPolicy> = {}): HermesQualificationPolicy {
  return {
    ...DEFAULT_QUALIFICATION_POLICY,
    enabled: true,
    ...overrides,
  };
}

/** Enrichment'tan geçmiş güçlü bir aday — production adapter çıktısının aynası. */
function strongLead(overrides: Partial<QualificationLeadLike> = {}): QualificationLeadLike {
  return {
    id: "lead-1",
    name: "Mersin Marina Hotel",
    city: "Mersin",
    phone: "+90 532 100 00 01",
    website: "https://marina.example",
    verifiedOpportunityScore: 88,
    leadScore: 80,
    icpFitScore: 75,
    lastEnrichedAt: FRESH_ISO,
    enrichmentCount: 1,
    signalVerification: {
      whatsappVerification: "verified",
      websiteVerification: "verified",
      reservationSignal: "detected",
      instagramVerification: "likely",
    },
    icpAlignment: {
      tugoboFitScore: 75,
      operationalFit: true,
      estimatedPropertySize: "large",
      estimatedDemandVolume: "high",
      otaDependencyLevel: "high",
      multiChannelScore: 70,
    },
    ...overrides,
  };
}

function input(
  lead: QualificationLeadLike,
  overrides: Partial<QualificationInput> = {},
): QualificationInput {
  return {
    lead,
    existingMissionId: null,
    acquisitionRunId: "acq-run-1",
    policy: policy(),
    currentTime: NOW,
    ...overrides,
  };
}

/* ── durum kuralları ────────────────────────────────────────── */

test("güçlü aday sales_ready olur ve mission'a uygundur", () => {
  const result = evaluateHermesQualification(input(strongLead()));
  assert.equal(result.status, "sales_ready");
  assert.equal(result.eligibleForMission, true);
  assert.equal(result.eligibleForOutreachDraft, true);
  assert.equal(result.nextAction, "prepare_outreach");
});

test("skor yüksek ama iletişim çelişkili → review_required", () => {
  // Telefon var ama WhatsApp geçersiz işaretli — kritik veri çelişkisi.
  const result = evaluateHermesQualification(
    input(
      strongLead({
        whatsappInvalid: true,
        signalVerification: { websiteVerification: "verified" },
      }),
    ),
  );
  assert.equal(result.status, "review_required");
  assert.equal(result.requiresFounderReview, true);
  assert.equal(result.eligibleForMission, false);
  assert.equal(result.nextAction, "founder_review");
});

test("chain işletme skoru güçlü olsa da founder incelemesine düşer", () => {
  const result = evaluateHermesQualification(
    input(strongLead({ businessOwnershipType: "chain" })),
  );
  assert.equal(result.status, "review_required");
});

test("bayat enrichment → data_needed", () => {
  const result = evaluateHermesQualification(
    input(strongLead({ lastEnrichedAt: STALE_ISO })),
  );
  assert.equal(result.status, "data_needed");
  assert.equal(result.eligibleForMission, false);
  assert.equal(result.nextAction, "run_enrichment");
});

test("hiç enrichment kanıtı yoksa data_needed + run_enrichment", () => {
  const result = evaluateHermesQualification(
    input({
      id: "lead-x",
      name: "Yeni Otel",
      phone: "+90 532 100 00 09",
      website: "https://yeni.example",
      verifiedOpportunityScore: 75,
    }),
  );
  assert.equal(result.status, "data_needed");
  assert.equal(result.nextAction, "run_enrichment");
});

test("iletişim yolu doğrulanmamışsa verify_contact önerilir", () => {
  const result = evaluateHermesQualification(
    input(
      strongLead({
        phone: undefined,
        signalVerification: { websiteVerification: "verified" },
        websiteIntelligence: undefined,
        whatsappConfidence: undefined,
        website: undefined,
        websiteCandidateUrl: undefined,
      }),
    ),
  );
  assert.equal(result.status, "data_needed");
  assert.equal(result.nextAction, "verify_contact");
});

test("orta potansiyel watch olur", () => {
  const result = evaluateHermesQualification(
    input(strongLead({
        verifiedOpportunityScore: 55,
        icpFitScore: 50,
        icpAlignment: undefined,
        // Kanal sıcaklığı yok: rezervasyon sinyali bulunamadı → HOT telafisi devreye girmez.
        signalVerification: { websiteVerification: "verified", whatsappVerification: "likely" },
      })),
  );
  assert.equal(result.status, "watch");
  assert.equal(result.nextAction, "watch");
  assert.equal(result.eligibleForMission, false);
});

test("düşük skor + zayıf ICP not_qualified olur", () => {
  const result = evaluateHermesQualification(
    input(
      strongLead({
        verifiedOpportunityScore: 25,
        icpFitScore: 20,
        icpAlignment: undefined,
        signalVerification: { websiteVerification: "reachable" },
      }),
    ),
  );
  assert.equal(result.status, "not_qualified");
  assert.equal(result.nextAction, "skip");
  assert.equal(result.eligibleForMission, false);
});

test("duplicate mission blocked üretir", () => {
  const result = evaluateHermesQualification(
    input(strongLead(), { existingMissionId: "mission-42" }),
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.eligibleForMission, false);
  assert.ok(result.blockingReasons.includes("duplicate_mission"));
  assert.equal(result.nextAction, "blocked");
});

test("lead id eksikse blocked", () => {
  const result = evaluateHermesQualification(input(strongLead({ id: undefined })));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes("insufficient_data"));
});

test("policy kapalıysa blocked (policy_blocked)", () => {
  const result = evaluateHermesQualification(
    input(strongLead(), { policy: policy({ enabled: false }) }),
  );
  assert.equal(result.status, "blocked");
  assert.ok(result.blockingReasons.includes("policy_blocked"));
});

test("doNotContact işaretli lead blocked olur", () => {
  const result = evaluateHermesQualification(input(strongLead({ doNotContact: true })));
  assert.equal(result.status, "blocked");
});

test("HOT kanal kriteri skor barını telafi eder (güçlü eşdeğer)", () => {
  const result = evaluateHermesQualification(
    input(strongLead({ verifiedOpportunityScore: 65 })),
  );
  // website verified + reservation detected + wa verified → channelHot.
  assert.equal(result.status, "sales_ready");
  assert.equal(result.eligibleForMission, true);
});

/* ── eligibility guard'ları ─────────────────────────────────── */

test("iletişim yolu olmayan lead asla mission'a uygun olamaz", () => {
  const lead = strongLead({
    phone: undefined,
    website: undefined,
    websiteCandidateUrl: undefined,
    signalVerification: { websiteVerification: "not_found" },
    websiteIntelligence: undefined,
  });
  const result = evaluateHermesQualification(input(lead));
  assert.equal(result.eligibleForMission, false);
});

test("yalnız website'li sales_ready aday outreach taslağına uygun DEĞİLDİR", () => {
  // requireContactPath kapalı bir policy'de bile taslak güvenilir kanal ister.
  const lead = strongLead({
    phone: undefined,
    signalVerification: {
      websiteVerification: "verified",
      reservationSignal: "detected",
      instagramVerification: "verified",
    },
    websiteIntelligence: undefined,
    whatsappConfidence: undefined,
  });
  const result = evaluateHermesQualification(
    input(lead, { policy: policy({ requireContactPath: false }) }),
  );
  assert.equal(result.eligibleForOutreachDraft, false);
});

test("qualification asla founder onayı veya gönderim izni üretmez", () => {
  const result = evaluateHermesQualification(input(strongLead()));
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("founderApproved"));
  assert.ok(!serialized.includes("sendAllowed"));
  assert.ok(!("founderApproved" in result));
  assert.ok(!("sendAllowed" in result));
});

test("evaluate girdideki lead objesini mutate etmez", () => {
  const lead = strongLead();
  const snapshot = JSON.stringify(lead);
  evaluateHermesQualification(input(lead));
  assert.equal(JSON.stringify(lead), snapshot);
});

/* ── güven / öncelik / neden eşlemeleri ─────────────────────── */

test("güven eşlemesi: tam doğrulama high, kanıt yok low", () => {
  assert.equal(deriveQualificationConfidence(input(strongLead())), "high");
  assert.equal(
    deriveQualificationConfidence(
      input({ id: "x", name: "Boş Otel", phone: "+90 532 1", verifiedOpportunityScore: undefined }),
    ),
    "low",
  );
});

test("öncelik eşlemesi: skor 80+ sales_ready kritik, review high, watch medium", () => {
  assert.equal(deriveQualificationPriority(input(strongLead())), "critical");
  assert.equal(
    deriveQualificationPriority(input(strongLead({ businessOwnershipType: "chain" }))),
    "high",
  );
  assert.equal(
    deriveQualificationPriority(
      input(strongLead({
        verifiedOpportunityScore: 55,
        icpFitScore: 50,
        icpAlignment: undefined,
        // Kanal sıcaklığı yok: rezervasyon sinyali bulunamadı → HOT telafisi devreye girmez.
        signalVerification: { websiteVerification: "verified", whatsappVerification: "likely" },
      })),
    ),
    "medium",
  );
});

test("neden üretimi: güçlü sinyaller positive, eksikler caution", () => {
  const reasons = deriveQualificationReasons(input(strongLead()));
  assert.ok(reasons.positive.includes("strong_icp_fit"));
  assert.ok(reasons.positive.includes("verified_opportunity"));
  assert.ok(reasons.positive.includes("direct_contact_available"));
  assert.ok(reasons.positive.includes("website_verified"));
  assert.ok(reasons.positive.includes("reservation_readiness"));
  assert.ok(reasons.positive.includes("high_ota_dependency"));
  assert.equal(reasons.blocking.length, 0);

  const gaps = deriveQualificationReasons(
    input({ id: "x", name: "Eksik Otel", verifiedOpportunityScore: 50 }),
  );
  assert.ok(gaps.caution.includes("missing_contact_path"));
  assert.ok(gaps.caution.includes("missing_website"));
  assert.ok(gaps.caution.includes("insufficient_data"));
});

test("durum türetmeleri evaluate ile birebir aynıdır (deterministik)", () => {
  const testInput = input(strongLead());
  const result = evaluateHermesQualification(testInput);
  assert.equal(result.status, deriveQualificationStatus(testInput));
  assert.equal(result.confidence, deriveQualificationConfidence(testInput));
  assert.equal(result.priority, deriveQualificationPriority(testInput));
  assert.equal(result.nextAction, deriveQualificationNextAction(testInput));
  // Aynı girdi + aynı zaman → aynı sonuç (tekrar üretilebilirlik).
  const again = evaluateHermesQualification(testInput);
  assert.deepEqual(again, result);
});

/* ── audit ──────────────────────────────────────────────────── */

test("audit event'leri durum + skor snapshot taşır, telefon/secret sızdırmaz", () => {
  const result = evaluateHermesQualification(input(strongLead()));
  assert.equal(result.auditEvents[0].type, "hermes_qualification_started");
  assert.equal(result.auditEvents[1].type, "hermes_qualification_sales_ready");
  assert.equal(result.auditEvents[2].type, "hermes_qualification_completed");
  for (const e of result.auditEvents) {
    assert.equal(e.leadId, "lead-1");
    assert.equal(e.acquisitionRunId, "acq-run-1");
    assert.ok(!e.detailTr.includes("+90 532"));
    assert.ok(!/Bearer\s+\S{5,}/.test(e.detailTr));
  }
});

test("buildQualificationAuditEvent secret ve numara görünümlerini temizler", () => {
  const e = buildQualificationAuditEvent({
    type: "hermes_qualification_failed",
    at: NOW,
    detailTr: "Hata: token=abc123 Bearer xyz987 tel +90 532 111 22 33 arandı.",
  });
  assert.ok(!e.detailTr.includes("abc123"));
  assert.ok(!e.detailTr.includes("xyz987"));
  assert.ok(!e.detailTr.includes("532 111"));
});

/* ── özet + sıralama + preview ──────────────────────────────── */

function resultWith(overrides: Partial<QualificationResult>): QualificationResult {
  return { ...evaluateHermesQualification(input(strongLead())), ...overrides };
}

test("özet sayaçları doğru sayar", () => {
  const items = [
    resultWith({ status: "sales_ready", eligibleForMission: true, eligibleForOutreachDraft: true }),
    resultWith({ status: "review_required", eligibleForMission: false, eligibleForOutreachDraft: false }),
    resultWith({ status: "data_needed", eligibleForMission: false, eligibleForOutreachDraft: false }),
    resultWith({ status: "watch", eligibleForMission: false, eligibleForOutreachDraft: false }),
    resultWith({ status: "not_qualified", eligibleForMission: false, eligibleForOutreachDraft: false }),
    resultWith({ status: "blocked", eligibleForMission: false, eligibleForOutreachDraft: false }),
  ];
  const summary = summarizeQualificationResults(items);
  assert.equal(summary.total, 6);
  assert.equal(summary.salesReady, 1);
  assert.equal(summary.reviewRequired, 1);
  assert.equal(summary.dataNeeded, 1);
  assert.equal(summary.watch, 1);
  assert.equal(summary.notQualified, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.eligibleForMission, 1);
  assert.equal(summary.eligibleForOutreachDraft, 1);
});

test("sıralama: sales_ready önce, sonra öncelik, sonra skor", () => {
  const a = resultWith({ leadId: "a", status: "watch", priority: "medium" });
  const b = resultWith({ leadId: "b", status: "sales_ready", priority: "high" });
  const c = resultWith({ leadId: "c", status: "sales_ready", priority: "critical" });
  const sorted = sortQualificationResults([a, b, c]);
  assert.deepEqual(
    sorted.map((r) => r.leadId),
    ["c", "b", "a"],
  );
});

test("preview: ilk 5 sales_ready + ilk 3 review_required, ham enum yok", () => {
  const results = Array.from({ length: 7 }, (_, i) => ({
    result: evaluateHermesQualification(
      input(strongLead({ id: `ready-${i}`, name: `Hazır Otel ${i}` })),
    ),
    businessName: `Hazır Otel ${i}`,
  }));
  const reviews = Array.from({ length: 4 }, (_, i) => ({
    result: evaluateHermesQualification(
      input(strongLead({ id: `review-${i}`, name: `İnceleme Otel ${i}`, businessOwnershipType: "chain" })),
    ),
    businessName: `İnceleme Otel ${i}`,
  }));
  const preview = buildQualificationPreview([...results, ...reviews]);
  assert.equal(preview.items.length, 8); // 5 + 3
  assert.equal(preview.summary.salesReady, 7);
  assert.equal(preview.summary.reviewRequired, 4);
  for (const item of preview.items) {
    assert.ok(!item.statusLabelTr.includes("_"), "ham enum sızdı");
    assert.ok(!JSON.stringify(item).includes("+90 532"), "ham telefon sızdı");
  }
});

/* ── founder dili ───────────────────────────────────────────── */

test("tüm founder etiketleri Türkçe ve teknik terimsizdir", () => {
  const forbidden = ["runtime", "registry", "pipeline", "provider", "qualification", "icp", "enum"];
  const texts = [
    ...Object.values(QUALIFICATION_STATUS_LABELS_TR),
    ...Object.values(QUALIFICATION_NEXT_ACTION_LABELS_TR),
    ...Object.values(QUALIFICATION_REASON_LABELS_TR),
  ];
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const term of forbidden) {
      assert.ok(!lower.includes(term), `"${term}" bulundu: "${text}"`);
    }
  }
});

test("founder özetleri Hermes ağzından konuşur", () => {
  const ready = evaluateHermesQualification(input(strongLead()));
  assert.ok(ready.founderSummaryTr.startsWith("Hermes"));
  const dataNeeded = evaluateHermesQualification(input(strongLead({ lastEnrichedAt: STALE_ISO })));
  assert.ok(dataNeeded.founderSummaryTr.includes("daha fazla veri"));
});

/* ── policy türetme entegrasyonu ────────────────────────────── */

test("deriveQualificationPolicy acquisition alanlarını consume eder", () => {
  const derived = deriveQualificationPolicy({
    ...DEFAULT_ACQUISITION_POLICY,
    enabled: true,
    mode: "scheduled_safe",
    minVerifiedOpportunityScore: 75,
    maxMissionCandidatesPerRun: 3,
  });
  assert.equal(derived.enabled, true);
  assert.equal(derived.minVerifiedOpportunityScore, 75);
  assert.equal(derived.maxSalesReadyPerRun, 3);
  assert.equal(derived.requireContactPath, DEFAULT_ACQUISITION_POLICY.requireContactPath);
});
