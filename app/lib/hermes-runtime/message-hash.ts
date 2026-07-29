import { createHash } from "node:crypto";

/**
 * An opaque digest of the exact copy a founder approved.
 *
 * This is what makes an approval stale-able. The Hermes line's approval
 * snapshot binds to a `missionId` only, so regenerating the draft left the old
 * approval standing over copy nobody had read — the gap this milestone closes.
 *
 * Only the digest is ever stored or returned. The message text itself never
 * enters the Hermes runtime file, so an approval record cannot leak outreach
 * copy even if the file is read by something that should not have it.
 *
 * Normalization before hashing is deliberate and minimal: trailing whitespace
 * and line-ending differences are not a different message, but a changed word
 * is. Anything more aggressive (case folding, punctuation stripping) would let
 * a genuinely edited message keep an old approval.
 */
export function hashApprovedMessage(message: string): string {
  const normalized = message.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 32);
}

/**
 * Whether an approval bound to `approvedHash` still covers `currentMessage`.
 *
 * An approval with no bound hash covers nothing message-specific — it is
 * treated as *not* matching whenever a message is presented, because "approved
 * without ever naming a message" must not become authority over a message that
 * appeared later. When no message is presented at all, there is nothing to
 * contradict and the binding is vacuously satisfied.
 */
export function approvalCoversMessage(
  approvedHash: string | null,
  currentMessage: string | null | undefined,
): boolean {
  if (currentMessage === null || currentMessage === undefined) return true;
  if (approvedHash === null) return false;
  return approvedHash === hashApprovedMessage(currentMessage);
}
