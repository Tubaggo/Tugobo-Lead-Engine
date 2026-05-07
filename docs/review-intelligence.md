# Review Intelligence — Tugobo Lead Engine

## Purpose

**Review intelligence** converts guest feedback (chiefly **Google reviews**, where API/ToS permit) into **structured operational and commercial pain points** that power:

- “Why this lead?” bullets
- Pain point badges
- Outreach angles grounded in **real language**
- Risk flags (reputation, communication, booking)

This module must stay **evidence-based**: every strong claim should trace to **stored excerpts** or aggregated statistics.

## Data sources

- **Google Places** — aggregate `rating`, `user_ratings_total`; per-review text subject to **API capabilities and policies** (verify current Google Places / partner APIs before building production ingestion).
- **Future:** partner PMS, survey tools, or manually pasted reviews for private demos (with consent).

## Complaint detection (taxonomy)

Build a **hospitality-specific taxonomy** (Turkish + English lemmas):

| Category | Example lemmas / patterns (illustrative) |
|----------|------------------------------------------|
| **Slow response** | geç cevap, dönüş yapılmadı, hours to reply |
| **Unreachable** | ulaşılamadı, telefon açılmadı, cevap yok |
| **No callback** | geri dönüş yok, aranmadım |
| **Reservation issues** | rezervasyon karıştı, double booking, iptal |
| **Unanswered messages** | mesajıma bakılmadı, WhatsApp okunmadı |
| **Poor communication** | iletişim zayıf, bilgi verilmedi |
| **Frustration** | hayal kırıklığı, bir daha gelmem |

Start with **regex + keyword** passes; add **LLM classification** only on pre-segmented snippets to control cost.

## Response delay detection

Signals:

- Explicit phrases (“two days later they replied”).
- Implicit patterns (“I wrote on WhatsApp, no answer until check-in”).
- **Relative time** extraction is hard—default to **soft** severity unless language is explicit.

Output: `response_delay` pain point with `confidence` and optional `quoteIds[]`.

## Communication problem extraction

Pipeline:

1. **Fetch** N recent reviews (cap N).
2. **Normalize** text (Unicode, language detect).
3. **Split** into sentences; drop boilerplate.
4. **Score** sentences against taxonomy (embeddings or keyword + LLM).
5. **Cluster** into recurring themes per lead.
6. **Aggregate** → top 3 themes + **percent of reviews touched** (not just raw count).

## Customer sentiment analysis

- **Document-level** sentiment (optional) — less important than **theme** detection.
- Prefer **aspect-based** framing: “communication negative, location positive.”
- Output feeds **outreach angle**: double down on strengths, gently probe weaknesses.

## Review-based pain point generation

Target object:

```typescript
type ReviewPainPoint = {
  id: string;
  category:
    | "response_delay"
    | "unreachable"
    | "reservation"
    | "communication"
    | "cleanliness"
    | "value"
    | "other";
  summary: string;        // one line, Turkish for TR market
  severity: "low" | "medium" | "high";
  evidence: { reviewId: string; excerpt: string }[]; // redact PII
  firstSeen: string;      // ISO date if available
  lastSeen: string;
  frequency: number;      // review count contributing
};
```

## Quality and compliance

- **Retention:** store excerpts minimally; hash full text if legal allows.
- **GDPR / KVKK:** reviews are public but bulk processing may still need policy review—consult legal for your jurisdiction and use case.
- **No training** on customer data without contract—default off.

---

*Review intelligence is high leverage but high responsibility; ship **taxonomy + evidence** before **LLM storytelling**.*
