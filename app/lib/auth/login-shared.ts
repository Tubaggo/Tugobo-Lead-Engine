/**
 * Values shared between the login server action and the login form.
 *
 * Kept out of the `"use server"` module because every export of a server
 * action file must itself be an async function. Nothing here touches secrets,
 * so it is safe for the client bundle.
 */

export type LoginState = {
  /** Message rendered to the user. Deliberately generic. */
  error: string | null;
};

export const INITIAL_LOGIN_STATE: LoginState = { error: null };

/**
 * One generic failure message for every credential problem. It must not reveal
 * whether the e-mail exists, which field was wrong, or whether auth is even
 * configured on this instance.
 */
export const GENERIC_LOGIN_ERROR = "E-posta veya şifre hatalı.";

export const RATE_LIMITED_LOGIN_ERROR =
  "Çok fazla başarısız deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.";

/**
 * Restricts post-login navigation to same-site paths, so a crafted
 * `?callbackUrl=` cannot turn the login form into an open redirect.
 * Protocol-relative (`//evil.com`) and absolute URLs are rejected.
 */
export function safeCallbackPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.startsWith("\\")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}
