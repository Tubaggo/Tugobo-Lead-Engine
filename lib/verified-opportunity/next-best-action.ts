import type { ScoredLead } from "@/app/lib/leads";
import type { OpportunityStage } from "./opportunity-stage";
import type { PipelineHealth } from "./pipeline-health";
import type { SalesPriority } from "./priority-engine";

export type ActionKey =
  | "call_today"
  | "send_whatsapp"
  | "reenrich_website"
  | "verify_contact"
  | "book_demo"
  | "wait_for_reply"
  | "follow_up_tomorrow"
  | "prepare_proposal"
  | "close_opportunity"
  | "lost_follow_up";

export type NextBestAction = {
  action: ActionKey;
  label: string;
  reason: string;
};

const ACTION_LABELS: Record<ActionKey, string> = {
  call_today: "Bugün Ara",
  send_whatsapp: "WhatsApp Gönder",
  reenrich_website: "Web Sitesini Tara",
  verify_contact: "Kişiyi Doğrula",
  book_demo: "Demo Ayarla",
  wait_for_reply: "Yanıt Bekle",
  follow_up_tomorrow: "Yarın Takip Et",
  prepare_proposal: "Teklif Hazırla",
  close_opportunity: "Satışı Kapat",
  lost_follow_up: "Kayıp Takibi",
};

export function computeNextBestAction(input: {
  lead: ScoredLead;
  stage: OpportunityStage;
  health: PipelineHealth;
  priority: SalesPriority;
}): NextBestAction {
  const { stage, health, lead } = input;
  const v = lead.signalVerification;
  const hasWa =
    v?.whatsappVerification === "verified" || v?.whatsappVerification === "likely";
  const hasWeb =
    v?.websiteVerification === "verified" || v?.websiteVerification === "reachable";
  const attempts = lead.contactAttempts ?? 0;

  if (stage === "LOST" || health === "Lost") {
    return {
      action: "lost_follow_up",
      label: ACTION_LABELS.lost_follow_up,
      reason: "Fırsat kaybedildi — sonraki dönem için kayıt tutun.",
    };
  }

  if (stage === "NEGOTIATION") {
    return {
      action: "close_opportunity",
      label: ACTION_LABELS.close_opportunity,
      reason: "Müzakere aşamasında — satışı kapatmak için harekete geçin.",
    };
  }

  if (stage === "DEMO_BOOKED") {
    return {
      action: "prepare_proposal",
      label: ACTION_LABELS.prepare_proposal,
      reason: "Demo planlandı — kişiselleştirilmiş teklifle hazır olun.",
    };
  }

  if (stage === "REPLIED") {
    return {
      action: "book_demo",
      label: ACTION_LABELS.book_demo,
      reason: "Yanıt alındı — demo için uygun zamanı ayarlayın.",
    };
  }

  if (stage === "CONTACTED" && attempts > 1) {
    return {
      action: "wait_for_reply",
      label: ACTION_LABELS.wait_for_reply,
      reason: `${attempts} iletişim denemesi yapıldı — yanıt bekleniyor.`,
    };
  }

  if (health === "Stale") {
    if (hasWa) {
      return {
        action: "send_whatsapp",
        label: ACTION_LABELS.send_whatsapp,
        reason: "Fırsat durgunlaşıyor — WhatsApp ile yeniden bağlantı kurun.",
      };
    }
    return {
      action: "follow_up_tomorrow",
      label: ACTION_LABELS.follow_up_tomorrow,
      reason: "Fırsat soğuyor — yarın için takip planı oluşturun.",
    };
  }

  if (stage === "CONTACT_READY") {
    if (hasWa) {
      return {
        action: "call_today",
        label: ACTION_LABELS.call_today,
        reason: "Tüm sinyaller doğrulandı — bugün arayın.",
      };
    }
    return {
      action: "send_whatsapp",
      label: ACTION_LABELS.send_whatsapp,
      reason: "İletişime hazır — ilk WhatsApp mesajını gönderin.",
    };
  }

  if (stage === "VERIFIED") {
    if (!hasWa && !lead.hasOwnWebsite) {
      return {
        action: "verify_contact",
        label: ACTION_LABELS.verify_contact,
        reason: "Kanal doğrulaması eksik — iletişim bilgilerini teyit edin.",
      };
    }
    return {
      action: "send_whatsapp",
      label: ACTION_LABELS.send_whatsapp,
      reason: "Lead doğrulandı — ilk mesajla süreci başlatın.",
    };
  }

  if (stage === "QUALIFIED") {
    if (!hasWeb) {
      return {
        action: "reenrich_website",
        label: ACTION_LABELS.reenrich_website,
        reason: "Web sitesi bilgisi eksik — zenginleştirme çalıştırın.",
      };
    }
    return {
      action: "verify_contact",
      label: ACTION_LABELS.verify_contact,
      reason: "Lead nitelikli — iletişim kanallarını doğrulayın.",
    };
  }

  // DISCOVERED
  return {
    action: "reenrich_website",
    label: ACTION_LABELS.reenrich_website,
    reason: "Yeni keşfedildi — sinyal zenginleştirmesini başlatın.",
  };
}
