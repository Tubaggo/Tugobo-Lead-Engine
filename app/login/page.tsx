import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { hasAdminSession } from "@/app/lib/auth/require-admin-session";
import { safeCallbackPath } from "@/app/lib/auth/login-shared";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Giriş · Tugobo Lead Engine",
  robots: { index: false, follow: false },
};

/** Never cache the login screen; it is session-dependent. */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // An already-authenticated founder should never see the login form.
  if (await hasAdminSession()) redirect("/");

  const params = await searchParams;
  const raw = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  const callbackUrl = safeCallbackPath(raw);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
            Tugobo <span className="text-zinc-400">Lead Engine</span>
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Kurucu erişimi. Bu alan yalnızca yetkili kullanım içindir.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <LoginForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
