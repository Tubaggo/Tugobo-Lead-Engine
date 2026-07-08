import type { ReplyIntelligenceItem } from "./reply-intelligence-runtime.ts";

/**
 * Reply Intelligence Registry (v6.3).
 *
 * Server-only, in-memory feed of recent sanitized reply classifications for
 * the Founder Revenue Workspace. Same shape/TTL convention as
 * `whatsapp-reply-registry.ts`: 7-day TTL, pruned on read, capped count,
 * lost on server restart. Stores only what `reply-intelligence-runtime.ts`
 * already produces — never a raw phone, never a full message body, never
 * the raw webhook payload, never a token.
 */

type RegistryEntry = ReplyIntelligenceItem & { expiresAt: number };

/** 7 days — matches the reply registry TTL this feed is populated alongside. */
const INTELLIGENCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RECENT_INTELLIGENCE_LIMIT = 50;

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

/** Records a classification into the recent feed, newest first. */
export function recordReplyIntelligence(item: ReplyIntelligenceItem, now: number = Date.now()): ReplyIntelligenceItem {
  pruneExpired(now);
  const entry: RegistryEntry = { ...item, expiresAt: now + INTELLIGENCE_TTL_MS };
  items = [entry, ...items].slice(0, RECENT_INTELLIGENCE_LIMIT);
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
