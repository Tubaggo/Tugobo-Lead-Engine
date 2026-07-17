/**
 * Hermes Controlled Send Readiness adapter (Founder Message Review &
 * Revision Flow v1.0).
 *
 * Pure, deterministic answer to "can this message actually be sent right
 * now?" once a real draft has been approved. Reads nothing new — every
 * input is a field another screen already fetched or holds
 * (`draft.status`, the lead's own `phone`/`signalVerification`, the
 * already-fetched `WhatsAppReadinessStatus`). Never claims "ready" unless
 * founder approval, a verified phone, AND `controlled_live_ready` provider
 * status are all true at once — this sprint sends nothing, so "ready" here
 * only ever means "nothing left to block it," never "a send happened."
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every v8
 * adapter in this codebase follows.
 */

export type ControlledSendDraftStatus = "draft_ready" | "edited" | "approved" | "rejected";

export type ControlledSendReadinessInput = {
  draftStatus: ControlledSendDraftStatus;
  draftBody: string;
  /** True while the founder has an open, unsaved edit-mode buffer — approval is never computed as "ready" mid-edit. */
  hasUnsavedEdit: boolean;
  recipientPhone: string | null | undefined;
  recipientPhoneVerified: boolean;
  /** True only when the provider's real readiness status is "controlled_live_ready" — every other value must always read as not-ready. */
  whatsappProviderReady: boolean;
};

export type ControlledSendReadiness = {
  draftStatusLabel: string;
  phoneLabel: string;
  phoneVerified: boolean;
  providerStatusLabel: string;
  founderApprovalLabel: string;
  controlledSendReady: boolean;
  controlledSendLabel: string;
  blockingReasonLabel: string | null;
  nextStepLabel: string;
};

export const CONTROLLED_SEND_READINESS_LABELS = {
  draftApproved: "Onaylandı",
  draftPending: "Bekliyor",
  draftRejected: "Reddedildi",
  phoneMissing: "WhatsApp numarası henüz doğrulanmadı.",
  providerReady: "Hazır",
  providerNotReady: "Gönderim altyapısı hazır değil.",
  founderApprovalYes: "Var",
  founderApprovalNo: "Yok",
  readyLabel: "Hazır",
  blockedLabel: "Bloke",
  reasonApprovalMissing: "Founder onayı bekleniyor.",
  reasonUnsavedEdit: "Kaydedilmemiş değişiklik var — önce kaydet veya vazgeç.",
  reasonPhoneMissing: "WhatsApp numarası henüz doğrulanmadı.",
  reasonProviderNotReady: "Gönderim altyapısı hazır değil.",
  nextStepReady: "Kontrollü gönderim ayrı bir founder aksiyonu olarak başlatılabilir.",
} as const;

function draftStatusLabelOf(status: ControlledSendDraftStatus): string {
  if (status === "approved") return CONTROLLED_SEND_READINESS_LABELS.draftApproved;
  if (status === "rejected") return CONTROLLED_SEND_READINESS_LABELS.draftRejected;
  return CONTROLLED_SEND_READINESS_LABELS.draftPending;
}

export function computeControlledSendReadiness(input: ControlledSendReadinessInput): ControlledSendReadiness {
  const founderApproved = input.draftStatus === "approved";
  const phoneOk = Boolean(input.recipientPhone?.trim()) && input.recipientPhoneVerified;
  const bodyOk = input.draftBody.trim() !== "";

  const controlledSendReady =
    founderApproved && phoneOk && input.whatsappProviderReady && !input.hasUnsavedEdit && bodyOk;

  let blockingReasonLabel: string | null = null;
  if (!founderApproved) blockingReasonLabel = CONTROLLED_SEND_READINESS_LABELS.reasonApprovalMissing;
  else if (input.hasUnsavedEdit) blockingReasonLabel = CONTROLLED_SEND_READINESS_LABELS.reasonUnsavedEdit;
  else if (!phoneOk) blockingReasonLabel = CONTROLLED_SEND_READINESS_LABELS.reasonPhoneMissing;
  else if (!input.whatsappProviderReady) blockingReasonLabel = CONTROLLED_SEND_READINESS_LABELS.reasonProviderNotReady;

  return {
    draftStatusLabel: draftStatusLabelOf(input.draftStatus),
    phoneLabel: input.recipientPhone?.trim() ? input.recipientPhone.trim() : CONTROLLED_SEND_READINESS_LABELS.phoneMissing,
    phoneVerified: phoneOk,
    providerStatusLabel: input.whatsappProviderReady
      ? CONTROLLED_SEND_READINESS_LABELS.providerReady
      : CONTROLLED_SEND_READINESS_LABELS.providerNotReady,
    founderApprovalLabel: founderApproved
      ? CONTROLLED_SEND_READINESS_LABELS.founderApprovalYes
      : CONTROLLED_SEND_READINESS_LABELS.founderApprovalNo,
    controlledSendReady,
    controlledSendLabel: controlledSendReady
      ? CONTROLLED_SEND_READINESS_LABELS.readyLabel
      : CONTROLLED_SEND_READINESS_LABELS.blockedLabel,
    blockingReasonLabel: controlledSendReady ? null : blockingReasonLabel,
    nextStepLabel: controlledSendReady
      ? CONTROLLED_SEND_READINESS_LABELS.nextStepReady
      : (blockingReasonLabel ?? ""),
  };
}
