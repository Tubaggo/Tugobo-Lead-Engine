import type { Metadata } from "next";
import { scoreAll } from "@/app/lib/leads";
import { adaptV2Data } from "@/app/components/v2/adapters/revenue-queue-adapter";
import { adaptScoredLeadsToCards } from "@/app/components/v2/adapters/lead-list-adapter";
import { adaptScoredLeadsToIcpCards } from "@/app/components/v2/adapters/icp-analysis-adapter";
import { adaptScoredLeadsToCommCards } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import { adaptScoredLeadsToFollowUpCards } from "@/app/components/v2/adapters/follow-ups-adapter";
import { adaptScoredLeadsToPipelineCards } from "@/app/components/v2/adapters/revenue-pipeline-adapter";
import V2Shell from "@/app/components/v2/V2Shell";

export const metadata: Metadata = {
  title: "Gelir Kuyruğu — Tugobo Lead Engine v2",
};

export default function V2Page() {
  const scored = scoreAll();
  const { rows, kpi, ctx } = adaptV2Data(scored);
  const cards = adaptScoredLeadsToCards(scored);
  const icpCards = adaptScoredLeadsToIcpCards(scored);
  const commCards = adaptScoredLeadsToCommCards(scored);
  const followUpCards = adaptScoredLeadsToFollowUpCards(scored);
  const pipelineCards = adaptScoredLeadsToPipelineCards(scored);
  return <V2Shell rows={rows} kpi={kpi} ctx={ctx} cards={cards} icpCards={icpCards} commCards={commCards} followUpCards={followUpCards} pipelineCards={pipelineCards} />;
}
