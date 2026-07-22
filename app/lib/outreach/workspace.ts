/**
 * The per-lead message workspace record.
 *
 * v3.7.6 gave the engine three genuinely different tones; this module gives the
 * result somewhere to live. A draft the founder generated in the AI modal has
 * to still be there when the same lead is opened from the queue, from
 * follow-ups, or from another device tomorrow — so the drafts are stored
 * server-side next to the rest of the lead's operational state rather than in
 * whichever component happened to produce them.
 *
 * Kept pure: no React, no `fs`, no `server-only`, no provider. The same
 * transitions run in the browser (optimistic UI), on the write path
 * (`operational-state/schema.ts`) and under `node --test`.
 *
 * This module stores and shapes messages. It never sends one.
 */

import { isTone, TONES, type Tone } from "./contract.ts";

/** Hard cap on a stored draft. Outreach copy longer than this is not outreach. */
export const MAX_WORKSPACE_MESSAGE_LENGTH = 520;
/** How many prior variations we keep per lead. */
export const MAX_RECENT_MESSAGES = 5;
/** Bounds the signal-key list carried alongside a generated draft. */
const MAX_USED_SIGNAL_KEYS = 12;
const MAX_ANGLE_LENGTH = 60;
const MAX_GENERATION_ID_LENGTH = 140;
const MAX_RECENT_ID_LENGTH = 120;

/**
 * Copy generation the draft was written under.
 *
 * v1 is everything produced before the warm-tone rewrite: long, hedged, and
 * consultant-voiced. Stored so the workspace can offer to refresh an old draft
 * instead of silently replacing copy the founder may already have sent.
 */
export const CURRENT_COPY_VERSION = 2;

export const DRAFT_SOURCES = ["provider", "fallback", "manual"] as const;
export type DraftSource = (typeof DRAFT_SOURCES)[number];

export function isDraftSource(value: unknown): value is DraftSource {
  return typeof value === "string" && (DRAFT_SOURCES as readonly string[]).includes(value);
}

export type PersistedOutreachDraft = {
  tone: Tone;
  message: string;
  source: DraftSource;
  variationAngle?: string;
  usedSignalKeys?: string[];
  generationId?: string;
  generatedAt?: string;
  updatedAt: string;
  manuallyEditedAt?: string;
  /** Absent means v1 — written before the warm-tone rewrite. */
  copyVersion?: number;
};

export type RecentWorkspaceMessage = {
  id: string;
  tone: Tone;
  message: string;
  source: DraftSource;
  variationAngle?: string;
  createdAt: string;
};

export type LeadMessageWorkspaceState = {
  activeTone: Tone;
  /** One current draft per tone. Tones are independent and never overwrite each other. */
  drafts: Partial<Record<Tone, PersistedOutreachDraft>>;
  /** Newest first, capped at {@link MAX_RECENT_MESSAGES}. */
  recentMessages: RecentWorkspaceMessage[];
};

export function emptyMessageWorkspace(): LeadMessageWorkspaceState {
  return { activeTone: "soft", drafts: {}, recentMessages: [] };
}

/* -------------------------------------------------------------------------- */
/* normalization                                                              */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) return false;
  return Number.isFinite(Date.parse(value));
}

function coerceIso(value: unknown, fallback: string): string {
  return isIsoDate(value) ? new Date(value).toISOString() : fallback;
}

function optionalIso(value: unknown): string | undefined {
  return isIsoDate(value) ? new Date(value).toISOString() : undefined;
}

function shortString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Trims and caps a message.
 *
 * Reads are lenient (truncate) and writes are strict (see
 * {@link parseMessageWorkspace}) — the same split the note field uses, so a
 * legacy or hand-edited file still loads while a client cannot grow the record.
 */
export function clampWorkspaceMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_WORKSPACE_MESSAGE_LENGTH);
}

function normalizeUsedSignalKeys(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keys = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 60))
    .filter((entry) => entry.length > 0)
    .slice(0, MAX_USED_SIGNAL_KEYS);
  return keys.length > 0 ? keys : undefined;
}

function normalizeDraft(
  tone: Tone,
  raw: unknown,
  fallbackNow: string,
): PersistedOutreachDraft | null {
  if (!isRecord(raw)) return null;
  const message = clampWorkspaceMessage(raw.message);
  if (message.length === 0) return null;

  const draft: PersistedOutreachDraft = {
    tone,
    message,
    source: isDraftSource(raw.source) ? raw.source : "fallback",
    updatedAt: coerceIso(raw.updatedAt, fallbackNow),
  };

  const angle = shortString(raw.variationAngle, MAX_ANGLE_LENGTH);
  if (angle) draft.variationAngle = angle;
  const usedSignalKeys = normalizeUsedSignalKeys(raw.usedSignalKeys);
  if (usedSignalKeys) draft.usedSignalKeys = usedSignalKeys;
  const generationId = shortString(raw.generationId, MAX_GENERATION_ID_LENGTH);
  if (generationId) draft.generationId = generationId;
  const generatedAt = optionalIso(raw.generatedAt);
  if (generatedAt) draft.generatedAt = generatedAt;
  const manuallyEditedAt = optionalIso(raw.manuallyEditedAt);
  if (manuallyEditedAt) draft.manuallyEditedAt = manuallyEditedAt;
  if (typeof raw.copyVersion === "number" && Number.isFinite(raw.copyVersion)) {
    draft.copyVersion = Math.max(1, Math.floor(raw.copyVersion));
  }

  return draft;
}

function normalizeRecent(
  raw: unknown,
  fallbackNow: string,
): RecentWorkspaceMessage | null {
  if (!isRecord(raw)) return null;
  const message = clampWorkspaceMessage(raw.message);
  if (message.length === 0) return null;
  const tone = isTone(raw.tone) ? raw.tone : null;
  if (!tone) return null;

  const entry: RecentWorkspaceMessage = {
    id: shortString(raw.id, MAX_RECENT_ID_LENGTH) ?? `${tone}-${message.length}`,
    tone,
    message,
    source: isDraftSource(raw.source) ? raw.source : "fallback",
    createdAt: coerceIso(raw.createdAt, fallbackNow),
  };
  const angle = shortString(raw.variationAngle, MAX_ANGLE_LENGTH);
  if (angle) entry.variationAngle = angle;
  return entry;
}

/**
 * Parses whatever is on disk or on the wire into a usable workspace.
 *
 * Returns `undefined` only for input that is not an object at all — an object
 * with no usable drafts still yields an empty workspace, because "this lead has
 * no draft yet" is a real state the UI has to render.
 */
export function normalizeMessageWorkspace(
  raw: unknown,
  fallbackNow: string,
): LeadMessageWorkspaceState | undefined {
  if (!isRecord(raw)) return undefined;

  const drafts: Partial<Record<Tone, PersistedOutreachDraft>> = {};
  const draftsRaw = isRecord(raw.drafts) ? raw.drafts : {};
  for (const tone of TONES) {
    const draft = normalizeDraft(tone, draftsRaw[tone], fallbackNow);
    if (draft) drafts[tone] = draft;
  }

  const recentRaw = Array.isArray(raw.recentMessages) ? raw.recentMessages : [];
  const seenIds = new Set<string>();
  const recentMessages: RecentWorkspaceMessage[] = [];
  for (const entry of recentRaw) {
    const normalized = normalizeRecent(entry, fallbackNow);
    if (!normalized || seenIds.has(normalized.id)) continue;
    seenIds.add(normalized.id);
    recentMessages.push(normalized);
    if (recentMessages.length >= MAX_RECENT_MESSAGES) break;
  }

  return {
    activeTone: isTone(raw.activeTone) ? raw.activeTone : "soft",
    drafts,
    recentMessages,
  };
}

/**
 * The strict variant used on the PATCH path.
 *
 * Returns `null` for a body that is not an object or that carries an
 * over-length message, so the route answers 400 instead of silently storing a
 * truncated message the founder never wrote.
 */
export function parseMessageWorkspace(
  raw: unknown,
  fallbackNow: string,
): LeadMessageWorkspaceState | null {
  if (!isRecord(raw)) return null;

  const overLength = (value: unknown): boolean =>
    typeof value === "string" && value.trim().length > MAX_WORKSPACE_MESSAGE_LENGTH;

  const draftsRaw = isRecord(raw.drafts) ? raw.drafts : {};
  for (const tone of TONES) {
    const draft = draftsRaw[tone];
    if (isRecord(draft) && overLength(draft.message)) return null;
  }
  if (Array.isArray(raw.recentMessages)) {
    for (const entry of raw.recentMessages) {
      if (isRecord(entry) && overLength(entry.message)) return null;
    }
  }

  return normalizeMessageWorkspace(raw, fallbackNow) ?? null;
}

/**
 * Merges an incoming workspace onto the stored one.
 *
 * Drafts merge tone-by-tone rather than replacing wholesale: a client that
 * saves the "soft" draft from a stale copy must not erase a "direct" draft
 * another device wrote in the meantime. Recent messages union by id, newest
 * first, then cap.
 */
export function mergeMessageWorkspace(
  base: LeadMessageWorkspaceState | undefined,
  incoming: LeadMessageWorkspaceState,
): LeadMessageWorkspaceState {
  const current = base ?? emptyMessageWorkspace();

  const drafts: Partial<Record<Tone, PersistedOutreachDraft>> = { ...current.drafts };
  for (const tone of TONES) {
    const next = incoming.drafts[tone];
    if (next) drafts[tone] = next;
  }

  const byId = new Map<string, RecentWorkspaceMessage>();
  for (const entry of [...incoming.recentMessages, ...current.recentMessages]) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  const recentMessages = [...byId.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_RECENT_MESSAGES);

  return { activeTone: incoming.activeTone, drafts, recentMessages };
}

/* -------------------------------------------------------------------------- */
/* transitions                                                                */
/* -------------------------------------------------------------------------- */

export type GeneratedDraftInput = {
  tone: Tone;
  message: string;
  source: "provider" | "fallback";
  variationAngle?: string;
  usedSignalKeys?: string[];
  generationId?: string;
};

function pushRecent(
  recentMessages: RecentWorkspaceMessage[],
  entry: RecentWorkspaceMessage,
): RecentWorkspaceMessage[] {
  // Deduplicated on the message itself: regenerating into the same copy should
  // not consume a history slot the founder could have used for a real variant.
  const withoutDuplicate = recentMessages.filter(
    (existing) => existing.message !== entry.message,
  );
  return [entry, ...withoutDuplicate].slice(0, MAX_RECENT_MESSAGES);
}

/**
 * Records a fresh generation.
 *
 * Every returned tone updates its own draft. History receives the active tone
 * last, which puts it at the head of the list: with three variants competing
 * for five slots, that is what keeps the founder's *previous* copy for the tone
 * they are actually working on from being pushed off the end by the other two.
 */
export function applyGeneratedDrafts(
  state: LeadMessageWorkspaceState,
  input: {
    entries: GeneratedDraftInput[];
    activeTone: Tone;
    now: string;
    generationId?: string;
  },
): LeadMessageWorkspaceState {
  const now = coerceIso(input.now, new Date().toISOString());
  const drafts: Partial<Record<Tone, PersistedOutreachDraft>> = { ...state.drafts };

  const ordered = [
    ...input.entries.filter((entry) => entry.tone !== input.activeTone),
    ...input.entries.filter((entry) => entry.tone === input.activeTone),
  ];

  let recentMessages = state.recentMessages;
  const stamp = Date.parse(now);

  ordered.forEach((entry, index) => {
    const message = clampWorkspaceMessage(entry.message);
    if (message.length === 0) return;

    const draft: PersistedOutreachDraft = {
      tone: entry.tone,
      message,
      source: entry.source,
      updatedAt: now,
      generatedAt: now,
      copyVersion: CURRENT_COPY_VERSION,
    };
    const angle = shortString(entry.variationAngle, MAX_ANGLE_LENGTH);
    if (angle) draft.variationAngle = angle;
    const keys = normalizeUsedSignalKeys(entry.usedSignalKeys);
    if (keys) draft.usedSignalKeys = keys;
    const generationId = shortString(
      entry.generationId ?? input.generationId,
      MAX_GENERATION_ID_LENGTH,
    );
    if (generationId) draft.generationId = generationId;
    drafts[entry.tone] = draft;

    recentMessages = pushRecent(recentMessages, {
      id: `${entry.tone}-${stamp}-${index}`,
      tone: entry.tone,
      message,
      source: entry.source,
      ...(angle ? { variationAngle: angle } : {}),
      createdAt: now,
    });
  });

  return { activeTone: input.activeTone, drafts, recentMessages };
}

/**
 * Records a manual edit the founder chose to save.
 *
 * The angle and signal keys of the generation it started from are carried over
 * — the founder rewrote the wording, not the argument — but the source becomes
 * `manual`, because the copy on screen is no longer what the engine produced.
 */
export function applyManualDraft(
  state: LeadMessageWorkspaceState,
  tone: Tone,
  message: string,
  now: string,
): LeadMessageWorkspaceState {
  const text = clampWorkspaceMessage(message);
  const at = coerceIso(now, new Date().toISOString());
  const previous = state.drafts[tone];

  const draft: PersistedOutreachDraft = {
    ...(previous ?? { tone, source: "manual", updatedAt: at }),
    tone,
    message: text,
    source: "manual",
    updatedAt: at,
    manuallyEditedAt: at,
  };

  const recentMessages =
    text.length > 0
      ? pushRecent(state.recentMessages, {
          id: `${tone}-manual-${Date.parse(at)}`,
          tone,
          message: text,
          source: "manual",
          ...(draft.variationAngle ? { variationAngle: draft.variationAngle } : {}),
          createdAt: at,
        })
      : state.recentMessages;

  return {
    activeTone: tone,
    drafts: { ...state.drafts, [tone]: draft },
    recentMessages,
  };
}

/**
 * True when this draft predates the warm-tone rewrite and is safe to refresh.
 *
 * Manual drafts are never stale: the founder wrote those words, and replacing
 * them because the generator changed would discard the one version of the
 * message a human actually approved.
 */
export function isStaleCopyDraft(
  draft: PersistedOutreachDraft | undefined,
): boolean {
  if (!draft) return false;
  if (draft.source === "manual") return false;
  return (draft.copyVersion ?? 1) < CURRENT_COPY_VERSION;
}

export function withActiveTone(
  state: LeadMessageWorkspaceState,
  tone: Tone,
): LeadMessageWorkspaceState {
  return state.activeTone === tone ? state : { ...state, activeTone: tone };
}

/**
 * Everything this lead has already been shown, oldest first.
 *
 * Ordered oldest-first because that is what the generation contract expects:
 * the newest message is the one a regenerate most needs to move away from, and
 * it takes the last slot.
 */
export function previousWorkspaceMessages(
  state: LeadMessageWorkspaceState,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const candidates = [
    ...[...state.recentMessages].reverse().map((entry) => entry.message),
    ...TONES.map((tone) => state.drafts[tone]?.message ?? ""),
  ];
  for (const message of candidates) {
    const text = message.trim();
    if (text.length === 0 || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* safety policy                                                              */
/* -------------------------------------------------------------------------- */

export type WorkspaceGuard = {
  canGenerate: boolean;
  canEdit: boolean;
  canCopy: boolean;
  canOpenWhatsApp: boolean;
  /** Founder-facing reason the WhatsApp action is unavailable, if it is. */
  whatsAppBlockedReason: string | null;
};

/**
 * What the founder may do with this lead's drafts.
 *
 * Two rules, both about not sending something we should not send:
 *  - a Do-Not-Contact lead keeps its drafts readable and editable (the record
 *    matters) but produces no new copy and opens no WhatsApp window
 *  - without a verified WhatsApp path there is nothing to open, so the action
 *    is disabled rather than silently pointing at an unverified number
 *
 * Sales stage is deliberately absent: a won, lost or queued lead still shows
 * and edits its drafts.
 */
export function messageWorkspaceGuard(input: {
  doNotContact: boolean;
  hasWhatsAppChannel: boolean;
}): WorkspaceGuard {
  if (input.doNotContact) {
    return {
      canGenerate: false,
      canEdit: true,
      canCopy: true,
      canOpenWhatsApp: false,
      whatsAppBlockedReason: "Bu lead 'İletişime geçme' olarak işaretli",
    };
  }
  return {
    canGenerate: true,
    canEdit: true,
    canCopy: true,
    canOpenWhatsApp: input.hasWhatsAppChannel,
    whatsAppBlockedReason: input.hasWhatsAppChannel
      ? null
      : "WhatsApp kanalı doğrulanmadı",
  };
}

/* -------------------------------------------------------------------------- */
/* activity policy                                                            */
/* -------------------------------------------------------------------------- */

export type WorkspaceAction =
  | "generate"
  | "regenerate"
  | "manual_save"
  | "copy"
  | "whatsapp_open";

export type WorkspaceActivityType =
  | "message_draft_saved"
  | "message_copied"
  | "whatsapp_opened";

/**
 * Which workspace actions reach the timeline.
 *
 * Generation is not an event. The founder produces drafts freely while
 * deciding what to say; logging each one would bury the three things the
 * timeline exists to answer — what was saved, what was copied, and when
 * WhatsApp was opened.
 */
export function workspaceActivityType(
  action: WorkspaceAction,
): WorkspaceActivityType | null {
  if (action === "manual_save") return "message_draft_saved";
  if (action === "copy") return "message_copied";
  if (action === "whatsapp_open") return "whatsapp_opened";
  return null;
}

/**
 * Whether an activity entry for this action may carry message text.
 *
 * A saved draft is recorded as a fact, not as a copy of the message: the draft
 * itself already lives in the workspace, and duplicating it into the timeline
 * would spread the founder's outreach copy across two records.
 */
export function workspaceActivityCarriesMessage(action: WorkspaceAction): boolean {
  return action === "copy" || action === "whatsapp_open";
}
