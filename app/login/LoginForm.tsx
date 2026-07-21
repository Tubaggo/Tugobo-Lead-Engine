"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction } from "./actions";
import {
  INITIAL_LOGIN_STATE,
  type LoginState,
} from "@/app/lib/auth/login-shared";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 w-full rounded-md bg-orange-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Giriş yapılıyor…" : "Giriş yap"}
    </button>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    INITIAL_LOGIN_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-400">E-posta</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          spellCheck={false}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-400/40 focus:ring-1 focus:ring-orange-400/30"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-400">Şifre</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-orange-400/40 focus:ring-1 focus:ring-orange-400/30"
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
