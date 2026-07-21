import { NextResponse } from "next/server";
import { type LeadType, type ScoredLead } from "@/app/lib/leads";
import {
  buildPlacesSearchQuery,
  mapGooglePlaceToScoredLead,
  type GoogleTextResult,
  type GoogleDetailsResult,
} from "@/app/lib/places-import";
import {
  makePlacesImportSessionKey,
  type PlacesImportSource,
  PLACES_IMPORT_SESSION_WINDOW_MS,
  PLACES_RATE_LIMIT_USER_MESSAGE,
} from "@/app/lib/places-import-session";
import { enrichLeadsWithHomepageSignalsBatched } from "@/app/lib/enrich-lead-homepage";
import { withAdminSession } from "@/app/lib/auth/require-admin-session";

const TEXT_SEARCH =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACE_DETAILS =
  "https://maps.googleapis.com/maps/api/place/details/json";
const DETAIL_REQUEST_DELAY_MIN_MS = 500;
const DETAIL_REQUEST_DELAY_MAX_MS = 1000;
const DETAILS_CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_FRIENDLY_TR_ERROR = PLACES_RATE_LIMIT_USER_MESSAGE;

type PlacesStatus = "OK" | "ZERO_RESULTS" | "OVER_QUERY_LIMIT" | "RESOURCE_EXHAUSTED" | string;

type PlacesTextSearchResponse = {
  status: PlacesStatus;
  error_message?: string;
  results?: GoogleTextResult[];
};

type PlacesDetailsResponse = {
  status: PlacesStatus;
  result?: GoogleDetailsResult;
  error_message?: string;
};

type RateLimitedError = Error & { isRateLimit: true };

const placeDetailsCache = new Map<
  string,
  { value: GoogleDetailsResult | null; expiresAt: number }
>();
const placeDetailsInflight = new Map<string, Promise<GoogleDetailsResult | null>>();

/** Full import payload (post-enrichment) keyed by city + niche + source. */
const placesFullImportCache = new Map<string, { leads: ScoredLead[]; storedAt: number }>();

function peekPlacesFullImport(cacheKey: string): { leads: ScoredLead[]; storedAt: number } | null {
  const row = placesFullImportCache.get(cacheKey);
  if (!row) return null;
  if (Date.now() - row.storedAt > PLACES_IMPORT_SESSION_WINDOW_MS) {
    placesFullImportCache.delete(cacheKey);
    return null;
  }
  return row;
}

function rememberPlacesFullImport(cacheKey: string, leads: ScoredLead[]) {
  placesFullImportCache.set(cacheKey, { leads, storedAt: Date.now() });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomDelayMs(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isRateLimitStatus(status: string | undefined) {
  return status === "OVER_QUERY_LIMIT" || status === "RESOURCE_EXHAUSTED";
}

function isRateLimitMessage(message: string | undefined) {
  if (!message) return false;
  return /rate[-\s]?limit|over[_\s]?query[_\s]?limit|resource[_\s]?exhausted/i.test(message);
}

function isRateLimitResponse(status: string | undefined, errorMessage: string | undefined) {
  return isRateLimitStatus(status) || isRateLimitMessage(errorMessage);
}

function createRateLimitError(): RateLimitedError {
  const err = new Error(RATE_LIMIT_FRIENDLY_TR_ERROR) as RateLimitedError;
  err.isRateLimit = true;
  return err;
}

function isRateLimitedError(err: unknown): err is RateLimitedError {
  return (
    err instanceof Error &&
    ((err as Partial<RateLimitedError>).isRateLimit === true ||
      isRateLimitMessage(err.message))
  );
}

async function fetchTextSearch(query: string, apiKey: string) {
  const u = new URL(TEXT_SEARCH);
  u.searchParams.set("query", query);
  u.searchParams.set("key", apiKey);
  u.searchParams.set("language", "tr");
  u.searchParams.set("region", "tr");
  const res = await fetch(u.toString(), { cache: "no-store" });
  const data = (await res.json()) as PlacesTextSearchResponse;
  if (isRateLimitResponse(data.status, data.error_message)) {
    throw createRateLimitError();
  }
  return data;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<GoogleDetailsResult | null> {
  const u = new URL(PLACE_DETAILS);
  u.searchParams.set("place_id", placeId);
  u.searchParams.set(
    "fields",
    "formatted_phone_number,international_phone_number,website,url,editorial_summary",
  );
  u.searchParams.set("key", apiKey);
  u.searchParams.set("language", "tr");
  const res = await fetch(u.toString(), { cache: "no-store" });
  const data = (await res.json()) as PlacesDetailsResponse;
  if (isRateLimitResponse(data.status, data.error_message)) {
    throw createRateLimitError();
  }
  if (data.status !== "OK" || !data.result) return null;
  return data.result;
}

async function fetchPlaceDetailsCached(
  placeId: string,
  apiKey: string,
): Promise<GoogleDetailsResult | null> {
  const now = Date.now();
  const cached = placeDetailsCache.get(placeId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  if (cached) {
    placeDetailsCache.delete(placeId);
  }

  const inflight = placeDetailsInflight.get(placeId);
  if (inflight) return inflight;

  const request = fetchPlaceDetails(placeId, apiKey)
    .then((value) => {
      placeDetailsCache.set(placeId, {
        value,
        expiresAt: Date.now() + DETAILS_CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      placeDetailsInflight.delete(placeId);
    });

  placeDetailsInflight.set(placeId, request);
  return request;
}

async function handlePOST(req: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Set GOOGLE_MAPS_API_KEY in .env.local (Places API enabled for the key).",
        leads: [],
      },
      { status: 503 },
    );
  }

  let body: {
    city?: string;
    type?: LeadType;
    source?: PlacesImportSource;
    forceGoogleRefresh?: boolean;
    icpSearchTerm?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", leads: [] }, { status: 400 });
  }

  const city = typeof body.city === "string" ? body.city.trim() : "";
  const type = body.type;
  const source: PlacesImportSource = "maps";
  const forceGoogleRefresh = body.forceGoogleRefresh === true;
  const icpSearchTerm = typeof body.icpSearchTerm === "string" ? body.icpSearchTerm.trim() : null;
  const validTypes: LeadType[] = [
    "Hotel",
    "Boutique Hotel",
    "Bungalow",
    "Villa",
    "Pension",
  ];
  if (!city || !type || !validTypes.includes(type)) {
    return NextResponse.json(
      { error: "city and type are required", leads: [] },
      { status: 400 },
    );
  }

  const sessionKey = icpSearchTerm
    ? `${city.trim().toLowerCase()}|icp:${icpSearchTerm}|${source}`
    : makePlacesImportSessionKey(city, type, source);
  const cachedFull = peekPlacesFullImport(sessionKey);

  if (!forceGoogleRefresh && cachedFull && cachedFull.leads.length > 0) {
    return NextResponse.json({
      leads: cachedFull.leads,
      fromPlacesMemoryCache: true,
    });
  }

  if (forceGoogleRefresh && cachedFull && cachedFull.leads.length > 0) {
    return NextResponse.json({
      leads: cachedFull.leads,
      fromPlacesMemoryCache: true,
      refreshCooldownActive: true,
    });
  }

  const query = icpSearchTerm
    ? `${icpSearchTerm} ${city} Türkiye`.trim()
    : buildPlacesSearchQuery(city, type);
  let searchData: Awaited<ReturnType<typeof fetchTextSearch>>;
  try {
    searchData = await fetchTextSearch(query, apiKey);
  } catch (err) {
    if (isRateLimitedError(err)) {
      return NextResponse.json(
        { error: RATE_LIMIT_FRIENDLY_TR_ERROR, leads: [] },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Google Places request failed", leads: [] },
      { status: 502 },
    );
  }

  if (searchData.status === "ZERO_RESULTS") {
    return NextResponse.json({ leads: [] });
  }

  if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
    if (isRateLimitResponse(searchData.status, searchData.error_message)) {
      return NextResponse.json(
        { error: RATE_LIMIT_FRIENDLY_TR_ERROR, leads: [] },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error:
          searchData.error_message ||
          `Places search error: ${searchData.status}`,
        leads: [],
      },
      { status: 502 },
    );
  }

  const raw = searchData.results ?? [];
  const seen = new Set<string>();
  const top: GoogleTextResult[] = [];
  for (const r of raw) {
    if (!r.place_id || !r.name) continue;
    if (seen.has(r.place_id)) continue;
    seen.add(r.place_id);
    top.push(r);
    if (top.length >= 10) break;
  }

  const detailPairs: Array<{ text: GoogleTextResult; details: GoogleDetailsResult | null }> = [];
  const seenDetailPlaceIds = new Set<string>();
  for (let i = 0; i < top.length; i += 1) {
    const r = top[i];
    if (seenDetailPlaceIds.has(r.place_id)) {
      continue;
    }
    seenDetailPlaceIds.add(r.place_id);

    try {
      const details = await fetchPlaceDetailsCached(r.place_id, apiKey);
      detailPairs.push({ text: r, details });
    } catch (err) {
      if (isRateLimitedError(err)) {
        return NextResponse.json(
          { error: RATE_LIMIT_FRIENDLY_TR_ERROR, leads: [] },
          { status: 429 },
        );
      }
      detailPairs.push({ text: r, details: null });
    }

    if (i < top.length - 1) {
      await delay(
        randomDelayMs(DETAIL_REQUEST_DELAY_MIN_MS, DETAIL_REQUEST_DELAY_MAX_MS),
      );
    }
  }

  const mapped = detailPairs.map(({ text, details }) =>
    mapGooglePlaceToScoredLead(text, details, city, type),
  );
  const leads = await enrichLeadsWithHomepageSignalsBatched(mapped);

  if (leads.length > 0) {
    rememberPlacesFullImport(sessionKey, leads);
  }

  return NextResponse.json({ leads });
}

/** Protected: unauthenticated callers get a generic JSON 401. */
export const POST = withAdminSession(handlePOST);
