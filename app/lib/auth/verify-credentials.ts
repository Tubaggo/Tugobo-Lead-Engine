import { compare } from "bcryptjs";

import { getAuthEnv, normalizeEmail } from "./env.ts";

/**
 * The credential check, kept separate from `auth.ts` so it can be unit-tested
 * without booting the whole Auth.js runtime.
 */

export type AdminIdentity = { id: string; email: string };

export const ADMIN_USER_ID = "lead-engine-admin";

/**
 * A syntactically valid bcrypt hash that no password matches. Used so the
 * unknown-e-mail branch still performs a real bcrypt comparison and therefore
 * takes the same time as the known-e-mail branch.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.rPrDJ8yPnQwLUsz7Lyy1QpQZ1t1zTGa";

/**
 * Verifies a submitted credential pair against the environment-backed admin.
 *
 * Returns `null` for every failure mode — unconfigured environment, unknown
 * e-mail, wrong password — so no caller can tell them apart.
 */
export async function verifyAdminCredentials(
  email: unknown,
  password: unknown,
): Promise<AdminIdentity | null> {
  if (typeof email !== "string" || typeof password !== "string") return null;
  if (password.length === 0) return null;

  const env = getAuthEnv();
  if (!env) return null;

  const submitted = normalizeEmail(email);
  const emailMatches = submitted === env.adminEmail;

  // Compare unconditionally so response time does not reveal whether the
  // submitted address is the admin's.
  const hashToCompare = emailMatches ? env.adminPasswordHash : DUMMY_HASH;

  let passwordMatches = false;
  try {
    passwordMatches = await compare(password, hashToCompare);
  } catch {
    // A malformed hash in the environment must deny, never surface details.
    passwordMatches = false;
  }

  if (!emailMatches || !passwordMatches) return null;
  return { id: ADMIN_USER_ID, email: env.adminEmail };
}
