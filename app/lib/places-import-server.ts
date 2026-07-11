import { type LeadType, type ScoredLead } from "./leads";
import {
  buildPlacesSearchQuery,
  mapGooglePlaceToScoredLead,
  type GoogleTextResult,
  type GoogleDetailsResult,
} from "./places-import";
import { PLACES_RATE_LIMIT_USER_MESSAGE } from "./places-import-session";

/**
 * Google Places server core (Sprint C1 — Autonomous Lead Acquisition).
 *
 * The Places text-search + details fetching that used to live inline in
 * `/api/import-leads/route.ts`, extracted verbatim so the autonomous
 * acquisition runtime can reuse the exact same discovery path instead of
 * copying it. The route still owns its own caching/session/HTTP-status
 * semantics; this module owns only the provider calls, the rate-limit
 * detection, the details cache, and the mapping to `ScoredLead`.
 *
 * Every external request is counted and returned to the caller
 * (`externalRequestCount`) so the acquisition budget guardrails can enforce
 * daily quotas — a details-cache hit costs nothing and is not counted.
 */

const TEXT_SEARCH = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACE_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";
const DETAIL_REQUEST_DELAY_MIN_MS = 500;
const DETAIL_REQUEST_DELAY_MAX_MS = 1000;
const DETAILS_CACHE_TTL_MS = 10 * 60 * 1000;

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

const placeDetailsCache = new Map<string, { value: GoogleDetailsResult | null; expiresAt: number }>();
const placeDetailsInflight = new Map<string, Promise<GoogleDetailsResult | null>>();

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
  const err = new Error(PLACES_RATE_LIMIT_USER_MESSAGE) as RateLimitedError;
  err.isRateLimit = true;
  return err;
}

export function isRateLimitedError(err: unknown): err is RateLimitedError {
  return (
    err instanceof Error &&
    ((err as Partial<RateLimitedError>).isRateLimit === true || isRateLimitMessage(err.message))
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

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<GoogleDetailsResult | null> {
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

function fetchPlaceDetailsCached(
  placeId: string,
  apiKey: string,
  onExternalRequest: () => void,
): Promise<GoogleDetailsResult | null> {
  const now = Date.now();
  const cached = placeDetailsCache.get(placeId);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  if (cached) {
    placeDetailsCache.delete(placeId);
  }

  const inflight = placeDetailsInflight.get(placeId);
  if (inflight) return inflight;

  onExternalRequest();
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

export type DiscoverPlacesLeadsInput = {
  apiKey: string;
  city: string;
  type: LeadType;
  /** Optional ICP search term — same semantics the import route already supports. */
  icpSearchTerm?: string | null;
  /** Text-search results processed at most — the import route passes 10, acquisition passes its per-region cap. */
  maxResults: number;
};

export type DiscoverPlacesLeadsResult =
  | { ok: true; leads: ScoredLead[]; externalRequestCount: number }
  | { ok: false; kind: "rate_limit" | "provider_error"; errorMessage?: string; externalRequestCount: number };

/**
 * One region/niche discovery pass: text search → capped, deduped result
 * list → sequential, delayed detail fetches → `mapGooglePlaceToScoredLead`.
 * Identical behavior to the pre-C1 inline route logic; detail-stage
 * non-rate errors degrade to a null details record exactly as before.
 */
export async function discoverGooglePlacesLeads(
  input: DiscoverPlacesLeadsInput,
): Promise<DiscoverPlacesLeadsResult> {
  let externalRequestCount = 0;
  const countRequest = () => {
    externalRequestCount += 1;
  };

  const query = input.icpSearchTerm
    ? `${input.icpSearchTerm} ${input.city} Türkiye`.trim()
    : buildPlacesSearchQuery(input.city, input.type);

  let searchData: PlacesTextSearchResponse;
  try {
    countRequest();
    searchData = await fetchTextSearch(query, input.apiKey);
  } catch (err) {
    if (isRateLimitedError(err)) {
      return { ok: false, kind: "rate_limit", externalRequestCount };
    }
    return { ok: false, kind: "provider_error", externalRequestCount };
  }

  if (searchData.status === "ZERO_RESULTS") {
    return { ok: true, leads: [], externalRequestCount };
  }

  if (searchData.status !== "OK") {
    if (isRateLimitResponse(searchData.status, searchData.error_message)) {
      return { ok: false, kind: "rate_limit", externalRequestCount };
    }
    return {
      ok: false,
      kind: "provider_error",
      errorMessage: searchData.error_message || `Places search error: ${searchData.status}`,
      externalRequestCount,
    };
  }

  const raw = searchData.results ?? [];
  const seen = new Set<string>();
  const top: GoogleTextResult[] = [];
  const cap = Math.max(1, input.maxResults);
  for (const r of raw) {
    if (!r.place_id || !r.name) continue;
    if (seen.has(r.place_id)) continue;
    seen.add(r.place_id);
    top.push(r);
    if (top.length >= cap) break;
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
      const details = await fetchPlaceDetailsCached(r.place_id, input.apiKey, countRequest);
      detailPairs.push({ text: r, details });
    } catch (err) {
      if (isRateLimitedError(err)) {
        return { ok: false, kind: "rate_limit", externalRequestCount };
      }
      detailPairs.push({ text: r, details: null });
    }

    if (i < top.length - 1) {
      await delay(randomDelayMs(DETAIL_REQUEST_DELAY_MIN_MS, DETAIL_REQUEST_DELAY_MAX_MS));
    }
  }

  const leads = detailPairs.map(({ text, details }) =>
    mapGooglePlaceToScoredLead(text, details, input.city, input.type),
  );

  return { ok: true, leads, externalRequestCount };
}
