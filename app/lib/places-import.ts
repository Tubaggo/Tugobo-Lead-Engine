import {
  type Channel,
  type Lead,
  type LeadType,
  type ScoredLead,
  scoreHot,
  scoreLead,
} from "./leads";
import { regionFor } from "./generate";

const NICHE_QUERY: Record<LeadType, string> = {
  Hotel: "otel hotel",
  "Boutique Hotel": "boutique hotel butik otel",
  Bungalow: "bungalow bungalov tatil",
  Villa: "villa kiralık tatil",
  Pension: "pansiyon guest house",
};

export function buildPlacesSearchQuery(city: string, type: LeadType) {
  return `${NICHE_QUERY[type]} ${city} Türkiye`.trim();
}

function hashPlaceId(placeId: string) {
  let h = 0;
  for (let i = 0; i < placeId.length; i++) {
    h = (h * 31 + placeId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function rRange(placeId: string, salt: number, min: number, max: number) {
  const v = hashPlaceId(`${placeId}:${salt}`);
  return min + (v % (max - min + 1));
}

/** Public hostname for Lead.website (matches mock style: domain only). */
export function normalizeWebsiteUrl(url: string | undefined): string | undefined {
  if (!url || !url.trim()) return undefined;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "") || undefined;
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || undefined;
  }
}

export type GoogleTextResult = {
  place_id: string;
  name: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
};

export type GoogleDetailsResult = {
  international_phone_number?: string;
  formatted_phone_number?: string;
  website?: string;
  url?: string;
};

export function mapGooglePlaceToScoredLead(
  textResult: GoogleTextResult,
  details: GoogleDetailsResult | null,
  city: string,
  nicheType: LeadType,
): ScoredLead {
  const placeId = textResult.place_id;
  const h = hashPlaceId(placeId);

  const rating =
    typeof textResult.rating === "number" ? textResult.rating : 4.2;

  const reviewsCount =
    typeof textResult.user_ratings_total === "number"
      ? textResult.user_ratings_total
      : rRange(placeId, 1, 12, 80);

  const phoneRaw =
    details?.international_phone_number ||
    details?.formatted_phone_number ||
    "";
  const phone = phoneRaw.trim() || "";

  const website = normalizeWebsiteUrl(details?.website);
  const hasOwnWebsite = Boolean(website);

  const types = textResult.types?.length
    ? textResult.types
    : ["establishment"];
  const categoryLabel = types.filter((t) => t !== "establishment")[0] || types[0];

  const unitsByNiche: Record<LeadType, [number, number]> = {
    Hotel: [24, 72],
    "Boutique Hotel": [6, 22],
    Bungalow: [5, 16],
    Villa: [1, 4],
    Pension: [4, 11],
  };
  const adrByNiche: Record<LeadType, [number, number]> = {
    Hotel: [1600, 6200],
    "Boutique Hotel": [2800, 11000],
    Bungalow: [1200, 4200],
    Villa: [5500, 22000],
    Pension: [900, 3400],
  };

  const [uMin, uMax] = unitsByNiche[nicheType];
  const [aMin, aMax] = adrByNiche[nicheType];
  const units = rRange(placeId, 2, uMin, uMax);
  let pricePerNight = rRange(placeId, 3, aMin, aMax);
  if (rating >= 4.7) pricePerNight += rRange(placeId, 4, 200, 1200);
  if (reviewsCount >= 500) pricePerNight += rRange(placeId, 5, 100, 800);

  const occupancy30d = Math.min(
    0.94,
    Math.max(
      0.32,
      Math.round((0.38 + (rating / 5) * 0.38 + (h % 13) / 130) * 100) / 100,
    ),
  );

  const channels: Channel[] = hasOwnWebsite
    ? ["Booking", "Direct"]
    : ["Booking", "Airbnb"];

  const daysSinceLastReview = rRange(placeId, 6, 0, 12);
  const daysOnPlatform = Math.min(
    4800,
    220 + reviewsCount * 4 + (h % 900),
  );

  const signals: string[] = [
    `Category: ${categoryLabel}`,
    "Source: Google Maps",
  ];
  if (reviewsCount >= 200) signals.push("Strong review volume");
  if (!phone) signals.push("Phone not listed");

  const lead: Lead = {
    id: `gmaps-${placeId}`,
    name: textResult.name,
    type: nicheType,
    city,
    region: regionFor(city),
    contactName: "İşletme",
    phone: phone || "",
    website,
    units,
    pricePerNight,
    occupancy30d,
    rating: Math.round(rating * 10) / 10,
    channels,
    hasOwnWebsite,
    hasInstagram: false,
    reviewsCount,
    daysSinceLastReview,
    daysOnPlatform,
    signals,
  };

  const ls = scoreLead(lead);
  const hs = scoreHot(lead);

  return {
    ...lead,
    leadScore: ls.score,
    leadReasons: ls.reasons,
    hotScore: hs.score,
    hotReasons: hs.reasons,
  };
}
