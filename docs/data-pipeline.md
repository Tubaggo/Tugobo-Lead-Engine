# Data Pipeline — Tugobo Lead Engine

## Overview

The pipeline moves data from **public listings** → **normalized leads** → **enriched signals** → **insights & outreach** → **workflow state** (and optional **Airtable** sync).

```
Places Search → Place Details → Lead map → Score + signals → UI / Queue → CRM
                     │                              │
                     └──────── Contact finder ──────┘
                     └──────── Reviews (future) ────┘
                     └──────── Website job (future) ─┘
```

## Scraping flow (terminology note)

**Not a generic scraper:** the primary path is **Google Places API** with keys and quotas. Additional fetches (homepage HTML) are **targeted enrichment** per lead or per batch job—not open-ended crawling.

Steps:

1. **Query** = niche + city (Turkish keywords).
2. **Search** → dedupe `place_id`.
3. **Details** → phone, website, rating, review count.
4. **Normalize** → `Lead` / `ScoredLead`.
5. **Dedupe** across imports (phone, name+city, website host).

## Enrichment flow

**Synchronous (today):**

- Phone normalization, Turkish mobile vs landline.
- Website hostname extraction.
- `enrichScoredLeadIntelligence` (rule-based signals).

**On-demand:**

- Contact finder API: GET homepage, parse tel/wa/Instagram.

**Async (planned):**

- Review fetch + classification.
- Website deep analysis + Lighthouse.

## AI processing flow

1. **Input assembly** — structured lead + signals + optional evidence JSON.
2. **LLM call** — JSON mode, schema validation, retries.
3. **Merge** — LLM `priorityDelta` capped; insights merged with deterministic signals.
4. **Store** — attach to lead record; version with `model` + `promptVersion`.

## Queue systems

- **Outreach queue (client-backed today):** daily list, session iterator, per-item message draft.
- **Future job queue:** Redis / SQS / Vercel cron + DB “job” rows for website/review tasks.

## Cron / job ideas

| Job | Cadence | Purpose |
|-----|---------|---------|
| **Refresh top leads** | Weekly | Re-fetch Places summary fields |
| **Review sync** | Weekly | Update pain points |
| **Insight stale check** | Daily | Down-rank leads with expired cache |
| **Airtable reconcile** | Hourly | Push status changes |

## Future automation systems

- **Webhook** from Airtable or CRM to trigger re-enrichment.
- **Slack** digest: “Top 5 new insights today.”
- **Batch LLM** overnight for cold-start insights (cost-controlled).

## Observability

- Log: import batch id, API latency, error codes, enrichment confidence.
- **Never** log full message bodies with PII in shared logs without policy.

---

*As the pipeline moves serverward, keep **idempotent** jobs and **explicit** data retention policies.*
