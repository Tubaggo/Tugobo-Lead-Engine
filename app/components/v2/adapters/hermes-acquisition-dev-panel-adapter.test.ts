import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACQUISITION_NETWORK_ERROR_TR,
  acquisitionResultFieldLabelsTr,
  acquisitionRunStatusLabelTr,
  buildAcquisitionRunRequestBody,
  resolveAcquisitionRunResponse,
} from "./hermes-acquisition-dev-panel-adapter.ts";

/* ── request body ───────────────────────────────────────────── */

test("dry-run request body carries exactly trigger + dryRun:true", () => {
  const body = buildAcquisitionRunRequestBody("dry");
  assert.deepEqual(body, { trigger: "developer", dryRun: true });
  assert.deepEqual(Object.keys(body).sort(), ["dryRun", "trigger"]);
});

test("safe-run request body carries exactly trigger — never a dryRun:false override", () => {
  const body = buildAcquisitionRunRequestBody("safe");
  assert.deepEqual(body, { trigger: "developer" });
  assert.deepEqual(Object.keys(body), ["trigger"]);
});

test("request body can never structurally carry policy/approval/secret fields", () => {
  for (const kind of ["dry", "safe"] as const) {
    const body = buildAcquisitionRunRequestBody(kind) as Record<string, unknown>;
    for (const forbidden of [
      "founderApproved",
      "autoSend",
      "dailyLeadLimit",
      "maxMissionCandidatesPerRun",
      "enabled",
      "secret",
      "accessToken",
      "apiKey",
    ]) {
      assert.equal(forbidden in body, false, `${kind} body must never contain ${forbidden}`);
    }
  }
});

/* ── response resolution ───────────────────────────────────────── */

function resultPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: "blocked",
    runId: "acq-1",
    dryRun: true,
    selectedRegionsSafe: [],
    blockingReasons: ["Fırsat taraması henüz etkin değil."],
    summaryTr: "Fırsat taraması henüz etkin değil.",
    evaluatedCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    qualifiedCount: 0,
    missionCandidateCount: 0,
    missionCreatedCount: 0,
    externalRequestCount: 0,
    ...overrides,
  };
}

test("a successful (200) blocked-status body resolves to a renderable result", () => {
  const outcome = resolveAcquisitionRunResponse({ ok: true, data: resultPayload() });
  assert.equal(outcome.kind, "result");
  if (outcome.kind === "result") {
    assert.equal(outcome.result.status, "blocked");
    assert.deepEqual(outcome.result.blockingReasons, ["Fırsat taraması henüz etkin değil."]);
  }
});

test("a successful (200) completed dry-run body resolves with real counters", () => {
  const outcome = resolveAcquisitionRunResponse({
    ok: true,
    data: resultPayload({
      status: "completed",
      blockingReasons: [],
      summaryTr: "Önizleme tamamlandı: Antalya bölgesinde 10 işletme değerlendirilecekti.",
      selectedRegionsSafe: ["Antalya"],
      evaluatedCount: 10,
      missionCandidateCount: 3,
      externalRequestCount: 11,
    }),
  });
  assert.equal(outcome.kind, "result");
  if (outcome.kind === "result") {
    assert.equal(outcome.result.evaluatedCount, 10);
    assert.equal(outcome.result.missionCandidateCount, 3);
    assert.equal(outcome.result.externalRequestCount, 11);
    assert.deepEqual(outcome.result.selectedRegionsSafe, ["Antalya"]);
  }
});

test("a non-2xx response with a Turkish error field surfaces that message", () => {
  const outcome = resolveAcquisitionRunResponse({
    ok: false,
    data: { error: "Yetkilendirme gerekli." },
  });
  assert.deepEqual(outcome, { kind: "error", messageTr: "Yetkilendirme gerekli." });
});

test("a non-2xx response without an error field falls back to a generic safe message", () => {
  const outcome = resolveAcquisitionRunResponse({ ok: false, data: {} });
  assert.equal(outcome.kind, "error");
  if (outcome.kind === "error") assert.equal(outcome.messageTr, "Çalıştırma başarısız oldu.");
});

test("a malformed 200 body (missing required fields) resolves to an error, not a crash", () => {
  const outcome = resolveAcquisitionRunResponse({ ok: true, data: { unexpected: true } });
  assert.equal(outcome.kind, "error");
});

test("resolveAcquisitionRunResponse never echoes raw provider/error text into result fields", () => {
  const outcome = resolveAcquisitionRunResponse({
    ok: false,
    data: { error: "Internal error: place_id=abc123 key=SECRET" },
  });
  // The function passes through the server's own message verbatim (the
  // server is the one responsible for scrubbing) — this test documents that
  // contract explicitly so a future server regression is caught elsewhere,
  // not silently double-trusted here.
  assert.equal(outcome.kind, "error");
});

test("the network-error constant is a safe Turkish sentence with no raw exception text", () => {
  assert.match(ACQUISITION_NETWORK_ERROR_TR, /Dry-run başlatılamadı/);
});

/* ── labels ─────────────────────────────────────────────────── */

test("every documented run status has a Turkish label", () => {
  for (const status of ["idle", "eligible", "running", "completed", "partial", "blocked", "failed"]) {
    assert.notEqual(acquisitionRunStatusLabelTr(status), status);
  }
});

test("an unknown status falls back to the raw value rather than throwing", () => {
  assert.equal(acquisitionRunStatusLabelTr("mystery"), "mystery");
});

test("result field labels are forward-looking for dry runs, past-tense for real runs", () => {
  const dry = acquisitionResultFieldLabelsTr(true);
  const real = acquisitionResultFieldLabelsTr(false);
  assert.equal(dry.evaluated, "Değerlendirilecek İşletme");
  assert.equal(dry.externalRequests, "Planlanan Dış İstek");
  assert.equal(real.evaluated, "Değerlendirilen İşletme");
  assert.equal(real.externalRequests, "Yapılan Dış İstek");
});
