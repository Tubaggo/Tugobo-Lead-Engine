import type { Metadata } from "next";
import { scoreAll } from "@/app/lib/leads";
import V2Shell from "@/app/components/v2/V2Shell";

export const metadata: Metadata = {
  title: "Gelir Kuyruğu — Tugobo Lead Engine v2",
};

export default function V2Page() {
  const scored = scoreAll();
  return <V2Shell scoredLeads={scored} />;
}
