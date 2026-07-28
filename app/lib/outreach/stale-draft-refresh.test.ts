/**
 * The stale-draft refresh contract (v3.7.9).
 *
 * The failure this covers: a v4 draft was offered for refresh, the provider
 * produced a valid v5 message, and the PATCH that should have stored it
 * returned a status the client only knew how to report as
 * "Sunucuya kaydedilemedi." The generated message was then thrown away, so the
 * founder's only way forward was another provider request returning different
 * copy — while the banner, the badge and the textarea all still showed v4.
 *
 * These tests pin the three things that has to mean:
 *  - the write path accepts everything a v6 refresh produces
 *  - a conflict is replayed once with the *same* candidate, never regenerated
 *  - a failure leaves the stored draft, its badge and its history untouched,
 *    and keeps the candidate so the save alone can be retried
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyLeadStatePatch,
  parseLeadStatePatch,
  type LeadOperationalState,
} from "../operational-state/schema.ts";
import { ANGLE_LABELS_TR, assignAngles, FIRST_CONTACT_ANGLES } from "./angles.ts";
import { TONES, type Tone } from "./contract.ts";
import {
  GENERATION_FAILED_MESSAGE,
  MANUAL_SAVE_FAILED_MESSAGE,
  MAX_PERSIST_ATTEMPTS,
  persistWorkspaceChange,
  PERSIST_FAILED_MESSAGE,
  staleRefreshEntries,
  type DraftPersistPorts,
} from "./draft-persistence.ts";
import { isOutreachStance } from "./lifecycle.ts";
import { buildOutreachSignals } from "./signals.ts";
import {
  applyGeneratedDrafts,
  applyManualDraft,
  CURRENT_COPY_VERSION,
  draftSourceLabel,
  isStaleCopyDraft,
  type GeneratedDraftInput,
  type LeadMessageWorkspaceState,
} from "./workspace.ts";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const OLD = "2026-07-01T09:00:00.000Z";
const NOW = "2026-07-25T09:00:00.000Z";

/** The shape found on disk when the bug was reported: three v4 drafts. */
function staleWorkspace(): LeadMessageWorkspaceState {
  return {
    activeTone: "soft",
    drafts: {
      soft: {
        tone: "soft",
        message: "v4 yumuşak taslak",
        source: "provider",
        updatedAt: OLD,
        generatedAt: OLD,
        copyVersion: 4,
        variationAngle: "Doğrulanmış kanal gözlemi",
      },
      direct: {
        tone: "direct",
        message: "v4 direkt taslak",
        source: "provider",
        updatedAt: OLD,
        copyVersion: 4,
      },
      consultative: {
        tone: "consultative",
        message: "v4 danışman taslak",
        source: "fallback",
        updatedAt: OLD,
        copyVersion: 4,
      },
    },
    recentMessages: [
      {
        id: "soft-1",
        tone: "soft",
        message: "v4 yumuşak taslak",
        source: "provider",
        createdAt: OLD,
      },
      {
        id: "direct-1",
        tone: "direct",
        message: "v4 direkt taslak",
        source: "provider",
        createdAt: OLD,
      },
    ],
  };
}

/** What a v5 generation hands the workspace, for all three tones. */
function generatedEntries(suffix = ""): GeneratedDraftInput[] {
  return [
    {
      tone: "soft",
      message: `v5 yumuşak: talepleri nasıl takip ediyorsunuz?${suffix}`,
      source: "provider",
      variationAngle: ANGLE_LABELS_TR["follow-up-method-question"],
      usedSignalKeys: ["whatsapp_link"],
      generationId: "lead-1:1",
    },
    {
      tone: "direct",
      message: `v5 direkt: kim takip ediyor?${suffix}`,
      source: "provider",
      variationAngle: ANGLE_LABELS_TR["ownership-question"],
      generationId: "lead-1:1",
    },
    {
      tone: "consultative",
      message: `v5 danışman: hangi kanaldan geliyor?${suffix}`,
      source: "fallback",
      variationAngle: ANGLE_LABELS_TR["multi-channel-visibility-question"],
      generationId: "lead-1:1",
    },
  ];
}

/** The refresh transition the editor applies for one tone. */
function refresh(
  base: LeadMessageWorkspaceState,
  activeTone: Tone,
  entries = generatedEntries(),
  now = NOW,
): LeadMessageWorkspaceState {
  return applyGeneratedDrafts(base, {
    entries: staleRefreshEntries(entries, activeTone),
    activeTone,
    now,
    generationId: "lead-1:1",
  });
}

/* -------------------------------------------------------------------------- */
/* a server that behaves like the real write path                             */
/* -------------------------------------------------------------------------- */

class RevisionConflict extends Error {}

/**
 * An in-memory stand-in for `/api/operational-state/[leadId]`.
 *
 * Deliberately built from the *real* `parseLeadStatePatch` and
 * `applyLeadStatePatch`, so "the schema accepts this" is a fact about the
 * shipping write path rather than about a test double.
 */
class FakeStore {
  state: LeadOperationalState;
  /** Extra revision bumps to inject before the next write, to force conflicts. */
  conflictsToInject = 0;
  /** Set to reject every write, standing in for a 400/500/503. */
  reject = false;
  writes = 0;

  constructor(workspace: LeadMessageWorkspaceState) {
    this.state = {
      leadId: "lead-1",
      activity: [],
      createdAt: OLD,
      updatedAt: OLD,
      revision: 7,
      messageWorkspace: workspace,
    };
  }

  patch(
    workspace: LeadMessageWorkspaceState,
    expectedRevision: number,
  ): LeadOperationalState {
    this.writes += 1;
    if (this.reject) throw new Error("rejected");

    if (this.conflictsToInject > 0) {
      this.conflictsToInject -= 1;
      this.state = { ...this.state, revision: this.state.revision + 1 };
    }
    if (this.state.revision !== expectedRevision) {
      throw new RevisionConflict("revision conflict");
    }

    const patch = parseLeadStatePatch({ messageWorkspace: workspace });
    assert.ok(patch, "the write path must accept a v5 workspace");
    this.state = applyLeadStatePatch(this.state, "lead-1", patch, NOW);
    return this.state;
  }
}

/**
 * The client mirror + transport, matching `operational-state/client.ts`:
 * a conflict pulls the server copy down *before* the error surfaces, which is
 * what lets the replay build on canonical state.
 */
function ports(store: FakeStore): DraftPersistPorts & { mirror: () => LeadOperationalState } {
  let mirror = store.state;
  return {
    mirror: () => mirror,
    read: () => mirror.messageWorkspace ?? { activeTone: "soft", drafts: {}, recentMessages: [] },
    write: async (next) => {
      try {
        mirror = store.patch(next, mirror.revision);
        return mirror.messageWorkspace;
      } catch (err) {
        if (err instanceof RevisionConflict) mirror = store.state; // canonical pull
        throw err;
      }
    },
    isConflict: (err) => err instanceof RevisionConflict,
  };
}

/* -------------------------------------------------------------------------- */
/* detection + the refreshed draft                                            */
/* -------------------------------------------------------------------------- */

describe("stale draft detection", () => {
  it("flags a v4 provider draft as stale", () => {
    assert.equal(isStaleCopyDraft(staleWorkspace().drafts.soft), true);
  });

  it("does not flag a draft written under the current contract", () => {
    const next = refresh(staleWorkspace(), "soft");
    assert.equal(isStaleCopyDraft(next.drafts.soft), false);
  });

  it("never flags a hand-written draft", () => {
    const manual = applyManualDraft(staleWorkspace(), "soft", "elle yazdım", NOW);
    assert.equal(manual.drafts.soft?.source, "manual");
    assert.equal(isStaleCopyDraft(manual.drafts.soft), false);
  });
});

describe("the refreshed draft", () => {
  it("is stamped with the current copy version", () => {
    const next = refresh(staleWorkspace(), "soft");
    assert.equal(next.drafts.soft?.copyVersion, CURRENT_COPY_VERSION);
    assert.equal(CURRENT_COPY_VERSION, 6);
  });

  it("is written from a first-contact question angle", () => {
    assert.ok(isOutreachStance("first_contact"));
    const signals = buildOutreachSignals({
      city: "Antalya",
      businessType: "Otel",
      hasWhatsAppPath: true,
      hasInstagram: true,
      hasOwnWebsite: true,
    });
    // Every tone, at every rotation, has to land on a question angle: a first
    // message that explains the product is what v5 removed.
    for (let rotation = 0; rotation < 8; rotation += 1) {
      const assigned = assignAngles(signals, rotation, "first_contact");
      for (const angle of Object.values(assigned)) {
        assert.ok(
          (FIRST_CONTACT_ANGLES as readonly string[]).includes(angle),
          `${angle} is not a first-contact angle`,
        );
      }
    }
  });

  it("shows the new message on the active tone", () => {
    const next = refresh(staleWorkspace(), "soft");
    assert.equal(next.activeTone, "soft");
    assert.match(next.drafts.soft?.message ?? "", /^v5 yumuşak/);
  });

  it("replaces only the tone being refreshed", () => {
    const next = refresh(staleWorkspace(), "soft");
    assert.match(next.drafts.soft?.message ?? "", /^v5/);
    assert.equal(next.drafts.direct?.message, "v4 direkt taslak");
    assert.equal(next.drafts.consultative?.message, "v4 danışman taslak");
  });

  it("refreshes each tone independently into three v5 drafts", () => {
    let ws = staleWorkspace();
    for (const tone of TONES) ws = refresh(ws, tone, generatedEntries(), NOW);
    for (const tone of TONES) {
      assert.equal(ws.drafts[tone]?.copyVersion, CURRENT_COPY_VERSION, tone);
      assert.equal(isStaleCopyDraft(ws.drafts[tone]), false, tone);
    }
  });

  it("keeps the old draft in history without duplicating it", () => {
    const next = refresh(staleWorkspace(), "soft");
    const messages = next.recentMessages.map((entry) => entry.message);
    assert.ok(messages.includes("v4 yumuşak taslak"), "the old copy stays readable");
    assert.equal(new Set(messages).size, messages.length, "no duplicate history rows");
  });

  it("does not add a second history row when the same copy is stored twice", () => {
    const once = refresh(staleWorkspace(), "soft");
    const twice = refresh(once, "soft", generatedEntries(), "2026-07-25T10:00:00.000Z");
    const v5 = twice.recentMessages.filter((e) => e.message.startsWith("v5 yumuşak"));
    assert.equal(v5.length, 1);
  });

  it("labels the source truthfully", () => {
    const next = refresh(staleWorkspace(), "soft");
    assert.equal(next.drafts.soft?.source, "provider");
    assert.equal(draftSourceLabel(next.drafts.soft?.source), "AI üretimi");

    const fallback = refresh(staleWorkspace(), "consultative");
    assert.equal(fallback.drafts.consultative?.source, "fallback");
    assert.equal(draftSourceLabel(fallback.drafts.consultative?.source), "Güvenli şablon");
  });
});

/* -------------------------------------------------------------------------- */
/* schema compatibility                                                       */
/* -------------------------------------------------------------------------- */

describe("the write path accepts a v6 refresh", () => {
  it("round-trips copyVersion 6, the source and the angle label", () => {
    const next = refresh(staleWorkspace(), "soft");
    const patch = parseLeadStatePatch({ messageWorkspace: next });
    assert.ok(patch?.messageWorkspace);
    const stored = patch.messageWorkspace.drafts.soft;
    assert.equal(stored?.copyVersion, 6);
    assert.equal(stored?.source, "provider");
    assert.equal(stored?.variationAngle, ANGLE_LABELS_TR["follow-up-method-question"]);
  });

  it("accepts every first-contact angle label", () => {
    for (const angle of FIRST_CONTACT_ANGLES) {
      const entries: GeneratedDraftInput[] = [
        {
          tone: "soft",
          message: `soru: ${angle}`,
          source: "provider",
          variationAngle: ANGLE_LABELS_TR[angle],
        },
      ];
      const ws = refresh(staleWorkspace(), "soft", entries);
      const patch = parseLeadStatePatch({ messageWorkspace: ws });
      assert.ok(patch?.messageWorkspace, `${angle} was rejected`);
      assert.equal(patch.messageWorkspace.drafts.soft?.variationAngle, ANGLE_LABELS_TR[angle]);
    }
  });

  it("accepts every draft source the editor can produce", () => {
    for (const source of ["provider", "fallback", "manual"] as const) {
      const patch = parseLeadStatePatch({
        messageWorkspace: {
          activeTone: "soft",
          drafts: { soft: { tone: "soft", message: "m", source, updatedAt: NOW, copyVersion: 6 } },
          recentMessages: [],
        },
      });
      assert.equal(patch?.messageWorkspace?.drafts.soft?.source, source);
    }
  });

  it("merges a single-tone refresh onto the stored record without erasing the others", () => {
    const store = new FakeStore(staleWorkspace());
    const next = refresh(staleWorkspace(), "soft");
    const stored = store.patch(next, 7).messageWorkspace;
    assert.match(stored?.drafts.soft?.message ?? "", /^v5/);
    assert.equal(stored?.drafts.direct?.message, "v4 direkt taslak");
    assert.equal(stored?.drafts.consultative?.message, "v4 danışman taslak");
  });
});

/* -------------------------------------------------------------------------- */
/* persistence + conflict replay                                              */
/* -------------------------------------------------------------------------- */

describe("persisting a refresh", () => {
  it("stores it and returns the canonical workspace and revision", async () => {
    const store = new FakeStore(staleWorkspace());
    const p = ports(store);

    const outcome = await persistWorkspaceChange((base) => refresh(base, "soft"), p);

    assert.equal(outcome.status, "saved");
    assert.equal(outcome.attempts, 1);
    assert.equal(store.state.revision, 8);
    assert.equal(p.mirror().revision, 8, "the client adopts the canonical revision");
    assert.match(
      outcome.status === "saved" ? (outcome.workspace?.drafts.soft?.message ?? "") : "",
      /^v5 yumuşak/,
    );
  });

  it("clears the stale flag once stored", async () => {
    const store = new FakeStore(staleWorkspace());
    await persistWorkspaceChange((base) => refresh(base, "soft"), ports(store));
    assert.equal(isStaleCopyDraft(store.state.messageWorkspace?.drafts.soft), false);
  });

  it("replays one conflict against the canonical copy and succeeds", async () => {
    const store = new FakeStore(staleWorkspace());
    store.conflictsToInject = 1;
    let builds = 0;

    const outcome = await persistWorkspaceChange((base) => {
      builds += 1;
      return refresh(base, "soft");
    }, ports(store));

    assert.equal(outcome.status, "saved");
    assert.equal(outcome.attempts, 2);
    assert.equal(builds, 2, "the candidate is re-applied to the newer base");
    assert.match(store.state.messageWorkspace?.drafts.soft?.message ?? "", /^v5/);
  });

  it("keeps the other device's work when it replays", async () => {
    const store = new FakeStore(staleWorkspace());
    const p = ports(store);

    // The conflict this injects stands for another device having written to
    // the same lead: the store advances, and it advances with a consultative
    // draft the founder typed there.
    store.conflictsToInject = 1;
    const otherDevice = applyManualDraft(
      staleWorkspace(),
      "consultative",
      "başka cihazda yazıldı",
      NOW,
    );
    store.state = { ...store.state, messageWorkspace: otherDevice };

    const outcome = await persistWorkspaceChange((base) => refresh(base, "soft"), p);

    assert.equal(outcome.status, "saved");
    assert.match(store.state.messageWorkspace?.drafts.soft?.message ?? "", /^v5 yumuşak/);
    assert.equal(
      store.state.messageWorkspace?.drafts.consultative?.message,
      "başka cihazda yazıldı",
      "the replay must not roll back the other device's draft",
    );
  });

  it("gives up after one replay instead of looping", async () => {
    const store = new FakeStore(staleWorkspace());
    store.conflictsToInject = 99;

    const outcome = await persistWorkspaceChange((base) => refresh(base, "soft"), ports(store));

    assert.equal(outcome.status, "conflict");
    assert.equal(outcome.attempts, MAX_PERSIST_ATTEMPTS);
    assert.equal(store.writes, MAX_PERSIST_ATTEMPTS);
  });

  it("leaves the stored draft untouched when it keeps conflicting", async () => {
    const store = new FakeStore(staleWorkspace());
    store.conflictsToInject = 99;
    await persistWorkspaceChange((base) => refresh(base, "soft"), ports(store));

    assert.equal(store.state.messageWorkspace?.drafts.soft?.message, "v4 yumuşak taslak");
    assert.equal(store.state.messageWorkspace?.drafts.soft?.copyVersion, 4);
    assert.equal(isStaleCopyDraft(store.state.messageWorkspace?.drafts.soft), true);
  });

  it("leaves the stored draft and its badge untouched when the write is rejected", async () => {
    const store = new FakeStore(staleWorkspace());
    store.reject = true;

    const outcome = await persistWorkspaceChange((base) => refresh(base, "soft"), ports(store));

    assert.equal(outcome.status, "failed");
    assert.equal(outcome.attempts, 1, "a rejection is not retried blindly");
    const draft = store.state.messageWorkspace?.drafts.soft;
    assert.equal(draft?.message, "v4 yumuşak taslak");
    assert.equal(draftSourceLabel(draft?.source), "AI üretimi");
    assert.equal(store.state.revision, 7);
  });

  it("keeps the candidate when the client refuses the lead id", async () => {
    // The client-side lead-id guard throws before the fetch. That is a plain
    // failure, not a conflict, so it must not burn the retry budget and must
    // not cost a second provider call.
    const store = new FakeStore(staleWorkspace());
    const p = ports(store);
    let providerCalls = 0;
    const candidate = (() => {
      providerCalls += 1;
      return generatedEntries();
    })();

    const outcome = await persistWorkspaceChange((base) => refresh(base, "soft", candidate), {
      ...p,
      write: async () => {
        throw new Error("Bu lead kaydı tanımlanamadı. Değişiklik kaydedilmedi.");
      },
    });

    assert.equal(outcome.status, "failed");
    assert.equal(outcome.attempts, 1);
    assert.equal(store.writes, 0, "nothing reached the store");
    assert.equal(store.state.messageWorkspace?.drafts.soft?.message, "v4 yumuşak taslak");

    // The same candidate then saves once the id is right — no regeneration.
    const retry = await persistWorkspaceChange(
      (base) => refresh(base, "soft", candidate),
      p,
    );
    assert.equal(retry.status, "saved");
    assert.equal(providerCalls, 1);
  });

  it("retries the held candidate without asking the provider again", async () => {
    const store = new FakeStore(staleWorkspace());
    store.reject = true;
    const p = ports(store);

    let providerCalls = 0;
    const generate = (): GeneratedDraftInput[] => {
      providerCalls += 1;
      return generatedEntries();
    };

    // First attempt: the message is produced, the write fails.
    const candidate = generate();
    const first = await persistWorkspaceChange(
      (base) => refresh(base, "soft", candidate),
      p,
    );
    assert.equal(first.status, "failed");

    // The founder retries the save. Same candidate, no new generation.
    store.reject = false;
    const second = await persistWorkspaceChange(
      (base) => refresh(base, "soft", candidate),
      p,
    );

    assert.equal(second.status, "saved");
    assert.equal(providerCalls, 1, "a retry must not cost another provider call");
    assert.match(store.state.messageWorkspace?.drafts.soft?.message ?? "", /^v5 yumuşak/);
    assert.equal(store.state.messageWorkspace?.drafts.soft?.copyVersion, 6);
  });
});

/* -------------------------------------------------------------------------- */
/* founder-facing copy                                                        */
/* -------------------------------------------------------------------------- */

describe("failure messages", () => {
  it("tells a failed generation apart from a failed save", () => {
    assert.notEqual(GENERATION_FAILED_MESSAGE, PERSIST_FAILED_MESSAGE);
    assert.equal(GENERATION_FAILED_MESSAGE, "Mesaj üretilemedi. Mevcut taslak korundu.");
    assert.equal(
      PERSIST_FAILED_MESSAGE,
      "Yeni mesaj üretildi ancak sunucuya kaydedilemedi. Mevcut taslak korundu.",
    );
  });

  it("says the existing draft survived, in every case", () => {
    for (const message of [
      GENERATION_FAILED_MESSAGE,
      PERSIST_FAILED_MESSAGE,
      MANUAL_SAVE_FAILED_MESSAGE,
    ]) {
      assert.match(message, /korundu|duruyor/);
    }
  });

  it("leaks no transport detail", () => {
    for (const message of [
      GENERATION_FAILED_MESSAGE,
      PERSIST_FAILED_MESSAGE,
      MANUAL_SAVE_FAILED_MESSAGE,
    ]) {
      assert.ok(!/\b(4\d\d|5\d\d|PATCH|revision|HTTP)\b/i.test(message), message);
    }
  });
});
