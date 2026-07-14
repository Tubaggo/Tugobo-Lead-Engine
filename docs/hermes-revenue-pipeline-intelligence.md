# Hermes Revenue Pipeline Intelligence (Sprint C6)

> **Pipeline zekâsı muhasebe DEĞİLDİR. Tahmini gelir, tahsil edilmiş gelir
> değildir.** C6 mevcut satış sinyallerini tek, açıklanabilir bir ticari
> görünümde birleştirir; hiçbir gelir değeri uydurmaz, hiçbir sonucu otomatik
> won/lost yapmaz.

## 1. Amaç

Founder tek bakışta görmeli: kaç aktif fırsat var, hangileri satışa yakın,
hangileri riskte, tahmini/kazanılmış/risk altındaki gelir ne, bugün hangi
fırsata müdahale edilmeli. C6 bunu mevcut runtime kayıtlarından **deterministik**
üretir.

## 2. Mevcut runtime'ların yeniden kullanımı

C6 **yeni Sales Outcome / CRM / finans motoru yazmadı.** Okuduğu kaynaklar:
qualification, outreach, delivery-receipt, conversation (C4), demo-scheduling,
follow-up + orchestration (C5), **sales-outcome (gelir source-of-truth)**.

## 3. Aşama modeli (15 durum)

`discovered → qualified → outreach_prepared → approval_pending → contacted →
reply_received → conversation_active → demo_pending → demo_scheduled →
follow_up_due → outcome_pending → won / lost / paused / blocked`. Founder
karşılıkları `REVENUE_STAGE_LABELS_TR`'de (Yeni Fırsat … İşlem Engellendi).

## 4. Precedence (deterministik)

Tek precedence: **kapalı sonuçlar (won/lost/paused) her şeyi geçersiz kılar** →
güvenlik blokları → outcome_pending → follow_up_due → demo_scheduled →
demo_pending → conversation_active → reply_received → contacted →
approval_pending → outreach_prepared → qualified → discovered. Çelişkili çıktı
yok (test edildi).

## 5. Gelir kategorileri (KESİN ayrık)

Kaynak yalnız **mevcut Sales Outcome tahminidir** (`estimatedMrr`); yoksa null.
- **Realized:** yalnız `won` → `realizedMrr = estimatedMrr`, `realizedArr = ×12`.
- **Potential:** açık pipeline'ın `estimatedMrr`'i (gerçek tahmin varsa).
- **Risked:** açık + `health = at_risk` olan fırsatın `estimatedMrr`'i.
- **Lost:** `lost` fırsatın `estimatedMrr`'i (varsa).

Sert kurallar: varsayılan paket fiyatı yok, otomatik fiyat çıkarımı yok, uydurma
ağırlıklı olasılık yok, **bilinmeyen MRR null kalır (asla sahte ₺0)**, 0 ve
bilinmeyen karıştırılmaz.

## 6. Risk zekâsı

`deriveRevenueRisks` mevcut operasyonel sinyallerden 13 risk kodu türetir
(delivery_failed, reply_waiting, hot_reply_unhandled, demo_not_scheduled,
demo_no_show, follow_up_overdue, outcome_missing, stale_opportunity,
missing_revenue_estimate, blocked_contact, wrong_number, not_interested,
duplicate_process). Eşikler policy'den gelir. Başka bir runtime'ın sahiplendiği
karar burada **tekrar karar kartına çevrilmez** — yalnız bilgilendirici risk
kodudur (bkz. §Karar Merkezi).

## 7. Aggregation / servis

`hermes-revenue-pipeline-service.ts` — server-only, **read-time aggregation**.
Fırsat evrenini mevcut registry anahtarlarının birleşiminden (missionId/leadId)
kurar, her fırsat için saf runtime'ı çağırır, sıralı pipeline + özet döner.
**Yeni source-of-truth registry oluşturmaz, downstream'i mutate etmez.**

## 8. Özet / dönüşüm

`summarizeRevenuePipeline`: aşama/sağlık sayıları + ayrık gelir toplamları
(null-safe, sahte 0 yok) + kümülatif funnel dönüşümü (qualifiedToContacted,
contactedToReply, replyToDemo, demoToWon). **Dönüşüm yalnız payda > 0 iken
hesaplanır; aksi halde null** (yanıltıcı %0 yok).

## 9. API

`GET /api/hermes/revenue-pipeline` — sanitize edilmiş `items` + `summary` +
`updatedAt`. Query: `activeOnly=true`, `limit` (katı doğrulanır). Client aşama/
won-lost/MRR/policy/risk eşiği override edemez, sahte gelir enjekte edemez.
Mutation route yok. Payload'da ham telefon/mesaj/provider/token/secret yok.

## 10. Founder Home — "Gelir Nabzı"

7 kompakt KPI (Aktif Fırsat, Sonuca Yakın, Riskte, Sonuç Bekliyor, Kazanılan
MRR, Potansiyel MRR, Risk Altındaki MRR) + "Gelire En Yakın Fırsatlar" +
"Riskteki Fırsatlar" listeleri. **Bilinmeyen tutar "Henüz belirlenmedi"**, asla
sahte ₺0. Grafik yok, dashboard yeniden tasarımı yok. Pipeline fetch başarısızsa
gerçek won/lost/MRR özeti (Sales Outcome) fallback olarak kalır.

## 11. Karar Merkezi sahipliği

C6 **yeni karar kartı EKLEMEZ** — teslimat/demo/takip/sonuç kararları zaten
mevcut Karar Merkezi'nde sahiplenilmiştir; duplicate önlemek için gelir riskleri
"Riskteki Fırsatlar" listesinde görünür (karar kartı değil). "outcome_required"
zaten mevcut ActionStage tarafından sahiplenilir.

## 12. Fırsat Odağı

`selectRevenuePipelineForLead` seçili fırsatın satış aşaması, sağlığı, gelir
potansiyeli, tahmini MRR/ARR, riski, son aktivitesi ve founder sonraki aksiyonunu
sağlar — "Bu fırsat gelir üretmeye ne kadar yakın ve şimdi ne yapmalıyım?"

## 13. Hermes Bugün

`buildRevenueDailyLines` yalnız gerçek sayılardan ticari cümleler üretir
(risk altındaki fırsat sayısı, sonuç bekleyen, kazanılan aylık gelir). **"Bu ay"
yalnız gerçek realized gelir varsa** söylenir; uydurma sayı yok.

## 14. Mevcut gelir ekranları

Developer altındaki Gelir Pipeline/Tahmini/Risk/Recovery/Analizi ekranları
**silinmedi** — advanced/debug görünüm olarak kalır. Founder Home yeni
intelligence'ı ana kaynak alır.

## 15. Audit

10 güvenli event tipi (`hermes_revenue_pipeline_evaluated` …
`hermes_revenue_pipeline_failed`); alanlar leadId/missionId/stage/health/
riskCodes/estimatedMrr/realizedMrr/timestamp; ham mesaj/telefon/secret/payload
yok, scrub edilir.

## 16. Kaynak-doğruluk beyanı

**Sales Outcome tek doğruluk kaynağıdır.** C6 paralel bir sonuç/CRM pipeline'ı
oluşturmaz; won/lost hiçbir zaman otomatik çıkarılmaz.

## 17. QA kontrol listesi

- [x] erken fırsat (qualified) — sahte gelir yok
- [x] contacted / conversation_active / demo_pending / demo_scheduled
- [x] follow_up_due (mevcut takip kararı sahiplenir)
- [x] outcome_pending (founder kararı görünür)
- [x] won → realized MRR; artık aktif/risked değil
- [x] lost → kapalı; lostMrr yalnız biliniyorsa
- [x] bilinmeyen MRR → "Henüz belirlenmedi", ₺0 değil
- [x] Founder Home kompakt, güvenli Türkçe, teknik terim yok
- [x] mevcut satış zinciri değişmedi, otomatik sonuç/gönderim yok

## 18. Bilinen sınırlamalar

- In-memory read-time aggregation; server restart'ında türetilmiş görünüm sıfırlanır (kaynak registry'ler kadar).
- `ageInStageHours` gerçek aşama-giriş geçmişi tutulmadığından son aktiviteye göre yaklaşıktır.
- Server evreni yalnız ticari sinyali olan fırsatları kapsar; hiç aktivitesi olmayan "discovered" lead'ler server tarafında görünmez.
- Gelir yalnız Sales Outcome'dan gelir; founder bir tahmin girmedikçe çoğu erken fırsat "Henüz belirlenmedi" kalır.

## 19. Rollback / disable

Policy `enabled=false` → servis boş pipeline döner; Founder Home fallback
won/lost özetini gösterir; mevcut hiçbir satış zinciri etkilenmez.
