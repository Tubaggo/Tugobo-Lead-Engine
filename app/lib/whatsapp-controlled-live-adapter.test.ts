import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENV_FLAG_OFF_REASON,
  MISSING_ACCESS_TOKEN_REASON,
  MISSING_PHONE_NUMBER_ID_REASON,
  CLOUD_API_SEND_FAILED_REASON,
  executeControlledWhatsAppSend,
  assertWhatsAppCloudApiTestSendAllowed,
  type ControlledWhatsAppAdapterInput,
} from "./whatsapp-controlled-live-adapter.ts";
import { evaluateControlledWhatsAppLiveSend } from "./whatsapp-controlled-live-send-runtime.ts";

const BASE_INPUT: ControlledWhatsAppAdapterInput = {
  missionId: "mission-1",
  leadId: "lead-1",
  provider: "whatsapp",
  runtimeMode: "controlled_test_live",
  founderApproved: true,
  courierDraftApproved: true,
  deliveryGatewayAllowed: true,
  whatsappReadinessStatus: "controlled_live_ready",
  liveSendGateAllowed: true,
  controlledLivePolicyAllowed: true,
  recipientPhone: "+905551234567",
  configuredTestRecipient: "+905551234567",
  messageText: "Merhaba, otel işletmeniz için görüşme talebimiz var.",
  requestedAt: 1000,
  liveSendEnvFlagOn: false,
  accessToken: "test-access-token",
  phoneNumberId: "1234567890",
};

/** Installs a counting fetch mock for the duration of `fn`, then restores the original. */
async function withMockedFetch<T>(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response,
  fn: (calls: { count: number }) => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  const calls = { count: 0 };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.count += 1;
    return impl(url, init);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("controlled_live_ready when all gates pass but the env flag is false", async () => {
  const result = await executeControlledWhatsAppSend(BASE_INPUT);
  assert.equal(result.status, "dry_run");
  assert.equal(result.forcedDryRun, true);
  assert.equal(result.canAttemptLiveSend, false);
  assert.equal(result.liveSendEnvFlagOn, false);
  assert.deepEqual(result.blockingReasons, [ENV_FLAG_OFF_REASON]);
});

test("blocked results are unaffected by the env flag", async () => {
  const result = await executeControlledWhatsAppSend({
    ...BASE_INPUT,
    founderApproved: false,
    liveSendEnvFlagOn: true,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.liveSendEnvFlagOn, true);
});

test("no fetch when runtimeMode is dry_run", async () => {
  await withMockedFetch(
    () => jsonResponse({}),
    async (calls) => {
      const result = await executeControlledWhatsAppSend({ ...BASE_INPUT, runtimeMode: "dry_run", liveSendEnvFlagOn: true });
      assert.equal(calls.count, 0);
      assert.equal(result.status, "dry_run");
    },
  );
});

test("no fetch when env flag is false", async () => {
  await withMockedFetch(
    () => jsonResponse({}),
    async (calls) => {
      await executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: false });
      assert.equal(calls.count, 0);
    },
  );
});

test("no fetch when recipient differs from WHATSAPP_TEST_RECIPIENT", async () => {
  await withMockedFetch(
    () => jsonResponse({}),
    async (calls) => {
      const result = await executeControlledWhatsAppSend({
        ...BASE_INPUT,
        liveSendEnvFlagOn: true,
        recipientPhone: "+905559999999",
      });
      assert.equal(calls.count, 0);
      assert.equal(result.status, "blocked");
    },
  );
});

test("no fetch when access token is missing", async () => {
  await withMockedFetch(
    () => jsonResponse({}),
    async (calls) => {
      const result = await executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true, accessToken: null });
      assert.equal(calls.count, 0);
      assert.equal(result.status, "blocked");
      assert.ok(result.blockingReasons.includes(MISSING_ACCESS_TOKEN_REASON));
    },
  );
});

test("no fetch when phone number id is missing", async () => {
  await withMockedFetch(
    () => jsonResponse({}),
    async (calls) => {
      const result = await executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true, phoneNumberId: undefined });
      assert.equal(calls.count, 0);
      assert.equal(result.status, "blocked");
      assert.ok(result.blockingReasons.includes(MISSING_PHONE_NUMBER_ID_REASON));
    },
  );
});

test("no fetch when the evaluator blocks (e.g. founder not approved)", async () => {
  await withMockedFetch(
    () => jsonResponse({}),
    async (calls) => {
      const result = await executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true, founderApproved: false });
      assert.equal(calls.count, 0);
      assert.equal(result.status, "blocked");
    },
  );
});

test("fetch is called exactly once when every gate passes and the env flag is true", async () => {
  await withMockedFetch(
    () => jsonResponse({ messages: [{ id: "wamid.TEST123" }] }),
    async (calls) => {
      const result = await executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true });
      assert.equal(calls.count, 1);
      assert.equal(result.status, "controlled_live_sent");
    },
  );
});

test("success response is sanitized — only providerMessageId/httpStatus/acceptedAt/recipientMasked/messagePreview, no raw provider payload", async () => {
  const result = await withMockedFetch(
    () => jsonResponse({ messaging_product: "whatsapp", messages: [{ id: "wamid.TEST123" }] }, 200),
    async () => executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true }),
  );
  assert.equal(result.status, "controlled_live_sent");
  assert.equal(result.providerMessageId, "wamid.TEST123");
  assert.equal(result.httpStatus, 200);
  assert.equal(typeof result.acceptedAt, "number");
  assert.equal(result.recipientMasked, "••• ••• 67");
  assert.ok(result.messagePreview.length > 0);
});

test("provider error response is sanitized", async () => {
  const result = await withMockedFetch(
    () =>
      jsonResponse(
        { error: { message: "Invalid parameter", type: "OAuthException", code: 100 } },
        400,
      ),
    async () => executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true }),
  );
  assert.equal(result.status, "failed");
  assert.equal(result.httpStatus, 400);
  assert.equal(result.providerErrorCode, 100);
  assert.equal(result.providerErrorType, "OAuthException");
  assert.equal(result.providerErrorMessageSafe, "Invalid parameter");
  assert.ok(result.blockingReasons.includes(CLOUD_API_SEND_FAILED_REASON));
});

test("a network-level fetch failure is also sanitized to a failed result, never throws", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    const result = await executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true });
    assert.equal(result.status, "failed");
  } finally {
    globalThis.fetch = original;
  }
});

test("raw access token never appears in the serialized result", async () => {
  const result = await withMockedFetch(
    () => jsonResponse({ messages: [{ id: "wamid.TEST123" }] }),
    async () => executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true }),
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("test-access-token"), false);
});

test("raw recipient never appears in the serialized result", async () => {
  const result = await withMockedFetch(
    () => jsonResponse({ messages: [{ id: "wamid.TEST123" }] }),
    async () => executeControlledWhatsAppSend({ ...BASE_INPUT, liveSendEnvFlagOn: true }),
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("+905551234567"), false);
  assert.equal(serialized.includes("905551234567"), false);
});

test("assertWhatsAppCloudApiTestSendAllowed rejects when any hard condition fails, independent of the evaluator", () => {
  const evaluation = evaluateControlledWhatsAppLiveSend(BASE_INPUT);
  const preflight = assertWhatsAppCloudApiTestSendAllowed({ ...BASE_INPUT, accessToken: null }, evaluation);
  assert.equal(preflight.allowed, false);
  assert.ok(preflight.reasons.includes(MISSING_ACCESS_TOKEN_REASON));
});

test("assertWhatsAppCloudApiTestSendAllowed allows when every condition passes", () => {
  const input = { ...BASE_INPUT, liveSendEnvFlagOn: true };
  const evaluation = evaluateControlledWhatsAppLiveSend(input);
  const preflight = assertWhatsAppCloudApiTestSendAllowed(input, evaluation);
  assert.equal(preflight.allowed, true);
  assert.deepEqual(preflight.reasons, []);
});
