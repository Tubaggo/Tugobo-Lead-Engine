import type { ScoredLead } from "@/app/lib/leads";

function sortedLines(items: readonly string[] | undefined): string {
  return [...(items ?? [])]
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join("\n");
}

/**
 * Stable digest of fields that manual re-enrichment can change (URLs, extracted contacts,
 * WhatsApp surface checks, discovery flags). Excludes LLM-only prose.
 */
export function scoredLeadVerifiableEnrichmentFingerprint(lead: ScoredLead): string {
  const acq = lead.acquisitionIntelligence;
  const wi = lead.websiteIntelligence;
  const meta = wi?.whatsappSurfaceMeta;
  const waTop = lead.whatsappConfidence ?? acq?.whatsappConfidence ?? "";
  const waSig = sortedLines(lead.whatsappSignals ?? acq?.whatsappSignals);
  return [
    lead.websiteCandidateUrl ?? "",
    lead.websiteVerificationStatus ?? "",
    (lead.website ?? "").trim(),
    String(waTop),
    waSig,
    sortedLines(lead.extractedPhones),
    sortedLines(lead.extractedEmails),
    String(lead.extractedSocialLinks?.length ?? 0),
    String(meta?.validatedLinkCount ?? 0),
    String(Boolean(meta?.allLinksInvalid)),
    String(Boolean(meta?.mixedValidation)),
    String(Boolean(wi?.hasWhatsAppLink)),
    String(Boolean(wi?.hasInvalidWhatsAppLinks)),
    String(Boolean(lead.hasReservationCTA)),
    String(Boolean(lead.hasContactPage)),
    sortedLines(lead.signals),
  ].join("|");
}

export function hasNewVerifiableEnrichmentSince(
  before: ScoredLead,
  after: ScoredLead,
): boolean {
  return (
    scoredLeadVerifiableEnrichmentFingerprint(before) !==
    scoredLeadVerifiableEnrichmentFingerprint(after)
  );
}
