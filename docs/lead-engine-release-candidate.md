# TUGOBO Lead Engine — Release Candidate (v8.5)

Status: **Release Candidate**, prepared for real founder usage and TUGOBO AI sales outreach.
Sprint: v8.5 — Release Candidate Polish (final polish pass before RC tag + product freeze).

## 1. Product identity

TUGOBO Lead Engine is an AI-native hotel operational intelligence runtime. Its founder-facing
identity is **Hermes** — an autonomous sales operating layer that discovers hotel leads, scores
opportunity, drafts and sends outreach, listens for replies, schedules demos, tracks follow-ups,
and records sales outcomes. The founder's job is narrow and explicit:

> **Hermes works. Founder decides.**

Hermes never sends a message, marks a deal won/lost, or takes an irreversible action without an
explicit founder decision. Every autonomous step stops at a decision point the founder can see,
approve, or reject.

## 2. Founder workflow

The founder-facing entry point is **`/v2`**, which renders a single screen — **Hermes Home**
(`app/components/v2/screens/FounderRevenueWorkspace.tsx`) — built from six sections, top to bottom:

1. **Hermes Bugün** — today's operational counters (active işler, onay bekleyen, sıcak cevap, demo
   bekleyen, takip gerekli, sonuç bekliyor) + a 3–5 tile health strip (Hermes / WhatsApp / Teslimat,
   plus Webhook/Runtime only in Developer Mode).
2. **Hermes Fırsat Keşfi** — a read-only summary of what Hermes's autonomous lead-intake side has
   found and converted into a satış görevi. Its only actions are "Fırsatları İncele" (scrolls to
   Karar Merkezi) and "Tarama Ekranını Aç" (jumps to the Developer-only Lead Import screen).
3. **Karar Merkezi** — the single, prioritized list of decisions that actually need the founder
   (Onayla/Reddet on a drafted message, plan a demo, review a hot reply, resolve a failed delivery,
   etc.). This is the visual and operational priority of the whole screen. Passive states (read,
   delivered, sent, ready, won, lost, unknown) never produce a card here.
4. **Fırsat Odağı** — once a card/mission is selected, answers one question: *"Bu otel için şimdi
   ne yapmalıyım?"* — current state, why it matters, Hermes's recommendation, the founder's next
   action, a compact status strip (Mesaj/Cevap/Demo/Takip/Sonuç), and up to 5 recent events.
5. **Gelir Nabzı** — Kazanıldı / Kaybedildi / Tahmini MRR, kept intentionally simple.
6. **Hermes Aktivitesi** — a short, meaningful activity feed (job opened, founder approved/rejected,
   message sent/delivered/read/failed) — never a technical/runtime log.

## 3. Developer Mode

Developer Mode is **OFF by default** and is not persisted as "on" across a fresh session unless the
founder explicitly turns it on (toggle button in the Hermes Home header: "Geliştirici Modu:
Açık/Kapalı"). While off:

- The sidebar shows exactly one entry: **Hermes**.
- Hermes Home renders only the six sections above — no runtime/pipeline/provider vocabulary.

Turning it on reveals, unchanged:

- A second sidebar group ("Developer") with all 13 legacy/technical screens (Gelir Pipeline,
  Gelir Tahmini, Gelir Risk, Gelir Recovery, Gelir Analizi, Günlük Operasyon, Fırsat Kuyruğu,
  Takip Edilecekler, Lead Listesi, ICP Analizi, İletişim Zekası, Lead Import, Veri Kaynakları).
- A collapsible "Geliştirici Runtime Görünümü" section under Hermes Home itself, exposing the raw
  Mission Runtime, Provider Registry, Courier, Delivery Gateway, WhatsApp test/send/readiness/
  receipt/reply cards, Reply Intelligence, Demo Scheduling, Follow-up, and Sales Outcome runtime
  cards — every technical capability stays reachable, nothing was removed.

Nothing is deleted when Developer Mode is off — every screen keeps its route/component/adapter; the
IA only decides what's *visible* (`app/components/v2/layout/v2-nav.ts`).

## 4. Completed runtime capabilities

- Lead Discovery (Google Maps + Airtable + Sheets ingestion, `app/lib/leads.ts`)
- ICP Analysis / opportunity scoring
- Hermes Mission Runtime (in-memory mission/task state)
- Founder Approval gate
- Courier Draft generation (AI message drafting)
- Delivery Gateway (send orchestration)
- WhatsApp Cloud API test runtime (readiness probe, dry-run)
- WhatsApp delivery receipt processing
- WhatsApp reply listener + webhook verification
- Reply Intelligence (deterministic, rule-based reply classification)
- Demo Scheduling
- Autonomous Follow-up candidate detection
- Sales Outcome tracking (won/lost/MRR)
- Hermes Operating System information architecture (v8.0–v8.4)
- Hermes Lead Intake summary, Decision Queue, Opportunity Focus operating layers
- Developer Isolation (founder-language audit contract, `app/components/v2/founder-language.ts`)

## 5. Environment requirements

No secrets are recorded here — only the variable names the runtime reads. Configure these in
`.env.local` (already git-ignored):

**WhatsApp Cloud API** (`app/lib/whatsapp-provider-runtime.ts`)
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_TEST_RECIPIENT` (dry-run/test-recipient gate)
- `WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED` (must be explicitly enabled for any live send)

**Lead data sources**
- `GOOGLE_MAPS_API_KEY`
- `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME`
- `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`

**AI drafting / enrichment**
- `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `LLM_TIMEOUT_MS`

Missing/partial credentials degrade gracefully — the WhatsApp health tile reports "Eksik"/"Kapalı"
rather than crashing, and data-source status is visible under Developer → Veri Kaynakları.

## 6. Manual Meta/WhatsApp setup still required

The following cannot be automated by this codebase and must be done by a human in Meta's own
dashboards before any real send is possible:

1. A verified Meta Business/WhatsApp Business Cloud API app, phone number, and permanent access
   token.
2. Registering the production webhook URL + verify token in the Meta App dashboard.
3. Adding real test recipients while `WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED` is off (dry-run only).
4. Explicitly flipping `WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED` only when ready for controlled live
   sends — this remains a manual, reversible config change, never a code change.

## 7. Known in-memory limitations

These are documented, not hidden, and are **not** solved in this RC sprint (production hardening,
future maintenance only):

- Mission State Bridge is in-memory — lost on server restart.
- Provider Message Registry is in-memory.
- Reply Registry is in-memory.
- Reply Intelligence Registry is in-memory.
- Demo Scheduling Registry is in-memory.
- Follow-up Registry is in-memory.
- Sales Outcome Registry is in-memory.
- No `X-Hub-Signature-256` webhook signature verification yet.
- WhatsApp Cloud API requires the real Meta setup above — nothing works against a mock.
- Live send remains controlled/test-recipient gated by design — no bulk/arbitrary send exists.
- No background cron worker — nothing runs unless the app process is up and a founder/API call
  triggers it.
- No persistent conversation store — reply history is a capped, aging in-memory feed.
- Plain, non-quoted WhatsApp replies may stay unmapped to a mission (only quoted-reply context
  resolves reliably today).
- Reply Intelligence is rule-based/deterministic, not a trained model — it will misclassify replies
  outside its known patterns; `reply_needs_review` exists specifically to surface that.

## 8. Known production hardening gaps

- No persistent database (all registries above are process-memory only).
- No Redis/Supabase or other durable store.
- No retry/backoff engine for failed provider calls.
- No background workers/queues.
- No CRM/calendar/payment integration.
- `Dashboard.tsx` (the pre-v2 legacy dashboard, still served at `/`) is a ~500KB+ file that makes
  `npm run lint` run out of memory before completing — pre-existing, not introduced by this sprint,
  and out of scope for an RC-polish pass. `/v2` (Hermes) is the intended founder entry point.

## 9. Manual smoke-test checklist

Run this before any real founder session or before re-tagging after a hotfix:

1. `npm test` — expect all tests passing (499 as of this RC).
2. `npx tsc --noEmit` — expect zero errors.
3. `npm run build` — expect a clean production build; confirm `/v2` appears as a route.
4. Start the app, open `/v2`.
5. Confirm the sidebar shows only **Hermes** (Developer Mode off by default).
6. Confirm all six Hermes Home sections render with no console errors.
7. Confirm no technical vocabulary (Mission/Runtime/Provider/Bridge/Webhook/Registry/Pipeline)
   appears anywhere on screen.
8. With an empty state (no missions/no data), confirm each section's empty-state copy matches:
   - Hermes Bugün: *"Henüz bugüne ait satış aktivitesi yok. Hermes çalışmaya başladığında özet
     burada görünecek."*
   - Hermes Fırsat Keşfi: *"Hermes henüz yeni fırsat taraması başlatmadı."*
   - Karar Merkezi: *"Şu anda senden karar bekleyen bir satış görevi yok. Hermes çalışmaya devam
     ediyor."*
   - Fırsat Odağı: *"Bir fırsat seçtiğinde Hermes bu otel için önerilen sonraki adımı gösterecek."*
   - Gelir Nabzı: *"Henüz satış sonucu kaydedilmedi."*
   - Hermes Aktivitesi: *"Hermes aktivitesi başladığında önemli gelişmeler burada görünecek."*
9. Select a karar/fırsat card and confirm Fırsat Odağı updates with a real recommendation.
10. Test Onayla/Reddet on an approvable card; confirm the buttons disable during submission and the
    card reflects the new decision state without a double-fire.
11. Turn Developer Mode on; confirm the Developer sidebar group and the "Geliştirici Runtime
    Görünümü" section both appear, with every legacy card (Mission/Courier/Delivery/Provider,
    WhatsApp test/send/readiness/receipt/reply, Demo/Follow-up/Outcome) intact.
12. Open Lead Import from Developer, then return to Hermes, then turn Developer Mode back off;
    confirm the sidebar returns to Hermes-only.
13. Resize to a laptop/narrow-desktop width (~1024–1280px); confirm no horizontal overflow.
14. Kill the WhatsApp/replies/demo/follow-up/outcome APIs (or block network) and confirm Hermes
    Home shows the safe error banner + "Tekrar Dene" instead of a crash or a silent zeroed KPI
    strip.

## 10. Rollback / tag information

_Placeholder — fill in at tag time:_

- RC tag: `v8.5.0-rc1` (to be created: `git tag v8.5.0-rc1 && git push origin v8.5.0-rc1`)
- Rollback target: the last known-good tag/commit before this RC (record here once tagged).
- Rollback procedure: redeploy the previous tag; no destructive migration exists to reverse (all
  new state in this sprint is in-memory or presentation-only).

## 11. Maintenance-only policy after RC

Once tagged, this branch enters **maintenance-only** mode:

- No new runtime features, APIs, or providers.
- Only: founder-reported bugs, security fixes, and the production-hardening items in Section 8,
  each scoped and reviewed independently — not bundled into unrelated changes.
- Any change to founder-facing copy must keep passing the founder-language audit contract in
  `app/components/v2/founder-language.test.ts`.
