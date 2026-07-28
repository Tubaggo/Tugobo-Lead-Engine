/**
 * How a generated draft reaches the server, and what happens when it does not.
 *
 * Split out of `LeadMessageEditor.tsx` because the interesting behaviour is not
 * React: it is "write once, replay at most once on a revision conflict, and
 * never lose the message the provider already produced". That policy is what
 * broke in v3.7.9 — a refreshed v5 draft whose PATCH failed was discarded, so
 * the founder's only recovery was another provider round-trip that returns a
 * *different* message.
 *
 * Kept pure: no React, no `fs`, no fetch. The transport is injected, so the
 * same code runs in the browser and under `node --test`.
 *
 * This module stores and replays messages. It never sends one.
 */

import type { Tone } from "./contract.ts";
import type {
  GeneratedDraftInput,
  LeadMessageWorkspaceState,
} from "./workspace.ts";

/* -------------------------------------------------------------------------- */
/* founder-facing copy                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The two failures the founder must be able to tell apart.
 *
 * Before this split both read "Sunucuya kaydedilemedi." — the raw transport
 * error — which says nothing about whether a message was produced and leaks a
 * server-side detail into the UI. Generation failing and persistence failing
 * call for different next actions, so they get different sentences.
 */
export const GENERATION_FAILED_MESSAGE = "Mesaj üretilemedi. Mevcut taslak korundu.";
export const PERSIST_FAILED_MESSAGE =
  "Yeni mesaj üretildi ancak sunucuya kaydedilemedi. Mevcut taslak korundu.";
export const MANUAL_SAVE_FAILED_MESSAGE =
  "Taslak kaydedilemedi. Metniniz ekranda duruyor, tekrar deneyebilirsiniz.";

/* -------------------------------------------------------------------------- */
/* what a stale refresh may overwrite                                         */
/* -------------------------------------------------------------------------- */

/**
 * Narrows a generation to the tone the founder asked to refresh.
 *
 * A generation returns all three tones, and "Yeniden Üret" stores all three —
 * the founder asked for new copy across the board. "Yeni tonla güncelle" is a
 * different request: it repairs the one out-of-date draft on screen. The other
 * two may already have been sent, and copy that left the building is not
 * something a version bump gets to rewrite.
 */
export function staleRefreshEntries(
  entries: GeneratedDraftInput[],
  activeTone: Tone,
): GeneratedDraftInput[] {
  return entries.filter((entry) => entry.tone === activeTone);
}

/* -------------------------------------------------------------------------- */
/* policy                                                                     */
/* -------------------------------------------------------------------------- */

/** How many writes a single save may cost. One attempt, one conflict replay. */
export const MAX_PERSIST_ATTEMPTS = 2;

export type DraftPersistOutcome =
  | {
      status: "saved";
      /** The canonical workspace the server returned, when it returned one. */
      workspace: LeadMessageWorkspaceState | undefined;
      attempts: number;
    }
  /** Still conflicting after the replay. The stored draft is untouched. */
  | { status: "conflict"; attempts: number }
  /** Rejected or unreachable. The stored draft is untouched. */
  | { status: "failed"; attempts: number };

export type DraftPersistPorts = {
  /**
   * The freshest workspace known for this lead.
   *
   * Read again before every attempt rather than captured once: after a
   * conflict the transport has pulled the server's copy down, and the replay
   * has to build on *that* or it will conflict forever.
   */
  read: () => LeadMessageWorkspaceState;
  /** Writes and returns the canonical workspace. Throws on any failure. */
  write: (
    next: LeadMessageWorkspaceState,
  ) => Promise<LeadMessageWorkspaceState | undefined>;
  /** True when the thrown error is a revision conflict worth replaying. */
  isConflict: (err: unknown) => boolean;
};

/**
 * Applies `build` to the freshest workspace and stores the result.
 *
 * `build` takes the base state instead of a finished object so a conflict can
 * be resolved by replaying the founder's change onto whatever the other writer
 * left behind. It must be pure and repeatable — it is called once per attempt,
 * and calling it again must not cost another provider request.
 *
 * At most {@link MAX_PERSIST_ATTEMPTS} writes leave this function, so a lead
 * that is being written continuously elsewhere degrades to "not saved" rather
 * than to an unbounded retry loop.
 */
export async function persistWorkspaceChange(
  build: (base: LeadMessageWorkspaceState) => LeadMessageWorkspaceState,
  ports: DraftPersistPorts,
): Promise<DraftPersistOutcome> {
  let attempts = 0;

  while (attempts < MAX_PERSIST_ATTEMPTS) {
    attempts += 1;
    try {
      const workspace = await ports.write(build(ports.read()));
      return { status: "saved", workspace, attempts };
    } catch (err) {
      if (!ports.isConflict(err)) return { status: "failed", attempts };
      // Conflict: the transport has refreshed its copy, so the next `read()`
      // returns the canonical state and the replay builds on it.
    }
  }

  return { status: "conflict", attempts };
}
