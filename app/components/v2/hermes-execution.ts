import type { AutomationCard } from "@/app/components/v2/adapters/automation-center-adapter";
import type { HermesMission } from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { ShadowTaskType } from "@/app/lib/hermes-monitor";
import { scheduleFollowUpForLead } from "@/app/hooks/useLeadMutations";

/**
 * Hermes Safe Actions (A4, refactored for A5).
 *
 * The only module that actually calls a fetch or a mutation on Hermes's
 * behalf. Wires exactly four already-existing, already-safe internal calls —
 * Contact Finder, re-enrich, AI insight, follow-up scheduling — for use by
 * the Hermes Pipeline Engine (`hermes-pipeline-engine.ts`), which sequences
 * them into a mission's execution chain. This file has no notion of a
 * "mission" or a "pipeline" itself — it only knows how to run one safe
 * action given a lead, and report what happened.
 *
 * No outbound message is ever sent from this module. It does not touch the
 * Decision Engine, Shadow Task generation, or mission grouping.
 */

export type ExecutableActionKey = "verify_contact" | "re_enrich" | "ai_review" | "follow_up";

/** One stage's outcome — the pipeline engine attaches mission/stage/agent identity on top of this. */
export type HermesStageOutcome = {
  status: "succeeded" | "failed";
  message: string;
  detail?: string;
  error?: string;
};

/**
 * Task type → the one safe internal action it maps to. Everything not
 * listed here — outreach-draft, recovery, demo-preparation, proposal,
 * reply-monitoring, close-decision, founder-review — has no execution path.
 * Those stay approval/preview-only; note "website-scan" (Tracer's
 * re-enrichment variant) maps to the same re_enrich call as "enrichment" —
 * both scan/refresh the lead, neither sends anything.
 */
const SAFE_TASK_TYPE_ACTION: Partial<Record<ShadowTaskType, ExecutableActionKey>> = {
  "contact-verification": "verify_contact",
  "website-scan": "re_enrich",
  enrichment: "re_enrich",
  "ai-review": "ai_review",
  "follow-up": "follow_up",
};

const ACTION_LABELS: Record<ExecutableActionKey, string> = {
  verify_contact: "İletişim Doğrulama (Contact Finder)",
  re_enrich: "Yeniden Zenginleştirme",
  ai_review: "AI İnceleme",
  follow_up: "Takip Planlama",
};

export function actionLabelOf(action: ExecutableActionKey): string {
  return ACTION_LABELS[action];
}

/**
 * Null means the mission's underlying task has no safe execution path at
 * all — used both to gate the pipeline entirely (A5) and, historically, to
 * gate the single-shot action (A4).
 */
export function resolveExecutableAction(mission: HermesMission): ExecutableActionKey | null {
  const task = mission.tasks.find((t) => t.id === mission.primaryTaskId) ?? mission.tasks[0];
  if (!task) return null;
  return SAFE_TASK_TYPE_ACTION[task.taskType] ?? null;
}

async function runVerifyContact(card: AutomationCard): Promise<HermesStageOutcome> {
  if (!card.website && !card.phone && !card.instagram) {
    return {
      status: "failed",
      message: "Bu lead için doğrulama yapılacak yeterli kanal bilgisi bulunamadı.",
      error: "no-channel-data",
    };
  }
  try {
    const res = await fetch("/api/contact-finder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website: card.website ?? "",
        phone: card.phone ?? "",
        instagram: card.instagram ?? "",
      }),
    });
    const data = (await res.json()) as {
      bestContactType?: string;
      bestContactValue?: string;
      confidence?: string;
      error?: string;
    };
    if (!res.ok || data.error) {
      return {
        status: "failed",
        message: "İletişim doğrulama başarısız oldu.",
        error: data.error ?? `HTTP ${res.status}`,
      };
    }
    return {
      status: "succeeded",
      message: "İletişim kanalı doğrulandı.",
      detail: `${data.bestContactType ?? "—"}: ${data.bestContactValue ?? "—"} (${data.confidence ?? "—"} güven)`,
    };
  } catch (e) {
    return {
      status: "failed",
      message: "İletişim doğrulama başarısız oldu.",
      error: e instanceof Error ? e.message : "Bağlantı hatası",
    };
  }
}

async function runReEnrich(card: AutomationCard): Promise<HermesStageOutcome> {
  if (!card.website && !card.phone) {
    return {
      status: "failed",
      message: "Bu lead için zenginleştirme yapılacak yeterli veri (web sitesi veya telefon) bulunamadı.",
      error: "no-enrich-input",
    };
  }
  try {
    const res = await fetch("/api/re-enrich-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead: card.scoredLead }),
    });
    const data = (await res.json()) as { lead?: Record<string, unknown>; error?: string };
    if (!res.ok || data.error) {
      return { status: "failed", message: "Zenginleştirme başarısız oldu.", error: data.error ?? `HTTP ${res.status}` };
    }
    const l = (data.lead ?? {}) as Record<string, unknown>;
    const score =
      typeof l.verifiedOpportunityScore === "number"
        ? l.verifiedOpportunityScore
        : typeof l.opportunityScore === "number"
          ? l.opportunityScore
          : "—";
    const icpScore =
      typeof l.icpFitScore === "number" ? l.icpFitScore : typeof l.leadScore === "number" ? l.leadScore : "—";
    return {
      status: "succeeded",
      message: "Zenginleştirme tamamlandı.",
      detail: `Fırsat Skoru: ${score} · ICP: ${icpScore}`,
    };
  } catch (e) {
    return {
      status: "failed",
      message: "Zenginleştirme başarısız oldu.",
      error: e instanceof Error ? e.message : "Bağlantı hatası",
    };
  }
}

async function runAiReview(card: AutomationCard): Promise<HermesStageOutcome> {
  try {
    const res = await fetch("/api/ai-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead: card.scoredLead, locale: "tr" }),
    });
    const data = (await res.json()) as { aiInsight?: string; error?: string };
    if (!res.ok || data.error) {
      return { status: "failed", message: "AI incelemesi başarısız oldu.", error: data.error ?? `HTTP ${res.status}` };
    }
    const insight = (data.aiInsight ?? "").trim();
    return {
      status: "succeeded",
      message: "AI incelemesi tamamlandı.",
      detail: insight.length === 0 ? undefined : insight.length > 180 ? `${insight.slice(0, 180)}…` : insight,
    };
  } catch (e) {
    return {
      status: "failed",
      message: "AI incelemesi başarısız oldu.",
      error: e instanceof Error ? e.message : "Bağlantı hatası",
    };
  }
}

/** Internal planning only — schedules +24h. Never sends a message. */
function runFollowUp(card: AutomationCard): HermesStageOutcome {
  scheduleFollowUpForLead(card.id, Date.now() + 24 * 60 * 60 * 1000);
  return {
    status: "succeeded",
    message: "Takip planı Hermes tarafından oluşturuldu.",
    detail: "Sonraki takip: +24 saat — mesaj gönderilmedi.",
  };
}

/**
 * Runs exactly one safe action against one lead. This is the single
 * primitive the Hermes Pipeline Engine sequences four times (once per
 * stage) — it has no knowledge of missions, pipelines, or what comes next.
 */
export async function runSafeAction(action: ExecutableActionKey, card: AutomationCard): Promise<HermesStageOutcome> {
  switch (action) {
    case "verify_contact":
      return runVerifyContact(card);
    case "re_enrich":
      return runReEnrich(card);
    case "ai_review":
      return runAiReview(card);
    case "follow_up":
      return runFollowUp(card);
  }
}
