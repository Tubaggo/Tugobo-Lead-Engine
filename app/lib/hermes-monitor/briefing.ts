import { EXECUTION_PRIORITY_RANK } from "@/app/lib/execution-runtime";
import { formatMrr } from "@/app/components/v2/adapters/revenue-recovery-adapter";
import type {
  HermesBriefApprovalItem,
  HermesMonitorBrief,
  HermesMonitorSummary,
  ShadowTask,
  ShadowTaskType,
} from "./types";

/**
 * Morning brief preview — what the Herald agent will one day deliver at
 * 07:00. Every sentence is a deterministic count from this monitor pass;
 * there is no free-form or generated prose, matching the Founder Coach
 * discipline. Conditional tense ("hazırlanabilirdi") is deliberate:
 * shadow mode reports what *would* have happened.
 */

const MAX_APPROVAL_QUEUE = 5;

function countByType(tasks: ShadowTask[], types: ShadowTaskType[]): number {
  return tasks.filter((t) => types.includes(t.taskType)).length;
}

export function buildMorningBriefPreview(
  summary: HermesMonitorSummary,
  tasks: ShadowTask[],
  now: number,
): HermesMonitorBrief {
  const verification = countByType(tasks, ["contact-verification"]);
  const enrichment = countByType(tasks, ["enrichment", "website-scan"]);
  const aiReview = countByType(tasks, ["ai-review"]);
  const drafts = countByType(tasks, ["outreach-draft"]);
  const followUps = countByType(tasks, ["follow-up", "recovery"]);
  const demos = countByType(tasks, ["demo-preparation"]);
  const approvals = summary.approvalCandidates.length;
  const escalations = summary.escalations.length;
  const waiting = summary.decisionCounts.WAIT;

  const highlights = [
    verification > 0 ? `${verification} iletişim doğrulama görevi oluşturulurdu.` : null,
    enrichment > 0 ? `${enrichment} zenginleştirme / site tarama görevi çalıştırılırdı.` : null,
    aiReview > 0 ? `${aiReview} lead için AI ticari incelemesi yapılırdı.` : null,
    drafts > 0 ? `${drafts} outreach taslağı hazırlanabilirdi.` : null,
    followUps > 0 ? `${followUps} takip/kurtarma teması onaya hazırlanırdı.` : null,
    demos > 0 ? `${demos} demo hazırlığı başlatılırdı.` : null,
    approvals > 0 ? `${approvals} fırsat Founder onayı bekliyor.` : null,
    escalations > 0 ? `${escalations} konu Founder kararı gerektiriyor.` : null,
    waiting > 0 ? `${waiting} lead yanıt penceresinde — izlemede kalırdı.` : null,
  ].filter((line): line is string => line !== null);

  if (highlights.length === 0) {
    highlights.push("Bu turda yürütülecek gölge görev çıkmadı — havuz sakin.");
  }

  // Founder decisions first, then approval-gated work; within each,
  // priority then commercial impact.
  const approvalQueue: HermesBriefApprovalItem[] = [
    ...summary.escalations,
    ...summary.approvalCandidates,
  ]
    .sort((a, b) => {
      const diff = EXECUTION_PRIORITY_RANK[b.priority] - EXECUTION_PRIORITY_RANK[a.priority];
      if (diff !== 0) return diff;
      return b.estimatedImpact - a.estimatedImpact;
    })
    .slice(0, MAX_APPROVAL_QUEUE)
    .map((c) => ({
      leadId: c.leadId,
      hotelName: c.hotelName,
      actionLabel: c.actionLabel,
      reason: c.actionReason,
      estimatedImpactLabel: c.estimatedImpact > 0 ? formatMrr(c.estimatedImpact) : "—",
      priority: c.priority,
    }));

  return {
    generatedAt: now,
    headline: "Günaydın Gökhan.",
    summary: `Bu sabah Hermes ${summary.leadsEvaluated} lead değerlendirdi ve ${summary.shadowTaskCount} gölge görev oluşturdu. Hiçbir aksiyon yürütülmedi — tümü önizleme.`,
    highlights,
    approvalQueue,
  };
}
