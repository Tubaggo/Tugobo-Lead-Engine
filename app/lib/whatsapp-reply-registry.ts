import type { WhatsAppInboundMessageType, WhatsAppInboundReply } from "./whatsapp-reply-listener-runtime.ts";
import { getProviderMessageMapping } from "./hermes-provider-message-registry.ts";
import { classifyReplyIntent, buildReplyIntelligenceEvent } from "./reply-intelligence-runtime.ts";
import { recordReplyIntelligence } from "./reply-intelligence-registry.ts";

/**
 * WhatsApp Reply Registry (v6.2, classifies via Reply Intelligence in v6.3).
 *
 * Server-only, in-memory feed of recent sanitized inbound replies for the
 * Founder Revenue Workspace. Same convention as
 * `whatsapp-delivery-receipt-processor.ts`'s `recentReceipts` feed, but with
 * a 7-day TTL (mirroring `hermes-provider-message-registry.ts`'s mapping
 * TTL) instead of a pure count cap, since replies should age out rather
 * than silently push each other off an unbounded list. Lost on server
 * restart — acceptable, a lost reply just stops appearing in the feed.
 *
 * Mapping strategy: a reply is attributed to a mission only when its
 * `conversationIdSafe` (the wamid of the message it quotes) resolves to a
 * known entry in `hermes-provider-message-registry.ts` — i.e. the customer
 * replied to a message Hermes actually sent. There is no fallback
 * heuristic (e.g. guessing from a masked sender suffix): an unreliable
 * guess would be worse than an honest `mapped: false`, so every reply that
 * doesn't resolve this way is recorded as unmapped and still surfaced.
 *
 * Every recorded reply is also classified by `reply-intelligence-runtime.ts`
 * and recorded into `reply-intelligence-registry.ts` — this is the single
 * choke point every parsed reply passes through (from
 * `whatsapp-webhook-event-processor.ts`), so it is the natural place to
 * attach intelligence without touching the pure parser. Classification is
 * wrapped so a failure there can never break reply recording itself —
 * `recordWhatsAppReply`'s own return value and behavior are unchanged from
 * v6.2.
 */

export type StoredWhatsAppReply = {
  provider: "whatsapp";
  providerMessageId: string;
  fromMasked: string | null;
  messageType: WhatsAppInboundMessageType;
  textPreview: string | null;
  occurredAt: number;
  conversationIdSafe: string | null;
  contactProfileNameSafe: string | null;
  mapped: boolean;
  missionId: string | null;
  leadId: string | null;
  source: "provider_message_registry" | "unmapped";
};

type RegistryEntry = StoredWhatsAppReply & { expiresAt: number };

/** 7 days — matches the provider message mapping TTL this registry depends on for attribution. */
const REPLY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RECENT_REPLIES_LIMIT = 50;

let replies: RegistryEntry[] = [];

export type MappedReplyContext = {
  mapped: boolean;
  missionId: string | null;
  leadId: string | null;
  source: "provider_message_registry" | "unmapped";
};

/**
 * Resolves a parsed reply to a mission/lead purely via the provider message
 * registry — never fakes a match. `mapped: false` is a normal, expected
 * outcome, not an error state.
 */
export function mapReplyToMissionContext(reply: WhatsAppInboundReply, now: number = Date.now()): MappedReplyContext {
  if (reply.conversationIdSafe) {
    const mapping = getProviderMessageMapping(reply.conversationIdSafe, now);
    if (mapping) {
      return { mapped: true, missionId: mapping.missionId, leadId: mapping.leadId, source: "provider_message_registry" };
    }
  }
  return { mapped: false, missionId: null, leadId: null, source: "unmapped" };
}

function pruneExpired(now: number): void {
  if (replies.length === 0) return;
  replies = replies.filter((r) => r.expiresAt > now);
}

/** Records a sanitized reply into the recent feed, newest first, resolving its mission mapping along the way. */
export function recordWhatsAppReply(reply: WhatsAppInboundReply, now: number = Date.now()): StoredWhatsAppReply {
  pruneExpired(now);

  const context = mapReplyToMissionContext(reply, now);
  const entry: RegistryEntry = {
    provider: reply.provider,
    providerMessageId: reply.providerMessageId,
    fromMasked: reply.fromMasked,
    messageType: reply.messageType,
    textPreview: reply.textPreview,
    occurredAt: reply.occurredAt,
    conversationIdSafe: reply.conversationIdSafe,
    contactProfileNameSafe: reply.contactProfileNameSafe,
    mapped: context.mapped,
    missionId: context.missionId,
    leadId: context.leadId,
    source: context.source,
    expiresAt: now + REPLY_TTL_MS,
  };

  replies = [entry, ...replies].slice(0, RECENT_REPLIES_LIMIT);

  try {
    const classification = classifyReplyIntent({
      provider: reply.provider,
      providerMessageId: reply.providerMessageId,
      messageType: reply.messageType,
      textPreview: reply.textPreview,
      mapped: context.mapped,
      missionId: context.missionId,
      leadId: context.leadId,
      occurredAt: reply.occurredAt,
      contactProfileNameSafe: reply.contactProfileNameSafe,
    });
    const intelligenceEvent = buildReplyIntelligenceEvent(
      {
        provider: reply.provider,
        providerMessageId: reply.providerMessageId,
        messageType: reply.messageType,
        textPreview: reply.textPreview,
        mapped: context.mapped,
        missionId: context.missionId,
        leadId: context.leadId,
        occurredAt: reply.occurredAt,
      },
      classification,
      now,
    );
    recordReplyIntelligence(intelligenceEvent, now);
  } catch {
    // Classification must never break reply recording — a lost intelligence
    // item just means the reply surfaces without an intent badge.
  }

  return stripInternal(entry);
}

function stripInternal(entry: RegistryEntry): StoredWhatsAppReply {
  const { expiresAt, ...rest } = entry;
  void expiresAt;
  return rest;
}

/** Newest first. Prunes expired entries on read so an idle server never serves a stale reply past its TTL. */
export function getRecentWhatsAppReplies(limit: number = RECENT_REPLIES_LIMIT, now: number = Date.now()): StoredWhatsAppReply[] {
  pruneExpired(now);
  return replies.slice(0, limit).map(stripInternal);
}

/** Sweeps every expired reply out of the registry; returns how many were removed. */
export function clearExpiredWhatsAppReplies(now: number = Date.now()): number {
  const before = replies.length;
  pruneExpired(now);
  return before - replies.length;
}

/** Test-only escape hatch — resets the module-level replies feed between test cases. */
export function __resetWhatsAppReplyRegistryForTests(): void {
  replies = [];
}
