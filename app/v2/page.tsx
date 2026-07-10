import type { Metadata } from "next";
import { scoreAll } from "@/app/lib/leads";
import V2Shell from "@/app/components/v2/V2Shell";

export const metadata: Metadata = {
  // v8.5 (Release Candidate Polish) — "Gelir Kuyruğu" was the pre-v8.0 IA's
  // product name; the browser tab now matches the current Hermes identity.
  title: "Hermes — Tugobo Lead Engine",
};

export default function V2Page() {
  const scored = scoreAll();
  return <V2Shell scoredLeads={scored} />;
}
