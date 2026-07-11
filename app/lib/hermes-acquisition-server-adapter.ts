import { discoverGooglePlacesLeads } from "./places-import-server";
import { enrichLeadsWithHomepageSignalsBatched } from "./enrich-lead-homepage";
import type {
  AcquisitionImportAdapter,
  AcquisitionImportAdapterResult,
} from "./hermes-autonomous-acquisition-runtime.ts";

/**
 * Production import adapter for the autonomous acquisition runtime
 * (Sprint C1 — Scope 4). The ONLY place autonomous acquisition touches the
 * real world, and it does so exclusively through the two functions the
 * manual Lead Import route already uses:
 *
 *   - `discoverGooglePlacesLeads` (the shared Places core extracted from
 *     `/api/import-leads`) — text search + capped detail fetches, with the
 *     external request count reported back for the budget guardrails;
 *   - `enrichLeadsWithHomepageSignalsBatched` — the existing homepage
 *     enrichment/ICP/verified-opportunity pipeline, unchanged.
 *
 * No new provider, no new scoring, no new enrichment. A missing
 * GOOGLE_MAPS_API_KEY yields a provider_error result — never a thrown
 * secret-bearing error.
 */
export const hermesAcquisitionServerImportAdapter: AcquisitionImportAdapter = async ({
  region,
  maxResults,
}): Promise<AcquisitionImportAdapterResult> => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, kind: "provider_error", externalRequestCount: 0 };
  }

  const discovery = await discoverGooglePlacesLeads({
    apiKey,
    city: region.city,
    type: region.leadType,
    icpSearchTerm: region.icpSearchTerm ?? null,
    maxResults,
  });

  if (!discovery.ok) {
    return {
      ok: false,
      kind: discovery.kind,
      externalRequestCount: discovery.externalRequestCount,
    };
  }

  try {
    const enriched = await enrichLeadsWithHomepageSignalsBatched(discovery.leads);
    return { ok: true, leads: enriched, externalRequestCount: discovery.externalRequestCount };
  } catch {
    // Enrichment trouble degrades to the un-enriched (still scored) leads —
    // the same objects the manual import would have produced pre-enrichment.
    return { ok: true, leads: discovery.leads, externalRequestCount: discovery.externalRequestCount };
  }
};
