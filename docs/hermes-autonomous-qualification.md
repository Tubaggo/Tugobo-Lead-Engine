# Hermes Autonomous Qualification (Sprint C2)

## Amaç

Hermes'in keşfettiği her işletme için founder'a **tek, açıklanabilir ve
güvenli** bir ticari qualification kararı üretmek. Farklı modüllere dağılmış
sinyaller (fırsat puanı, ICP uyumu, doğrulama durumları, enrichment tazeliği)
tek karar altında toplanır; founder "bu işletme satışa hazır mı, değilse
neden değil?" sorusunun cevabını tek yerden okur.

**Qualification ≠ onay. Qualification ≠ gönderim.** Bu katman yalnız
değerlendirir; hiçbir WhatsApp mesajı göndermez, hiçbir founder onayı
üretmez, Delivery Gateway'e dokunmaz. Outreach hâlâ mevcut Founder Approval →
Courier Draft → Delivery Gateway → controlled-send zincirinin arkasındadır.

## Yeniden kullanılan sinyaller (yeni skor motoru YOK)

| Sinyal | Kaynağı | Qualification'da okunuşu |
| --- | --- | --- |
| `verifiedOpportunityScore` | `opportunity-scoring.ts` (v1.4) | Skor barı; eşik acquisition policy'sinin `minVerifiedOpportunityScore`'u |
| `icpFitScore` / `icpAlignment` | `signal-verification.ts` + `icp-alignment.ts` | ICP uyumu güçlü mü (operationalFit / ≥62 barı — icp-alignment'ın kendi barı) |
| `signalVerification` | Signal Verification Engine (v1.3) | WhatsApp/website/rezervasyon/Instagram doğrulamaları |
| HOT kanal kriteri | `computeLeadLifecycleStatus` (v1.7) | Website doğrulanmış + rezervasyon + WhatsApp/Instagram → skor barını telafi eden "güçlü eşdeğer" |
| `websiteIntelligence` | Homepage enrichment | Rezervasyon motoru, WhatsApp linki, OTA linkleri |
| `adsLikelihood`, `otaDependencyLikelihood` | Enrichment v2 | Reklam izi, OTA bağımlılığı |
| `lastEnrichedAt` / `enrichmentCount` | Lead memory | Enrichment tazeliği |
| `whatsappInvalid`, `doNotContact` | Workflow bayrakları | Çelişki / güvenlik blokajı |

## Durum modeli

| Status | Founder etiketi | Ne zaman |
| --- | --- | --- |
| `sales_ready` | Satışa Hazır | Skor eşik üstünde + ICP güçlü + güvenilir iletişim + website + taze veri + blokaj yok (veya HOT kanal eşdeğeri) |
| `review_required` | Founder İncelemesi Gerekli | Skor güçlü ama kritik veri çelişkili: chain işletme, telefon var ama WhatsApp geçersiz, website eksik/uyumsuz, ICP belirsiz |
| `data_needed` | Daha Fazla Veri Gerekli | Enrichment eksik/bayat veya iletişim yolu hiç doğrulanmamış ama potansiyel var |
| `watch` | İzlemeye Alındı | Orta skor, bazı olumlu sinyaller; ileride yeniden değerlendirilir |
| `not_qualified` | Şimdilik Uygun Değil | Skor açıkça düşük (<40) + telafi eden sinyal yok, veya ICP açıkça zayıf |
| `blocked` | İşlem Engellendi | Duplicate mission, policy kapalı, geçersiz lead (id/isim yok), doNotContact |

Karar deterministiktir: aynı girdi + aynı `currentTime` → aynı sonuç
(testle doğrulanır). Confidence (yüksek/orta/düşük) doğrulanmış sinyal sayısı
ve veri tazeliğinden; priority (kritik/yüksek/orta/düşük) durum + skordan
türetilir (80+ sales_ready → kritik; lifecycle HOT barının aynısı).

## Mission ve outreach uygunluğu

`eligibleForMission` YALNIZ şu koşulların tamamında true olur:

- `status === "sales_ready"`
- lead id geçerli
- duplicate mission yok (`blockDuplicateMission`)
- iletişim yolu var
- skor eşiği karşılanıyor (veya HOT kanal eşdeğeri)
- policy açık

`eligibleForOutreachDraft` = eligibleForMission **VE** güvenilir kanal
(telefon ya da doğrulanmış/olası WhatsApp — yalnız website yetmez).

Yapısal koruma: `QualificationResult` üzerinde `founderApproved` veya
`sendAllowed` diye bir alan yoktur ve runtime modülü hiçbir mesajlaşma
modülünü import etmez — onay/gönderim üretmesi tip düzeyinde imkânsızdır.

## Policy (`hermes-qualification-policy.ts`)

Yeni env değişkeni YOK. `deriveQualificationPolicy(acquisitionPolicy)`
mevcut acquisition policy'sinden türetir:

- `enabled` ← acquisition enabled + mode ≠ disabled
- `minVerifiedOpportunityScore` ← acquisition'ın kendi eşiği (default 70)
- `maxSalesReadyPerRun` ← `maxMissionCandidatesPerRun` (aynı cap, çift kaynak yok)
- `requireContactPath` ← acquisition'ın alanı
- Qualification'a özgü güvenli default'lar: `requireWebsite=true`,
  `requireFreshEnrichment=true` (`maxEnrichmentAgeHours=168`),
  `allowManualReview=true`, `blockDuplicateMission=true`

Client hiçbir alanı override edemez: policy yalnız server tarafında türetilir;
qualification route'u GET-only'dir ve girdi okumaz.

## Acquisition entegrasyonu

Yeni akış: Discover → Dedupe → Enrich → mevcut skor/ICP → **Autonomous
Qualification** → Qualification Registry → `eligibleForMission` filtresi →
capped mission ingest (mevcut `registerAcquisitionCandidates` yolu, cap ve
dedupe aynen).

- Tek bir lead'in değerlendirme hatası run'ı düşürmez → `partial` sonuç +
  güvenli hata notu.
- Run özeti yeni sayaçları taşır: `qualificationEvaluatedCount`,
  `salesReadyCount`, `reviewRequiredCount`, `dataNeededCount`, `watchCount`,
  `notQualifiedCount`, `qualificationBlockedCount`.
- `RunAcquisitionResult.qualificationPreview` founder-safe önizleme döner:
  ilk 5 Satışa Hazır + ilk 3 İnceleme kartı + özet sayaçlar.

### Dry-run davranışı

Dry-run dış çağrı yapamadığı için yeni işletme değerlendiremez. Önizleme,
**teslim bekleyen gerçek aday havuzu** (registry'deki pending batch'ler)
üzerinden sıfır mutation ile üretilir: qualification registry'ye kayıt
yazılmaz, aday havuzu değişmez, mission oluşmaz. Havuz boşsa önizleme boş
döner — bu bir hata değildir.

## Registry (`hermes-qualification-registry.ts`)

- Server-side, in-memory (diğer Hermes registry'leriyle aynı tradeoff);
  restart'ta kaybolur.
- TTL 14 gün; en fazla 500 kayıt; lead bazlı **upsert** (duplicate kayıt
  imkânsız); audit geçmişi kayıt başına son 12 event ile sınırlı.
- Saklanan: sanitize `QualificationResult` + görünen işletme adı. Ham telefon,
  API key, secret, provider payload'ı, website HTML'i, AI yanıtı yapısal
  olarak saklanamaz (tip bu alanları taşımaz; audit detayları scrubber'dan
  geçer — telefon görünümlü diziler "[numara gizli]" olur).

## API

`GET /api/hermes/qualification` — son 50 sanitize sonuç + özet
(total/salesReady/reviewRequired/dataNeeded/watch/notQualified/blocked/
eligibleForMission/eligibleForOutreachDraft). Reason'lar Türkçe cümle olarak
döner; ham enum founder katmanına ulaşmaz. Route girdi okumaz — client
threshold, onay, gönderim izni veya policy override GÖNDEREMEZ.

`POST /api/hermes/qualification/re-evaluate` **eklenmedi**: acquisition run
qualification'ı zaten üretiyor (sprint "yeni route şart değil" der).

## Founder yüzeyi

- **Hermes Home → "Hermes Satışa Hazır Fırsatlar"**: 4 sayaç (Satışa Hazır /
  İnceleme Gerekiyor / Daha Fazla Veri Gerekiyor / İzleniyor) + kartlar
  (otel adı, durum, "Hermes neden hazır gördü", dikkat noktası, sonraki adım,
  "Mesaj Hazırlamaya Uygun"/"Founder İncelemesi Gerekli" rozeti). Bölümde
  gönderim butonu YOKTUR.
- **Karar Merkezi**: yalnız `review_required` + `requiresFounderReview`
  sonuçları `review_qualification` karar öğesi olur ("Fırsatı İncele" /
  "İncele"). Aynı lead zaten mission karar öğesi taşıyorsa ikinci kart
  üretilmez. Primary aksiyon yalnız ilgili bölüme odaklanır — mutation yok.
- **Fırsat Odağı**: seçili otelin "Satış Hazırlığı" satırı — durum etiketi,
  güçlü sinyaller + dikkat noktası paragrafı, taslak uygunluk rozeti.

## Audit event'leri

`hermes_qualification_requested/started/sales_ready/review_required/
data_needed/watch/not_qualified/blocked/completed/failed` — her event
leadId, acquisitionRunId, status, skor snapshot'ı, reason kodları,
eligibleForMission ve zaman damgası taşır. Detay metni scrubber'dan geçer
(Bearer/key/token/telefon görünümleri gizlenir).

## Bilinen sınırlamalar

- Registry in-memory: restart'ta qualification geçmişi kaybolur; bir sonraki
  run yeniden değerlendirir (upsert olduğundan güvenli).
- `existingMissionId` server tarafında her zaman null'dır: mission'lar
  client-side oluştuğu için server duplicate mission'ı bilemez; run-arası
  dedupe anahtarları aynı işletmenin yeniden değerlendirilmesini zaten
  engeller. Duplicate-mission blokajı runtime'da hazırdır ve ileride Mission
  State Bridge'ten beslenebilir.
- Dry-run önizlemesi pending aday havuzuna bağlıdır; havuz boşsa boş döner.
- Enrichment düşerse (adapter fallback'i skorlu ama doğrulamasız lead döner)
  adaylar `data_needed` olur ve mission'a girmez — C1'e göre daha muhafazakâr
  ve kasıtlı bir davranış değişikliğidir.

## Manuel QA kontrol listesi

1. Güçlü aday → Satışa Hazır + mission adayı, gönderim yok. ✓ (test + mock QA)
2. Çelişkili iletişim → Founder İncelemesi Gerekli, Karar Merkezi'nde görünür. ✓
3. Enrichment eksik → Daha Fazla Veri Gerekli, mission yok. ✓
4. Düşük kaliteli lead → Şimdilik Uygun Değil, mission yok. ✓
5. Duplicate mission → İşlem Engellendi. ✓ (runtime testi)
6. Dry-run → önizleme görünür, sıfır mutation. ✓
7. Güvenli run → yalnız cap'li sales_ready adaylar, founder onayı beklemede. ✓
8. Hermes Home → founder-safe copy, teknik terim yok. ✓ (release-audit testleri)
9. Mevcut satış zinciri → otomatik WhatsApp isteği yok; Courier/Approval/Delivery dokunulmadı. ✓

## Production aktivasyonu

Ek adım yoktur: acquisition zaten açıksa qualification otomatik devrededir
(policy acquisition'dan türetilir). Sıralama C1 checklist'iyle aynıdır —
önce `DRY_RUN=true` ile önizlemeleri doğrula, sonra düşük limitlerle aç.

## Rollback / devre dışı bırakma

C1 ile aynı tek adım: `HERMES_AUTONOMOUS_ACQUISITION_ENABLED=false` (veya
`MODE=disabled`) — acquisition durunca qualification da durur (policy
türetimi enabled=false üretir; her sonuç `blocked` döner, mission oluşmaz).
`HERMES_ACQUISITION_DRY_RUN=true` tek başına tüm mutasyonları durdurur.
