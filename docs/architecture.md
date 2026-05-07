# Architecture — Tugobo Lead Engine

## System overview

Tugobo Lead Engine is a **Next.js** application that combines:

1. **Data acquisition** — primarily Google Places (Text Search + Place Details) for Türkiye hospitality niches.
2. **Enrichment** — phone normalization, website normalization, optional homepage “contact finder,” future review/website analyzers.
3. **Intelligence layer** — rule-based **business signals** today; LLM enrichment for insights and outreach angles next.
4. **Workflow UI** — dark premium dashboard: lead lists, detail drawer, outreach queue, follow-ups, Airtable sync.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ App Router   │  │ API routes   │  │ Client components    │  │
│  │ pages/layout │  │ import/sync  │  │ Dashboard, queue, UI │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │             │
│         └────────────────┼──────────────────────┘             │
│                          ▼                                      │
│              ┌─────────────────────────┐                        │
│              │ lib: leads, intelligence│                        │
│              │ places-import, airtable │                        │
│              └─────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   Google Places API    Airtable REST      OpenAI (planned)
```

## Frontend / backend responsibilities

### Frontend (React client components)

- **Dashboard:** lead table, filters, hot cards, **lead detail** (scores, intelligence, contacts, notes).
- **State:** workflow per lead (status, DNC, queue flags, follow-up times)—much of this today in **localStorage** for speed of iteration; migration to server store is a scaling step.
- **Outreach queue:** session-based flow, daily cap, prepared messages (rule-based or API-generated).

### Backend (Next.js Route Handlers)

- **`/api/import-leads`** — Places search + details → mapped `ScoredLead[]`.
- **`/api/airtable/*`** — sync, leads list, follow-ups, mark-sent.
- **`/api/generate-message`** — outreach copy (today: rule-based packs; LLM optional extension).
- **`/api/contact-finder`** — homepage fetch / parse for WhatsApp, phone, Instagram signals.

### Shared library (`app/lib`)

- **`leads.ts`** — types, `scoreLead`, `scoreHot`, contact quality, WhatsApp helpers, `enrichScoredLeadIntelligence`.
- **`intelligence/signals.ts`** — pure **feature extraction** from lead-shaped inputs.
- **`places-import.ts`** — Google result → domain lead + scores.
- **`airtable.ts`** — CRUD helpers for temporary CRM storage.

## AI layers (current and planned)

| Layer | Responsibility | Implementation |
|-------|----------------|----------------|
| **Feature extraction** | Deterministic signals from listing + proxies | `extractBusinessSignals`, `buildExtractedSignals` |
| **Scoring** | Prioritization blends | `leadScore`, `hotScore`, `intelligenceScore`, readiness |
| **Insight generation** | Narratives, pain points, angles | Heuristic strings → **LLM JSON** (planned) |
| **Outreach** | Short, consultative messages | Template packs → **LLM with constraints** (planned) |

## Data acquisition (“scraping pipeline”)

**Important:** The product uses **documented APIs** (Google Places) for business listings—not arbitrary site scraping for bulk personal data.

1. Build niche query (city + type: hotel, bungalow, pension, etc.).
2. Text Search → candidate `place_id`s.
3. Place Details → phone, website, ratings, review count.
4. Map to internal **Lead** model; dedupe by phone / name+city / website host.
5. Score and enrich intelligence.

Future: **review text** and **website HTML** only where ToS and robots rules allow, with caching and rate limits.

## Enrichment pipeline

1. **Normalize** phone (Turkish mobile vs landline), website hostname.
2. **Derive** `hasOwnWebsite`, channel assumptions (until explicit OTA data exists).
3. **Contact finder** (optional): fetch homepage, detect wa.me, tel:, Instagram links.
4. **Intelligence attach** — `enrichScoredLeadIntelligence` on every scored lead path.

## Insight generation flow (target end-state)

1. **Structured signals** (always) — machine-readable tags + human bullets.
2. **Evidence** (when available) — review quotes, website check results.
3. **LLM pass** — input: structured JSON + redacted snippets; output: `aiInsight[]`, `outreachAngle`, `priorityScore` delta suggestions; **validate** JSON schema server-side.
4. **UI** — insight cards, timeline of “what we know,” confidence indicators.

## Outreach workflow

1. User builds or auto-fills **daily queue** (capped).
2. System ranks by **readiness**, **hot/lead** scores, **intelligenceScore**, contact quality penalties.
3. Per lead: open WhatsApp with prepared text; mark **contacted** / **DNC** / **invalid WhatsApp**.
4. Follow-up scheduling and notes; optional Airtable sync for reporting.

---

## Missing layers (to build deliberately)

- **Server-side source of truth** for leads + insights (reduce localStorage-only risk).
- **Async job runner** for heavy website/Lighthouse work.
- **LLM gateway** (single module: model selection, retries, schema validation, logging).
- **Audit log** for outreach actions (compliance and coaching).

---

*Architecture favors incremental delivery: each vertical slice should be shippable without the others.*
