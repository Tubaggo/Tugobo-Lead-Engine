# Lead Scoring — Tugobo Lead Engine

## Philosophy

**Smart lead scoring** answers: *Who should we spend limited outreach capacity on, and why?*

Scores are **not** a moral judgment on a business. They approximate:

1. **Commercial potential** — scale, ADR, proof of demand.
2. **Urgency / momentum** — recency, occupancy proxies, seasonality hints.
3. **Fit for our solution** — digital weakness, channel concentration, direct-booking headroom.
4. **Reachability** — WhatsApp-ready mobile vs landline, invalid numbers.

Ratings alone are **weak** predictors of outreach success; they are one input among several.

## Score types (conceptual)

| Score | Intent |
|-------|--------|
| **Lead score** | Longer-term value / fit (bigger picture) |
| **Hot score** | “Worth a touch soon” — gaps + momentum |
| **Intelligence score** | Strength of **structured weakness/opportunity** signal (consultative potential) |
| **Contact readiness** | Can we reach them cleanly on instant channels? |

Implementation references: `scoreLead`, `scoreHot`, `computeContactReadinessScore`, `enrichScoredLeadIntelligence` in `app/lib/leads.ts` and `app/lib/intelligence/signals.ts`.

## Scoring variables (lead score family)

Typical inputs:

- **ADR** (`pricePerNight`) — logarithmic scaling to avoid outliers dominating.
- **Inventory** (`units` × ADR) — rough revenue capacity proxy.
- **Rating** — linear contribution centered around a baseline (e.g. 4.0).
- **Occupancy proxy** (`occupancy30d`) — demand strength.
- **Review count** — capped contribution (“proven demand” without unbounded weight).
- **Owned website** — small positive; absence feeds reasons, not only penalty.
- **Instagram** — presence matters for funnel and creative reach.
- **Channel count** — diversification vs concentration.

## Hot score variables

Emphasizes **timing** and **obvious gaps**:

- Recent review activity (`daysSinceLastReview`).
- High occupancy proxy.
- Missing website / single channel / premium without owned funnel.
- “Sweet spot” maturity (optional age proxy).
- Small **deterministic jitter** per day to avoid static ordering (use carefully in production).

## Intelligence score (digital weakness & opportunity)

Derived from **business signals** such as:

- OTA dependence (platform channels without direct)
- Conversion gap (attention surface without owned booking path)
- Weak digital presence
- Reputation risk (low rating with meaningful review volume)
- Review staleness
- Direct contact possible (WhatsApp-eligible mobile)
- Landline or missing phone

Weights are **tunable constants** in `SIGNAL_WEIGHT`—treat them as product parameters, not physics.

## Outreach opportunity scoring

**Readiness** blends:

- WhatsApp path, website, Instagram, phone quality
- Recent activity
- Alignment with hot score

**Queue ranking** (conceptually) combines:

- Readiness (largest weight)
- Hot score
- Lead score
- Source bonus (e.g. fresh import)
- Intelligence score (modest weight so “interesting problems” surface)
- Penalties: weak contact, needs manual finder, no contact

## Priority scoring (future)

- Add explicit **priorityDelta** from LLM (bounded).
- Add **decay** for stale insights (re-fetch reviews monthly).
- Add **caps** so one signal cannot dominate without evidence.

## Tuning process

1. Log **outcomes**: contacted, replied, meeting (privacy-safe).
2. Fit **weights** to correlate scores with outcomes, not vanity metrics.
3. A/B **message** variants, not score noise.

---

*Document changes to weights in PR descriptions so tuning is auditable.*
