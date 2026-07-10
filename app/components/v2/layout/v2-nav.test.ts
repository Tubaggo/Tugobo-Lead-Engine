import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_NAV_SCREENS, founderVisibleNavEntries, V2_NAV, navEntryIdForScreen } from "./v2-nav.ts";

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
  // v8.4 — Developer Panel Organization reordered the same 13 screens into
  // logical sections; the set itself is unchanged.
  assert.deepEqual(
    developer.items!.map((i) => i.screen).sort(),
    [
      "command-center",
      "communication-intelligence",
      "data-sources",
      "follow-ups",
      "icp-analysis",
      "lead-import",
      "lead-list",
      "revenue-analytics",
      "revenue-forecast",
      "revenue-pipeline",
      "revenue-queue",
      "revenue-recovery",
      "revenue-risk",
    ],
  );
});

// v8.4 — Developer Panel Organization: every Developer screen belongs to a
// named logical section, and sections are contiguous (the sidebar renders a
// header exactly once per group).
test("v8.4: every developer item carries a section, in contiguous logical groups", () => {
  const developer = V2_NAV.find((e) => e.id === "developer")!;
  for (const item of developer.items!) {
    assert.ok(item.section && item.section.length > 0, `${item.screen} must have a section`);
  }
  const seen: string[] = [];
  for (const item of developer.items!) {
    const section = item.section!;
    if (seen[seen.length - 1] !== section) {
      assert.ok(!seen.includes(section), `section "${section}" must be contiguous`);
      seen.push(section);
    }
  }
  assert.deepEqual(seen, ["Gelir", "Operasyon", "Lead", "Veri"]);
});

// v8.4 — the Hermes entry (the founder's only entry) never carries a section.
test("v8.4: founder-facing Hermes entry has no developer grouping", () => {
  const hermes = V2_NAV.find((e) => e.id === "hermes")!;
  assert.equal(hermes.items, undefined);
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

// v8.1.1 — Hide Developer Navigation: the sidebar renders only Hermes by
// default; Developer (and everything under it, including Lead Import)
// appears only once Developer Mode is explicitly ON.
test("v8.1.1: sidebar only renders Hermes when Developer Mode is off (default)", () => {
  const visible = founderVisibleNavEntries(false);
  assert.deepEqual(visible.map((e) => e.id), ["hermes"]);
});

test("v8.1.1: developer is hidden by default", () => {
  const visible = founderVisibleNavEntries(false);
  assert.ok(!visible.some((e) => e.id === "developer"));
});

test("v8.1.1: developer becomes visible only when developer mode is on, with every legacy screen intact", () => {
  const visible = founderVisibleNavEntries(true);
  assert.deepEqual(visible.map((e) => e.id), ["hermes", "developer"]);
  const developer = visible.find((e) => e.id === "developer")!;
  assert.equal(developer.items!.length, 13);
});

test("v8.1.1: lead import is not visible when developer mode is off", () => {
  const visible = founderVisibleNavEntries(false);
  const reachableScreens = visible.flatMap((e) => [
    ...(e.screen ? [e.screen] : []),
    ...(e.items ? e.items.map((i) => i.screen) : []),
  ]);
  assert.ok(!reachableScreens.includes("lead-import"));
});

test("v8.1.1: hermes badge is preserved regardless of developer mode", () => {
  for (const developerMode of [false, true]) {
    const badged = founderVisibleNavEntries(developerMode).filter((e) => e.showsPendingDecisionBadge);
    assert.equal(badged.length, 1);
    assert.equal(badged[0]!.id, "hermes");
  }
  // Developer itself never carries a badge, in either mode.
  const developerInDevMode = founderVisibleNavEntries(true).find((e) => e.id === "developer")!;
  assert.equal(developerInDevMode.showsPendingDecisionBadge, undefined);
});

test("v8.1.1: no runtime removed — V2_NAV and ALL_NAV_SCREENS are untouched by the visibility filter", () => {
  // founderVisibleNavEntries only ever narrows what's rendered; the
  // underlying data — every screen, every runtime — stays exactly as before.
  assert.equal(V2_NAV.length, 2);
  assert.equal(ALL_NAV_SCREENS.length, 14);
  assert.ok(ALL_NAV_SCREENS.includes("lead-import"));
  assert.ok(ALL_NAV_SCREENS.includes("revenue-pipeline"));
});

test("v8.1.1: navigation migration still works — legacy 'automation-center' still resolves away regardless of developer mode", () => {
  for (const developerMode of [false, true]) {
    const visible = founderVisibleNavEntries(developerMode);
    const reachableScreens = visible.flatMap((e) => [
      ...(e.screen ? [e.screen] : []),
      ...(e.items ? e.items.map((i) => i.screen) : []),
    ]);
    assert.ok(!(reachableScreens as string[]).includes("automation-center"));
  }
});
