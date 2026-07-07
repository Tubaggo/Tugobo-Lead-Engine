import type { WhatsAppDeliveryStatus } from "./whatsapp-delivery-receipt-runtime.ts";

/**
 * Hermes Provider Message Registry (v6.0.1).
 *
 * Server-only, in-memory map from `providerMessageId` → Hermes mission
 * context. Same convention as `hermes-mission-state-bridge.ts`: a
 * module-level `Map`, no database, no file, no Airtable field. Lost on
 * server restart — acceptable, since a lost mapping just means a later
 * delivery receipt arrives "unmapped" (still processed safely, never a
 * failure).
 *
 * Populated by `whatsapp-controlled-live-adapter.ts` right after a
 * successful v5.2 Cloud API test send. Read by the webhook receiver
 * (`whatsapp-delivery-receipt-processor.ts`) to attach missionId/leadId to
 * an incoming delivery receipt.
 *
 * Deliberately minimal: never stores the raw recipient phone (only
 * `recipientMasked`, already masked by the caller), never a message body,
 * never an access token, never a raw provider response.
 */

export type ProviderMessageMapping = {
  providerMessageId: string;
  provider: "whatsapp";
  missionId: string;
  leadId: string;
  recipientMasked: string | null;
  createdAt: number;
  expiresAt: number;
  lastDeliveryStatus?: WhatsAppDeliveryStatus;
  lastDeliveryStatusAt?: number;
};

/** 7 days — delivery receipts (especially "read") can legitimately arrive well after send; this is a much longer window than the 10-minute mission-approval snapshot TTL on purpose. */
const MAPPING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const registry = new Map<string, ProviderMessageMapping>();

export type RegisterProviderMessageMappingInput = {
  providerMessageId: string;
  missionId: string;
  leadId: string;
  recipientMasked: string | null;
  now?: number;
};

/** Overwrites any prior mapping for the same providerMessageId — a real provider message id should never legitimately collide across missions. */
export function registerProviderMessageMapping(input: RegisterProviderMessageMappingInput): ProviderMessageMapping {
  const now = input.now ?? Date.now();
  const mapping: ProviderMessageMapping = {
    providerMessageId: input.providerMessageId,
    provider: "whatsapp",
    missionId: input.missionId,
    leadId: input.leadId,
    recipientMasked: input.recipientMasked,
    createdAt: now,
    expiresAt: now + MAPPING_TTL_MS,
  };
  registry.set(input.providerMessageId, mapping);
  return mapping;
}

/** Returns `undefined` for a missing OR expired mapping — an expired entry is evicted on read, never returned. */
export function getProviderMessageMapping(
  providerMessageId: string,
  now: number = Date.now(),
): ProviderMessageMapping | undefined {
  const mapping = registry.get(providerMessageId);
  if (!mapping) return undefined;
  if (mapping.expiresAt <= now) {
    registry.delete(providerMessageId);
    return undefined;
  }
  return mapping;
}

/** Patches an existing mapping's last-known delivery status — a no-op if the mapping doesn't exist (unmapped receipts never create a mapping). */
export function updateProviderMessageMappingDeliveryStatus(
  providerMessageId: string,
  status: WhatsAppDeliveryStatus,
  occurredAt: number,
): void {
  const mapping = registry.get(providerMessageId);
  if (!mapping) return;
  mapping.lastDeliveryStatus = status;
  mapping.lastDeliveryStatusAt = occurredAt;
}

/** Sweeps every expired entry out of the registry; returns how many were removed. */
export function clearExpiredProviderMessageMappings(now: number = Date.now()): number {
  let cleared = 0;
  for (const [id, mapping] of registry) {
    if (mapping.expiresAt <= now) {
      registry.delete(id);
      cleared += 1;
    }
  }
  return cleared;
}

/** Test-only escape hatch — resets the module-level registry between test cases. Not used by any route or resolver. */
export function __resetProviderMessageRegistryForTests(): void {
  registry.clear();
}
