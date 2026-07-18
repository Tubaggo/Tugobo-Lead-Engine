import type { AcquisitionRegion } from "./hermes-autonomous-acquisition-policy.ts";

/**
 * Türkiye Region Rotation v1.0 — built-in 81-province catalog.
 *
 * Pure, dependency-free data (same convention as the policy/config modules
 * it feeds): no fetch, no env access, no fs. `hermes-acquisition-config.ts`
 * substitutes this catalog in place of `HERMES_ACQUISITION_REGIONS_JSON`
 * only when `HERMES_ACQUISITION_REGION_SCOPE=turkey`.
 *
 * `priority` encodes the initial static scan order: the 30 cities named
 * explicitly in the sprint brief (business-potential-first), then the
 * remaining 51 provinces in plate-code order — deterministic, not a claimed
 * "official tourism ranking." `id` is an ASCII slug (`${province}-hotel`,
 * no Turkish characters) so it is safe as a stable rotation-cursor key
 * regardless of encoding. `lastRunAt` is always `null` here — the real
 * per-region last-run moment lives in the run registry / durable region
 * state store, never in this static catalog.
 */
export const TURKEY_ACQUISITION_REGIONS: AcquisitionRegion[] = [
  { id: "istanbul-hotel", city: "İstanbul", priority: 1 },
  { id: "antalya-hotel", city: "Antalya", priority: 2 },
  { id: "mugla-hotel", city: "Muğla", priority: 3 },
  { id: "izmir-hotel", city: "İzmir", priority: 4 },
  { id: "ankara-hotel", city: "Ankara", priority: 5 },
  { id: "bursa-hotel", city: "Bursa", priority: 6 },
  { id: "aydin-hotel", city: "Aydın", priority: 7 },
  { id: "nevsehir-hotel", city: "Nevşehir", priority: 8 },
  { id: "mersin-hotel", city: "Mersin", priority: 9 },
  { id: "adana-hotel", city: "Adana", priority: 10 },
  { id: "balikesir-hotel", city: "Balıkesir", priority: 11 },
  { id: "denizli-hotel", city: "Denizli", priority: 12 },
  { id: "afyonkarahisar-hotel", city: "Afyonkarahisar", priority: 13 },
  { id: "konya-hotel", city: "Konya", priority: 14 },
  { id: "kayseri-hotel", city: "Kayseri", priority: 15 },
  { id: "trabzon-hotel", city: "Trabzon", priority: 16 },
  { id: "samsun-hotel", city: "Samsun", priority: 17 },
  { id: "kocaeli-hotel", city: "Kocaeli", priority: 18 },
  { id: "sakarya-hotel", city: "Sakarya", priority: 19 },
  { id: "canakkale-hotel", city: "Çanakkale", priority: 20 },
  { id: "hatay-hotel", city: "Hatay", priority: 21 },
  { id: "gaziantep-hotel", city: "Gaziantep", priority: 22 },
  { id: "sanliurfa-hotel", city: "Şanlıurfa", priority: 23 },
  { id: "mardin-hotel", city: "Mardin", priority: 24 },
  { id: "diyarbakir-hotel", city: "Diyarbakır", priority: 25 },
  { id: "eskisehir-hotel", city: "Eskişehir", priority: 26 },
  { id: "ordu-hotel", city: "Ordu", priority: 27 },
  { id: "rize-hotel", city: "Rize", priority: 28 },
  { id: "erzurum-hotel", city: "Erzurum", priority: 29 },
  { id: "bolu-hotel", city: "Bolu", priority: 30 },
  // Remaining 51 provinces, plate-code order.
  { id: "adiyaman-hotel", city: "Adıyaman", priority: 31 },
  { id: "agri-hotel", city: "Ağrı", priority: 32 },
  { id: "amasya-hotel", city: "Amasya", priority: 33 },
  { id: "artvin-hotel", city: "Artvin", priority: 34 },
  { id: "bilecik-hotel", city: "Bilecik", priority: 35 },
  { id: "bingol-hotel", city: "Bingöl", priority: 36 },
  { id: "bitlis-hotel", city: "Bitlis", priority: 37 },
  { id: "burdur-hotel", city: "Burdur", priority: 38 },
  { id: "cankiri-hotel", city: "Çankırı", priority: 39 },
  { id: "corum-hotel", city: "Çorum", priority: 40 },
  { id: "edirne-hotel", city: "Edirne", priority: 41 },
  { id: "elazig-hotel", city: "Elazığ", priority: 42 },
  { id: "erzincan-hotel", city: "Erzincan", priority: 43 },
  { id: "giresun-hotel", city: "Giresun", priority: 44 },
  { id: "gumushane-hotel", city: "Gümüşhane", priority: 45 },
  { id: "hakkari-hotel", city: "Hakkari", priority: 46 },
  { id: "isparta-hotel", city: "Isparta", priority: 47 },
  { id: "kars-hotel", city: "Kars", priority: 48 },
  { id: "kastamonu-hotel", city: "Kastamonu", priority: 49 },
  { id: "kirklareli-hotel", city: "Kırklareli", priority: 50 },
  { id: "kirsehir-hotel", city: "Kırşehir", priority: 51 },
  { id: "kutahya-hotel", city: "Kütahya", priority: 52 },
  { id: "malatya-hotel", city: "Malatya", priority: 53 },
  { id: "manisa-hotel", city: "Manisa", priority: 54 },
  { id: "kahramanmaras-hotel", city: "Kahramanmaraş", priority: 55 },
  { id: "mus-hotel", city: "Muş", priority: 56 },
  { id: "nigde-hotel", city: "Niğde", priority: 57 },
  { id: "siirt-hotel", city: "Siirt", priority: 58 },
  { id: "sinop-hotel", city: "Sinop", priority: 59 },
  { id: "sivas-hotel", city: "Sivas", priority: 60 },
  { id: "tekirdag-hotel", city: "Tekirdağ", priority: 61 },
  { id: "tokat-hotel", city: "Tokat", priority: 62 },
  { id: "tunceli-hotel", city: "Tunceli", priority: 63 },
  { id: "usak-hotel", city: "Uşak", priority: 64 },
  { id: "van-hotel", city: "Van", priority: 65 },
  { id: "yozgat-hotel", city: "Yozgat", priority: 66 },
  { id: "zonguldak-hotel", city: "Zonguldak", priority: 67 },
  { id: "aksaray-hotel", city: "Aksaray", priority: 68 },
  { id: "bayburt-hotel", city: "Bayburt", priority: 69 },
  { id: "karaman-hotel", city: "Karaman", priority: 70 },
  { id: "kirikkale-hotel", city: "Kırıkkale", priority: 71 },
  { id: "batman-hotel", city: "Batman", priority: 72 },
  { id: "sirnak-hotel", city: "Şırnak", priority: 73 },
  { id: "bartin-hotel", city: "Bartın", priority: 74 },
  { id: "ardahan-hotel", city: "Ardahan", priority: 75 },
  { id: "igdir-hotel", city: "Iğdır", priority: 76 },
  { id: "yalova-hotel", city: "Yalova", priority: 77 },
  { id: "karabuk-hotel", city: "Karabük", priority: 78 },
  { id: "kilis-hotel", city: "Kilis", priority: 79 },
  { id: "osmaniye-hotel", city: "Osmaniye", priority: 80 },
  { id: "duzce-hotel", city: "Düzce", priority: 81 },
].map((entry) => ({
  id: entry.id,
  city: entry.city,
  country: "TR",
  enabled: true,
  priority: entry.priority,
  maxResultsPerRun: 10,
  leadType: "Hotel",
  lastRunAt: null,
  cooldownHours: 24,
}));
