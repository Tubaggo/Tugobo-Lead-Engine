# VPS Persistence Audit — Tugobo Lead Engine v3.7.3

**Date:** 2026-07-20
**Branch:** `restore/v3.7.1-working-lead-engine`
**Scope:** Where operational data actually lives, and what survives a refresh, a
different browser/device, and a VPS restart.

This audit was produced by reading the code, not by assumption. It does **not**
change any persistence behaviour — this sprint was auth + VPS readiness only.

---

## 1. Summary

The Lead Engine is, today, a **single-browser application**. Effectively all
operational sales state is written to `localStorage` in the founder's browser.
The server holds no per-lead state of its own.

Airtable is wired up and works, but it is a **manual, partial, founder-triggered
sync** — not a source of truth and not automatic.

This is safe for one founder on one machine. It is not safe against clearing
browser data, switching devices, or a browser profile loss.

---

## 2. Storage inventory

| Data | React state | localStorage | Server/File | Airtable | Notes |
|---|:--:|:--:|:--:|:--:|---|
| Lead list (seed/demo) | — | — | ✅ source code | — | `LEADS` array in `app/lib/leads.ts:468`, compiled into the build |
| Lead list (imported) | ✅ | ✅ | — | partial | `tugobo-lead-engine:imported-leads-v2` |
| Queue / daily outreach | ✅ | ✅ | — | — | `tugobo-lead-engine:daily-outreach-v1` |
| Sales stage (pipelineStage) | ✅ | ✅ | — | partial | `tugobo-lead-engine:state-v1`; pushed to Airtable only on manual sync |
| Follow-up date (nextFollowUpAt) | ✅ | ✅ | — | ❌ | `state-v1`. **Not** included in the Airtable payload |
| Activity history / outreach log | ✅ | ✅ | — | ❌ | `tugobo-lead-engine:outreach-log-v1` |
| AI analysis / interpretation | ✅ | ✅ | — | ❌ | `tugobo-lead-engine:ai-interpretation-cache-v1` (cache only, regenerable) |
| Contact finder results | ✅ | ✅ | — | ❌ | `tugobo-lead-engine:contact-finder-map-v1` |
| Lead enrichment overrides | ✅ | ✅ | — | ❌ | `tugobo-lead-engine:lead-enrichment-overrides-v1` |
| Import cache / metadata | ✅ | ✅ | — | ❌ | `import-cache-v1`, `import-meta-v1`, `last-import-v1` |
| Manual lead edits (status, note, doNotContact, contactAttempts, won/lost) | ✅ | ✅ | — | partial | `state-v1` |
| Filters / UI preferences | ✅ | — | — | — | React state only; resets on refresh (acceptable) |
| UI locale | ✅ | ✅ | — | — | `tugobo-lead-engine:ui-locale` (acceptable) |
| Auth session | — | — | ✅ cookie (JWT) | — | HttpOnly cookie, 24h, signed with `AUTH_SECRET` |

All localStorage keys are namespaced `tugobo-lead-engine:*` and are read/written
in `app/components/Dashboard.tsx` (and read in `app/components/FollowUpsPage.tsx`).

---

## 3. Per-item risk assessment

### 3.1 Critical — sales state (`tugobo-lead-engine:state-v1`)

Holds `status`, `note`, `contactedAt`, `lastContactedAt`, `nextFollowUpAt`,
`pipelineStage`, `contactAttempts`, `doNotContact`, `repliedAt`, `meetingAt`,
`wonAt`, `lostAt`.

- **Source of truth:** browser localStorage
- **Survives refresh:** ✅ yes
- **Visible on another browser/device:** ❌ no
- **Survives VPS restart:** ✅ yes (it never lived on the VPS)
- **Survives browser data clear / new machine:** ❌ **no — permanent loss**
- **Risk:** 🔴 **HIGH**
- **Recommended fix:** promote Airtable (or SQLite/Postgres on the VPS) to
  source of truth for this map, with read-on-load and write-on-change.

### 3.2 Critical — imported leads (`imported-leads-v2`)

- **Source of truth:** browser localStorage
- **Survives refresh:** ✅ · **Cross-device:** ❌ · **VPS restart:** ✅
- **Risk:** 🔴 **HIGH** — re-importing costs real Google Places API spend.
- **Recommended fix:** persist imported leads server-side at import time
  (the import already runs through `/api/import-leads`, so the write point exists).

### 3.3 Important — activity history (`outreach-log-v1`)

- **Cross-device:** ❌ · **Risk:** 🟠 **MEDIUM-HIGH**
- Not synced to Airtable at all. Losing it loses the "what did I already say to
  this hotel" record, which is the hardest thing to reconstruct.

### 3.4 Moderate — follow-up dates

`nextFollowUpAt` is **not** part of the Airtable sync payload
(`app/components/Dashboard.tsx:10880-10904` sends only contact fields,
`do_not_contact`, `pipeline_stage`, `contact_readiness_score`,
`whatsapp_invalid`). So even a founder who syncs diligently will lose the
follow-up schedule. **Risk:** 🟠 **MEDIUM-HIGH**

### 3.5 Low — caches and preferences

AI interpretation cache, import cache, contact-finder map, locale, filters.
All regenerable or cosmetic. **Risk:** 🟢 **LOW** — leaving these in
localStorage is correct.

---

## 4. What Airtable actually does today

- **Automatic on page load:** a single `GET /api/airtable/leads` fires from a
  `useEffect` purely to set the "connected" indicator
  (`app/components/Dashboard.tsx:10650`). It does not restore state.
- **Manual push:** "sync" button → `POST /api/airtable/sync-leads`. Sends only
  leads deemed valuable, and only a subset of fields.
- **Manual pull:** "load from Airtable" button → merges a subset of state back.

So Airtable is a **partial manual backup**, not a source of truth. Nothing is
written to Airtable automatically as the founder works.

---

## 5. VPS restart behaviour

Because the server is stateless with respect to lead data, a VPS restart, a PM2
reload, or a redeploy loses **nothing** — all operational data is in the
founder's browser. The one in-process piece of state is the login rate-limit
counter, which resets on restart by design (documented in
`app/lib/auth/login-rate-limit.ts`).

The inverse is also true and is the real risk: **the VPS holds no backup of the
founder's pipeline.** Backing up the server backs up no sales data.

---

## 6. Recommended sequence (future sprint — not done here)

1. Move `state-v1` to a server-side store (SQLite on the VPS is sufficient for
   one user and needs no extra service).
2. Move `imported-leads-v2` to the same store, written at import time.
3. Move `outreach-log-v1` next — it is the least reconstructible.
4. Add `nextFollowUpAt` to whatever sync survives.
5. Leave caches, locale, and filters in localStorage.

Until step 1 lands, the founder should be told plainly: **do not clear browser
data, and treat the Airtable sync button as a partial manual backup.**

---

## 7. Assessment

> **VPS DEPLOYMENT READY WITH SINGLE-BROWSER LIMITATION**

The application can be deployed to Hostinger VPS today. Authentication, page
protection, API protection, and demo-data safety are in place, and no data is
lost on restart or redeploy. However, all critical sales state lives only in one
browser profile, so the deployment is safe for exactly one founder on one
machine and provides no server-side backup of the pipeline.
