# AI Insight Engine — Tugobo Lead Engine

## Purpose

The **AI Insight Engine** turns **structured business signals** and (later) **text/visual evidence** into short, trustworthy narratives:

- **AI insights** — what a human rep should know in 10 seconds.
- **Outreach angle** — one consultative hook, not a sales script.
- **Pain points** — labeled issues (e.g. communication, funnel, reputation).
- **Priority hints** — adjustments to ranking, not a black-box replacement for rules.

The engine must **never** invent facts. It only interprets inputs present in the payload or explicitly marked as uncertain.

## Current state vs target

| Capability | Today | Target |
|-----------|--------|--------|
| Business signals | Rule-based tags + bullets | Same + LLM summarization |
| Outreach angle | Heuristic paragraph | LLM + guardrails + fallback |
| Pain points | Implied in signal copy | Explicit typed `PainPoint[]` |
| Review quotes | Not in pipeline | Hashed citations, redaction |

## Business signal analysis (input)

Signals are produced by **deterministic extraction** (see `intelligence/signals.ts`) from fields such as:

- Website and Instagram presence
- Channel mix (OTA vs direct)
- Rating and review volume proxies
- Review recency proxies
- Phone / WhatsApp eligibility
- ADR and scale proxies (units)

The AI layer **consumes** these as JSON; it does not replace the extractor—it **explains** and **prioritizes** them for humans.

## Prompt architecture (recommended)

### System prompt (stable)

- Role: senior hospitality GTM analyst.
- Output: **valid JSON only** (schema below).
- Rules: no fabrication; if data missing, say so in `confidence` or omit fields.
- Language: Turkish for `outreachAngle` / `aiInsight` when user locale is TR; keep `signalIds` in English enums.

### User payload (per lead)

```json
{
  "business": {
    "name": "string",
    "city": "string",
    "type": "string",
    "rating": 0,
    "reviewsCount": 0,
    "channels": [],
    "hasOwnWebsite": true,
    "hasInstagram": true,
    "signals": ["weak_digital_presence", "ota_dependency"]
  },
  "evidence": {
    "reviewSnippets": [{ "text": "…", "lang": "tr" }],
    "websiteChecks": { "hasWhatsAppButton": true, "hasBookingEngine": false }
  },
  "task": "generate_insights"
}
```

### Model strategy

- **Structured outputs** or JSON mode with **Zod / JSON Schema** validation.
- **Temperature** low (0.2–0.4) for classification; slightly higher only for phrasing variants.
- **Retry** once on schema failure; then fall back to heuristic strings.

## AI output structure (contract)

```typescript
// Conceptual — enforce with Zod on the server
type AiInsightPayload = {
  aiInsight: string[];           // 2–4 short bullets
  outreachAngle: string;        // 1–2 sentences, consultative
  painPoints: {
    id: string;
    label: string;
    severity: "low" | "medium" | "high";
    basis: "reviews" | "website" | "listing" | "inferred";
  }[];
  priorityDelta: number;       // e.g. -10..+10 to apply on top of base score
  confidence: number;          // 0..1 for this LLM pass
  warnings: string[];          // e.g. "no review text provided"
};
```

## Outreach angle generation

**Good angles:**

- Reference **categories** of issues (“late-night inquiries,” “direct booking path”) without accusing.
- Invite **confirmation** (“does this match what you’re seeing?”).

**Bad angles:**

- Claiming secret knowledge or internal metrics.
- Generic “we help hotels grow” fluff.

## Pain point extraction

When review text exists:

1. **Segment** sentences (language-aware).
2. **Classify** into types: `response_delay`, `unreachable`, `reservation_error`, `billing`, `cleanliness`, etc. (hospitality-tuned taxonomy).
3. Map to **sales-relevant** pain: operational vs commercial vs reputation.
4. Attach **severity** from frequency + recency + rating interaction (rules), LLM only labels.

## Guardrails

- Max tokens per lead; **batch** only for offline jobs.
- Store **model id + prompt hash** with outputs for reproducibility.
- PII: minimize review text retention; prefer **hashes** and excerpt IDs.

---

*The AI Insight Engine is a **presentation and prioritization** layer on top of trusted structured data—not a replacement for it.*
