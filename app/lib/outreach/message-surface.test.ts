/**
 * Guards the single-message-surface rule.
 *
 * The lead drawer once carried an Operation Guide that displayed the draft and
 * a separate "Mesaj Çalışma Alanı" section that edited it. Two surfaces for one
 * message is easy to reintroduce — a component gets a heading back, a "open in
 * workspace" button reappears — and hard to notice in review, because both
 * halves work. These assertions read the source and fail if it happens.
 *
 * Source-level rather than render-level: the drawer has no test renderer here,
 * and the thing worth protecting is structural.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const componentsDir = fileURLToPath(new URL("../../components/", import.meta.url));

function read(file: string): string {
  return readFileSync(`${componentsDir}${file}`, "utf8");
}

/**
 * Source with comments removed.
 *
 * The comments explaining *why* the separate surface was removed necessarily
 * name it, so a naive substring search would flag the documentation as the
 * defect. Only what actually renders is checked.
 */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("single message surface", () => {
  it("has no standalone message workspace component", () => {
    assert.equal(
      existsSync(`${componentsDir}LeadMessageWorkspace.tsx`),
      false,
      "the separate workspace section must stay removed",
    );
    assert.equal(existsSync(`${componentsDir}LeadMessageEditor.tsx`), true);
  });

  it("renders no separate workspace section in the lead drawer", () => {
    const dashboard = code("Dashboard.tsx");
    assert.ok(
      !dashboard.includes("<LeadMessageWorkspace"),
      "the drawer must not mount a second message surface",
    );
    assert.ok(
      !dashboard.includes("Mesajı Çalışma Alanında Aç"),
      "the hand-off button belongs to the removed surface",
    );
    assert.ok(
      !/Mesaj [Çç]alışma [Aa]lanı/.test(dashboard),
      "no 'Mesaj Çalışma Alanı' heading may remain",
    );
  });

  it("keeps the editor chrome-free so it can live inside another card", () => {
    const editor = code("LeadMessageEditor.tsx");
    assert.ok(
      !/Mesaj [Çç]alışma [Aa]lanı/.test(editor),
      "the editor must not render its own section heading",
    );
    assert.ok(
      !editor.includes('variant === "section"'),
      "the section/modal split belonged to the standalone surface",
    );
  });

  it("keeps the shared hook, persistence and engine intact", () => {
    const editor = read("LeadMessageEditor.tsx");
    assert.ok(editor.includes("export function useLeadMessageWorkspace"));
    assert.ok(editor.includes("patchMessageWorkspace"));
    assert.ok(editor.includes("generateOutreachStylePack"));
    assert.ok(editor.includes("applyManualDraft"));
    assert.ok(editor.includes("applyGeneratedDrafts"));
  });

  it("renders the editor inline inside the Operation Guide", () => {
    const dashboard = read("Dashboard.tsx");
    assert.ok(dashboard.includes("<LeadMessageEditor"));
    assert.ok(
      dashboard.includes('actionsLabel={tr ? "Hızlı Aksiyonlar" : "Quick Actions"}'),
      "the guide keeps its Hızlı Aksiyonlar section",
    );
  });

  it("keeps the Operation Guide's card wrapper and section labels", () => {
    const dashboard = read("Dashboard.tsx");
    for (const marker of [
      'className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-3"',
      '{tr ? "Operasyon Rehberi" : "Operation Guide"}',
      '{tr ? "Önerilen Kanal" : "Channel"}',
      '{tr ? "Bugünkü Aksiyon" : "Today\'s Action"}',
      '{tr ? "Önerilen Mesaj" : "Suggested Message"}',
    ]) {
      assert.ok(dashboard.includes(marker), `missing: ${marker}`);
    }
  });

  it("still accepts the legacy panel=message deep link", () => {
    assert.ok(read("Dashboard.tsx").includes('params.get("panel") === "message"'));
    assert.ok(read("FollowUpsPage.tsx").includes("panel=message"));
  });

  it("sends nothing automatically", () => {
    const editor = read("LeadMessageEditor.tsx");
    assert.ok(!/graph\.facebook\.com|messages\/send|autoSend/i.test(editor));
    assert.ok(editor.includes('window.open(waLink, "_blank")'));
  });
});
