import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyGeneratedDrafts,
  applyManualDraft,
  clampWorkspaceMessage,
  emptyMessageWorkspace,
  MAX_RECENT_MESSAGES,
  MAX_WORKSPACE_MESSAGE_LENGTH,
  mergeMessageWorkspace,
  messageWorkspaceGuard,
  normalizeMessageWorkspace,
  parseMessageWorkspace,
  previousWorkspaceMessages,
  withActiveTone,
  workspaceActivityCarriesMessage,
  workspaceActivityType,
  type GeneratedDraftInput,
  type LeadMessageWorkspaceState,
} from "./workspace.ts";

const NOW = "2026-07-22T09:00:00.000Z";
const LATER = "2026-07-22T10:00:00.000Z";

function pack(prefix: string): GeneratedDraftInput[] {
  return [
    {
      tone: "soft",
      message: `${prefix} soft`,
      source: "provider",
      variationAngle: "Rezervasyon akışı",
    },
    { tone: "direct", message: `${prefix} direct`, source: "provider" },
    { tone: "consultative", message: `${prefix} consultative`, source: "fallback" },
  ];
}

function generated(
  state: LeadMessageWorkspaceState,
  prefix: string,
  activeTone: "soft" | "direct" | "consultative" = "soft",
  now = NOW,
): LeadMessageWorkspaceState {
  return applyGeneratedDrafts(state, { entries: pack(prefix), activeTone, now });
}

/* -------------------------------------------------------------------------- */
/* generation                                                                 */
/* -------------------------------------------------------------------------- */

describe("applyGeneratedDrafts", () => {
  it("stores one draft per tone with its source and angle", () => {
    const state = generated(emptyMessageWorkspace(), "v1");

    assert.equal(state.drafts.soft?.message, "v1 soft");
    assert.equal(state.drafts.soft?.source, "provider");
    assert.equal(state.drafts.soft?.variationAngle, "Rezervasyon akışı");
    assert.equal(state.drafts.consultative?.source, "fallback");
    assert.equal(state.drafts.soft?.generatedAt, NOW);
  });

  it("keeps tone drafts independent", () => {
    let state = generated(emptyMessageWorkspace(), "v1");
    state = applyManualDraft(state, "direct", "elle yazılmış", LATER);

    assert.equal(state.drafts.direct?.message, "elle yazılmış");
    assert.equal(state.drafts.soft?.message, "v1 soft");
    assert.equal(state.drafts.consultative?.message, "v1 consultative");
  });

  it("keeps the previous draft of the active tone in history after a regenerate", () => {
    let state = generated(emptyMessageWorkspace(), "v1", "soft", NOW);
    state = generated(state, "v2", "soft", LATER);

    assert.equal(state.drafts.soft?.message, "v2 soft");
    assert.ok(state.recentMessages.some((entry) => entry.message === "v1 soft"));
  });

  it("caps history at five entries", () => {
    let state = emptyMessageWorkspace();
    for (let i = 0; i < 4; i += 1) {
      state = generated(state, `v${i}`, "soft", new Date(Date.parse(NOW) + i * 1000).toISOString());
    }
    assert.equal(state.recentMessages.length, MAX_RECENT_MESSAGES);
  });

  it("does not spend a history slot on an identical regenerate", () => {
    let state = generated(emptyMessageWorkspace(), "v1", "soft", NOW);
    const before = state.recentMessages.length;
    state = generated(state, "v1", "soft", LATER);
    assert.equal(state.recentMessages.length, before);
  });

  it("truncates an over-length generated message", () => {
    const long = "x".repeat(MAX_WORKSPACE_MESSAGE_LENGTH + 80);
    const state = applyGeneratedDrafts(emptyMessageWorkspace(), {
      entries: [{ tone: "soft", message: long, source: "provider" }],
      activeTone: "soft",
      now: NOW,
    });
    assert.equal(state.drafts.soft?.message.length, MAX_WORKSPACE_MESSAGE_LENGTH);
  });
});

/* -------------------------------------------------------------------------- */
/* manual editing                                                             */
/* -------------------------------------------------------------------------- */

describe("applyManualDraft", () => {
  it("marks the draft manual and stamps the edit time", () => {
    let state = generated(emptyMessageWorkspace(), "v1");
    state = applyManualDraft(state, "soft", "kendi metnim", LATER);

    assert.equal(state.drafts.soft?.message, "kendi metnim");
    assert.equal(state.drafts.soft?.source, "manual");
    assert.equal(state.drafts.soft?.manuallyEditedAt, LATER);
    assert.equal(state.drafts.soft?.updatedAt, LATER);
  });

  it("carries the generation's angle across a manual rewrite", () => {
    let state = generated(emptyMessageWorkspace(), "v1");
    state = applyManualDraft(state, "soft", "kendi metnim", LATER);
    assert.equal(state.drafts.soft?.variationAngle, "Rezervasyon akışı");
  });

  it("records the saved text in history", () => {
    let state = emptyMessageWorkspace();
    state = applyManualDraft(state, "soft", "kendi metnim", NOW);
    assert.equal(state.recentMessages[0]?.message, "kendi metnim");
    assert.equal(state.recentMessages[0]?.source, "manual");
  });

  it("clamps an over-length manual save", () => {
    const long = "y".repeat(MAX_WORKSPACE_MESSAGE_LENGTH + 10);
    const state = applyManualDraft(emptyMessageWorkspace(), "soft", long, NOW);
    assert.equal(state.drafts.soft?.message.length, MAX_WORKSPACE_MESSAGE_LENGTH);
  });
});

describe("clampWorkspaceMessage", () => {
  it("trims and caps", () => {
    assert.equal(clampWorkspaceMessage("  merhaba  "), "merhaba");
    assert.equal(
      clampWorkspaceMessage("z".repeat(900)).length,
      MAX_WORKSPACE_MESSAGE_LENGTH,
    );
    assert.equal(clampWorkspaceMessage(42), "");
  });
});

/* -------------------------------------------------------------------------- */
/* previous messages fed back to the engine                                   */
/* -------------------------------------------------------------------------- */

describe("previousWorkspaceMessages", () => {
  it("returns every distinct message oldest first", () => {
    let state = generated(emptyMessageWorkspace(), "v1", "soft", NOW);
    state = generated(state, "v2", "soft", LATER);

    const previous = previousWorkspaceMessages(state);
    assert.ok(previous.includes("v1 soft"));
    assert.ok(previous.includes("v2 soft"));
    assert.ok(
      previous.indexOf("v1 soft") < previous.indexOf("v2 soft"),
      "the newest message must take the last slot",
    );
    assert.equal(new Set(previous).size, previous.length);
  });

  it("is empty for a lead with no drafts", () => {
    assert.deepEqual(previousWorkspaceMessages(emptyMessageWorkspace()), []);
  });
});

describe("withActiveTone", () => {
  it("switches tone without touching drafts", () => {
    const state = generated(emptyMessageWorkspace(), "v1");
    const next = withActiveTone(state, "consultative");
    assert.equal(next.activeTone, "consultative");
    assert.deepEqual(next.drafts, state.drafts);
  });
});

/* -------------------------------------------------------------------------- */
/* normalization and the write path                                           */
/* -------------------------------------------------------------------------- */

describe("normalizeMessageWorkspace", () => {
  it("round-trips a generated workspace", () => {
    const state = generated(emptyMessageWorkspace(), "v1");
    const parsed = normalizeMessageWorkspace(JSON.parse(JSON.stringify(state)), NOW);
    assert.deepEqual(parsed, state);
  });

  it("returns undefined for non-objects", () => {
    assert.equal(normalizeMessageWorkspace(null, NOW), undefined);
    assert.equal(normalizeMessageWorkspace([], NOW), undefined);
    assert.equal(normalizeMessageWorkspace("soft", NOW), undefined);
  });

  it("yields an empty workspace rather than dropping an unseeded lead", () => {
    const parsed = normalizeMessageWorkspace({}, NOW);
    assert.deepEqual(parsed, emptyMessageWorkspace());
  });

  it("drops unknown tones, empty drafts and bad sources", () => {
    const parsed = normalizeMessageWorkspace(
      {
        activeTone: "shouty",
        drafts: {
          soft: { message: "geçerli", source: "nonsense", updatedAt: NOW },
          bogus: { message: "atılmalı", source: "provider", updatedAt: NOW },
          direct: { message: "   ", source: "provider", updatedAt: NOW },
        },
        recentMessages: [{ id: "a", tone: "nope", message: "x", createdAt: NOW }],
      },
      NOW,
    );

    assert.equal(parsed?.activeTone, "soft");
    assert.equal(parsed?.drafts.soft?.message, "geçerli");
    assert.equal(parsed?.drafts.soft?.source, "fallback");
    assert.equal(parsed?.drafts.direct, undefined);
    assert.equal(Object.keys(parsed?.drafts ?? {}).length, 1);
    assert.equal(parsed?.recentMessages.length, 0);
  });

  it("truncates over-length messages found on disk", () => {
    const parsed = normalizeMessageWorkspace(
      { drafts: { soft: { message: "q".repeat(2000), updatedAt: NOW } } },
      NOW,
    );
    assert.equal(parsed?.drafts.soft?.message.length, MAX_WORKSPACE_MESSAGE_LENGTH);
  });
});

describe("parseMessageWorkspace", () => {
  it("rejects an over-length draft instead of storing it truncated", () => {
    const result = parseMessageWorkspace(
      {
        activeTone: "soft",
        drafts: {
          soft: { message: "q".repeat(MAX_WORKSPACE_MESSAGE_LENGTH + 1), updatedAt: NOW },
        },
      },
      NOW,
    );
    assert.equal(result, null);
  });

  it("rejects an over-length history entry", () => {
    const result = parseMessageWorkspace(
      {
        recentMessages: [
          {
            id: "a",
            tone: "soft",
            message: "q".repeat(MAX_WORKSPACE_MESSAGE_LENGTH + 1),
            createdAt: NOW,
          },
        ],
      },
      NOW,
    );
    assert.equal(result, null);
  });

  it("rejects a non-object body", () => {
    assert.equal(parseMessageWorkspace("soft", NOW), null);
  });

  it("accepts a message exactly at the cap", () => {
    const message = "q".repeat(MAX_WORKSPACE_MESSAGE_LENGTH);
    const result = parseMessageWorkspace(
      { activeTone: "soft", drafts: { soft: { message, updatedAt: NOW } } },
      NOW,
    );
    assert.equal(result?.drafts.soft?.message, message);
  });
});

describe("mergeMessageWorkspace", () => {
  it("never lets a stale client erase another device's tone", () => {
    const server = generated(emptyMessageWorkspace(), "v1");
    const staleClient = applyManualDraft(
      { activeTone: "direct", drafts: {}, recentMessages: [] },
      "direct",
      "başka cihazdan",
      LATER,
    );

    const merged = mergeMessageWorkspace(server, staleClient);
    assert.equal(merged.drafts.direct?.message, "başka cihazdan");
    assert.equal(merged.drafts.soft?.message, "v1 soft");
    assert.equal(merged.drafts.consultative?.message, "v1 consultative");
  });

  it("unions history newest first and caps it", () => {
    const server = generated(emptyMessageWorkspace(), "v1", "soft", NOW);
    const client = generated(emptyMessageWorkspace(), "v2", "soft", LATER);

    const merged = mergeMessageWorkspace(server, client);
    assert.equal(merged.recentMessages.length, MAX_RECENT_MESSAGES);
    assert.equal(merged.recentMessages[0]?.createdAt, LATER);
  });

  it("adopts the incoming active tone", () => {
    const merged = mergeMessageWorkspace(
      emptyMessageWorkspace(),
      withActiveTone(emptyMessageWorkspace(), "consultative"),
    );
    assert.equal(merged.activeTone, "consultative");
  });
});

/* -------------------------------------------------------------------------- */
/* safety policy                                                              */
/* -------------------------------------------------------------------------- */

describe("messageWorkspaceGuard", () => {
  it("keeps a do-not-contact lead readable but never opens WhatsApp", () => {
    const guard = messageWorkspaceGuard({
      doNotContact: true,
      hasWhatsAppChannel: true,
    });
    assert.equal(guard.canOpenWhatsApp, false);
    assert.equal(guard.canGenerate, false);
    assert.equal(guard.canEdit, true);
    assert.ok(guard.whatsAppBlockedReason);
  });

  it("disables WhatsApp without a verified channel but still allows drafting", () => {
    const guard = messageWorkspaceGuard({
      doNotContact: false,
      hasWhatsAppChannel: false,
    });
    assert.equal(guard.canOpenWhatsApp, false);
    assert.equal(guard.whatsAppBlockedReason, "WhatsApp kanalı doğrulanmadı");
    assert.equal(guard.canGenerate, true);
    assert.equal(guard.canEdit, true);
    assert.equal(guard.canCopy, true);
  });

  it("allows everything for a contactable lead with a channel", () => {
    const guard = messageWorkspaceGuard({
      doNotContact: false,
      hasWhatsAppChannel: true,
    });
    assert.equal(guard.canOpenWhatsApp, true);
    assert.equal(guard.whatsAppBlockedReason, null);
  });
});

/* -------------------------------------------------------------------------- */
/* activity policy                                                            */
/* -------------------------------------------------------------------------- */

describe("workspaceActivityType", () => {
  it("logs nothing for generate or regenerate", () => {
    assert.equal(workspaceActivityType("generate"), null);
    assert.equal(workspaceActivityType("regenerate"), null);
  });

  it("logs one event each for save, copy and WhatsApp", () => {
    assert.equal(workspaceActivityType("manual_save"), "message_draft_saved");
    assert.equal(workspaceActivityType("copy"), "message_copied");
    assert.equal(workspaceActivityType("whatsapp_open"), "whatsapp_opened");
  });

  it("keeps message text out of the saved-draft event", () => {
    assert.equal(workspaceActivityCarriesMessage("manual_save"), false);
    assert.equal(workspaceActivityCarriesMessage("generate"), false);
    assert.equal(workspaceActivityCarriesMessage("copy"), true);
  });
});
