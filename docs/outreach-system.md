# Outreach System — Tugobo Lead Engine

## Philosophy

Outreach is **consultative discovery**, not broadcast.

- **Curiosity** over claims.
- **Observation** over accusation (“many properties in this situation…” vs “you are failing…”).
- **Brevity** — mobile-first; 2–4 short lines.
- **Respect** — easy to ignore, no pressure tricks.

## Anti-spam principles

1. **Hard caps** — maximum leads in the daily queue (e.g. 20); no bulk “send all.”
2. **Cooldowns** — skip recently contacted leads within a defined window unless follow-up workflow applies.
3. **DNC and invalid WhatsApp** — permanently respect opt-out and bad numbers in UI logic.
4. **No automated spam chains** — no product feature whose primary purpose is cold mass messaging.
5. **Transparency** — reps know **why** a lead is queued (`whyThisLead`, angles).

## Personalized messaging logic

**Layers:**

1. **Context:** city, property type, signals (e.g. OTA-heavy, no site).
2. **Channel:** WhatsApp-first when mobile line validates; otherwise Instagram or call guidance.
3. **Variant:** direct / soft / curiosity tones (rule packs today; LLM can select among constrained templates).

**Rules:**

- Never assert a specific guest complaint unless tied to **review evidence** in the system.
- Prefer questions: “Does this match what you see?” vs “You have this problem.”

## WhatsApp outreach strategy

- **Deep link** with pre-filled text (`wa.me`) for **human-sent** messages from the dashboard.
- Validate **Turkish mobile** patterns; flag landlines as low quality.
- **Follow-up** mode: shorter, acknowledges prior touch when `needs_follow_up`.

Future: WhatsApp Business API only in **opt-in** or **reply-based** flows—not cold automation without consent.

## Outreach queue logic

1. **Eligibility filter:** not DNC, not invalid WhatsApp, pipeline not terminal, attempt count below cap, contact path exists.
2. **Ranking:** readiness + hot + lead + intelligence + source bonus − penalties (see `lead-scoring.md`).
3. **Session:** user walks the queue one-by-one; tracks prepared message, variant, status (queued / contacted / skipped).
4. **Persistence:** queue state per calendar day; optional Airtable sync for reporting.

## Lead warming ideas (non-spam)

- **Insight-first DM:** “We summarized public signals on X—want the one-page view?” (only if you actually have it).
- **Content hooks:** seasonal occupancy tips, OTA fee calculators—**value** before ask.
- **Referral path:** partner with local tourism boards or associations for **introduced** conversations.

## Metrics that matter

- Reply rate, meeting rate, **time-to-reply** (human), not raw sends.
- Qualitative tags: “angry reply” / “positive curiosity” for model and copy tuning.

---

*If a feature increases send volume without increasing insight quality, it is probably wrong for this product.*
