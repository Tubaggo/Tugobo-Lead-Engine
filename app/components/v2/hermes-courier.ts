import type { AutomationCard } from "@/app/components/v2/adapters/automation-center-adapter";
import type { CommCard } from "@/app/components/v2/adapters/communication-intelligence-adapter";
import type {
  HermesMission,
  HermesMissionTimelineItem,
} from "@/app/components/v2/adapters/hermes-mission-adapter";
import type { ShadowTask } from "@/app/lib/hermes-monitor";

/**
 * Hermes Courier Draft Runtime (v4.1.0-A).
 *
 * This is NOT a sending sprint. Nothing in this module ever calls an
 * external channel — it only prepares an outreach draft and carries it
 * through a founder review loop (draft_ready → edited → approved/rejected).
 * Sending is out of scope until a later sprint; approving a draft here only
 * changes its own status field.
 *
 * Session state only — HermesOutboundDraft is never persisted. It is kept
 * in a Record<missionId, HermesOutboundDraft> by the caller (V2Shell), the
 * same convention hermesDecisions and hermesPipelines already use.
 *
 * Does not touch Execution Runtime, the Decision Engine, Shadow Task
 * generation, mission grouping, lead scoring, or any schema — it only reads
 * fields those already produce (mission.tasks, AutomationCard, CommCard)
 * and derives a draft from them.
 */

export type DraftChannel = "whatsapp" | "instagram" | "email" | "unknown";
export type DraftStatus = "draft_ready" | "edited" | "approved" | "rejected";
export type DraftSource = "pipeline-complete" | "founder-manual";

export type HermesOutboundDraft = {
  id: string;
  missionId: string;
  leadId: string;
  hotelName: string;
  channel: DraftChannel;
  status: DraftStatus;
  createdAt: number;
  updatedAt: number;
  createdByAgent: "scribe";
  approvedByFounderAt: number | null;
  rejectedByFounderAt: number | null;
  /** Founder's own edit timestamp — kept distinct from approve/reject so the timeline can show it even after a later decision. */
  editedAt: number | null;
  subject?: string;
  body: string;
  originalBody: string;
  reason: string;
  evidence: string[];
  confidence: ShadowTask["confidence"];
  source: DraftSource;
};

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  draft_ready: "Taslak Hazır",
  edited: "Düzenlendi",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

export const DRAFT_CHANNEL_LABELS: Record<DraftChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "E-posta",
  unknown: "Kanal Belirsiz",
};

export const UNVERIFIED_CHANNEL_WARNING = "Kanal doğrulanmadan gönderim yapılmamalı.";
export const NO_SEND_NOTE = "Bu onay gönderim yapmaz. Gönderim sonraki sprintte bağlanacak.";
export const FOUNDER_DECISION_NEEDED = "Outreach taslağı için Founder kararı gerekiyor.";
export const NOT_SENT_LABEL = "Gönderilmedi";

/**
 * Channel resolution reuses Communication Intelligence's own verified/likely
 * channel status when the lead has already been through that screen's
 * adapter; falls back to raw AutomationCard contact fields (the same ones
 * Contact Finder / Re-Enrich already read) when no CommCard is available.
 * Never invents a channel — "unknown" is a valid, expected outcome.
 */
function resolveDraftChannel(card: AutomationCard, comm: CommCard | undefined): DraftChannel {
  if (comm) {
    if (comm.whatsappStatus === "verified" || comm.whatsappStatus === "likely") return "whatsapp";
    if (comm.instagramStatus === "verified" || comm.instagramStatus === "likely") return "instagram";
  }
  if (card.phone) return "whatsapp";
  if (card.instagram) return "instagram";
  return "unknown";
}

export type DraftGuardResult = { ok: true } | { ok: false; reason: string };

/**
 * Safety gate. `forced` is what lets a founder manually create a draft from
 * the Decision Center even when confidence is low — the absolute rules
 * (DNC, closed lost/won, no evidence) can never be bypassed, forced or not.
 */
export function canCreateDraft(
  mission: HermesMission,
  card: AutomationCard | undefined,
  forced: boolean,
): DraftGuardResult {
  if (!card) return { ok: false, reason: "Lead bulunamadı — taslak oluşturulamaz." };
  if (card.scoredLead.doNotContact) {
    return { ok: false, reason: "İletişim yasağı (DNC) aktif — taslak oluşturulamaz." };
  }
  if (card.scoredLead.status === "won" || card.scoredLead.status === "lost") {
    return { ok: false, reason: "Fırsat kapanmış — taslak oluşturulamaz." };
  }
  const primaryTask = mission.tasks.find((t) => t.id === mission.primaryTaskId) ?? mission.tasks[0];
  if (!primaryTask || (!primaryTask.suggestedAction.reason && primaryTask.reasons.length === 0)) {
    return { ok: false, reason: "Yeterli kanıt/gerekçe yok — taslak oluşturulamaz." };
  }
  if (!forced && primaryTask.confidence === "low") {
    return { ok: false, reason: FOUNDER_DECISION_NEEDED };
  }
  return { ok: true };
}

function buildDraftBody(hotelName: string, channel: DraftChannel): { subject?: string; body: string } {
  switch (channel) {
    case "instagram":
      return {
        body: `Merhaba ${hotelName} 👋\n\nTUGOBO AI olarak otellerin dijital kanallardan gelen rezervasyon taleplerini tek merkezden yönetmesine yardımcı oluyoruz.\n\nKısa bir demo ile size nasıl fayda sağlayabileceğimizi göstermek isteriz.\n\nMüsait olduğunuz bir zaman var mı?`,
      };
    case "email":
      return {
        subject: `${hotelName} için TUGOBO AI demo daveti`,
        body: `Merhaba ${hotelName} ekibi,\n\nTUGOBO AI olarak dijital kanallardan gelen rezervasyon taleplerini tek merkezden yönetmenize ve kaçan fırsatları azaltmanıza yardımcı oluyoruz.\n\nKısa bir demo ile işletmeniz için uygun olup olmadığını göstermek isteriz.\n\nMüsait olduğunuz bir zaman var mı?\n\nSaygılarımızla,\nTUGOBO AI`,
      };
    case "whatsapp":
    case "unknown":
    default:
      return {
        body: `Merhaba ${hotelName} ekibi,\n\nTUGOBO AI olarak dijital kanallardan gelen rezervasyon taleplerini tek merkezden yönetmenize ve kaçan fırsatları azaltmanıza yardımcı oluyoruz.\n\nKısa bir demo ile işletmeniz için uygun olup olmadığını göstermek isterim.\n\nMüsait olduğunuz bir zaman var mı?`,
      };
  }
}

/** Callers must run `canCreateDraft` first — this assumes the gate already passed. */
export function createOutreachDraft(
  mission: HermesMission,
  card: AutomationCard,
  comm: CommCard | undefined,
  source: DraftSource,
): HermesOutboundDraft {
  const channel = resolveDraftChannel(card, comm);
  const primaryTask = mission.tasks.find((t) => t.id === mission.primaryTaskId) ?? mission.tasks[0]!;
  const { subject, body } = buildDraftBody(mission.hotelName, channel);
  const now = Date.now();
  return {
    id: `draft:${mission.missionId}`,
    missionId: mission.missionId,
    leadId: mission.leadId,
    hotelName: mission.hotelName,
    channel,
    status: "draft_ready",
    createdAt: now,
    updatedAt: now,
    createdByAgent: "scribe",
    approvedByFounderAt: null,
    rejectedByFounderAt: null,
    editedAt: null,
    subject,
    body,
    originalBody: body,
    reason: primaryTask.suggestedAction.reason || primaryTask.decisionReason,
    evidence: primaryTask.reasons.slice(0, 3).map((r) => r.message),
    confidence: primaryTask.confidence,
    source,
  };
}

/** Pure: founder edits always move the draft to "edited", even if later approved/rejected. */
export function applyDraftEdit(draft: HermesOutboundDraft, newBody: string): HermesOutboundDraft {
  const now = Date.now();
  return { ...draft, body: newBody, status: "edited", editedAt: now, updatedAt: now };
}

/** Pure: approve-draft only — never triggers a send. */
export function applyDraftApproval(draft: HermesOutboundDraft): HermesOutboundDraft {
  const now = Date.now();
  return { ...draft, status: "approved", approvedByFounderAt: now, rejectedByFounderAt: null, updatedAt: now };
}

export function applyDraftRejection(draft: HermesOutboundDraft): HermesOutboundDraft {
  const now = Date.now();
  return { ...draft, status: "rejected", rejectedByFounderAt: now, approvedByFounderAt: null, updatedAt: now };
}

/**
 * Mission timeline entries generated purely from the draft's own timestamps —
 * mirrors buildPipelineTimelineEntries' convention in hermes-pipeline-engine.ts.
 */
export function buildDraftTimelineEntries(draft: HermesOutboundDraft | undefined): HermesMissionTimelineItem[] {
  if (!draft) return [];
  const items: HermesMissionTimelineItem[] = [
    { at: draft.createdAt, actorLabel: "Scribe", actorCls: "text-violet-300", text: "Taslak hazırladı" },
    { at: draft.createdAt, actorLabel: "Courier", actorCls: "text-violet-300", text: "Onaya sundu" },
  ];
  if (draft.editedAt) {
    items.push({ at: draft.editedAt, actorLabel: "Founder", actorCls: "text-zinc-100", text: "Taslağı düzenledi" });
  }
  if (draft.approvedByFounderAt) {
    items.push({
      at: draft.approvedByFounderAt,
      actorLabel: "Founder",
      actorCls: "text-emerald-400",
      text: "Taslağı onayladı — gönderilmedi",
    });
  }
  if (draft.rejectedByFounderAt) {
    items.push({
      at: draft.rejectedByFounderAt,
      actorLabel: "Founder",
      actorCls: "text-rose-400",
      text: "Taslağı reddetti",
    });
  }
  return items;
}
