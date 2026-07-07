import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetProviderMessageRegistryForTests,
  clearExpiredProviderMessageMappings,
  getProviderMessageMapping,
  registerProviderMessageMapping,
  updateProviderMessageMappingDeliveryStatus,
} from "./hermes-provider-message-registry.ts";

beforeEach(() => {
  __resetProviderMessageRegistryForTests();
});

test("registers a mapping and resolves it back by providerMessageId", () => {
  registerProviderMessageMapping({
    providerMessageId: "wamid.ABC123",
    missionId: "mission-1",
    leadId: "lead-1",
    recipientMasked: "••• ••• 67",
    now: 1000,
  });
  const mapping = getProviderMessageMapping("wamid.ABC123", 1000);
  assert.ok(mapping);
  assert.equal(mapping?.missionId, "mission-1");
  assert.equal(mapping?.leadId, "lead-1");
  assert.equal(mapping?.recipientMasked, "••• ••• 67");
  assert.equal(mapping?.provider, "whatsapp");
});

test("returns undefined for a providerMessageId that was never registered", () => {
  assert.equal(getProviderMessageMapping("wamid.NEVER"), undefined);
});

test("mapping expires safely after the TTL window", () => {
  registerProviderMessageMapping({
    providerMessageId: "wamid.EXP1",
    missionId: "mission-1",
    leadId: "lead-1",
    recipientMasked: null,
    now: 1000,
  });
  const stillValid = getProviderMessageMapping("wamid.EXP1", 1000 + 6 * 24 * 60 * 60 * 1000);
  assert.ok(stillValid);
  const expired = getProviderMessageMapping("wamid.EXP1", 1000 + 8 * 24 * 60 * 60 * 1000);
  assert.equal(expired, undefined);
});

test("clearExpiredProviderMessageMappings evicts expired entries and reports the count", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.A", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  registerProviderMessageMapping({ providerMessageId: "wamid.B", missionId: "m2", leadId: "l2", recipientMasked: null, now: 1000 });
  const cleared = clearExpiredProviderMessageMappings(1000 + 8 * 24 * 60 * 60 * 1000);
  assert.equal(cleared, 2);
  assert.equal(getProviderMessageMapping("wamid.A", 1000 + 8 * 24 * 60 * 60 * 1000), undefined);
});

test("a later registration for the same providerMessageId overwrites the earlier mapping", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.X", missionId: "mission-old", leadId: "lead-old", recipientMasked: null, now: 1000 });
  registerProviderMessageMapping({ providerMessageId: "wamid.X", missionId: "mission-new", leadId: "lead-new", recipientMasked: null, now: 2000 });
  const mapping = getProviderMessageMapping("wamid.X", 2000);
  assert.equal(mapping?.missionId, "mission-new");
});

test("updateProviderMessageMappingDeliveryStatus patches an existing mapping", () => {
  registerProviderMessageMapping({ providerMessageId: "wamid.Y", missionId: "m1", leadId: "l1", recipientMasked: null, now: 1000 });
  updateProviderMessageMappingDeliveryStatus("wamid.Y", "delivered", 2000);
  const mapping = getProviderMessageMapping("wamid.Y", 2000);
  assert.equal(mapping?.lastDeliveryStatus, "delivered");
  assert.equal(mapping?.lastDeliveryStatusAt, 2000);
});

test("updateProviderMessageMappingDeliveryStatus is a safe no-op for an unknown providerMessageId", () => {
  assert.doesNotThrow(() => updateProviderMessageMappingDeliveryStatus("wamid.NEVER", "delivered", 2000));
});

test("mapping shape never includes a raw recipient, message text, or access token field", () => {
  const mapping = registerProviderMessageMapping({
    providerMessageId: "wamid.SHAPE1",
    missionId: "m1",
    leadId: "l1",
    recipientMasked: "••• ••• 67",
    now: 1000,
  });
  assert.equal("recipientPhone" in mapping, false);
  assert.equal("messageText" in mapping, false);
  assert.equal("accessToken" in mapping, false);
  assert.equal("rawResponse" in mapping, false);
});
