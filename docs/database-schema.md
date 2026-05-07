# Database Schema (Target) — Tugobo Lead Engine

> **Status:** Today much state lives in **Airtable** and **browser storage**. This document describes a **target relational model** for when you migrate to Postgres (or similar).

## Design principles

- **Leads** are the anchor entity.
- **Insights** are versioned and **regenerable** (never the only copy of truth).
- **Outreach** events are append-only for analytics.
- **PII** minimized; review excerpts stored with retention policy.

---

## Entity relationship (conceptual)

```
Organization ──< User
Organization ──< Lead ──< LeadSignalSnapshot
Lead ──< InsightRun
Lead ──< ReviewEvidence
Lead ──< WebsiteReport
Lead ──< OutreachEvent
Lead ──< ScoreSnapshot
```

---

## TypeScript-like schema examples

### Organization & user

```typescript
type Organization = {
  id: string;
  name: string;
  createdAt: Date;
  plan: "solo" | "team" | "enterprise";
};

type User = {
  id: string;
  orgId: string;
  email: string;
  role: "admin" | "member";
  createdAt: Date;
};
```

### Lead (core listing + commercial fields)

```typescript
type Lead = {
  id: string;
  orgId: string;

  externalPlaceId: string | null;  // Google place_id
  name: string;
  type: "Hotel" | "Boutique Hotel" | "Bungalow" | "Villa" | "Pension";
  city: string;
  region: string;

  phone: string | null;
  websiteHost: string | null;
  instagramHandle: string | null;

  rating: number | null;
  reviewsCount: number | null;
  daysSinceLastReview: number | null;

  channels: ("Booking" | "Airbnb" | "Direct" | "Tatilsepeti")[];
  hasOwnWebsite: boolean;
  hasInstagram: boolean;

  units: number | null;
  pricePerNight: number | null;
  occupancy30d: number | null;

  /** Workflow */
  status: "new" | "contacted" | "needs_follow_up" | "replied" | "meeting" | "won" | "lost";
  doNotContact: boolean;
  pipelineStage: string | null;

  createdAt: Date;
  updatedAt: Date;
  lastEnrichedAt: Date | null;
};
```

### Lead signal snapshot (deterministic)

```typescript
type LeadSignalSnapshot = {
  id: string;
  leadId: string;
  capturedAt: Date;
  signals: string[];           // BusinessSignal enum values
  whyThisLead: string[];
  heuristicOutreachAngle: string | null;
  intelligenceScore: number;
  source: "rules_v1" | "rules_v2";
};
```

### AI insight model

```typescript
type InsightRun = {
  id: string;
  leadId: string;
  createdAt: Date;
  model: string;
  promptVersion: string;

  aiInsight: string[];
  outreachAngle: string | null;
  painPoints: {
    id: string;
    label: string;
    severity: "low" | "medium" | "high";
    basis: "reviews" | "website" | "listing" | "inferred";
  }[];

  priorityDelta: number;      // clamped in application layer
  confidence: number;

  rawJson: unknown;            // optional debug; encrypt or redact in prod
};
```

### Scoring model

```typescript
type ScoreSnapshot = {
  id: string;
  leadId: string;
  capturedAt: Date;

  leadScore: number;
  hotScore: number;
  contactReadiness: number;
  contactQuality: "high" | "medium" | "low";

  leadReasons: string[];
  hotReasons: string[];
  readinessReasons: string[];
};
```

### Review analysis model

```typescript
type ReviewEvidence = {
  id: string;
  leadId: string;
  source: "google";
  reviewId: string;
  publishedAt: Date | null;
  rating: number | null;
  language: string | null;
  excerpt: string;             // short, PII-redacted
  excerptHash: string;
};

type ReviewThemeAggregate = {
  id: string;
  leadId: string;
  category: string;
  frequency: number;
  severity: "low" | "medium" | "high";
  exampleEvidenceIds: string[];
  updatedAt: Date;
};
```

### Outreach model

```typescript
type OutreachEvent = {
  id: string;
  leadId: string;
  userId: string;
  channel: "whatsapp" | "instagram" | "phone" | "email";
  kind: "first_touch" | "follow_up";
  variant: "direct" | "soft" | "curiosity" | "custom" | null;
  messageHash: string;         // hash only in DB
  createdAt: Date;
  outcome: "sent" | "skipped" | "dnc" | "error" | null;
};
```

---

## Indexing (recommended)

- `(orgId, city, type)` for browsing.
- `(orgId, status, updatedAt DESC)` for work queues.
- `(leadId, capturedAt DESC)` for insight history.
- Full-text on `ReviewEvidence.excerpt` optional (language-specific config).

---

*Migrate **append-only** outreach and **versioned** insights first—they are hardest to reconstruct from UI state.*
