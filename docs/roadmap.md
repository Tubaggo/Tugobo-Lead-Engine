# Roadmap — Tugobo Lead Engine

Roadmap phases are **sequential priorities**, not rigid dates. Each phase should leave the app **stable and shippable**.

## Current priorities (live focus)

- Harden **lead model** and **scoring** so they reflect digital weakness and outreach potential—not only ratings.
- Ship **structured business signals** and **“Why this lead?”** in the product UI (rule-based first, LLM-enriched later).
- Maintain **daily outreach queue** with caps, session UX, and anti-spam defaults.
- Keep **Google Places** import reliable (details fields, normalization, deduplication).

## Phase 1 — Intelligence foundation (MVP+)

**Goal:** Raw listings become **explainable** leads.

- [x] Core lead fields: identity, contact, channels, ratings, review counts, website, workflow state.
- [x] Rule-based **feature extraction** (business signals) from existing fields.
- [x] **Intelligence score** distinct from legacy lead/hot scores (documented separately).
- [x] Dashboard: **Lead intelligence** block—why bullets, signal badges, consultative angle (heuristic).
- [ ] Persist optional insight fields to Airtable / future DB when schema is ready.
- [ ] **Generate message** API: optional LLM path behind feature flag; keep rule-based fallback.

**Exit criteria:** Every lead in the dashboard has a coherent **why** and **angle** without manual research.

## ICP alignment (applies to all phases)

Near-term product decisions (signals, scoring, queue ranking, and messaging) should align to a segmented ICP model:

- **Micro**: low priority unless strong pain signals exist
- **Small**: good target
- **Medium**: high priority
- **Premium Independent**: very high priority
- **Enterprise / Chain**: future stage (requires integrations, procurement/SLA, role permissions)

This keeps the engine focused on independent operators with enough operational volume to feel ROI, while avoiding premature enterprise complexity.

## Phase 2 — Review & reputation intelligence

**Goal:** Turn Google reviews into **structured pain points** (not raw text dumps).

- Places API (or compliant review source) → fetch **review text samples** where allowed.
- **Pattern library:** slow response, unreachable, reservation issues, unanswered messages, frustration language (TR + EN).
- NLP + LLM: classify segments → **pain point objects** (type, severity, quote hash, confidence).
- Feed review-derived signals into **scoring** and **outreach angles** with citations/guardrails.

**Exit criteria:** Review themes appear as **badges and bullets** on the lead card with traceability to source snippets.

## Phase 3 — Website & funnel intelligence

**Goal:** Objective **digital funnel** signals from owned sites.

- Fetch homepage (and key paths): **booking engine** hints, **WhatsApp** click-to-chat, **CTA** presence, **mobile** hints.
- Optional: Lighthouse scores, Puppeteer screenshots, **vision model** for layout/CTA (cost-controlled).
- Outputs: `conversion_gap`, `weak_booking_funnel`, `poor_mobile_experience` (structured).

**Exit criteria:** Website section on lead detail with **evidence** (URL, checks passed/failed), not black-box scores.

## Phase 4 — Sales OS & scale

**Goal:** Multi-user, integrated, **measurable** outbound motion.

- CRM-grade **pipeline**, ownership, and activity log.
- **Jobs:** scheduled re-enrichment, review refresh, stale-insight invalidation.
- **Integrations:** Airtable migration path to Postgres/Supabase; optional WhatsApp Business API for **opt-in** workflows only.
- **Analytics:** funnel from “insight viewed” → “message sent” → “reply” (privacy-preserving).

**Exit criteria:** A team can run **repeatable weekly outreach** with audit trail and without bypassing queue limits.

---

## MVP priorities (summary)

1. Explainable signals + **Why this lead?**
2. Smart scoring that **weights weaknesses and contact path**
3. Capped **outreach queue** + consultative copy
4. Stable **import + storage** path

## Scaling priorities

- Move from **client-heavy** state to **server-backed** lead + insight storage.
- Async workers for website/review analysis (queues, retries, cost caps).
- Multi-tenant auth and org-scoped data.

## AI intelligence evolution

| Stage | AI role |
|-------|--------|
| Now | Rules + templates; optional LLM for polish |
| Next | LLM classification of reviews + structured JSON outputs |
| Later | Multi-modal (screenshots), campaign narratives, copilots |

---

*Review this roadmap quarterly; reorder only when Phase N exit criteria are met or invalidated by market feedback.*
