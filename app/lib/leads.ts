export type LeadType =
  | "Hotel"
  | "Boutique Hotel"
  | "Bungalow"
  | "Villa"
  | "Pension";

export type LeadStatus =
  | "new"
  | "contacted"
  | "needs_follow_up"
  | "replied"
  | "meeting"
  | "won"
  | "lost";

export type Channel = "Booking" | "Airbnb" | "Direct" | "Tatilsepeti";

export type Lead = {
  id: string;
  createdAt?: number;
  /** First time this business was added to the master database (import). */
  firstImportedAt?: number;
  /** Most recent import that touched this lead. */
  lastImportedAt?: number;
  /** Last outreach marked as contacted (mirrors workflow state). */
  lastContactedAt?: number;
  /** Number of times outreach was marked contacted. */
  contactAttempts?: number;
  /** Import batch session id (last touch). */
  importSessionId?: string | null;
  /** Optional mirror; persisted workflow flag lives in {@link LeadStatusUpdate.doNotContact}. */
  doNotContact?: boolean;
  name: string;
  type: LeadType;
  city: string;
  region: string;
  contactName: string;
  phone: string;
  instagram?: string;
  website?: string;
  units: number;
  pricePerNight: number;
  occupancy30d: number;
  rating: number;
  channels: Channel[];
  hasOwnWebsite: boolean;
  hasInstagram: boolean;
  reviewsCount: number;
  daysSinceLastReview: number;
  daysOnPlatform: number;
  signals: string[];
};

export type ContactQuality = "high" | "medium" | "low";

export type ScoredLead = Lead & {
  leadScore: number;
  hotScore: number;
  leadReasons: string[];
  hotReasons: string[];
  contactQuality: ContactQuality;
};

/** Persisted workflow state for one lead — scalars only (current snapshot, not history). */
export type LeadStatusUpdate = {
  status: LeadStatus;
  /** Single note text; UI and storage must not treat as a list. */
  note: string;
  updatedAt: number | null;
  contactedAt?: number | null;
  channel?: "whatsapp" | "phone" | "instagram" | "email" | null;
  /** Persisted DNC flag (also mirrored on stored ScoredLead for imports). */
  doNotContact?: boolean;
  contactAttempts?: number;
  lastContactedAt?: number | null;
  /** Epoch ms when a follow-up is due (set on outbound WhatsApp / contacted). */
  nextFollowUpAt?: number | null;
  /** Hours after last contact before auto “needs follow-up” (default 24 in UI). */
  followUpAfterHours?: number;
  repliedAt?: number | null;
  meetingAt?: number | null;
  wonAt?: number | null;
  lostAt?: number | null;
};

const turkishPhone = (n: number) => {
  const nn = (300000000 + n).toString().padStart(9, "0");
  return `+90 5${nn.slice(0, 2)} ${nn.slice(2, 5)} ${nn.slice(5, 9)}`;
};

export const LEADS: Lead[] = [
  {
    id: "ant-001",
    name: "Lara Sunset Boutique",
    type: "Boutique Hotel",
    city: "Antalya",
    region: "Akdeniz",
    contactName: "Mehmet Yılmaz",
    phone: turkishPhone(12001),
    instagram: "larasunset.boutique",
    website: "larasunset.com.tr",
    units: 22,
    pricePerNight: 4200,
    occupancy30d: 0.86,
    rating: 4.7,
    channels: ["Booking", "Airbnb"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 312,
    daysSinceLastReview: 1,
    daysOnPlatform: 1450,
    signals: ["High season pricing", "Sold out next 2 weekends"],
  },
  {
    id: "bod-002",
    name: "Bodrum Bay Villas",
    type: "Villa",
    city: "Bodrum",
    region: "Ege",
    contactName: "Ayşe Demir",
    phone: turkishPhone(12302),
    instagram: "bodrumbayvillas",
    units: 6,
    pricePerNight: 18500,
    occupancy30d: 0.74,
    rating: 4.9,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 88,
    daysSinceLastReview: 3,
    daysOnPlatform: 720,
    signals: ["Premium ADR", "No own website"],
  },
  {
    id: "kap-003",
    name: "Cappadocia Cave Suites",
    type: "Boutique Hotel",
    city: "Göreme",
    region: "Kapadokya",
    contactName: "Hasan Karaca",
    phone: turkishPhone(13003),
    instagram: "cappadociacavesuites",
    website: "cavesuites.com",
    units: 14,
    pricePerNight: 6800,
    occupancy30d: 0.91,
    rating: 4.8,
    channels: ["Booking", "Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 540,
    daysSinceLastReview: 0,
    daysOnPlatform: 2100,
    signals: ["High occupancy", "Booking #1 in district"],
  },
  {
    id: "alc-004",
    name: "Alaçatı Taş Konak",
    type: "Boutique Hotel",
    city: "Alaçatı",
    region: "Ege",
    contactName: "Selin Aksoy",
    phone: turkishPhone(13404),
    instagram: "alacatitaskonak",
    units: 9,
    pricePerNight: 7400,
    occupancy30d: 0.68,
    rating: 4.6,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 204,
    daysSinceLastReview: 2,
    daysOnPlatform: 980,
    signals: ["Single channel only", "No own website"],
  },
  {
    id: "fet-005",
    name: "Kayaköy Stone Pension",
    type: "Pension",
    city: "Fethiye",
    region: "Akdeniz",
    contactName: "Emre Şahin",
    phone: turkishPhone(13705),
    units: 8,
    pricePerNight: 1900,
    occupancy30d: 0.55,
    rating: 4.4,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: false,
    reviewsCount: 41,
    daysSinceLastReview: 14,
    daysOnPlatform: 410,
    signals: ["Low online presence", "No Instagram"],
  },
  {
    id: "kas-006",
    name: "Kaş Cliffside Villa",
    type: "Villa",
    city: "Kaş",
    region: "Akdeniz",
    contactName: "Can Öztürk",
    phone: turkishPhone(14006),
    instagram: "kascliffside",
    website: "kascliffside.com",
    units: 1,
    pricePerNight: 14500,
    occupancy30d: 0.62,
    rating: 4.9,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 67,
    daysSinceLastReview: 5,
    daysOnPlatform: 540,
    signals: ["High ADR", "Repeat guest signals"],
  },
  {
    id: "sap-007",
    name: "Sapanca Forest Bungalows",
    type: "Bungalow",
    city: "Sapanca",
    region: "Marmara",
    contactName: "Burcu Aydın",
    phone: turkishPhone(14307),
    instagram: "sapancaforestbungalow",
    units: 12,
    pricePerNight: 3400,
    occupancy30d: 0.81,
    rating: 4.5,
    channels: ["Booking", "Tatilsepeti"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 189,
    daysSinceLastReview: 1,
    daysOnPlatform: 870,
    signals: ["Trending category", "No own website"],
  },
  {
    id: "abn-008",
    name: "Abant Pine Bungalov",
    type: "Bungalow",
    city: "Abant",
    region: "Karadeniz",
    contactName: "Onur Çelik",
    phone: turkishPhone(14608),
    units: 10,
    pricePerNight: 2800,
    occupancy30d: 0.58,
    rating: 4.3,
    channels: ["Tatilsepeti"],
    hasOwnWebsite: false,
    hasInstagram: false,
    reviewsCount: 73,
    daysSinceLastReview: 9,
    daysOnPlatform: 320,
    signals: ["Single channel only", "No Instagram"],
  },
  {
    id: "ole-009",
    name: "Olympos Treehouse Camp",
    type: "Bungalow",
    city: "Olympos",
    region: "Akdeniz",
    contactName: "Deniz Kara",
    phone: turkishPhone(14909),
    instagram: "olympostreehouse",
    units: 18,
    pricePerNight: 1600,
    occupancy30d: 0.77,
    rating: 4.6,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 412,
    daysSinceLastReview: 0,
    daysOnPlatform: 2800,
    signals: ["Backpacker favorite", "High review velocity"],
  },
  {
    id: "ist-010",
    name: "Galata Heritage Hotel",
    type: "Hotel",
    city: "İstanbul",
    region: "Marmara",
    contactName: "Zeynep Polat",
    phone: turkishPhone(15010),
    instagram: "galataheritage",
    website: "galataheritage.com",
    units: 48,
    pricePerNight: 5200,
    occupancy30d: 0.72,
    rating: 4.4,
    channels: ["Booking", "Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 1280,
    daysSinceLastReview: 0,
    daysOnPlatform: 3200,
    signals: ["High volume", "Stable bookings"],
  },
  {
    id: "ces-011",
    name: "Çeşme Marina Suites",
    type: "Boutique Hotel",
    city: "Çeşme",
    region: "Ege",
    contactName: "Elif Tunç",
    phone: turkishPhone(15311),
    instagram: "cesmemarinasuites",
    units: 16,
    pricePerNight: 6900,
    occupancy30d: 0.79,
    rating: 4.5,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 145,
    daysSinceLastReview: 2,
    daysOnPlatform: 610,
    signals: ["Fast-growing region", "No own website"],
  },
  {
    id: "kal-012",
    name: "Kalkan Sea View Villa",
    type: "Villa",
    city: "Kalkan",
    region: "Akdeniz",
    contactName: "Murat Eren",
    phone: turkishPhone(15612),
    instagram: "kalkanseaviewvilla",
    website: "kalkanseaview.com",
    units: 1,
    pricePerNight: 22000,
    occupancy30d: 0.69,
    rating: 5.0,
    channels: ["Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 38,
    daysSinceLastReview: 4,
    daysOnPlatform: 410,
    signals: ["Direct-only", "5.0 rating"],
  },
  {
    id: "sir-013",
    name: "Şirince Bağ Evi",
    type: "Pension",
    city: "Şirince",
    region: "Ege",
    contactName: "Hülya Arslan",
    phone: turkishPhone(15913),
    instagram: "sirincebagevi",
    units: 5,
    pricePerNight: 2200,
    occupancy30d: 0.49,
    rating: 4.5,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 62,
    daysSinceLastReview: 11,
    daysOnPlatform: 380,
    signals: ["Low channel count", "Soft season"],
  },
  {
    id: "ayv-014",
    name: "Ayvalık Cunda Konak",
    type: "Pension",
    city: "Ayvalık",
    region: "Ege",
    contactName: "Tolga Bilgin",
    phone: turkishPhone(16214),
    instagram: "cundakonakayvalik",
    units: 7,
    pricePerNight: 2600,
    occupancy30d: 0.63,
    rating: 4.6,
    channels: ["Booking", "Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 98,
    daysSinceLastReview: 3,
    daysOnPlatform: 720,
    signals: ["Tasteful brand", "No own website"],
  },
  {
    id: "fet-015",
    name: "Ölüdeniz Beach Hotel",
    type: "Hotel",
    city: "Ölüdeniz",
    region: "Akdeniz",
    contactName: "Sinem Doğan",
    phone: turkishPhone(16515),
    instagram: "oludenizbeachhotel",
    website: "oludenizbeachhotel.com",
    units: 64,
    pricePerNight: 3900,
    occupancy30d: 0.83,
    rating: 4.3,
    channels: ["Booking", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 920,
    daysSinceLastReview: 0,
    daysOnPlatform: 4100,
    signals: ["Established", "High volume"],
  },
  {
    id: "dat-016",
    name: "Datça Olive Bungalows",
    type: "Bungalow",
    city: "Datça",
    region: "Ege",
    contactName: "Cem Bulut",
    phone: turkishPhone(16816),
    instagram: "datcaolivebungalow",
    units: 9,
    pricePerNight: 2400,
    occupancy30d: 0.71,
    rating: 4.7,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 112,
    daysSinceLastReview: 1,
    daysOnPlatform: 540,
    signals: ["Single channel only", "No own website"],
  },
  {
    id: "ass-017",
    name: "Assos Stone Hotel",
    type: "Boutique Hotel",
    city: "Assos",
    region: "Ege",
    contactName: "Yasemin Koç",
    phone: turkishPhone(17117),
    instagram: "assosstonehotel",
    website: "assosstonehotel.com",
    units: 20,
    pricePerNight: 4400,
    occupancy30d: 0.66,
    rating: 4.4,
    channels: ["Booking", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 256,
    daysSinceLastReview: 6,
    daysOnPlatform: 1700,
    signals: ["Quiet shoulder season"],
  },
  {
    id: "uzu-018",
    name: "Uzungöl Wooden Villas",
    type: "Villa",
    city: "Uzungöl",
    region: "Karadeniz",
    contactName: "Halil Yıldız",
    phone: turkishPhone(17418),
    instagram: "uzungolwoodenvillas",
    units: 4,
    pricePerNight: 4900,
    occupancy30d: 0.58,
    rating: 4.5,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 71,
    daysSinceLastReview: 7,
    daysOnPlatform: 480,
    signals: ["Single channel only", "GCC inbound trend"],
  },
  {
    id: "agv-019",
    name: "Ağva Riverside Bungalow",
    type: "Bungalow",
    city: "Ağva",
    region: "Marmara",
    contactName: "Pelin Aslan",
    phone: turkishPhone(17719),
    instagram: "agvariverside",
    units: 11,
    pricePerNight: 3100,
    occupancy30d: 0.74,
    rating: 4.4,
    channels: ["Airbnb", "Tatilsepeti"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 158,
    daysSinceLastReview: 2,
    daysOnPlatform: 690,
    signals: ["Weekend demand from İstanbul"],
  },
  {
    id: "izm-020",
    name: "Karşıyaka City Hotel",
    type: "Hotel",
    city: "İzmir",
    region: "Ege",
    contactName: "Burak Tezcan",
    phone: turkishPhone(18020),
    website: "karsiyakacityhotel.com",
    units: 52,
    pricePerNight: 2200,
    occupancy30d: 0.61,
    rating: 4.1,
    channels: ["Booking"],
    hasOwnWebsite: true,
    hasInstagram: false,
    reviewsCount: 430,
    daysSinceLastReview: 1,
    daysOnPlatform: 2900,
    signals: ["No Instagram", "Single channel"],
  },
  {
    id: "tra-021",
    name: "Trabzon Taş Pansiyon",
    type: "Pension",
    city: "Trabzon",
    region: "Karadeniz",
    contactName: "Esra Güneş",
    phone: turkishPhone(18321),
    instagram: "trabzontaspansiyon",
    units: 6,
    pricePerNight: 1500,
    occupancy30d: 0.64,
    rating: 4.5,
    channels: ["Booking", "Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 87,
    daysSinceLastReview: 4,
    daysOnPlatform: 510,
    signals: ["Arabic-speaking demand"],
  },
  {
    id: "mar-022",
    name: "Marmaris Adaköy Villa",
    type: "Villa",
    city: "Marmaris",
    region: "Ege",
    contactName: "Kerem Yıldırım",
    phone: turkishPhone(18622),
    instagram: "adakoyvilla",
    website: "adakoyvilla.com",
    units: 1,
    pricePerNight: 11000,
    occupancy30d: 0.55,
    rating: 4.7,
    channels: ["Direct", "Airbnb"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 44,
    daysSinceLastReview: 8,
    daysOnPlatform: 360,
    signals: ["Premium villa segment"],
  },
  {
    id: "boz-023",
    name: "Bozcaada Vine Pension",
    type: "Pension",
    city: "Bozcaada",
    region: "Ege",
    contactName: "Defne Yalçın",
    phone: turkishPhone(18923),
    instagram: "bozcaadavine",
    units: 8,
    pricePerNight: 3300,
    occupancy30d: 0.72,
    rating: 4.7,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 132,
    daysSinceLastReview: 1,
    daysOnPlatform: 800,
    signals: ["Hot island summer", "No own website"],
  },
  {
    id: "akc-024",
    name: "Akçakoca Coast Hotel",
    type: "Hotel",
    city: "Akçakoca",
    region: "Karadeniz",
    contactName: "Volkan Aksu",
    phone: turkishPhone(19224),
    units: 38,
    pricePerNight: 1700,
    occupancy30d: 0.45,
    rating: 4.0,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: false,
    reviewsCount: 220,
    daysSinceLastReview: 12,
    daysOnPlatform: 1900,
    signals: ["Low online presence", "Single channel"],
  },
  {
    id: "ese-025",
    name: "Eskişehir Odunpazarı Konak",
    type: "Boutique Hotel",
    city: "Eskişehir",
    region: "İç Anadolu",
    contactName: "Berke Şener",
    phone: turkishPhone(19525),
    instagram: "odunpazarikonak",
    website: "odunpazarikonak.com",
    units: 11,
    pricePerNight: 2600,
    occupancy30d: 0.74,
    rating: 4.6,
    channels: ["Booking", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 184,
    daysSinceLastReview: 0,
    daysOnPlatform: 1100,
    signals: ["Weekend city break demand"],
  },
  {
    id: "sap-026",
    name: "Saklıkent Mountain Bungalow",
    type: "Bungalow",
    city: "Saklıkent",
    region: "Akdeniz",
    contactName: "Aslı Korkmaz",
    phone: turkishPhone(19826),
    instagram: "saklikentbungalow",
    units: 7,
    pricePerNight: 2700,
    occupancy30d: 0.6,
    rating: 4.4,
    channels: ["Airbnb"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 53,
    daysSinceLastReview: 5,
    daysOnPlatform: 360,
    signals: ["Single channel only"],
  },
  {
    id: "akb-027",
    name: "Akbük Bay Hotel",
    type: "Hotel",
    city: "Didim",
    region: "Ege",
    contactName: "İlker Doğru",
    phone: turkishPhone(20127),
    website: "akbukbayhotel.com",
    units: 44,
    pricePerNight: 2900,
    occupancy30d: 0.7,
    rating: 4.2,
    channels: ["Booking"],
    hasOwnWebsite: true,
    hasInstagram: false,
    reviewsCount: 615,
    daysSinceLastReview: 1,
    daysOnPlatform: 2400,
    signals: ["No Instagram", "Stable demand"],
  },
  {
    id: "nev-028",
    name: "Uçhisar Stone Suites",
    type: "Boutique Hotel",
    city: "Uçhisar",
    region: "Kapadokya",
    contactName: "Tuğçe Şimşek",
    phone: turkishPhone(20428),
    instagram: "uchisarstonesuites",
    website: "uchisarstone.com",
    units: 12,
    pricePerNight: 7200,
    occupancy30d: 0.88,
    rating: 4.8,
    channels: ["Booking", "Airbnb", "Direct"],
    hasOwnWebsite: true,
    hasInstagram: true,
    reviewsCount: 388,
    daysSinceLastReview: 0,
    daysOnPlatform: 1850,
    signals: ["Premium ADR", "High occupancy"],
  },
  {
    id: "gum-029",
    name: "Gümüşlük Marina Pension",
    type: "Pension",
    city: "Gümüşlük",
    region: "Ege",
    contactName: "Naz Erden",
    phone: turkishPhone(20729),
    instagram: "gumuslukmarinapansiyon",
    units: 6,
    pricePerNight: 3000,
    occupancy30d: 0.66,
    rating: 4.6,
    channels: ["Booking"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 79,
    daysSinceLastReview: 2,
    daysOnPlatform: 470,
    signals: ["Single channel only"],
  },
  {
    id: "alc-030",
    name: "Alaçatı Wind Villas",
    type: "Villa",
    city: "Alaçatı",
    region: "Ege",
    contactName: "Yiğit Bayar",
    phone: turkishPhone(21030),
    instagram: "alacatiwindvillas",
    units: 3,
    pricePerNight: 16500,
    occupancy30d: 0.78,
    rating: 4.9,
    channels: ["Airbnb", "Direct"],
    hasOwnWebsite: false,
    hasInstagram: true,
    reviewsCount: 71,
    daysSinceLastReview: 1,
    daysOnPlatform: 530,
    signals: ["Premium ADR", "No own website"],
  },
];

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

/**
 * leadScore = long-term fit / revenue potential.
 * Considers ADR, units, rating, occupancy, presence breadth.
 */
export function scoreLead(l: Lead): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let s = 40;

  const adrFactor = Math.log10(Math.max(800, l.pricePerNight)) - Math.log10(800);
  s += adrFactor * 24;
  if (l.pricePerNight >= 6000) reasons.push("High ADR");

  const inventory = l.units * l.pricePerNight;
  const inventoryFactor = Math.log10(Math.max(1, inventory)) - 4;
  s += inventoryFactor * 8;
  if (l.units >= 20) reasons.push("Large inventory");

  s += (l.rating - 4) * 18;
  if (l.rating >= 4.7) reasons.push("Top-rated");

  s += (l.occupancy30d - 0.5) * 28;
  if (l.occupancy30d >= 0.8) reasons.push("Strong occupancy");

  s += Math.min(l.reviewsCount, 500) * 0.012;
  if (l.reviewsCount >= 250) reasons.push("Proven demand");

  if (l.hasOwnWebsite) {
    s += 4;
  } else {
    reasons.push("No own website");
  }
  if (!l.hasInstagram) {
    s -= 4;
    reasons.push("No Instagram");
  }
  if (l.channels.length <= 1) {
    s -= 4;
    reasons.push("Single channel");
  } else if (l.channels.length >= 3) {
    s += 3;
  }

  return { score: Math.round(clamp(s)), reasons: reasons.slice(0, 4) };
}

/**
 * hotScore = how worth contacting *today*.
 * Considers recency, gaps in setup, momentum, missing distribution.
 */
export function scoreHot(l: Lead): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let s = 30;

  if (l.daysSinceLastReview <= 1) {
    s += 18;
    reasons.push("New review today");
  } else if (l.daysSinceLastReview <= 3) {
    s += 10;
    reasons.push("Recent review");
  }

  if (l.occupancy30d >= 0.85) {
    s += 14;
    reasons.push("Selling out");
  } else if (l.occupancy30d >= 0.7) {
    s += 8;
  }

  if (!l.hasOwnWebsite) {
    s += 12;
    reasons.push("Needs own website");
  }
  if (l.channels.length <= 1) {
    s += 10;
    reasons.push("Channel diversification");
  }
  if (l.pricePerNight >= 8000 && !l.hasOwnWebsite) {
    s += 6;
    reasons.push("Premium leaking margin");
  }
  if (l.daysOnPlatform >= 365 && l.daysOnPlatform <= 1500 && l.rating >= 4.5) {
    s += 6;
    reasons.push("Sweet-spot maturity");
  }
  if (!l.hasInstagram && l.units >= 8) {
    s += 6;
    reasons.push("Missing social presence");
  }
  if (l.daysSinceLastReview >= 10) {
    s -= 6;
  }

  // small daily jitter that is stable per id
  let h = 0;
  for (let i = 0; i < l.id.length; i++) h = (h * 31 + l.id.charCodeAt(i)) | 0;
  const today = new Date();
  const day = today.getUTCFullYear() * 1000 + today.getUTCMonth() * 31 + today.getUTCDate();
  const jitter = Math.abs((h ^ day) % 7) - 3; // -3..+3
  s += jitter;

  return { score: Math.round(clamp(s)), reasons: reasons.slice(0, 4) };
}

/** Turkish national patterns after stripping IDD/country code: 05… mobile, 02/03… landline. */
export type TurkishPhoneKind = "mobile" | "landline" | "unknown";

export function getTurkishPhoneKind(phone: string): TurkishPhoneKind {
  const trimmed = phone.trim();
  if (!trimmed) return "unknown";

  let d = trimmed.replace(/\D/g, "");
  if (!d) return "unknown";

  while (d.startsWith("00") && d.length > 2) {
    d = d.slice(2);
  }
  if (d.startsWith("90") && d.length > 2) {
    d = d.slice(2);
  }

  if (d.startsWith("05")) return "mobile";
  if (d.startsWith("02") || d.startsWith("03")) return "landline";

  if (d.length === 10 && d.startsWith("5")) return "mobile";
  if (d.length === 10 && (d.startsWith("2") || d.startsWith("3"))) {
    return "landline";
  }
  if (d.length === 11 && d.startsWith("0")) {
    if (d[1] === "5") return "mobile";
    if (d[1] === "2" || d[1] === "3") return "landline";
  }

  return "unknown";
}

/** landline → low; mobile without wa.me → medium; mobile with working WhatsApp → high. */
export function getContactQuality(phone: string): ContactQuality {
  const kind = getTurkishPhoneKind(phone);
  if (kind === "landline") return "low";
  if (kind !== "mobile") return "low";
  if (normalizePhoneForWhatsApp(phone) !== null) return "high";
  return "medium";
}

export function scoreAll(leads: Lead[] = LEADS): ScoredLead[] {
  return leads.map((l) => {
    const lead = scoreLead(l);
    const hot = scoreHot(l);
    return {
      ...l,
      leadScore: lead.score,
      leadReasons: lead.reasons,
      hotScore: hot.score,
      hotReasons: hot.reasons,
      contactQuality: getContactQuality(l.phone),
    };
  });
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  needs_follow_up: "Follow-Up",
  replied: "Replied",
  meeting: "Meeting",
  won: "Won",
  lost: "Lost",
};

export const STATUS_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "needs_follow_up",
  "replied",
  "meeting",
  "won",
  "lost",
];

export const WHATSAPP_OUTREACH_MESSAGE =
  "Selam, genelde tam burada kaçırılıyor gibi oluyor\nmesaj geliyor ama rezervasyona dönüşen taraf zayıf kalıyor\nsiz de bunu fark ettiniz mi?";

/** Strips spaces, +, parentheses, etc.; normalizes Turkish numbers to international 90…. */
export function normalizePhoneForWhatsApp(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  while (digits.startsWith("00") && digits.length > 2) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("90")) {
    return digits.length >= 12 ? digits : null;
  }
  if (digits.startsWith("0")) {
    const intl = "90" + digits.slice(1);
    return intl.length >= 12 ? intl : null;
  }
  if (digits.length === 10) {
    const intl = "90" + digits;
    return intl.length >= 12 ? intl : null;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}

/** Opens WhatsApp (wa.me) with {@link WHATSAPP_OUTREACH_MESSAGE}; `null` if phone cannot be used. */
export function whatsappLink(phone: string): string | null {
  return whatsappLinkWithText(phone, WHATSAPP_OUTREACH_MESSAGE);
}

/** Opens WhatsApp with a custom URL-encoded message; `null` if not a mobile line or phone unusable. */
export function whatsappLinkWithText(phone: string, text: string): string | null {
  if (getTurkishPhoneKind(phone) !== "mobile") return null;
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

export function instagramLink(handle: string) {
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}
