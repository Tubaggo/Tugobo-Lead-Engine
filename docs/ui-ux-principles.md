# UI/UX Principles — Tugobo Lead Engine

## Design philosophy

**Dark premium SaaS:** calm, high-contrast readability, subtle accent gradients (indigo, violet, emerald), **operational** density without clutter. The product should feel like a **serious workflow tool**, not a marketing landing page.

## Dashboard structure

- **Primary:** sortable lead universe with clear status and scores.
- **Secondary:** “hot” or focused strips for **today’s work**.
- **Detail:** right-hand or overlay **lead drawer** with scores, **lead intelligence**, contacts, workflow, notes.
- **Queue:** dedicated **session mode** for outreach—one lead at a time, progress, and stats.

## SaaS feel

- Consistent **typography scale** (uppercase micro-labels for sections).
- **Tabular numbers** for scores and dates.
- **Empty states** that explain what to do next (import, connect Airtable, build queue).

## Intelligence-focused UI

- **Explainability first:** every strong score should have **reason chips** or bullets.
- **Lead intelligence** block: signal badges + “Why this lead?” + consultative angle.
- **Confidence** indicators when AI is involved (future): “High / medium / low evidence.”

## Lead card principles

- **Scannable:** name, city, type, 2–3 reason chips, primary actions (open, queue).
- **Honest:** if data missing (“no website”), show neutral gray—not broken layouts.
- **Action-safe:** destructive actions (DNC) require clear copy; WhatsApp opens with explicit user gesture.

## Visual hierarchy

1. **Who** (name, location)
2. **Why now** (hot / intelligence / readiness)
3. **What to do** (queue, message, note)
4. **Evidence** (signals, future review/website sections)

## Accessibility and motion

- Respect `prefers-reduced-motion`.
- Keyboard focus for queue and table rows.
- Sufficient contrast for zinc-on-dark text.

## Demo / investor readiness

- **Story path:** Import → open lead → show intelligence → add to queue → send message.
- **No fake metrics** that imply live network effects.

---

*Polish follows **clarity**: if a chart does not change a decision, remove it.*
