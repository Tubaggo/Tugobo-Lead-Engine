import { isHotReplyIntelligence, type ReplyIntelligenceItem, type ReplyIntent } from "./reply-intelligence-runtime.ts";
import { getRecentDemoScheduleItems, upsertDemoScheduleItem } from "./demo-scheduling-registry.ts";
import { upsertFollowUpCandidate } from "./follow-up-registry.ts";

/**
 * Reply Intelligence Registry (v6.3, feeds Demo Scheduling in v6.4, feeds
 * Follow-up candidates in v6.5).
 *
 * Server-only, in-memory feed of recent sanitized reply classifications for
 * the Founder Revenue Workspace. Same shape/TTL convention as
 * `whatsapp-reply-registry.ts`: 7-day TTL, pruned on read, capped count,
 * lost on server restart. Stores only what `reply-intelligence-runtime.ts`
 * already produces — never a raw phone, never a full message body, never
 * the raw webhook payload, never a token.
 *
 * Every recorded classification whose intent is one of the four
 * demo-relevant intents (`demo_requested`/`call_requested`/`interested`/
 * `pricing_question`) is also handed to
 * `demo-scheduling-registry.ts#upsertDemoScheduleItem` — this is the single
 * choke point every classified reply passes through, so it is the natural
 * place to seed a demo opportunity without touching the pure classifier.
 *
 * v6.5 adds two more follow-up rules at the same choke point:
 *  - `not_interested`/`wrong_number` never seed a follow-up (explicit
 *    exclusion, checked first — a hot-urgency `wrong_number` must not slip
 *    through the hot-reply branch below).
 *  - a hot reply with no `scheduled`/`completed` demo item yet seeds
 *    `hot_reply_needs_action`; `later` seeds `later_requested`.
 * All of it wrapped so a demo-scheduling or follow-up failure can never
 * break intelligence recording itself.
 */

type RegistryEntry = ReplyIntelligenceItem & { expiresAt: number };

/** 7 days — matches the reply registry TTL this feed is populated alongside. */
const INTELLIGENCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RECENT_INTELLIGENCE_LIMIT = 50;

const DEMO_RELEVANT_INTENTS: ReadonlySet<ReplyIntent> = new Set(["demo_requested", "call_requested", "interested", "pricing_question"]);
const NO_FOLLOW_UP_INTENTS: ReadonlySet<ReplyIntent> = new Set(["not_interested", "wrong_number"]);

let items: RegistryEntry[] = [];

function pruneExpired(now: number): void {
  if (items.length === 0) return;
  items = items.filter((i) => i.expiresAt > now);
}

function stripInternal(entry: RegistryEntry): ReplyIntelligenceItem {
  const { expiresAt, ...rest } = entry;
  void expiresAt;
  return rest;
}

/**
 * True when this mission already has a demo item that's `scheduled` or
 * `completed` — a hot reply here is already "on track" and doesn't need a
 * generic follow-up nag. `now` must be threaded through explicitly (not
 * defaulted to `Date.now()`) — this can run moments after a demo item was
 * just stored with an `expiresAt` computed relative to the same caller-
 * supplied `now`; reading it back with a different clock value would make
 * a freshly-created item look already expired and get pruned away.
 */
function hasScheduledOrCompletedDemo(missionId: string | null, now: number): boolean {
  if (!missionId) return false;
  return getRecentDemoScheduleItems(50, now).some((d) => d.missionId === missionId && (d.status === "scheduled" || d.status === "completed"));
}

function seedFollowUpForIntelligence(item: ReplyIntelligenceItem, now: number): void {
  if (NO_FOLLOW_UP_INTENTS.has(item.intent)) return;

  let reason: "hot_reply_needs_action" | "later_requested" | null = null;
  if (isHotReplyIntelligence(item) && !hasScheduledOrCompletedDemo(item.missionId, now)) {
    reason = "hot_reply_needs_action";
  } else if (item.intent === "later") {
    reason = "later_requested";
  }
  if (!reason) return;

  try {
    upsertFollowUpCandidate(
      {
        source: "reply_intelligence",
        reason,
        provider: item.provider,
        sourceId: item.providerMessageId,
        providerMessageId: item.providerMessageId,
        missionId: item.missionId,
        leadId: item.leadId,
      },
      now,
    );
  } catch {
    // Follow-up seeding must never break reply intelligence recording.
  }
}

/** Records a classification into the recent feed, newest first. */
export function recordReplyIntelligence(item: ReplyIntelligenceItem, now: number = Date.now()): ReplyIntelligenceItem {
  pruneExpired(now);
  const entry: RegistryEntry = { ...item, expiresAt: now + INTELLIGENCE_TTL_MS };
  items = [entry, ...items].slice(0, RECENT_INTELLIGENCE_LIMIT);

  if (DEMO_RELEVANT_INTENTS.has(item.intent)) {
    try {
      upsertDemoScheduleItem(
        {
          provider: item.provider,
          providerMessageId: item.providerMessageId,
          missionId: item.missionId,
          leadId: item.leadId,
          intent: item.intent,
        },
        now,
      );
    } catch {
      // Demo scheduling must never break reply intelligence recording.
    }
  }

  seedFollowUpForIntelligence(item, now);

  return stripInternal(entry);
}

/** Newest first. Prunes expired entries on read so an idle server never serves a stale classification past its TTL. */
export function getRecentReplyIntelligence(limit: number = RECENT_INTELLIGENCE_LIMIT, now: number = Date.now()): ReplyIntelligenceItem[] {
  pruneExpired(now);
  return items.slice(0, limit).map(stripInternal);
}

/** Sweeps every expired classification out of the registry; returns how many were removed. */
export function clearExpiredReplyIntelligence(now: number = Date.now()): number {
  const before = items.length;
  pruneExpired(now);
  return before - items.length;
}

/** Test-only escape hatch — resets the module-level feed between test cases. */
export function __resetReplyIntelligenceRegistryForTests(): void {
  items = [];
}
