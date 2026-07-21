import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { getAuthEnv, normalizeEmail } from "@/app/lib/auth/env";
import { verifyAdminCredentials } from "@/app/lib/auth/verify-credentials";

/**
 * Single-admin authentication for the Tugobo Lead Engine.
 *
 * There is exactly one identity, supplied entirely by environment variables.
 * No sign-up, no password reset, no user store, no roles, no tenants.
 */

/** Session lifetime. Re-login is required once a day. */
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Cookie names Auth.js uses, plain in dev and `__Secure-` prefixed over HTTPS. */
export const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

export const { handlers, signIn, signOut, auth } = NextAuth(() => {
  const env = getAuthEnv();

  return {
    // Absent in an unconfigured environment; Auth.js then refuses to issue or
    // read sessions, which is the fail-closed behaviour we want.
    secret: env?.authSecret,
    trustHost: true,
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    jwt: {
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    providers: [
      Credentials({
        credentials: {
          email: { label: "E-posta", type: "email" },
          password: { label: "Şifre", type: "password" },
        },
        authorize: async (credentials) =>
          verifyAdminCredentials(credentials?.email, credentials?.password),
      }),
    ],
    callbacks: {
      // Keep the token minimal: an identifier and the admin e-mail, nothing else.
      jwt({ token, user }) {
        if (user?.email) token.email = normalizeEmail(user.email);
        return token;
      },
      session({ session, token }) {
        if (session.user) {
          session.user.email = normalizeEmail(token.email);
          session.user.name = null;
          session.user.image = null;
        }
        return session;
      },
      // Reject open redirects: only same-origin destinations are honoured.
      redirect({ url, baseUrl }) {
        try {
          const target = new URL(url, baseUrl);
          if (target.origin === baseUrl) return target.toString();
        } catch {
          // fall through
        }
        return baseUrl;
      },
    },
  };
});
