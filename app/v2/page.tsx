import type { Metadata } from "next";
import { scoreAll } from "@/app/lib/leads";
import { adaptV2Data } from "@/app/components/v2/adapters/revenue-queue-adapter";
import V2Shell from "@/app/components/v2/V2Shell";

export const metadata: Metadata = {
  title: "Gelir Kuyruğu — Tugobo Lead Engine v2",
};

export default function V2Page() {
  const scored = scoreAll();
  const { rows, kpi, ctx } = adaptV2Data(scored);
  return <V2Shell rows={rows} kpi={kpi} ctx={ctx} />;
}
