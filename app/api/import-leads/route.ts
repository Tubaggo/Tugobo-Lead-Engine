import { NextResponse } from "next/server";
import { type LeadType } from "@/app/lib/leads";
import {
  buildPlacesSearchQuery,
  mapGooglePlaceToScoredLead,
  type GoogleTextResult,
  type GoogleDetailsResult,
} from "@/app/lib/places-import";

const TEXT_SEARCH =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACE_DETAILS =
  "https://maps.googleapis.com/maps/api/place/details/json";

async function fetchTextSearch(query: string, apiKey: string) {
  const u = new URL(TEXT_SEARCH);
  u.searchParams.set("query", query);
  u.searchParams.set("key", apiKey);
  u.searchParams.set("language", "tr");
  u.searchParams.set("region", "tr");
  const res = await fetch(u.toString(), { cache: "no-store" });
  return res.json() as Promise<{
    status: string;
    error_message?: string;
    results?: GoogleTextResult[];
  }>;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<GoogleDetailsResult | null> {
  const u = new URL(PLACE_DETAILS);
  u.searchParams.set("place_id", placeId);
  u.searchParams.set(
    "fields",
    "formatted_phone_number,international_phone_number,website,url",
  );
  u.searchParams.set("key", apiKey);
  u.searchParams.set("language", "tr");
  const res = await fetch(u.toString(), { cache: "no-store" });
  const data = (await res.json()) as {
    status: string;
    result?: GoogleDetailsResult;
    error_message?: string;
  };
  if (data.status !== "OK" || !data.result) return null;
  return data.result;
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

  let body: { city?: string; type?: LeadType };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", leads: [] }, { status: 400 });
  }

  const city = typeof body.city === "string" ? body.city.trim() : "";
  const type = body.type;
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

  const query = buildPlacesSearchQuery(city, type);
  let searchData: Awaited<ReturnType<typeof fetchTextSearch>>;
  try {
    searchData = await fetchTextSearch(query, apiKey);
  } catch {
    return NextResponse.json(
      { error: "Google Places request failed", leads: [] },
      { status: 502 },
    );
  }

  if (searchData.status === "ZERO_RESULTS") {
    return NextResponse.json({ leads: [] });
  }

  if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
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

  const detailPairs = await Promise.all(
    top.map(async (r) => {
      const details = await fetchPlaceDetails(r.place_id, apiKey);
      return { text: r, details };
    }),
  );

  const leads = detailPairs.map(({ text, details }) =>
    mapGooglePlaceToScoredLead(text, details, city, type),
  );

  return NextResponse.json({ leads });
}
