"use client";

import { useState } from "react";

export default function V2Header({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const [filterActive, setFilterActive] = useState(false);

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[var(--background-elev)] px-6 py-4">
      {/* Title area */}
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-zinc-100">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          {subtitle}
        </p>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Date selector */}
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 text-[11px] font-medium text-zinc-300 transition-colors duration-150 hover:bg-white/[0.06] hover:text-zinc-100"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3.5 w-3.5 shrink-0 text-zinc-400"
            aria-hidden
          >
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 1.5v3M11 1.5v3M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>25 Haziran 2026, Perşembe</span>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3 w-3 shrink-0 text-zinc-600"
            aria-hidden
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Filter button with count badge */}
        <button
          type="button"
          onClick={() => setFilterActive((v) => !v)}
          className={`flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[11px] font-medium transition-colors duration-150 ${
            filterActive
              ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
              : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100"
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className={`h-3.5 w-3.5 shrink-0 transition-colors duration-150 ${filterActive ? "text-indigo-400" : "text-zinc-400"}`}
            aria-hidden
          >
            <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Filtreler</span>
          <span
            className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold transition-colors ${
              filterActive
                ? "bg-indigo-500/70 text-white"
                : "bg-amber-500/90 text-zinc-900"
            }`}
          >
            3
          </span>
        </button>

        {/* Notification bell */}
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-zinc-200"
          aria-label="Bildirimler"
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden>
            <path
              d="M8 2a4 4 0 0 0-4 4v2.5L2.5 10.5h11L12 8.5V6a4 4 0 0 0-4-4zM6.5 11.5a1.5 1.5 0 0 0 3 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
        </button>

        {/* User */}
        <div className="flex h-9 items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] pl-1.5 pr-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/35 text-[10px] font-bold text-indigo-200 ring-1 ring-inset ring-indigo-400/40">
            TF
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-zinc-200">Tugobo Founder</p>
            <p className="text-[10px] text-zinc-600">Kurucu Hesap</p>
          </div>
        </div>
      </div>
    </header>
  );
}
