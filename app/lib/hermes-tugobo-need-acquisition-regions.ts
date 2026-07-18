import type { AcquisitionRegion } from "./hermes-autonomous-acquisition-policy.ts";
import { TUGOBO_TARGET_MARKET_CLUSTERS } from "./hermes-tugobo-target-market-clusters.ts";

/**
 * TUGOBO Need-Based Acquisition Engine — acquisition search catalog.
 *
 * Target Market Cluster Coverage Fix: this catalog is now deterministically
 * DERIVED from `TUGOBO_TARGET_MARKET_CLUSTERS`'s `searchMarkets` — the same
 * single source `tugobo-target-market-eligibility.ts` reads for active-queue
 * coverage. Never hand-maintained as a second, parallel locality list (that
 * conflation was the root cause of the Uçhisar exclusion this fix repairs).
 *
 * This catalog plays no role in deciding whether a discovered business is a
 * real TUGOBO opportunity — that decision is `computeTugoboNeedAssessment`
 * (digital-demand signals) gated behind `computeTugoboTargetMarketEligibility`
 * (is it even in an approved market at all). This list only decides sourcing
 * order.
 *
 * Stable IDs: a province-level entry (`antalya-hotel`, `mersin-hotel`,
 * `nevsehir-hotel`, `trabzon-hotel`, `rize-hotel`) shares the exact same id
 * `TURKEY_ACQUISITION_REGIONS` uses for that province, so the durable
 * rotation cursor is naturally shared across scopes. A district/town-level
 * locality gets its own `${province-slug}-${locality-slug}-hotel` id, and
 * its `city` field is the plain locality name only (e.g. "Bodrum",
 * "Alaçatı", "Uçhisar") so the existing Google Places adapter's
 * locality-specific query is preserved verbatim.
 */
export const TUGOBO_NEED_ACQUISITION_REGIONS: AcquisitionRegion[] = TUGOBO_TARGET_MARKET_CLUSTERS.flatMap(
  (c) => c.searchMarkets,
)
  .sort((a, b) => a.priority - b.priority)
  .map((m) => ({
    id: m.id,
    city: m.city,
    country: "TR",
    enabled: true,
    priority: m.priority,
    maxResultsPerRun: 10,
    leadType: "Hotel",
    lastRunAt: null,
    cooldownHours: 24,
  }));
