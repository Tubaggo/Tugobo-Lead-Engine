import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FOLLOW_UPS_HREF,
  OPERATION_TARGETS,
  isOperationNavKey,
  resolveFounderCommandDestination,
  resolveOperationTarget,
  type FounderCommandPriority,
  type OperationNavKey,
  type OperationSectionId,
} from "./operation-navigation.ts";

/**
 * Canonical section anchors that actually exist on the dashboard (mirrors the
 * ids rendered from SectionNavigationRail.SECTION_NAV_DEFS). Every navigation
 * target must land on one of these — no dangling anchors.
 */
const VALID_SECTION_IDS: readonly OperationSectionId[] = [
  "tum-leadler",
  "satis-boru-hatti",
  "bugunun-firsatlari",
  "satis-plani",
  "lead-havuzu",
];

const ALL_KEYS: readonly OperationNavKey[] = [
  "critical",
  "activeLeads",
  "dailyTarget",
  "queueRate",
  "contacted",
  "followUpClosed",
  "demoPlanned",
  "won",
  "closeFollowUps",
  "engageHot",
  "advanceDemo",
  "generateNew",
];

describe("operation-navigation — KPI card targets", () => {
  it("1. critical KPI navigates to the leads table", () => {
    assert.equal(resolveOperationTarget("critical").sectionId, "tum-leadler");
    assert.equal(resolveOperationTarget("critical").openAllLeads, true);
  });

  it("2. active lead KPI navigates to the leads table with no status filter", () => {
    const t = resolveOperationTarget("activeLeads");
    assert.equal(t.sectionId, "tum-leadler");
    assert.equal(t.statusFilter, "all");
    assert.equal(t.timeFilter, "all_time");
  });

  it("3. queue KPI navigates to today's opportunities section", () => {
    assert.equal(resolveOperationTarget("queueRate").sectionId, "bugunun-firsatlari");
  });

  it("4. contacted KPI applies the contacted status filter", () => {
    assert.equal(resolveOperationTarget("contacted").statusFilter, "contacted");
  });

  it("5. follow-up-closed KPI applies the replied status filter", () => {
    assert.equal(resolveOperationTarget("followUpClosed").statusFilter, "replied");
  });

  it("6. demo KPI applies the meeting status filter", () => {
    assert.equal(resolveOperationTarget("demoPlanned").statusFilter, "meeting");
  });

  it("7. won KPI applies the won status filter", () => {
    assert.equal(resolveOperationTarget("won").statusFilter, "won");
  });

  it("13. daily-target KPI links to the sales plan section", () => {
    const t = resolveOperationTarget("dailyTarget");
    assert.equal(t.sectionId, "satis-plani");
    assert.equal(t.openAllLeads, undefined);
  });
});

describe("operation-navigation — operation flow targets", () => {
  it("8. 'Sıcak Fırsatları İşle' opens the exact HOT_NOW list", () => {
    const t = resolveOperationTarget("engageHot");
    assert.equal(t.sectionId, "tum-leadler");
    assert.equal(t.openAllLeads, true);
    // Exact parity: driven by the operational selector, NOT a hotScore/tab approx.
    assert.equal(t.operationFilter, "hot_now");
    assert.equal(t.tab, undefined);
    assert.equal(t.statusFilter, undefined);
    assert.equal(t.timeFilter, undefined);
  });

  it("10. 'Takipleri Kapat' opens overdue/due follow-ups", () => {
    const t = resolveOperationTarget("closeFollowUps");
    assert.equal(t.sectionId, "tum-leadler");
    assert.equal(t.timeFilter, "follow_up");
  });

  it("11. 'Demo Adaylarını İlerlet' opens the pipeline demo stage", () => {
    assert.equal(resolveOperationTarget("advanceDemo").sectionId, "satis-boru-hatti");
  });

  it("11b. 'Demo Adaylarını İlerlet' never falls back to Lead Havuzu", () => {
    // Even at 0 demo candidates the target is the pipeline (which renders its
    // own empty state) — it must not resolve to the lead pool.
    const t = resolveOperationTarget("advanceDemo");
    assert.notEqual(t.sectionId, "lead-havuzu");
    // Section jump only — no table filter that could redirect the landing.
    assert.equal(t.openAllLeads, undefined);
    assert.equal(t.operationFilter, undefined);
  });

  it("12. 'Yeni Fırsat Üret' opens the lead pool / import", () => {
    assert.equal(resolveOperationTarget("generateNew").sectionId, "lead-havuzu");
  });

  it("12b. demo and generate-new are distinct, non-colliding targets", () => {
    assert.notEqual(
      resolveOperationTarget("advanceDemo").sectionId,
      resolveOperationTarget("generateNew").sectionId,
    );
  });
});

describe("operation-navigation — count/selector consistency", () => {
  /**
   * The progress-strip counts are computed as `status === X`. Their navigation
   * target must filter the table with the SAME status, so the number on the
   * card equals the number of rows in the destination (single selector).
   */
  it("9. progress KPIs and their targets share one status selector", () => {
    assert.equal(resolveOperationTarget("contacted").statusFilter, "contacted");
    assert.equal(resolveOperationTarget("followUpClosed").statusFilter, "replied");
    assert.equal(resolveOperationTarget("demoPlanned").statusFilter, "meeting");
    assert.equal(resolveOperationTarget("won").statusFilter, "won");
  });

  it("status-bound targets never restrict by time window (would drop rows)", () => {
    for (const key of ["contacted", "followUpClosed", "demoPlanned", "won"] as const) {
      assert.equal(
        resolveOperationTarget(key).timeFilter,
        "all_time",
        `${key} must not hide rows behind a time filter`,
      );
    }
  });
});

describe("operation-navigation — contract integrity", () => {
  it("every nav key resolves to a valid existing section", () => {
    for (const key of ALL_KEYS) {
      const target = resolveOperationTarget(key);
      assert.ok(
        VALID_SECTION_IDS.includes(target.sectionId),
        `${key} → unknown section ${target.sectionId}`,
      );
    }
  });

  it("table targets always carry a concrete filter, section targets never do", () => {
    for (const key of ALL_KEYS) {
      const t = resolveOperationTarget(key);
      const hasFilter =
        t.timeFilter !== undefined ||
        t.statusFilter !== undefined ||
        t.tab !== undefined ||
        t.operationFilter !== undefined;
      if (t.openAllLeads) {
        assert.ok(hasFilter, `${key} opens the table but binds no filter`);
      } else {
        assert.ok(!hasFilter, `${key} is a section jump but carries table filters`);
      }
    }
  });

  it("only engageHot carries the exact hot_now operational filter", () => {
    for (const key of ALL_KEYS) {
      const expected = key === "engageHot" ? "hot_now" : undefined;
      assert.equal(resolveOperationTarget(key).operationFilter, expected);
    }
  });

  it("OPERATION_TARGETS covers exactly the known key set", () => {
    assert.deepEqual(
      Object.keys(OPERATION_TARGETS).sort(),
      [...ALL_KEYS].sort(),
    );
  });

  it("isOperationNavKey guards untrusted input", () => {
    assert.equal(isOperationNavKey("engageHot"), true);
    assert.equal(isOperationNavKey("nope"), false);
    assert.equal(isOperationNavKey(42), false);
    assert.equal(isOperationNavKey(undefined), false);
  });

  it("unknown keys fall back to a safe active-leads target", () => {
    // @ts-expect-error — exercising the runtime fallback for an invalid key.
    const t = resolveOperationTarget("bogus");
    assert.equal(t.sectionId, "tum-leadler");
  });
});

/**
 * v3.9.1 — Founder Command Center primary-command destination.
 *
 * `resolveFounderCommandDestination` is keyed off the structured priority
 * `computeFounderCommand` already produces (Dashboard.tsx), not off the
 * `command` copy string — these tests pin priority → destination, not wording.
 */
describe("operation-navigation — Founder Command Center destination", () => {
  const ALL_PRIORITIES: readonly FounderCommandPriority[] = [1, 2, 3, 4, 5];

  it("1. priority 1 (follow-up due) opens Takipler, not an in-page section", () => {
    const d = resolveFounderCommandDestination(1);
    assert.equal(d.kind, "href");
    assert.equal(d.kind === "href" ? d.href : null, FOLLOW_UPS_HREF);
  });

  it("2. priority 2 (hot now) opens the Hot Leads section", () => {
    const d = resolveFounderCommandDestination(2);
    assert.equal(d.kind, "section");
    assert.equal(d.kind === "section" ? d.sectionId : null, "sicak-leadler");
  });

  it("3. priority 3 (demo ready) opens the Sales Pipeline section", () => {
    const d = resolveFounderCommandDestination(3);
    assert.equal(d.kind, "section");
    assert.equal(d.kind === "section" ? d.sectionId : null, "satis-boru-hatti");
  });

  it("4. priority 4 (recovery) opens the Revenue & Risk section", () => {
    const d = resolveFounderCommandDestination(4);
    assert.equal(d.kind, "section");
    assert.equal(d.kind === "section" ? d.sectionId : null, "gelir-risk");
  });

  it("5. priority 5 (pipeline low) opens the Lead Pool section", () => {
    const d = resolveFounderCommandDestination(5);
    assert.equal(d.kind, "section");
    assert.equal(d.kind === "section" ? d.sectionId : null, "lead-havuzu");
  });

  it("6. every priority resolves to a distinct, real destination — no dangling target", () => {
    const REAL_SECTION_IDS = [
      "tum-leadler",
      "satis-boru-hatti",
      "bugunun-firsatlari",
      "satis-plani",
      "lead-havuzu",
      "sicak-leadler",
      "gelir-risk",
    ];
    for (const p of ALL_PRIORITIES) {
      const d = resolveFounderCommandDestination(p);
      if (d.kind === "href") {
        assert.equal(d.href, FOLLOW_UPS_HREF);
      } else {
        assert.ok(
          REAL_SECTION_IDS.includes(d.sectionId),
          `priority ${p} → unknown section ${d.sectionId}`,
        );
      }
    }
  });

  it("7. resolution is a pure function of priority — same input, same output", () => {
    for (const p of ALL_PRIORITIES) {
      assert.deepEqual(resolveFounderCommandDestination(p), resolveFounderCommandDestination(p));
    }
  });
});
