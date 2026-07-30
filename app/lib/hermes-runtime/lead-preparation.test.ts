import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  computeLeadPreparation,
  evaluateDraftStaleness,
  type LeadPreparationInput,
} from "./lead-preparation.ts";
import { buildPersonalizationEvidence, computeEvidenceFingerprint } from "../outreach/evidence.ts";
import { emptyMessageWorkspace } from "../outreach/workspace.ts";
import type { LeadMessageWorkspaceState, PersistedOutreachDraft } from "../outreach/workspace.ts";

const NOW_ISO = "2026-07-29T09:00:00.000Z";

function baseInput(overrides: Partial<LeadPreparationInput["lead"]> = {}): LeadPreparationInput {
  return {
    leadId: "gmaps-abc",
    lead: {
      hasOwnWebsite: true,
      websiteIntelligence: { hasWhatsAppLink: true },
      whatsappConfidence: "confirmed",
      ...overrides,
    },
    workspace: undefined,
  };
}

function workspaceWithDraft(draft: Partial<PersistedOutreachDraft>): LeadMessageWorkspaceState {
  const base = emptyMessageWorkspace();
  return {
    ...base,
    drafts: {
      soft: {
        tone: "soft",
        message: "Merhaba, bir sorum olacaktı.",
        source: "provider",
        updatedAt: NOW_ISO,
        generatedAt: NOW_ISO,
        copyVersion: 6,
        ...draft,
      },
    },
  };
}

describe("computeLeadPreparation — status", () => {
  test("1. zero evidence -> needs_research", () => {
    const result = computeLeadPreparation(
      baseInput({ hasOwnWebsite: false, websiteIntelligence: null, hasInstagram: false }),
    );
    assert.equal(result.status, "needs_research");
    assert.ok(result.blockers.some((b) => b.code === "NO_USABLE_EVIDENCE"));
  });

  test("2. evidence + no draft -> needs_draft", () => {
    const result = computeLeadPreparation(baseInput());
    assert.equal(result.status, "needs_draft");
    assert.ok(result.blockers.some((b) => b.code === "NO_CURRENT_DRAFT"));
  });

  test("3. evidence + current draft + verified WhatsApp -> ready", () => {
    const input = baseInput();
    const pack = buildPersonalizationEvidence({
      hasOwnWebsite: true,
      websiteIntelligence: { hasWhatsAppLink: true },
    });
    const fp = computeEvidenceFingerprint(pack);
    input.workspace = workspaceWithDraft({ evidenceFingerprint: fp });
    const result = computeLeadPreparation(input);
    assert.equal(result.status, "ready");
    assert.deepEqual(result.blockers, []);
  });

  test("4. no verified WhatsApp -> needs_channel", () => {
    const result = computeLeadPreparation(baseInput({ whatsappConfidence: "weak" }));
    assert.equal(result.status, "needs_channel");
    assert.ok(result.blockers.some((b) => b.code === "NO_VERIFIED_WHATSAPP"));
  });

  test("5. copyVersion stale -> DRAFT_VERSION_STALE / draft_stale", () => {
    const input = baseInput();
    const pack = buildPersonalizationEvidence({
      hasOwnWebsite: true,
      websiteIntelligence: { hasWhatsAppLink: true },
    });
    const fp = computeEvidenceFingerprint(pack);
    input.workspace = workspaceWithDraft({ evidenceFingerprint: fp, copyVersion: 3 });
    const result = computeLeadPreparation(input);
    assert.equal(result.status, "draft_stale");
    assert.ok(result.blockers.some((b) => b.code === "DRAFT_VERSION_STALE"));
    assert.equal(
      result.blockers.find((b) => b.code === "DRAFT_VERSION_STALE")?.severity,
      "warning",
    );
  });

  test("6. evidence fingerprint mismatch -> DRAFT_EVIDENCE_STALE / review_required", () => {
    const input = baseInput();
    input.workspace = workspaceWithDraft({ evidenceFingerprint: "stale-fingerprint-000000" });
    const result = computeLeadPreparation(input);
    assert.equal(result.status, "review_required");
    assert.ok(result.blockers.some((b) => b.code === "DRAFT_EVIDENCE_STALE"));
    assert.equal(
      result.blockers.find((b) => b.code === "DRAFT_EVIDENCE_STALE")?.severity,
      "blocking",
    );
  });

  test("7. blocker order is deterministic across repeated calls", () => {
    const input = baseInput({ whatsappConfidence: "none", hasOwnWebsite: false, websiteIntelligence: null });
    const a = computeLeadPreparation(input).blockers.map((b) => b.code);
    const b = computeLeadPreparation(input).blockers.map((b) => b.code);
    assert.deepEqual(a, b);
    assert.deepEqual(a, ["NO_VERIFIED_WHATSAPP", "NO_USABLE_EVIDENCE"]);
  });

  test("8. no duplicate blocker codes", () => {
    const input = baseInput({ whatsappConfidence: "none", hasOwnWebsite: false, websiteIntelligence: null });
    const codes = computeLeadPreparation(input).blockers.map((b) => b.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  test("9. sourceRefs are grounded (reference the lead id and real fields)", () => {
    const input = baseInput({ whatsappConfidence: "none" });
    const result = computeLeadPreparation(input);
    for (const blocker of result.blockers) {
      assert.ok(blocker.sourceRefs.length > 0, blocker.code);
      for (const ref of blocker.sourceRefs) {
        assert.ok(ref.includes(input.leadId) || ref.startsWith("evidenceFingerprint:"), ref);
      }
    }
  });

  test("10. an open (non-terminal) evidence gap on a lead with evidence but no channel still reports needs_channel, not needs_research", () => {
    const result = computeLeadPreparation(
      baseInput({ whatsappConfidence: "none", hasOwnWebsite: true, websiteIntelligence: { hasWhatsAppLink: true } }),
    );
    assert.equal(result.status, "needs_channel");
  });
});

describe("evaluateDraftStaleness — backward compatibility (v1 fallback)", () => {
  const draftNoFingerprint: PersistedOutreachDraft = {
    tone: "soft",
    message: "Merhaba",
    source: "provider",
    updatedAt: NOW_ISO,
    generatedAt: "2026-07-01T00:00:00.000Z",
  };

  test("11. no fingerprint + re-enriched since generation -> stale (fallback path)", () => {
    const result = evaluateDraftStaleness(
      draftNoFingerprint,
      "irrelevant",
      Date.parse("2026-07-15T00:00:00.000Z"),
    );
    assert.equal(result.stale, true);
    assert.equal(result.reason, "reenriched_since_generation");
  });

  test("12. no fingerprint + no re-enrichment since generation -> not blindly invalidated", () => {
    const result = evaluateDraftStaleness(
      draftNoFingerprint,
      "irrelevant",
      Date.parse("2026-06-01T00:00:00.000Z"),
    );
    assert.equal(result.stale, false);
    assert.equal(result.reason, "not_applicable");
  });

  test("13. no fingerprint + no lastEnrichedAt at all -> not blindly invalidated", () => {
    const result = evaluateDraftStaleness(draftNoFingerprint, "irrelevant", null);
    assert.equal(result.stale, false);
    assert.equal(result.reason, "not_applicable");
  });

  test("14. a matching fingerprint always wins over the timestamp fallback", () => {
    const draft: PersistedOutreachDraft = { ...draftNoFingerprint, evidenceFingerprint: "abc123" };
    const result = evaluateDraftStaleness(draft, "abc123", Date.parse("2026-07-28T00:00:00.000Z"));
    assert.equal(result.stale, false);
    assert.equal(result.reason, "current");
  });

  test("15. no draft at all -> not_applicable, never stale", () => {
    const result = evaluateDraftStaleness(undefined, "abc123", Date.now());
    assert.equal(result.stale, false);
    assert.equal(result.reason, "not_applicable");
  });
});

describe("checks", () => {
  test("16. websiteEvidence is true only when a non-instagram/ota evidence item exists", () => {
    const withWebsite = computeLeadPreparation(
      baseInput({ hasOwnWebsite: true, websiteIntelligence: { hasWhatsAppLink: true }, hasInstagram: false }),
    );
    assert.equal(withWebsite.checks.websiteEvidence, true);

    const instagramOnly = computeLeadPreparation(
      baseInput({ hasOwnWebsite: false, websiteIntelligence: null, hasInstagram: true }),
    );
    assert.equal(instagramOnly.checks.websiteEvidence, false);
    assert.equal(instagramOnly.checks.usableEvidence, true);
  });

  test("17. instagramKnown / otaKnown reflect confirmed-or-likely confidence", () => {
    const result = computeLeadPreparation(
      baseInput({ instagramConfidence: "confirmed", otaConfidence: "weak" }),
    );
    assert.equal(result.checks.instagramKnown, true);
    assert.equal(result.checks.otaKnown, false);
  });

  test("18. evidenceFingerprint on the assessment matches computeEvidenceFingerprint of the same pack", () => {
    const lead = { hasOwnWebsite: true, websiteIntelligence: { hasWhatsAppLink: true } };
    const result = computeLeadPreparation(baseInput(lead));
    const expected = computeEvidenceFingerprint(
      buildPersonalizationEvidence({ hasOwnWebsite: lead.hasOwnWebsite, websiteIntelligence: lead.websiteIntelligence }),
    );
    assert.equal(result.evidenceFingerprint, expected);
  });
});
