import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_ACQUISITION_FOUNDER_LABELS,
  computeHermesAcquisitionFounderView,
  type AcquisitionStatusLike,
} from "./hermes-acquisition-founder-adapter.ts";
import { findForbiddenFounderTerm } from "../founder-language.ts";

function status(overrides: Partial<AcquisitionStatusLike> = {}): AcquisitionStatusLike {
  return {
    configOk: true,
    enabled: true,
    dryRun: false,
    running: false,
    lastScanAt: null,
    today: {
      evaluatedToday: 0,
      importedToday: 0,
      duplicatesToday: 0,
      missionCandidatesToday: 0,
      runsToday: 0,
    },
    ...overrides,
  };
}

test("no status at all renders the not-enabled empty state", () => {
  const view = computeHermesAcquisitionFounderView(null);
  assert.equal(view.statusLineTr, "Fırsat taraması henüz etkin değil.");
  assert.equal(view.lastScanAt, null);
  assert.equal(view.needsAttention, false);
});

test("running state renders the scanning line", () => {
  const view = computeHermesAcquisitionFounderView(status({ running: true }));
  assert.equal(view.statusLineTr, "Hermes fırsatları tarıyor.");
});

test("disabled acquisition renders the not-enabled line", () => {
  const view = computeHermesAcquisitionFounderView(status({ enabled: false }));
  assert.equal(view.statusLineTr, "Fırsat taraması henüz etkin değil.");
});

test("broken config renders Kontrol Gerekli copy and flags attention — never the technical note", () => {
  const view = computeHermesAcquisitionFounderView(status({ configOk: false }));
  assert.equal(view.statusLineTr, "Tarama yapılandırması kontrol gerektiriyor.");
  assert.equal(view.needsAttention, true);
});

test("completed day renders real counters as founder sentences", () => {
  const view = computeHermesAcquisitionFounderView(
    status({
      lastScanAt: 1_780_000_000_000,
      today: {
        evaluatedToday: 24,
        importedToday: 8,
        duplicatesToday: 3,
        missionCandidatesToday: 4,
        runsToday: 2,
      },
    }),
  );
  assert.equal(view.statusLineTr, "Hermes bugün 24 işletmeyi değerlendirdi.");
  assert.ok(view.detailLinesTr.includes("8 yeni fırsat bulundu."));
  assert.ok(view.detailLinesTr.includes("4 satış işi kararını bekliyor."));
  assert.ok(view.detailLinesTr.some((l) => l.includes("zaten listede")));
  assert.equal(view.lastScanAt, 1_780_000_000_000);
  assert.equal(view.counters.evaluatedToday, 24);
});

test("blocked run surfaces its founder-safe blocking reason", () => {
  const view = computeHermesAcquisitionFounderView(
    status({ lastRunBlockingReasons: ["Bugün için tarama limiti tamamlandı."] }),
  );
  assert.equal(view.statusLineTr, "Bugün için tarama limiti tamamlandı.");
});

test("enabled but quiet day falls back to the ready line", () => {
  const view = computeHermesAcquisitionFounderView(status());
  assert.equal(view.statusLineTr, HERMES_ACQUISITION_FOUNDER_LABELS.readyForScheduled);
});

test("no founder copy this adapter can emit contains a forbidden technical term", () => {
  const views = [
    computeHermesAcquisitionFounderView(null),
    computeHermesAcquisitionFounderView(status({ running: true })),
    computeHermesAcquisitionFounderView(status({ enabled: false })),
    computeHermesAcquisitionFounderView(status({ configOk: false })),
    computeHermesAcquisitionFounderView(
      status({
        today: {
          evaluatedToday: 24,
          importedToday: 8,
          duplicatesToday: 3,
          missionCandidatesToday: 4,
          runsToday: 2,
        },
      }),
    ),
  ];
  for (const view of views) {
    for (const text of [view.statusLineTr, ...view.detailLinesTr]) {
      assert.equal(findForbiddenFounderTerm(text), null, `forbidden term in: ${text}`);
    }
  }
  for (const label of Object.values(HERMES_ACQUISITION_FOUNDER_LABELS.sectionCounters)) {
    assert.equal(findForbiddenFounderTerm(label), null);
  }
});
