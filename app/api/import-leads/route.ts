import { NextResponse } from "next/server";
import { type LeadType, type ScoredLead } from "@/app/lib/leads";
import {
  makePlacesImportSessionKey,
  type PlacesImportSource,
  PLACES_IMPORT_SESSION_WINDOW_MS,
  PLACES_RATE_LIMIT_USER_MESSAGE,
} from "@/app/lib/places-import-session";
import { enrichLeadsWithHomepageSignalsBatched } from "@/app/lib/enrich-lead-homepage";
import { discoverGooglePlacesLeads } from "@/app/lib/places-import-server";

/**
 * Manual Lead Import route. Sprint C1 moved the Places text-search/details
 * core into `app/lib/places-import-server.ts` (shared with the autonomous
 * acquisition runtime — one discovery path, not two); this route keeps its
 * own session caching, request validation, and HTTP status mapping exactly
 * as before.
 */

const RATE_LIMIT_FRIENDLY_TR_ERROR = PLACES_RATE_LIMIT_USER_MESSAGE;
const MANUAL_IMPORT_MAX_RESULTS = 10;

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

export async function POST(req: Request) {
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

  const discovery = await discoverGooglePlacesLeads({
    apiKey,
    city,
    type,
    icpSearchTerm,
    maxResults: MANUAL_IMPORT_MAX_RESULTS,
  });

  if (!discovery.ok) {
    if (discovery.kind === "rate_limit") {
      return NextResponse.json(
        { error: RATE_LIMIT_FRIENDLY_TR_ERROR, leads: [] },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error: discovery.errorMessage || "Google Places request failed",
        leads: [],
      },
      { status: 502 },
    );
  }

  if (discovery.leads.length === 0) {
    return NextResponse.json({ leads: [] });
  }

  const leads = await enrichLeadsWithHomepageSignalsBatched(discovery.leads);

  if (leads.length > 0) {
    rememberPlacesFullImport(sessionKey, leads);
  }

  return NextResponse.json({ leads });
}
