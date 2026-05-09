"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "@/app/lib/i18n";

const STORAGE_KEY = "tugobo-lead-engine:ui-locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("tr");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "en" || raw === "tr") setLocaleState(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function LocaleToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const base =
    "rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium transition";
  const active = "bg-indigo-500/25 text-indigo-100 ring-1 ring-indigo-400/40";
  const idle = "text-zinc-400 hover:bg-white/10 hover:text-zinc-200";
  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="group"
      aria-label={locale === "tr" ? "Dil" : "Language"}
    >
      <button
        type="button"
        className={`${base} ${locale === "tr" ? active : idle}`}
        aria-pressed={locale === "tr"}
        onClick={() => setLocale("tr")}
      >
        TR
      </button>
      <button
        type="button"
        className={`${base} ${locale === "en" ? active : idle}`}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
