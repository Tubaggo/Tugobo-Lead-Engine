"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { isAuthEnvConfigured } from "@/app/lib/auth/env";
import {
  buildAttemptKey,
  clientIpFromHeaders,
  loginRateLimiter,
} from "@/app/lib/auth/login-rate-limit";
import {
  GENERIC_LOGIN_ERROR,
  RATE_LIMITED_LOGIN_ERROR,
  safeCallbackPath,
  type LoginState,
} from "@/app/lib/auth/login-shared";

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackPath = safeCallbackPath(formData.get("callbackUrl"));

  // An unconfigured instance fails closed and still returns the generic error,
  // so a probe cannot tell "no admin configured" from "wrong password".
  if (!isAuthEnvConfigured()) return { error: GENERIC_LOGIN_ERROR };

  const ip = clientIpFromHeaders(await headers());
  const attemptKey = buildAttemptKey(ip, email);

  if (!loginRateLimiter.check(attemptKey).allowed) {
    return { error: RATE_LIMITED_LOGIN_ERROR };
  }

  let succeeded = false;
  try {
    await signIn("credentials", { email, password, redirect: false });
    succeeded = true;
  } catch {
    // Any Auth.js error is treated as a failed credential attempt. The reason
    // is never surfaced or logged, so credentials cannot leak into VPS logs.
    succeeded = false;
  }

  if (!succeeded) {
    loginRateLimiter.recordFailure(attemptKey);
    return { error: GENERIC_LOGIN_ERROR };
  }

  loginRateLimiter.reset(attemptKey);
  // Outside the try/catch: redirect() signals by throwing and must propagate.
  redirect(callbackPath);
}

/** Ends the session and returns to the login screen. */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
