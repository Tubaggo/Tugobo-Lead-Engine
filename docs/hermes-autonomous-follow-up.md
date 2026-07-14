# Hermes Autonomous Follow-up Orchestration (Sprint C5)

> **Takip planlaması ≠ takip gönderimi.**
> Follow-up scheduling does not equal follow-up sending. C5 hangi takibin ne
> zaman yapılacağını belirler ve founder onayına hazırlar; hiçbir takip mesajı
> otomatik göndermez.

## 1. Amaç (Objective)

Hermes zaten follow-up adayları oluşturabiliyordu ama takip operasyonu tek bir
güvenli orchestration döngüsü olarak çalışmıyordu. C5, mevcut Follow-up
Runtime'ı conversation/demo/outcome/teslimat/zamanlama sinyallerine ve founder
approval zincirine bağlayarak şu soruları cevaplar: hangi takip bugün yapılmalı,
hangisi erken, hangisi cevap/demo/sonuç değiştiği için iptal edilmeli, hangisi
founder onayına sunulmalı, aynı lead kaç kez takip edilebilir, ne zaman durmalı.

## 2. Mevcut Follow-up Runtime'ın yeniden kullanımı

C5 **yeni bir follow-up runtime YAZMADI.** Mevcut katman tek doğruluk kaynağı
olarak kalır:

| Katman | Modül | Kullanım |
|---|---|---|
| Candidate üretimi | `follow-up-runtime.ts` | `FollowUpCandidate`/`FollowUpReason` OKUNUR — yeni model yok |
| Candidate defteri | `follow-up-registry.ts` | **source of truth**; C5 buna dokunmaz |
| Founder status | `POST /api/hermes/follow-ups/status` | korunur (approval/dismiss/complete) |
| Recent feed | `GET /api/hermes/follow-ups` | korunur |

C5 yalnız bir **orchestration/karar** katmanı ekler; paralel candidate sistemi
kurmaz.

## 3. Orchestration durum modeli

`FollowUpOrchestrationState` (11 durum): `not_needed`, `waiting`, `due`,
`draft_needed`, `approval_required`, `approved_waiting_send`, `completed`,
`cancelled`, `dismissed`, `expired`, `blocked`.

Akış: **sinyal → waiting → due → draft_needed → approval_required →
approved_waiting_send** (son adım mevcut controlled-send zinciridir).

## 4. Trigger eşlemesi

`FollowUpTrigger` = mevcut `FollowUpReason` + `manual`. `source === "manual"` →
`manual`; aksi halde `reason` doğrudan trigger olur. Bilinmeyen → `unknown`.

## 5. Zamanlama policy'si (deterministik, server-kontrollü)

`hermes-follow-up-policy.ts` — client hiçbir değeri gönderemez/override edemez;
tüm sayısal alanlar sağlık sınırlarına clamp'lenir. `requireFounderApproval`
tip düzeyinde `true` sabittir.

| Trigger | Gecikme (default) |
|---|---|
| read_no_reply | 24 saat |
| delivered_no_reply | 48 saat |
| hot_reply_needs_action | 30 dakika |
| demo_not_scheduled | 4 saat |
| demo_no_show | 24 saat |
| failed_delivery_recovery | 15 dakika |
| later_requested | 72 saat |

`dueAt = candidate.createdAt + policy gecikmesi`. Diğer sınırlar:
`maxFollowUpsPerLead=3`, `minHoursBetweenFollowUps=24`, `expireAfterHours=336`.

## 6. Due / waiting mantığı

`now < dueAt` → **waiting**; `now ≥ dueAt` → **due**. Zamanı gelen normal takip
`draft_needed`'e geçer (taslak hazırlanacak). **failed_delivery_recovery ASLA
otomatik taslak hazırlamaz** — `due` + `manual_channel_review` + "İletişim
kanalını kontrol et" kalır (otomatik yeniden gönderim yok). Kanal yoksa
(`hasContactPath=false`) yine yalnız `due`.

## 7. İptal / bastırma

Şu durumlarda otomatik `cancelled`/`blocked`/`expired`:
DNC, ilgilenmiyor, yanlış numara (blok); yeni cevap geldi, demo planlandı/
tamamlandı, sonuç won/lost, konuşma kapandı, mission kapandı (iptal); daha
güncel takip min-aralıkta, max sayı aşıldı, süre doldu. Cancelled takip yeniden
taslak üretmez; audit yazılır; founder'a teknik değil güvenli Türkçe neden
gösterilir.

## 8. Conversation / demo / outcome entegrasyonu

Aggregator (`hermes-follow-up-orchestration-service.ts`) her aday için
sinyalleri mevcut registry'lerden toplar: **conversation-registry** (C4:
not_interested/wrong_number/closed), **demo-scheduling-registry** (scheduled/
completed), **sales-outcome-registry** (won/lost), **whatsapp-reply-registry**
(adaydan sonraki yeni cevap). Bu sinyaller saf `evaluateFollowUpOrchestration`'a
geçirilir — modül registry'lere erişmez, mutasyon yapmaz.

## 9. Taslak hazırlığı

Zamanı gelen uygun takip yalnız `draftNeeded=true` + `approvalRequired=true`
kararı üretir. Gerçek taslak mevcut **Courier/template motoru + Founder
Approval** zincirinden geçer; C5 yeni template sistemi kurmaz, metin üretmez.
Aynı mission'da zaten bir onay taslağı varsa (`hasActiveApprovalDraft`) ikinci
taslak üretilmez → durum `approval_required` olur.

## 10. Founder onayı garantisi + no-auto-send

`FollowUpOrchestrationDecision` üzerinde **`sendAllowed`/`founderApproved` alanı
YOKTUR.** Runtime/servis/route hiçbir mesajlaşma/provider/gateway/send modülü
import etmez → gönderim tip düzeyinde imkânsızdır. `requireFounderApproval` asla
kapatılamaz.

## 11. Scheduler / evaluation stratejisi

C5 **read/evaluate-on-fetch** modelini kullanır: `GET /api/hermes/follow-ups/
orchestration` her okumada mevcut aday + güncel sinyalleri yeniden değerlendirir
ve orchestration registry'sini tazeler. Scheduler-uyumlu **`POST /api/hermes/
follow-ups/evaluate`** aynı aggregator'ı çalıştırır; `scheduled` trigger cron
secret (`HERMES_FOLLOW_UP_CRON_SECRET`, acquisition secret'a fallback) gerektirir
(acquisition run route'unun aynı kalıbı). Client policy/dueAt/onay/gönderim
gönderemez. Servis re-entrancy lock ile korunur; idempotent (aynı durum → aynı
kararlar → upsert). **Arka plan cron bu sprintte kurulmak zorunda değildir** —
route yalnız scheduler-uyumludur.

## 12. Kayıt defteri

`hermes-follow-up-orchestration-registry.ts` — YALNIZ orchestration state
snapshot'ı. 14 gün TTL, max 500, `followUpCandidateId` bazlı upsert (retry-safe),
lead/mission indeks, audit scrub. Ham telefon/mesaj/token/payload SAKLAMAZ.

## 13. Founder Home / Decision Queue / Opportunity Focus / Activity

"Hermes Takip Planı" bölümü: Bugün Takip / Yaklaşan / Onay Bekleyen / Kanal
Kontrolü grupları; kart başına işletme adı, neden, ne zaman, öneri, founder
kararı. **"Gönder" butonu YOK**, teknik terim yok. Decision Queue'da mevcut
demo/conversation/approval kararları zaten founder kararlarını taşıdığından
paralel duplicate kart eklenmez (duplicate önleme). Opportunity Focus seçili
fırsatın takip durumunu/zamanını gösterir. Aktivite founder-güvenli etiketler
kullanır.

## 14. QA kontrol listesi

- [x] read_no_reply: eşik öncesi waiting, sonrası due/draft
- [x] later: gelecekteki takip, anlık karar yok
- [x] demo talep + planlanmamış: due
- [x] demo planlandı: önceki takip iptal
- [x] demo no-show: recovery takibi
- [x] yeni cevap: eski no-reply takip bastırıldı
- [x] ilgilenmiyor/yanlış numara: takip yok/blok
- [x] due takip: approval-required taslak, gönderim yok
- [x] retry: duplicate yok
- [x] Founder Home: Türkçe, "Gönder" yok, teknik terim yok
- [x] mevcut controlled send: değişmedi

## 15. Production etkinleştirme / rollback

- **Etkinleştirme:** `DEFAULT_FOLLOW_UP_POLICY.enabled = true` (default). İsteğe
  bağlı scheduler `POST /api/hermes/follow-ups/evaluate`'i `HERMES_FOLLOW_UP_
  CRON_SECRET` ile çağırır.
- **Rollback:** policy `enabled=false` → servis erken döner, hiçbir orchestration
  kararı üretilmez; mevcut follow-up/demo/conversation davranışı hiç etkilenmez.

## 16. Bilinen sınırlamalar

- In-memory store; server restart'ında kaybolur.
- `dueAt` aday `createdAt`'ine dayanır (deterministik); ayrı per-event timestamp
  join'i yapılmaz.
- Lead `doNotContact` alanı server registry'lerinde taşınmadığından DNC bloğu
  esas olarak konuşma not_interested/wrong_number sinyalleri üzerinden uygulanır;
  saf runtime `doNotContact` sinyalini destekler (test edildi).
- Arka plan cron altyapısı kurulmadı; route scheduler-uyumlu bırakıldı.
