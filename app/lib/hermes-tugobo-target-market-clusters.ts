/**
 * TUGOBO Target Market Clusters — the single shared source of truth (Target
 * Market Cluster Coverage Fix).
 *
 * Root cause this file fixes: the prior sprint conflated two different
 * concepts into one flat locality list — the acquisition SEARCH catalog
 * (controlled Google Places query points) and eligibility COVERAGE (which
 * businesses count as "in an approved target market" at all). A real
 * Kapadokya hotel in Uçhisar was wrongly excluded from the active Founder
 * queue only because "Uçhisar" wasn't itself a named search point, even
 * though it is unambiguously part of the approved Kapadokya tourism market.
 *
 * Every cluster below has:
 *  - `searchMarkets` — the controlled acquisition sourcing points (feeds
 *    `TUGOBO_NEED_ACQUISITION_REGIONS`, unchanged cost/rotation behavior);
 *  - `eligibilityAliases` — additional verified locality names that count
 *    for active-queue membership even though they are not (yet) their own
 *    acquisition search point. Empty today (every named locality in this
 *    sprint's brief already appears as a search market) but structurally
 *    present so a future locality can be added to eligibility coverage
 *    without also becoming a new paid search point;
 *  - `coverageMode`:
 *      - `"province-wide"` — the bare province name itself (and any
 *        verified `province` field matching it) is ALSO eligible, even for
 *        a locality this catalog has never named (e.g. "Dalaman" inside
 *        Muğla province). Reserved for provinces that are themselves,
 *        broadly, a real target tourism market.
 *      - `"locality-only"` — only the named search markets/aliases are
 *        eligible; the province's own city-center is deliberately NOT
 *        auto-eligible (e.g. plain "İzmir" the city center is not a target
 *        market — "Çeşme"/"Alaçatı" within İzmir province are).
 *
 * `TUGOBO_NEED_ACQUISITION_REGIONS` (`hermes-tugobo-need-acquisition-regions.ts`)
 * and `computeTugoboTargetMarketEligibility`
 * (`tugobo-target-market-eligibility.ts`) both derive from this exact list —
 * neither duplicates it.
 *
 * Pure, dependency-free data — no fetch, no env access, same convention as
 * every other Hermes region/catalog module.
 */

export type TugoboClusterCoverageMode = "province-wide" | "locality-only";

export type TugoboTargetMarketSearchPoint = {
  /** Stable ASCII id — shared with the Turkey 81-province catalog for province-level entries. */
  id: string;
  city: string;
  /** Global sourcing priority (lower = scanned earlier). Assigned once, across all clusters, in this file's declared cluster order. */
  priority: number;
};

export type TugoboTargetMarketCluster = {
  id: string;
  /** Human/founder-facing cluster label (e.g. "Kapadokya") — may differ from `province` (e.g. "Nevşehir"). */
  name: string;
  province: string;
  coverageMode: TugoboClusterCoverageMode;
  searchMarkets: TugoboTargetMarketSearchPoint[];
  /** Verified locality names that count for eligibility but are not (yet) their own acquisition search point. */
  eligibilityAliases: string[];
};

type ClusterSeed = Omit<TugoboTargetMarketCluster, "searchMarkets"> & {
  searchMarkets: Array<{ id: string; city: string }>;
};

let prioritySeq = 0;
function nextPriority(): number {
  prioritySeq += 1;
  return prioritySeq;
}

function cluster(seed: ClusterSeed): TugoboTargetMarketCluster {
  return {
    ...seed,
    searchMarkets: seed.searchMarkets.map((m) => ({ ...m, priority: nextPriority() })),
  };
}

/**
 * Declared in the sprint's required initial sourcing order (Antalya first,
 * İstanbul never included). Each cluster's search markets keep the given
 * list order; priority is assigned once, sequentially, across this whole
 * declaration.
 */
export const TUGOBO_TARGET_MARKET_CLUSTERS: TugoboTargetMarketCluster[] = [
  cluster({
    id: "antalya-cluster",
    name: "Antalya",
    province: "Antalya",
    coverageMode: "province-wide",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "antalya-hotel", city: "Antalya" },
      { id: "antalya-lara-hotel", city: "Lara" },
      { id: "antalya-kundu-hotel", city: "Kundu" },
      { id: "antalya-alanya-hotel", city: "Alanya" },
      { id: "antalya-side-hotel", city: "Side" },
      { id: "antalya-manavgat-hotel", city: "Manavgat" },
      { id: "antalya-belek-hotel", city: "Belek" },
      { id: "antalya-serik-hotel", city: "Serik" },
      { id: "antalya-kemer-hotel", city: "Kemer" },
      { id: "antalya-kas-hotel", city: "Kaş" },
      { id: "antalya-kalkan-hotel", city: "Kalkan" },
      { id: "antalya-olympos-hotel", city: "Olympos" },
      { id: "antalya-cirali-hotel", city: "Çıralı" },
    ],
  }),
  cluster({
    id: "mugla-cluster",
    name: "Muğla",
    province: "Muğla",
    coverageMode: "province-wide",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "mugla-bodrum-hotel", city: "Bodrum" },
      { id: "mugla-marmaris-hotel", city: "Marmaris" },
      { id: "mugla-fethiye-hotel", city: "Fethiye" },
      { id: "mugla-gocek-hotel", city: "Göcek" },
      { id: "mugla-datca-hotel", city: "Datça" },
      { id: "mugla-oludeniz-hotel", city: "Ölüdeniz" },
      { id: "mugla-dalyan-hotel", city: "Dalyan" },
      { id: "mugla-akyaka-hotel", city: "Akyaka" },
    ],
  }),
  cluster({
    id: "izmir-tourism-cluster",
    name: "İzmir Turizm",
    province: "İzmir",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "izmir-cesme-hotel", city: "Çeşme" },
      { id: "izmir-alacati-hotel", city: "Alaçatı" },
      { id: "izmir-urla-hotel", city: "Urla" },
      { id: "izmir-seferihisar-hotel", city: "Seferihisar" },
      { id: "izmir-foca-hotel", city: "Foça" },
    ],
  }),
  cluster({
    id: "aydin-tourism-cluster",
    name: "Aydın Turizm",
    province: "Aydın",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "aydin-kusadasi-hotel", city: "Kuşadası" },
      { id: "aydin-didim-hotel", city: "Didim" },
    ],
  }),
  cluster({
    id: "mersin-cluster",
    name: "Mersin",
    province: "Mersin",
    coverageMode: "province-wide",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "mersin-hotel", city: "Mersin" },
      { id: "mersin-erdemli-hotel", city: "Erdemli" },
      { id: "mersin-kizkalesi-hotel", city: "Kızkalesi" },
      { id: "mersin-silifke-hotel", city: "Silifke" },
      { id: "mersin-tasucu-hotel", city: "Taşucu" },
      { id: "mersin-anamur-hotel", city: "Anamur" },
    ],
  }),
  cluster({
    id: "balikesir-tourism-cluster",
    name: "Balıkesir Turizm",
    province: "Balıkesir",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "balikesir-ayvalik-hotel", city: "Ayvalık" },
      { id: "balikesir-cunda-hotel", city: "Cunda" },
      { id: "balikesir-edremit-hotel", city: "Edremit" },
      { id: "balikesir-akcay-hotel", city: "Akçay" },
    ],
  }),
  cluster({
    id: "kapadokya-cluster",
    name: "Kapadokya",
    province: "Nevşehir",
    coverageMode: "province-wide",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "nevsehir-hotel", city: "Nevşehir" },
      { id: "nevsehir-goreme-hotel", city: "Göreme" },
      { id: "nevsehir-urgup-hotel", city: "Ürgüp" },
      { id: "nevsehir-avanos-hotel", city: "Avanos" },
      { id: "nevsehir-uchisar-hotel", city: "Uçhisar" },
      { id: "nevsehir-ortahisar-hotel", city: "Ortahisar" },
      { id: "nevsehir-mustafapasa-hotel", city: "Mustafapaşa" },
    ],
  }),
  cluster({
    id: "canakkale-tourism-cluster",
    name: "Çanakkale Turizm",
    province: "Çanakkale",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [
      { id: "canakkale-assos-hotel", city: "Assos" },
      { id: "canakkale-ayvacik-hotel", city: "Ayvacık" },
      { id: "canakkale-bozcaada-hotel", city: "Bozcaada" },
      { id: "canakkale-gokceada-hotel", city: "Gökçeada" },
    ],
  }),
  cluster({
    id: "denizli-tourism-cluster",
    name: "Denizli Turizm",
    province: "Denizli",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [{ id: "denizli-pamukkale-hotel", city: "Pamukkale" }],
  }),
  cluster({
    id: "sakarya-tourism-cluster",
    name: "Sakarya Turizm",
    province: "Sakarya",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [{ id: "sakarya-sapanca-hotel", city: "Sapanca" }],
  }),
  cluster({
    id: "bolu-tourism-cluster",
    name: "Bolu Turizm",
    province: "Bolu",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [{ id: "bolu-abant-hotel", city: "Abant" }],
  }),
  cluster({
    id: "bursa-tourism-cluster",
    name: "Bursa Turizm",
    province: "Bursa",
    coverageMode: "locality-only",
    eligibilityAliases: [],
    searchMarkets: [{ id: "bursa-uludag-hotel", city: "Uludağ" }],
  }),
  cluster({
    id: "trabzon-cluster",
    name: "Trabzon",
    province: "Trabzon",
    coverageMode: "province-wide",
    eligibilityAliases: [],
    searchMarkets: [{ id: "trabzon-hotel", city: "Trabzon" }],
  }),
  cluster({
    id: "rize-cluster",
    name: "Rize",
    province: "Rize",
    coverageMode: "province-wide",
    eligibilityAliases: [],
    searchMarkets: [{ id: "rize-hotel", city: "Rize" }],
  }),
];
