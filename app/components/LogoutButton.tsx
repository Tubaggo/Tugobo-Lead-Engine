"use client";

import { useFormStatus } from "react-dom";

import { logoutAction } from "@/app/login/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Çıkılıyor…" : "Çıkış"}
    </button>
  );
}

/**
 * Ends the session via a server action. Using a form (rather than a fetch)
 * means the browser follows the redirect to /login and the back button cannot
 * restore the protected page from cache.
 */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton />
    </form>
  );
}
