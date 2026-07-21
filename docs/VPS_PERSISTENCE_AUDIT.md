# VPS Persistence Audit — Tugobo Lead Engine v3.7.5

**Date:** 2026-07-21
**Branch:** `restore/v3.7.1-working-lead-engine`
**Scope:** Where operational data actually lives, and what survives a refresh, a
different browser/device, and a VPS restart.

Supersedes the v3.7.3 edition of this document, which recorded the
single-browser limitation. That limitation is now closed for critical state.

---

## 1. Summary

Critical operational state is **server-side and cross-device**. It lives in one
atomic JSON file on the VPS, outside the repository, and is read on every page
load rather than reconstructed from the browser.

The Lead Engine is no longer a single-browser application. Clearing browser data
no longer destroys the pipeline; a second device shows the same queue, the same
sales stages, the same follow-up dates, the same notes, and the same activity
history.

UI preferences and regenerable caches deliberately remain in `localStorage`.

Airtable is unchanged: still a manual, partial, founder-triggered sync, and
still not a source of truth.

---

## 2. Storage inventory

| Data | React state | localStorage | Server file | Airtable | Source of truth |
|---|:--:|:--:|:--:|:--:|---|
| Lead list (seed/demo) | — | — | — | — | `LEADS` in `app/lib/leads.ts`, compiled in |
| Lead list (imported) | ✅ | ❌ | ✅ | partial | **server** (`roster`) |
| Queue / daily outreach | ✅ | ❌ | ✅ | — | **server** (`dailyQueue`) |
| Sales stage | ✅ | ❌ | ✅ | partial | **server** (`leads[].salesStage`) |
| Follow-up date | ✅ | ❌ | ✅ | ❌ | **server** (`leads[].nextFollowUpAt`) |
| Activity history | ✅ | ❌ | ✅ | ❌ | **server** (`leads[].activity`) |
| Founder notes | ✅ | ❌ | ✅ | partial | **server** (`leads[].founderNotes`) |
| Manual edits (status, DNC, attempts, won/lost) | ✅ | ❌ | ✅ | partial | **server** (`leads[].workflow`) |
| AI snapshot (durable) | ✅ | ❌ | ✅ | ❌ | **server** (`leads[].aiSnapshot`) |
| AI interpretation cache | ✅ | ✅ | — | ❌ | browser (regenerable) |
| Contact finder results | ✅ | ✅ | — | ❌ | browser (regenerable) |
| Lead enrichment overrides | ✅ | ✅ | — | ❌ | browser (regenerable) |
| Import cache / metadata | ✅ | ✅ | — | ❌ | browser (regenerable) |
| Filters / UI preferences | ✅ | — | — | — | React state |
| UI locale | ✅ | ✅ | — | — | browser (preference) |
| Auth session | — | — | ✅ cookie | — | HttpOnly JWT, 24h |

Server file: `$LEAD_ENGINE_DATA_DIR/operational-state.json`
(see `docs/HOSTINGER_DATA_STORAGE.md`).

---

## 3. Per-category assessment

### 3.1 Sales state — `leads[].workflow` / `salesStage` / `nextFollowUpAt`

- **Source of truth:** server file
- **Cross-device:** ✅ yes
- **Survives refresh:** ✅ yes
- **Survives VPS restart:** ✅ yes — re-read from disk, nothing cached in-process
- **Backup:** ✅ `pnpm state:backup`
- **Remaining limitation:** last-write-wins between two devices editing the same
  lead simultaneously unless the caller sends `expectedRevision`. Every record
  carries a monotonic `revision` and the API returns `409` on a mismatch, so the
  mechanism exists; the dashboard's fire-and-forget field edits do not use it.
  Not a practical risk for one founder.

### 3.2 Imported leads — `roster`

- **Source of truth:** server file
- **Cross-device:** ✅ · **Refresh:** ✅ · **VPS restart:** ✅ · **Backup:** ✅
- **Remaining limitation:** the roster is replaced wholesale on write. Two
  devices importing at the same moment could have one overwrite the other's
  batch. Re-importing recovers it, at Google Places cost.

### 3.3 Activity history — `leads[].activity`

- **Source of truth:** server file
- **Cross-device:** ✅ · **Refresh:** ✅ · **VPS restart:** ✅ · **Backup:** ✅
- Appended and deduplicated on entry id, so concurrent devices both keep their
  entries and a retried request cannot double an event.
- **Remaining limitation:** capped at 200 entries per lead; older entries are
  dropped.

### 3.4 Daily queue — `dailyQueue`

- **Source of truth:** server file
- **Cross-device:** ✅ · **Refresh:** ✅ · **VPS restart:** ✅ · **Backup:** ✅
- **Remaining limitation:** one queue for the workspace, reset on local calendar
  day rollover. A device in a different timezone can trigger the rollover early.

### 3.5 Caches and preferences

AI interpretation cache, contact-finder map, enrichment overrides, import cache,
locale, filters.

- **Source of truth:** browser
- **Cross-device:** ❌ by design · **VPS restart:** ✅ (never on the VPS)
- **Backup:** not applicable — all regenerable or cosmetic
- Leaving these in `localStorage` is the correct call: they cost nothing to
  rebuild and would only add write traffic and file size server-side.

---

## 4. Legacy migration

A one-shot, idempotent migration runs once per browser after hydration
(`app/lib/operational-state/legacy-migration.ts`):

1. Hydrate server state.
2. Read the legacy critical keys (`state-v1`, `imported-leads-v2`,
   `extra-leads-v1`, `outreach-log-v1`, `daily-outreach-v1`).
3. POST them to `/api/operational-state`, which adopts **only** what the server
   does not already have. Server data always wins.
4. Write a marker, then clear the adopted legacy keys.

Properties:

- **Server never overwritten** — a lead already present server-side is left
  untouched, because it may carry edits from another device.
- **Idempotent** — activity merges on entry id; re-running changes nothing.
- **Fail-safe** — if the server call throws, legacy keys are *not* cleared and
  the next load retries.
- **Empty browser** — a second device with no legacy data marks itself complete
  without calling the server and simply reads server state.
- **UI keys untouched** — locale and caches are explicitly excluded.

---

## 5. Lead ID stability

IDs were verified against their sources, not assumed:

- Seed leads: hardcoded stable ids (`ant-001`) in `app/lib/leads.ts`.
- Imported leads: `gmaps-${place_id}` from the Google Place ID
  (`app/lib/places-import.ts:235`), stable across re-imports.

No display-name-derived ids exist, so no deterministic-hash fallback was needed.
IDs are validated at the API edge against `^[A-Za-z0-9][A-Za-z0-9_:.-]*$` with
`..` rejected, so a malformed id cannot be stored.

---

## 6. VPS restart behaviour

The server holds no operational state in memory: every read goes to the file and
every write is an atomic read-modify-write under a per-file lock. A PM2 reload,
a redeploy, or a reboot therefore loses nothing, provided
`LEAD_ENGINE_DATA_DIR` points outside the repository.

Verified across two separate Node processes: process 1 wrote queue membership,
sales stage, follow-up date, notes and activity, exited; process 2 read all of
it back with the correct revision.

The login rate-limit counter is still in-process and still resets on restart, by
design (`app/lib/auth/login-rate-limit.ts`).

Backing up the server now backs up the pipeline — the inverse of the v3.7.3
finding.

---

## 7. Durability and corruption

- Writes go to a temp file, are `fsync`ed, then `rename`d over the target, so a
  reader never sees a partial JSON document.
- Concurrent writes are serialized per file; a failed write does not poison the
  queue behind it.
- A corrupt or wrong-schema file is renamed `*.corrupt-<timestamp>` and never
  silently reset. Reads return `503`, not an empty pipeline presented as truth.

---

## 8. Remaining limitations

1. **Single process only.** The write lock is in-process. PM2 cluster mode or
   two processes on one data directory could interleave writes.
2. **Roster writes are wholesale.** Concurrent imports from two devices can lose
   a batch.
3. **No field-level conflict resolution in the UI.** `revision` and `409` exist
   but the dashboard does not send `expectedRevision` for routine edits.
4. **Backups live inside the data directory.** Losing the VPS loses them too
   unless copied off-box.
5. **Activity capped at 200 entries per lead.**
6. **Airtable is still a partial manual sync**, unchanged by this sprint.

---

## 9. Assessment

> **READY FOR HOSTINGER VPS — CRITICAL STATE IS SERVER-SIDE AND CROSS-DEVICE**

Authentication, page protection, API protection and demo-data safety remain in
place from v3.7.4. On top of that, the founder's pipeline now lives on the
server, survives a browser data clear, is visible from any device after login,
survives a VPS restart, and has a working backup and restore procedure.

Operational setup is documented in `docs/HOSTINGER_DATA_STORAGE.md`. The single
mandatory step before first production deploy is setting
`LEAD_ENGINE_DATA_DIR` to a path outside the repository.
