import type { ScoredLead } from "@/app/lib/leads";
import type { OpportunityStage } from "./opportunity-stage";
import type { PipelineHealth } from "./pipeline-health";
import type { SalesPriority } from "./priority-engine";
import type { NextBestAction } from "./next-best-action";
import type { Blocker } from "./blocker-engine";

export function computeFounderInsight(input: {
  lead: ScoredLead;
  stage: OpportunityStage;
  priority: SalesPriority;
  health: PipelineHealth;
  nextBestAction: NextBestAction;
  blockers: Blocker[];
  confidenceScore: number;
}): string {
  const { lead, stage, priority, health, nextBestAction, blockers, confidenceScore } = input;
  const v = lead.signalVerification;
  const sentences: string[] = [];

  // Sentence 1: Overall opportunity assessment
  if (stage === "CUSTOMER") {
    sentences.push(
      `${lead.name} aktif bir müşteri — bu ilişkiyi güçlendirmeye odaklanın.`,
    );
  } else if (stage === "LOST") {
    sentences.push(
      `${lead.name} şu anda kaybedilmiş görünüyor — iletişim engeli veya ilgi eksikliği tespit edildi.`,
    );
  } else if (priority === "CRITICAL") {
    sentences.push(
      `${lead.name} bu hafta en yüksek öncelikli fırsatınız — %${confidenceScore} güven skoru ile satışa çok yakın.`,
    );
  } else if (priority === "URGENT") {
    sentences.push(
      `${lead.name} için fırsat penceresi daralıyor — %${confidenceScore} güven skoru ile acil takip gerekiyor.`,
    );
  } else if (priority === "HIGH") {
    sentences.push(
      `${lead.name}, %${confidenceScore} güven skoru ile yüksek potansiyelli bir fırsat sunuyor.`,
    );
  } else {
    sentences.push(
      `${lead.name}, mevcut sinyal kalitesiyle orta düzeyde bir satış fırsatı temsil ediyor.`,
    );
  }

  // Sentence 2: Key channel signal or top blocker
  const criticalBlocker = blockers.find((b) => b.severity === "critical");
  if (criticalBlocker) {
    sentences.push(`Kritik engel: ${criticalBlocker.label}.`);
  } else if (
    v?.whatsappVerification === "verified" &&
    v?.reservationSignal === "verified"
  ) {
    sentences.push(
      "WhatsApp doğrulandı ve rezervasyon CTA aktif — doğrudan satış yolu açık.",
    );
  } else if (v?.whatsappVerification === "verified") {
    sentences.push(
      "WhatsApp doğrulandı — bu fırsat için en etkili iletişim kanalı hazır.",
    );
  } else if (!v || v.whatsappVerification === "not_found") {
    sentences.push(
      "Doğrulanmış bir WhatsApp numarası bulunamadı — bu boşluk kapanmadan outreach zorlanacak.",
    );
  }

  // Sentence 3: Timing and stage context
  if (stage === "CONTACT_READY" || stage === "VERIFIED") {
    sentences.push("Bu fırsat bugün outreach için uygun — harekete geçin.");
  } else if (health === "Stale") {
    if (typeof lead.lastContactedAt === "number") {
      const daysSince = Math.round(
        (Date.now() - lead.lastContactedAt) / (1000 * 60 * 60 * 24),
      );
      sentences.push(
        `Son iletişimden bu yana ${daysSince} gün geçti — acil takip yapılmazsa bu fırsat soğuyacak.`,
      );
    } else {
      sentences.push(
        "Bu fırsat durgunlaşıyor — yeniden bağlantı kurmak için geç kalmadan harekete geçin.",
      );
    }
  } else if (stage === "NEGOTIATION" || stage === "DEMO_BOOKED") {
    sentences.push("Bu fırsat kapanma aşamasına yakın — teklifi hazır tutun.");
  }

  // Sentence 4: Action directive (avoid restating "wait" passives)
  if (
    sentences.length < 4 &&
    nextBestAction.action !== "wait_for_reply" &&
    nextBestAction.action !== "lost_follow_up"
  ) {
    sentences.push(
      `Önerilen aksiyon: ${nextBestAction.label} — ${nextBestAction.reason}`,
    );
  }

  return sentences.slice(0, 4).join(" ");
}
