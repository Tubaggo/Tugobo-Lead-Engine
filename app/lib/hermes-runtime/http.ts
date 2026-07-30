import "server-only";

import { CorruptDataFileError } from "../operational-state/file-store.ts";
import { UnknownLeadError } from "../operational-state/repository.ts";
import { errorJson, json } from "../operational-state/http.ts";
import {
  InvalidDecisionTransitionError,
  InvalidMissionTransitionError,
} from "./mission.ts";
import { InvalidRecordIdError, UnknownMissionError } from "./repository.ts";
import { InvalidFollowUpTransitionError } from "./follow-up.ts";
import { InvalidOutcomeTransitionError } from "./outcome.ts";
import { UnknownDailyRunItemError } from "./daily-run.ts";
import {
  InvalidLocalDateError,
  InvalidOutcomeUpdateError,
  StaleApprovalError,
  StaleDraftError,
  UnknownDailyRunError,
  UnknownFollowUpError,
} from "./daily-loop-repository.ts";

export { json, errorJson, readJsonBody } from "../operational-state/http.ts";

/**
 * Error mapping for the Hermes routes.
 *
 * Same discipline as `operational-state/http.ts`: only the errors a caller can
 * act on are distinguished, and no response ever names the data directory, the
 * filename, or an errno.
 *
 * An illegal transition is a 409 rather than a 400 — the request was
 * well-formed, it just lost a race with the mission's actual state, and the
 * caller's correct response is to re-read rather than to fix its payload.
 */
export function hermesErrorResponse(err: unknown): Response {
  if (err instanceof InvalidMissionTransitionError) {
    return json({ error: "illegal mission transition", from: err.from, to: err.to }, 409);
  }
  if (err instanceof InvalidDecisionTransitionError) {
    return json({ error: "illegal decision transition", from: err.from, to: err.to }, 409);
  }
  if (err instanceof UnknownMissionError) {
    return errorJson("not found", 404);
  }
  if (err instanceof UnknownLeadError) {
    return errorJson("not found", 404);
  }
  if (err instanceof InvalidRecordIdError) {
    return errorJson("invalid id", 400);
  }
  if (err instanceof InvalidFollowUpTransitionError) {
    return json({ error: "illegal follow-up transition", from: err.from, to: err.to }, 409);
  }
  if (err instanceof InvalidOutcomeTransitionError) {
    return json({ error: "illegal outcome transition", from: err.from, to: err.to }, 409);
  }
  if (err instanceof StaleApprovalError) {
    return json({ error: "approval does not cover the current message", blockingReasons: err.blockingReasons }, 409);
  }
  if (err instanceof StaleDraftError) {
    return json(
      { error: "draft evidence changed since approval — review or regenerate first", blockerCodes: err.blockerCodes },
      409,
    );
  }
  if (err instanceof InvalidOutcomeUpdateError) {
    return errorJson("outcome update is missing required detail", 400);
  }
  if (err instanceof InvalidLocalDateError) {
    return errorJson("invalid local date", 400);
  }
  if (err instanceof UnknownDailyRunError || err instanceof UnknownFollowUpError) {
    return errorJson("not found", 404);
  }
  if (err instanceof UnknownDailyRunItemError) {
    return errorJson("item is not in the current daily run queue", 409);
  }
  if (err instanceof CorruptDataFileError) {
    return errorJson("storage unavailable", 503);
  }
  return errorJson("internal error", 500);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
