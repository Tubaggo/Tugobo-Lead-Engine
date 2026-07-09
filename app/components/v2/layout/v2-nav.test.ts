import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_NAV_SCREENS, V2_NAV, navEntryIdForScreen } from "./v2-nav.ts";

// v8.0.1 acceptance: the founder sidebar is exactly two top-level entries.
test("v8.0.1 IA: exactly two top-level entries, in founder order", () => {
  assert.deepEqual(
    V2_NAV.map((e) => e.id),
    ["hermes", "developer"],
  );
  assert.deepEqual(
    V2_NAV.map((e) => e.label),
    ["Hermes", "Developer"],
  );
});

test("v8.0.1 IA: the badge exists only on Hermes", () => {
  const badged = V2_NAV.filter((e) => e.showsPendingDecisionBadge);
  assert.equal(badged.length, 1);
  assert.equal(badged[0]!.id, "hermes");
});

test("v8.0.1 IA: Hermes is the single direct entry point; Developer is a group", () => {
  const hermes = V2_NAV[0]!;
  assert.equal(hermes.screen, "hermes");
  assert.equal(hermes.items, undefined);

  for (const entry of V2_NAV.slice(1)) {
    assert.equal(entry.screen, undefined, `${entry.id} must not be a direct screen`);
    assert.ok((entry.items?.length ?? 0) > 0, `${entry.id} must contain screens`);
  }
});

test("v8.0.1 IA: only Developer is muted", () => {
  assert.deepEqual(
    V2_NAV.filter((e) => e.muted).map((e) => e.id),
    ["developer"],
  );
});

test("v8.0.1 IA: Developer keeps every legacy dashboard + former Gelir/Ayarlar screen — nothing deleted", () => {
  const developer = V2_NAV.find((e) => e.id === "developer")!;
  assert.deepEqual(
    developer.items!.map((i) => i.screen),
    [
      "revenue-pipeline",
      "revenue-forecast",
      "revenue-risk",
      "revenue-recovery",
      "revenue-analytics",
      "data-sources",
      "lead-import",
      "command-center",
      "revenue-queue",
      "follow-ups",
      "lead-list",
      "icp-analysis",
      "communication-intelligence",
    ],
  );
});

test("v8.0.1 IA: all 14 screens reachable exactly once; automation-center is gone", () => {
  assert.equal(ALL_NAV_SCREENS.length, 14);
  assert.equal(new Set(ALL_NAV_SCREENS).size, 14);
  assert.ok(ALL_NAV_SCREENS.includes("hermes"));
  assert.ok(!(ALL_NAV_SCREENS as string[]).includes("automation-center"));
});

// v8.1: Hermes Autonomous Lead Intake demotes manual Lead Import to a
// Developer-only fallback — this pins that contract explicitly.
test("v8.1: Lead Import is reachable only under Developer, never top-level", () => {
  assert.equal(navEntryIdForScreen("lead-import"), "developer");
  const developer = V2_NAV.find((e) => e.id === "developer")!;
  assert.ok(developer.items!.some((i) => i.screen === "lead-import"));
  assert.ok(!V2_NAV.some((e) => e.screen === "lead-import"));
});

test("navEntryIdForScreen resolves each screen to its owning top-level entry", () => {
  assert.equal(navEntryIdForScreen("hermes"), "hermes");
  assert.equal(navEntryIdForScreen("revenue-forecast"), "developer");
  assert.equal(navEntryIdForScreen("data-sources"), "developer");
  assert.equal(navEntryIdForScreen("lead-list"), "developer");
  assert.equal(navEntryIdForScreen("command-center"), "developer");
});
