# Tech Stack — Tugobo Lead Engine

## Current stack (repository baseline)

| Layer | Choice | Notes |
|-------|--------|--------|
| **Framework** | Next.js (App Router) | Server components + route handlers |
| **Language** | TypeScript | Strict types for leads and API contracts |
| **UI** | React + Tailwind CSS | Dark theme, utility-first |
| **Data (interim)** | Airtable | Fast for solo/small team CRM; not long-term core DB |
| **Listings** | Google Places API | Text Search + Place Details |
| **Auth** | Not yet central | Add when multi-tenant |
| **LLM** | OpenAI (planned wire-up) | JSON outputs, schema validation |

> **Note:** `package.json` may show Next **16.x** as the resolved version; product docs may say “15+” — treat **App Router + Route Handlers** as the stable contract.

## Application modules (code map)

- `app/components/Dashboard.tsx` — main product UI and workflow.
- `app/lib/leads.ts` — domain types, scoring, WhatsApp helpers, intelligence attach.
- `app/lib/intelligence/signals.ts` — deterministic feature extraction.
- `app/lib/places-import.ts` — Google → `ScoredLead`.
- `app/api/*` — import, Airtable, generate-message, contact-finder.

## Future stack possibilities

| Concern | Option A | Option B |
|---------|----------|----------|
| **Primary DB** | Supabase Postgres | Planetscale / Neon |
| **ORM** | Drizzle | Prisma |
| **Jobs** | Inngest | Trigger.dev / BullMQ on Redis |
| **Cache** | Upstash Redis | Cloudflare KV |
| **File store** | R2 / S3 | Screenshots, exports |

## Infrastructure decisions

- **Edge vs Node:** heavy fetching (Puppeteer) → **Node** workers, not edge.
- **Secrets:** environment variables per env; never commit API keys.
- **Rate limits:** enforce at API route + job layer for Google and OpenAI.

## AI model strategy

- **Default:** small/medium multimodal-capable model for JSON structuring; escalate for nuanced Turkish copy when needed.
- **Fallback:** rule-based templates if LLM fails validation.
- **Cost:** per-lead token budget; batch offline for large backfills.

## Deployment ideas

- **Vercel** for Next.js app (typical).
- **Separate worker service** when Puppeteer/Lighthouse volume grows.
- **Staging** with fake Places responses for CI.

## Scaling considerations

- **Client-only state** (localStorage) does not scale past single browser—plan **server persistence**.
- **Enrichment fan-out** needs queues to avoid thundering herd on homepage fetches.
- **Multi-tenant** isolation early if agencies are a target segment.

---

*Prefer **boring** infrastructure for core data; experiment behind feature flags.*
