import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { computeMessageReadiness } from "./message-readiness.ts";
import { emptyMessageWorkspace } from "../outreach/workspace.ts";

describe("computeMessageReadiness", () => {
  test("1. not_required for a stage where copy readiness is not the question", () => {
    assert.equal(
      computeMessageReadiness({ actionStage: "hot_reply", hasWhatsAppChannel: true, workspace: undefined }),
      "not_required",
    );
  });
  test("2. missing_channel outranks needs_research", () => {
    assert.equal(
      computeMessageReadiness({ actionStage: "ready", hasWhatsAppChannel: false, workspace: undefined }),
      "missing_channel",
    );
  });
  test("3. needs_research when the channel exists but no draft is stored", () => {
    assert.equal(
      computeMessageReadiness({ actionStage: "approval_required", hasWhatsAppChannel: true, workspace: undefined }),
      "needs_research",
    );
  });
  test("4. ready when a non-empty draft exists for the active tone", () => {
    const workspace = {
      ...emptyMessageWorkspace(),
      drafts: {
        soft: {
          tone: "soft" as const,
          message: "Merhaba, bir sorum olacaktı.",
          source: "provider" as const,
          updatedAt: "2026-07-29T09:00:00.000Z",
        },
      },
    };
    assert.equal(
      computeMessageReadiness({ actionStage: "ready", hasWhatsAppChannel: true, workspace }),
      "ready",
    );
  });
  test("5. a whitespace-only draft still reads as needs_research", () => {
    const workspace = {
      ...emptyMessageWorkspace(),
      drafts: {
        soft: {
          tone: "soft" as const,
          message: "   ",
          source: "manual" as const,
          updatedAt: "2026-07-29T09:00:00.000Z",
        },
      },
    };
    assert.equal(
      computeMessageReadiness({ actionStage: "ready", hasWhatsAppChannel: true, workspace }),
      "needs_research",
    );
  });
});
