/**
 * Expected Revenue Engine v3.9.0
 *
 * Answers: "How much recurring TUGOBO revenue should we expect from this lead?"
 *
 * Formula:
 *   expectedMonthlyRevenue  = commercialPackaging.monthlyRevenue  (package price ₺5K–₺40K)
 *   expectedAnnualRevenue   = expectedMonthlyRevenue × 12
 *   expectedCustomerProbability = deterministic probability (0–1) this lead converts
 *   weightedExpectedMonthlyRevenue = expectedMonthlyRevenue × expectedCustomerProbability
 *   weightedExpectedAnnualRevenue  = expectedAnnualRevenue  × expectedCustomerProbability
 *
 * Probability ranges (deterministic):
 *   0.05–0.14  Weak lead
 *   0.15–0.29  Moderate lead
 *   0.30–0.49  Strong lead
 *   0.50–0.75  Very strong lead / advanced pipeline
 *   1.00       Won (special case)
 *   0.02       Lost (special case)
 *   0.01       Do not contact
 *
 * No AI, no I/O, no schema changes. Pure function — safe to call anywhere.
 */

import type { CommercialPackagingResult } from "@/lib/commercial/commercial-packaging";
import type { SignalVerificationProfile } from "@/app/lib/signal-verification";
import type { AcquisitionIntelligenceProfile } from "@/app/lib/intelligence/acquisition-intelligence";
import type { SignalConfidence } from "@/app/lib/intelligence/confidence";

// ── Public types ──────────────────────────────────────────────────────────────

export type ExpectedRevenueConfidence = "low" | "medium" | "high";

export interface ExpectedRevenueInput {
  /** Result of computeCommercialPackaging — sets the base monthly/annual revenue. */
  commercialPackaging: CommercialPackagingResult;

  /** Lead hot score (0–100). Primary conversion urgency signal. */
  hotScore: number;
  /** Lead score (0–100). Secondary operational signal. */
  leadScore: number;
  /** Verified Opportunity Score (0–100). Unified sales-readiness signal. */
  verifiedOpportunityScore: number;
  /** TUGOBO ICP fit score (0–100). Structural alignment signal. */
  icpFitScore: number;
  /** Contact readiness score (0–100). Optional — from computeContactReadinessScore. */
  contactReadinessScore?: number;

  /** Signal verification layer — multi-page verified channel states. */
  signalVerification?: SignalVerificationProfile | null;

  /** Raw contact presence (fallback when signalVerification is absent). */
  phone?: string | null;
  hasOwnWebsite: boolean;
  hasInstagram: boolean;

  /** Pipeline / workflow status — adjusts probability for advanced or terminal stages. */
  pipelineStatus?: string | null;
  doNotContact?: boolean;

  /** Marketing intensity — increases willingness-to-buy signal. */
  adsLikelihood?: SignalConfidence;
  acquisitionIntelligence?: AcquisitionIntelligenceProfile | null;
}

export interface ExpectedRevenueResult {
  /** Package price from Commercial Packaging (base monthly revenue). */
  expectedMonthlyRevenue: number;
  /** expectedMonthlyRevenue × 12. */
  expectedAnnualRevenue: number;
  /** Deterministic probability (0–1) this lead becomes a TUGOBO customer. */
  expectedCustomerProbability: number;
  /** expectedMonthlyRevenue × expectedCustomerProbability (rounded to ₺100). */
  weightedExpectedMonthlyRevenue: number;
  /** expectedAnnualRevenue × expectedCustomerProbability (rounded to ₺100). */
  weightedExpectedAnnualRevenue: number;
  /** Confidence level in this estimate. */
  expectedRevenueConfidence: ExpectedRevenueConfidence;
  /** Founder-readable reasoning lines (max 6). */
  expectedRevenueReasoning: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// ── Probability computation ───────────────────────────────────────────────────

function computeProbability(input: ExpectedRevenueInput): number {
  const status = (input.pipelineStatus ?? "new").toLowerCase();

  // Pipeline status shortcuts
  if (status === "won") return 1.0;
  if (input.doNotContact) return 0.01;
  if (status === "lost") return 0.02;

  const sv = input.signalVerification ?? null;

  // ── Core score components ─────────────────────────────────────────────────
  // Baseline + weighted contributions from primary signals.
  let p = 0.05;

  // hotScore: urgency + demand fit signal (max +0.20)
  p += clamp01(input.hotScore / 100) * 0.20;

  // verifiedOpportunityScore: unified sales-readiness (max +0.18)
  p += clamp01(input.verifiedOpportunityScore / 100) * 0.18;

  // icpFitScore: structural product-market fit (max +0.10)
  p += clamp01(input.icpFitScore / 100) * 0.10;

  // leadScore: operational signals (max +0.07)
  p += clamp01(input.leadScore / 100) * 0.07;

  // contactReadinessScore: reachability signal (max +0.06)
  p += clamp01((input.contactReadinessScore ?? 0) / 100) * 0.06;

  // ── Verified channel bonuses ──────────────────────────────────────────────
  const wa = sv?.whatsappVerification;
  if (wa === "verified") p += 0.04;
  else if (wa === "likely") p += 0.02;
  else if (input.phone?.trim()) p += 0.01;

  const web = sv?.websiteVerification;
  if (web === "verified") p += 0.03;
  else if (web === "reachable") p += 0.01;
  else if (input.hasOwnWebsite) p += 0.005;

  const ig = sv?.instagramVerification;
  if (ig === "verified") p += 0.02;
  else if (ig === "likely" || ig === "candidate") p += 0.01;
  else if (input.hasInstagram) p += 0.005;

  if (sv?.reservationSignal === "verified") p += 0.03;
  else if (sv?.reservationSignal === "detected") p += 0.015;

  // ── Marketing intent bonuses ──────────────────────────────────────────────
  if (input.adsLikelihood === "confirmed") p += 0.02;
  else if (input.adsLikelihood === "likely") p += 0.01;

  if (input.acquisitionIntelligence?.acquisition.isAcquisitionActive) p += 0.01;

  // ── Clamp to base maximum before pipeline adjustments ────────────────────
  p = Math.min(0.75, p);

  // ── Pipeline status boosts ────────────────────────────────────────────────
  if (status === "meeting") p = Math.min(0.75, p + 0.15);
  else if (status === "replied") p = Math.min(0.70, p + 0.08);
  else if (status === "contacted" || status === "needs_follow_up") {
    p = Math.min(0.65, p + 0.03);
  }

  return Math.round(p * 1000) / 1000;
}

// ── Confidence computation ────────────────────────────────────────────────────

function computeConfidence(
  probability: number,
  input: ExpectedRevenueInput,
): ExpectedRevenueConfidence {
  const strongSignals =
    input.hotScore >= 60 ||
    input.verifiedOpportunityScore >= 70 ||
    input.icpFitScore >= 70 ||
    input.signalVerification?.whatsappVerification === "verified" ||
    input.signalVerification?.websiteVerification === "verified";

  if (probability >= 0.45 && strongSignals) return "high";
  if (probability >= 0.20) return "medium";
  return "low";
}

// ── Reasoning builder ─────────────────────────────────────────────────────────

function buildReasoning(
  input: ExpectedRevenueInput,
  probability: number,
  confidence: ExpectedRevenueConfidence,
): string[] {
  const out: string[] = [];
  const pkg = input.commercialPackaging.package;
  const pkgNames: Record<string, string> = {
    starter: "Starter",
    professional: "Professional",
    growth: "Growth",
    enterprise: "Enterprise",
  };

  // Headline: package + price
  out.push(
    `${pkgNames[pkg] ?? pkg} paketi — aylık ${input.commercialPackaging.monthlyRevenue.toLocaleString("tr-TR")} ₺`,
  );

  // Probability + confidence
  const pct = Math.round(probability * 100);
  const confLabel =
    confidence === "high" ? "Yüksek" : confidence === "medium" ? "Orta" : "Düşük";
  out.push(`Dönüşüm olasılığı %${pct} (${confLabel} güven)`);

  // Key signal reasons
  const sv = input.signalVerification ?? null;

  if (input.verifiedOpportunityScore >= 70)
    out.push("Doğrulanmış fırsat skoru yüksek (≥70)");
  else if (input.verifiedOpportunityScore >= 50)
    out.push("Orta doğrulanmış fırsat skoru (≥50)");

  if (input.icpFitScore >= 70) out.push("Güçlü ICP uyumu (≥70)");
  else if (input.icpFitScore >= 50) out.push("Orta ICP uyumu (≥50)");

  if (sv?.whatsappVerification === "verified") out.push("WhatsApp hattı doğrulandı");
  else if (sv?.whatsappVerification === "likely") out.push("WhatsApp muhtemelen aktif");
  else if (input.phone?.trim()) out.push("Telefon numarası mevcut");

  if (sv?.websiteVerification === "verified") out.push("Web sitesi doğrulandı");
  else if (input.hasOwnWebsite) out.push("Web sitesi mevcut");

  if (sv?.reservationSignal === "verified") out.push("Rezervasyon CTA doğrulandı");

  if (input.hotScore >= 65) out.push(`Sıcak lead skoru yüksek (${input.hotScore})`);

  const status = (input.pipelineStatus ?? "").toLowerCase();
  if (status === "meeting") out.push("Demo / toplantı aşamasında — olasılık artırıldı");
  else if (status === "replied") out.push("Yanıt alındı — olasılık artırıldı");
  else if (status === "won") out.push("Satış tamamlandı");
  else if (status === "lost") out.push("Kaybedildi — olasılık düşürüldü");
  else if (input.doNotContact) out.push("İletişim engeli — olasılık düşürüldü");

  if ((input.contactReadinessScore ?? 100) < 40)
    out.push("İletişim hazırlığı düşük — olasılık baskılandı");

  return out.slice(0, 6);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the expected TUGOBO subscription revenue for a lead.
 *
 * Takes the result of computeCommercialPackaging + lead conversion signals.
 * Pure deterministic function — no I/O, no side effects.
 *
 * @example
 * const pkg = computeCommercialPackaging({ icpFitScore, ... });
 * const er = computeExpectedRevenue({
 *   commercialPackaging: pkg,
 *   hotScore: lead.hotScore,
 *   leadScore: lead.leadScore,
 *   verifiedOpportunityScore: lead.verifiedOpportunityScore ?? 0,
 *   icpFitScore: lead.icpFitScore ?? 0,
 *   contactReadinessScore: lead.contactReadinessScore,
 *   signalVerification: lead.signalVerification,
 *   phone: lead.phone,
 *   hasOwnWebsite: lead.hasOwnWebsite,
 *   hasInstagram: lead.hasInstagram,
 *   pipelineStatus: lead._s.status,
 *   doNotContact: lead._s.doNotContact,
 *   adsLikelihood: lead.adsLikelihood,
 *   acquisitionIntelligence: lead.acquisitionIntelligence,
 * });
 */
export function computeExpectedRevenue(input: ExpectedRevenueInput): ExpectedRevenueResult {
  const expectedMonthlyRevenue = input.commercialPackaging.monthlyRevenue;
  const expectedAnnualRevenue = expectedMonthlyRevenue * 12;

  const expectedCustomerProbability = computeProbability(input);

  const weightedExpectedMonthlyRevenue =
    Math.round((expectedMonthlyRevenue * expectedCustomerProbability) / 100) * 100;
  const weightedExpectedAnnualRevenue =
    Math.round((expectedAnnualRevenue * expectedCustomerProbability) / 100) * 100;

  const expectedRevenueConfidence = computeConfidence(expectedCustomerProbability, input);
  const expectedRevenueReasoning = buildReasoning(
    input,
    expectedCustomerProbability,
    expectedRevenueConfidence,
  );

  return {
    expectedMonthlyRevenue,
    expectedAnnualRevenue,
    expectedCustomerProbability,
    weightedExpectedMonthlyRevenue,
    weightedExpectedAnnualRevenue,
    expectedRevenueConfidence,
    expectedRevenueReasoning,
  };
}
