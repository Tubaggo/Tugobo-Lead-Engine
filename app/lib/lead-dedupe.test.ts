import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDedupeKeySet,
  isDuplicateAgainstKeySet,
  leadDedupeKeysFor,
  leadNameCityKey,
  normalizePhoneForDedupe,
  normalizeWebsiteForDedupe,
} from "./lead-dedupe.ts";

test("leadNameCityKey matches the legacy generate.ts format", () => {
  assert.equal(leadNameCityKey("  Otel Deniz ", " Antalya "), "otel deniz|antalya");
});

test("normalizePhoneForDedupe strips 00/90 prefixes and non-digits", () => {
  assert.equal(normalizePhoneForDedupe("+90 532 111 22 33"), "5321112233");
  assert.equal(normalizePhoneForDedupe("0090 532 111 22 33"), "5321112233");
  assert.equal(normalizePhoneForDedupe("532-111-22-33"), "5321112233");
});

test("normalizePhoneForDedupe returns null for short or empty input", () => {
  assert.equal(normalizePhoneForDedupe(""), null);
  assert.equal(normalizePhoneForDedupe("12345"), null);
  assert.equal(normalizePhoneForDedupe(null), null);
});

test("normalizeWebsiteForDedupe strips protocol, www and path", () => {
  assert.equal(normalizeWebsiteForDedupe("https://www.oteldeniz.com/tr/oda"), "oteldeniz.com");
  assert.equal(normalizeWebsiteForDedupe("oteldeniz.com"), "oteldeniz.com");
  assert.equal(normalizeWebsiteForDedupe(undefined), null);
});

test("leadDedupeKeysFor always includes name|city and only valid phone/web keys", () => {
  const keys = leadDedupeKeysFor({
    name: "Otel Deniz",
    city: "Antalya",
    phone: "+90 532 111 22 33",
    website: "https://oteldeniz.com",
  });
  assert.deepEqual(keys, ["otel deniz|antalya", "phone:5321112233", "web:oteldeniz.com"]);

  const minimal = leadDedupeKeysFor({ name: "Otel Deniz", city: "Antalya" });
  assert.deepEqual(minimal, ["otel deniz|antalya"]);
});

test("isDuplicateAgainstKeySet matches on any shared key", () => {
  const keySet = buildDedupeKeySet([
    { name: "Otel Deniz", city: "Antalya", phone: "+90 532 111 22 33", website: "oteldeniz.com" },
  ]);

  // Different name, same phone (different formatting) → duplicate.
  assert.equal(
    isDuplicateAgainstKeySet({ name: "Deniz Hotel", city: "Antalya", phone: "+90 (532) 111-22-33" }, keySet),
    true,
  );
  // Different everything → not a duplicate.
  assert.equal(
    isDuplicateAgainstKeySet({ name: "Otel Kaya", city: "Bodrum", phone: "0532 999 88 77" }, keySet),
    false,
  );
});
