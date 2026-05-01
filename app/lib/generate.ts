import {
  type Channel,
  type Lead,
  type LeadType,
  getContactQuality,
  scoreLead,
  scoreHot,
  type ScoredLead,
} from "./leads";

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32) – identical output for the same seed
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rInt(rng: () => number, min: number, max: number) {
  return min + Math.floor(rng() * (max - min + 1));
}

function rFloat(rng: () => number, min: number, max: number, dp = 2) {
  const v = min + rng() * (max - min);
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

// ---------------------------------------------------------------------------
// Turkish tourism geography
// ---------------------------------------------------------------------------
const CITY_REGION: Record<string, string> = {
  Antalya: "Akdeniz",
  Alanya: "Akdeniz",
  Side: "Akdeniz",
  Kaş: "Akdeniz",
  Kalkan: "Akdeniz",
  Fethiye: "Akdeniz",
  Ölüdeniz: "Akdeniz",
  Mersin: "Akdeniz",
  Erdemli: "Akdeniz",
  Silifke: "Akdeniz",
  Kızkalesi: "Akdeniz",
  Anamur: "Akdeniz",
  Tarsus: "Akdeniz",
  Ayaş: "Akdeniz",
  Susanoğlu: "Akdeniz",
  Marmaris: "Ege",
  Datça: "Ege",
  Akyaka: "Ege",
  Olympos: "Akdeniz",
  Bodrum: "Ege",
  İzmir: "Ege",
  Alaçatı: "Ege",
  Çeşme: "Ege",
  Kuşadası: "Ege",
  Didim: "Ege",
  Ayvalık: "Ege",
  Cunda: "Ege",
  Assos: "Ege",
  Bozcaada: "Ege",
  Gümüşlük: "Ege",
  Kapadokya: "Kapadokya",
  Göreme: "Kapadokya",
  Ürgüp: "Kapadokya",
  "Uçhisar": "Kapadokya",
  Urgup: "Kapadokya",
  Avanos: "Kapadokya",
  Mustafapaşa: "Kapadokya",
  İstanbul: "Marmara",
  Sapanca: "Marmara",
  Ağva: "Marmara",
  Bursa: "Marmara",
  "Şile": "Marmara",
  Trabzon: "Karadeniz",
  Uzungöl: "Karadeniz",
  Abant: "Karadeniz",
  Amasra: "Karadeniz",
  Sinop: "Karadeniz",
  Rize: "Karadeniz",
  Safranbolu: "Karadeniz",
  Eskişehir: "İç Anadolu",
  Konya: "İç Anadolu",
  Şanlıurfa: "Güneydoğu",
  Gaziantep: "Güneydoğu",
  Mardin: "Güneydoğu",
};

export function regionFor(city: string) {
  if (CITY_REGION[city]) return CITY_REGION[city];
  const lower = city.trim().toLowerCase();
  const hit = Object.keys(CITY_REGION).find((k) => k.toLowerCase() === lower);
  if (hit) return CITY_REGION[hit];
  return "Türkiye";
}

// ---------------------------------------------------------------------------
// Name corpora
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Ahmet", "Mehmet", "Ali", "Mustafa", "Hüseyin",
  "Ayşe", "Fatma", "Zeynep", "Elif", "Selin",
  "Can", "Emre", "Burak", "Cem", "Murat",
  "Deniz", "Pelin", "Burcu", "Aslı", "Naz",
  "Tolga", "Kerem", "Yiğit", "Onur", "İlker",
  "Tuğçe", "Defne", "Berke", "Esra", "Hülya",
];

const LAST_NAMES = [
  "Yılmaz", "Kaya", "Demir", "Çelik", "Şahin",
  "Doğan", "Arslan", "Koç", "Aydın", "Öztürk",
  "Aksoy", "Polat", "Eren", "Tezcan", "Bilgin",
  "Korkmaz", "Aslan", "Bayar", "Bulut", "Güneş",
  "Yıldız", "Aksu", "Şener", "Karaca", "Erden",
];

// ---------------------------------------------------------------------------
// Business name templates per type
// ---------------------------------------------------------------------------
const PREFIXES: Record<LeadType, string[]> = {
  Hotel: [
    "Sahil", "Deniz", "Mavi", "Plaj", "Marina",
    "Bahçe", "Panorama", "Grand", "Classic", "City",
    "Akdeniz", "Ege", "Liman", "Kale", "Antik",
  ],
  "Boutique Hotel": [
    "Taş", "Kaya", "Beyaz", "Konak", "Çiçek",
    "Divan", "Heritage", "Stone", "Vintage", "Antika",
    "Bahce", "Yıldız", "Asma", "Peri", "Lüfer",
  ],
  Bungalow: [
    "Orman", "Çam", "Fındık", "Nehir", "Şelale",
    "Doğa", "Dere", "Kayın", "Meşe", "Yeşil",
    "Göl", "Bulut", "Sisli", "Pınar", "Kekik",
  ],
  Villa: [
    "Manzara", "Panorama", "Cliff", "Sahil", "Bay",
    "Masmavi", "Sunset", "Sunrise", "Lüks", "Royal",
    "Özel", "Elit", "Cennet", "Rüya", "Altın",
  ],
  Pension: [
    "Gül", "Bahçe", "Ev", "Konak", "Vine",
    "Bağ", "Zeytin", "Çam", "Limon", "Defne",
    "Dağ", "Dere", "Kekik", "Lavanta", "Pembe",
  ],
};

const SUFFIXES: Record<LeadType, string[]> = {
  Hotel: ["Hotel", "Otel", "Hotel & Suites", "Resort", "Hotel & Spa"],
  "Boutique Hotel": [
    "Boutique Hotel",
    "Butik Otel",
    "Suites",
    "Konak",
    "Stone Hotel",
  ],
  Bungalow: ["Bungalows", "Bungalov", "Bungalow Camp", "Nature Camp", "Forest Camp"],
  Villa: ["Villa", "Villas", "Villa & Garden", "Private Villa", "Villa Suites"],
  Pension: ["Pansiyon", "Pension", "Konak", "Ev Pansiyonu", "Guest House"],
};

// ---------------------------------------------------------------------------
// Type-specific realistic ranges
// ---------------------------------------------------------------------------
type TypeMeta = {
  unitMin: number;
  unitMax: number;
  adrMin: number;
  adrMax: number;
  occupancyMin: number;
  occupancyMax: number;
  ratingMin: number;
  ratingMax: number;
  reviewMin: number;
  reviewMax: number;
  daysOnMin: number;
  daysOnMax: number;
  channelPool: Channel[];
  websiteChance: number;
  igChance: number;
};

type TypeMetaAdjust = Partial<TypeMeta>;

const TYPE_META: Record<LeadType, TypeMeta> = {
  Hotel: {
    unitMin: 28, unitMax: 90,
    adrMin: 1800, adrMax: 7500,
    occupancyMin: 0.45, occupancyMax: 0.88,
    ratingMin: 3.9, ratingMax: 4.8,
    reviewMin: 180, reviewMax: 1500,
    daysOnMin: 800, daysOnMax: 4500,
    channelPool: ["Booking", "Airbnb", "Direct", "Tatilsepeti"],
    websiteChance: 0.7,
    igChance: 0.55,
  },
  "Boutique Hotel": {
    unitMin: 6, unitMax: 28,
    adrMin: 3200, adrMax: 12000,
    occupancyMin: 0.5, occupancyMax: 0.93,
    ratingMin: 4.2, ratingMax: 5.0,
    reviewMin: 45, reviewMax: 600,
    daysOnMin: 300, daysOnMax: 2500,
    channelPool: ["Booking", "Airbnb", "Direct"],
    websiteChance: 0.45,
    igChance: 0.85,
  },
  Bungalow: {
    unitMin: 5, unitMax: 20,
    adrMin: 1400, adrMax: 5000,
    occupancyMin: 0.45, occupancyMax: 0.87,
    ratingMin: 4.0, ratingMax: 4.8,
    reviewMin: 30, reviewMax: 450,
    daysOnMin: 200, daysOnMax: 2000,
    channelPool: ["Airbnb", "Booking", "Tatilsepeti", "Direct"],
    websiteChance: 0.25,
    igChance: 0.7,
  },
  Villa: {
    unitMin: 1, unitMax: 5,
    adrMin: 6000, adrMax: 28000,
    occupancyMin: 0.4, occupancyMax: 0.82,
    ratingMin: 4.4, ratingMax: 5.0,
    reviewMin: 15, reviewMax: 140,
    daysOnMin: 200, daysOnMax: 1800,
    channelPool: ["Airbnb", "Direct"],
    websiteChance: 0.4,
    igChance: 0.75,
  },
  Pension: {
    unitMin: 4, unitMax: 12,
    adrMin: 1200, adrMax: 4000,
    occupancyMin: 0.4, occupancyMax: 0.79,
    ratingMin: 4.0, ratingMax: 4.8,
    reviewMin: 20, reviewMax: 250,
    daysOnMin: 200, daysOnMax: 2200,
    channelPool: ["Booking", "Airbnb"],
    websiteChance: 0.15,
    igChance: 0.6,
  },
};

type CityNicheProfile = {
  meta?: TypeMetaAdjust;
  namePrefixes?: string[];
  nameSuffixes?: string[];
  extraSignals?: string[];
};

const CITY_NICHE_PROFILES: Record<string, Partial<Record<LeadType, CityNicheProfile>>> = {
  bodrum: {
    Villa: {
      meta: { adrMin: 14000, adrMax: 32000, occupancyMin: 0.55, occupancyMax: 0.9, ratingMin: 4.6, reviewMin: 30 },
      namePrefixes: ["Azure", "Yalıkavak", "Marina", "Aegean", "Elite", "Luxe", "Royal"],
      nameSuffixes: ["Luxury Villas", "Private Villa", "Signature Villas", "Villa Collection"],
      extraSignals: ["Luxury demand", "High-spend segment"],
    },
  },
  fethiye: {
    Pension: {
      meta: { adrMin: 1100, adrMax: 3200, occupancyMin: 0.35, occupancyMax: 0.76, reviewMin: 25, reviewMax: 220 },
      namePrefixes: ["Kayaköy", "Lagoon", "Likya", "Zeytin", "Portakal", "Sahil"],
      nameSuffixes: ["Pansiyon", "Guest House", "Ev Pansiyonu"],
      extraSignals: ["Seasonal demand", "Price-sensitive segment"],
    },
  },
  göreme: {
    "Boutique Hotel": {
      meta: { reviewMin: 260, reviewMax: 1200, ratingMin: 4.6, occupancyMin: 0.65, occupancyMax: 0.96 },
      namePrefixes: ["Cave", "Fairy", "Stone", "Peri", "Valley", "Sunrise"],
      nameSuffixes: ["Cave Suites", "Boutique Hotel", "Stone Suites"],
      extraSignals: ["High review volume"],
    },
  },
  cappadocia: {
    "Boutique Hotel": {
      meta: { reviewMin: 260, reviewMax: 1200, ratingMin: 4.6, occupancyMin: 0.65, occupancyMax: 0.96 },
      extraSignals: ["High review volume"],
    },
  },
  antalya: {
    Hotel: {
      meta: { unitMin: 45, unitMax: 130, reviewMin: 300, reviewMax: 2200, occupancyMin: 0.55, occupancyMax: 0.92 },
      namePrefixes: ["Lara", "Kundu", "Riviera", "Mediterranean", "Grand", "Coast"],
      nameSuffixes: ["Resort", "Hotel & Spa", "Hotel", "Hotel & Suites"],
      extraSignals: ["Large-scale operation"],
    },
  },
  sapanca: {
    Bungalow: {
      meta: { adrMin: 1800, adrMax: 5400, occupancyMin: 0.52, occupancyMax: 0.9, igChance: 0.82 },
      namePrefixes: ["Lake", "Forest", "Weekend", "Nature", "Pine", "Riverside"],
      nameSuffixes: ["Bungalov", "Nature Camp", "Forest Camp"],
      extraSignals: ["Weekend getaway demand", "Nature escape trend"],
    },
  },
};

function normalizeCity(input: string) {
  return input
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mergeMeta(base: TypeMeta, adjust?: TypeMetaAdjust): TypeMeta {
  if (!adjust) return base;
  return { ...base, ...adjust };
}

function profileFor(city: string, type: LeadType): CityNicheProfile | undefined {
  const byCity = CITY_NICHE_PROFILES[normalizeCity(city)];
  return byCity?.[type];
}

// ---------------------------------------------------------------------------
// Signal text pools per type
// ---------------------------------------------------------------------------
const TYPE_SIGNALS: Record<LeadType, string[]> = {
  Hotel: [
    "No Instagram",
    "Single channel only",
    "Stable bookings",
    "High volume",
    "Weak direct share",
    "Low ADR vs market",
    "No own website",
    "Mobile traffic dominant",
  ],
  "Boutique Hotel": [
    "No own website",
    "Premium ADR",
    "High occupancy",
    "Single channel only",
    "Sweet-spot maturity",
    "Repeat guest signals",
    "Fast-growing region",
    "Strong IG engagement",
  ],
  Bungalow: [
    "Trending category",
    "Weekend demand",
    "No own website",
    "Single channel only",
    "High review velocity",
    "GCC inbound trend",
    "Forest/nature demand",
    "Soft weekday occupancy",
  ],
  Villa: [
    "Premium ADR",
    "Direct-only",
    "No own website",
    "High ADR",
    "Premium leaking margin",
    "Repeat guest signals",
    "Low channel count",
    "5-star experience signals",
  ],
  Pension: [
    "Low channel count",
    "No own website",
    "Arabic-speaking demand",
    "Low online presence",
    "Soft season",
    "Tasteful brand",
    "Backpacker favorite",
    "No Instagram",
  ],
};

// ---------------------------------------------------------------------------
// Instagram handle generator
// ---------------------------------------------------------------------------
function makeHandle(
  rng: () => number,
  citySlug: string,
  prefix: string,
  suffix: string,
) {
  const base =
    (prefix + citySlug + suffix)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9._]/g, "")
      .slice(0, 28);
  // small random suffix to avoid collisions
  return base + rInt(rng, 1, 99);
}

// ---------------------------------------------------------------------------
// Phone generator
// ---------------------------------------------------------------------------
let _phoneCounter = 90000;
function nextPhone() {
  _phoneCounter += 37;
  const n = (300000000 + _phoneCounter).toString().padStart(9, "0");
  return `+90 5${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 9)}`;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export function generateLeads(
  city: string,
  type: LeadType,
  count: number,
  seed: number,
): Lead[] {
  const rng = mulberry32(seed);
  const profile = profileFor(city, type);
  const meta = mergeMeta(TYPE_META[type], profile?.meta);
  const citySlug = city.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
  const region = regionFor(city);
  const results: Lead[] = [];

  for (let i = 0; i < count; i++) {
    const prefix = pick(rng, profile?.namePrefixes ?? PREFIXES[type]);
    const suffix = pick(rng, profile?.nameSuffixes ?? SUFFIXES[type]);
    const name = `${city} ${prefix} ${suffix}`;

    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const contactName = `${firstName} ${lastName}`;

    const hasInstagram = rng() < meta.igChance;
    const hasOwnWebsite = rng() < meta.websiteChance;

    const channelCount = rng() < 0.3 ? 1 : rng() < 0.6 ? 2 : 3;
    const shuffledChannels = [...meta.channelPool].sort(() => rng() - 0.5);
    const channels = shuffledChannels.slice(0, Math.min(channelCount, shuffledChannels.length)) as Channel[];

    const units = rInt(rng, meta.unitMin, meta.unitMax);
    const pricePerNight = rInt(rng, meta.adrMin, meta.adrMax);
    const occupancy30d = rFloat(rng, meta.occupancyMin, meta.occupancyMax, 2);
    const rating = rFloat(rng, meta.ratingMin, meta.ratingMax, 1);
    const reviewsCount = rInt(rng, meta.reviewMin, meta.reviewMax);
    const daysSinceLastReview = rInt(rng, 0, 14);
    const daysOnPlatform = rInt(rng, meta.daysOnMin, meta.daysOnMax);

    const igHandle = hasInstagram
      ? makeHandle(rng, citySlug, prefix, suffix)
      : undefined;
    const websiteDomain = hasOwnWebsite
      ? `${citySlug}${prefix.toLowerCase().replace(/[^a-z]/g, "")}.com`
      : undefined;

    // pick 1-3 signals
    const sigPool = [...TYPE_SIGNALS[type], ...(profile?.extraSignals ?? [])];
    sigPool.sort(() => rng() - 0.5);
    const signalCount = rInt(rng, 1, 3);
    const signals: string[] = [];
    if (!hasOwnWebsite) signals.push("No own website");
    if (!hasInstagram && units >= 6) signals.push("No Instagram");
    if (channels.length === 1) signals.push("Single channel only");
    for (const sig of sigPool) {
      if (signals.length >= signalCount + 1) break;
      if (!signals.includes(sig)) signals.push(sig);
    }

    const id = `gen-${seed.toString(36)}-${i}`;

    results.push({
      id,
      name,
      type,
      city,
      region,
      contactName,
      phone: nextPhone(),
      instagram: igHandle,
      website: websiteDomain,
      units,
      pricePerNight,
      occupancy30d,
      rating,
      channels,
      hasOwnWebsite,
      hasInstagram,
      reviewsCount,
      daysSinceLastReview,
      daysOnPlatform,
      signals,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Score a batch and return ScoredLeads
// ---------------------------------------------------------------------------
export function generateScoredLeads(
  city: string,
  type: LeadType,
  count: number,
  seed: number,
): ScoredLead[] {
  const raw = generateLeads(city, type, count, seed);
  return raw.map((l) => {
    const ls = scoreLead(l);
    const hs = scoreHot(l);
    return {
      ...l,
      leadScore: ls.score,
      leadReasons: ls.reasons,
      hotScore: hs.score,
      hotReasons: hs.reasons,
      contactQuality: getContactQuality(l.phone),
    };
  });
}

// ---------------------------------------------------------------------------
// Duplicate check key
// ---------------------------------------------------------------------------
export function leadDedupeKey(name: string, city: string) {
  return `${name.toLowerCase().trim()}|${city.toLowerCase().trim()}`;
}

// ---------------------------------------------------------------------------
// Known Turkey tourism cities for the city datalist
// ---------------------------------------------------------------------------
export const TURKEY_CITIES = Object.keys(CITY_REGION).sort();
