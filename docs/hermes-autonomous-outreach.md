# Hermes Autonomous Outreach (Sprint C3)

## Amaç

Zincirin eksik halkasını doldurmak:

    Discovery → Qualification → Sales Ready → **Outreach Preparation** →
    Founder Approval → Controlled WhatsApp Send

Hermes artık satışa hazır her fırsat için outreach'i otomatik **hazırlar**:
önerilen kanal, template seçimi, dil, ton, uzunluk ve yalnız mevcut veriden
türetilmiş personalization sinyalleri. Founder her sabah manuel outreach
başlatmak zorunda kalmaz.

**MUTLAK KURAL: Hermes hiçbir mesajı doğrudan GÖNDERMEZ.** Founder onayı
zorunludur, istisnasız. Bu sprint hiçbir gönderim/onay/WhatsApp/mission/queue/
delivery/provider/gateway runtime'ı yeniden yazmadı — hepsini tüketti.

## Yeniden kullanılan mevcut yetenekler (yeni sistem YOK)

| Yetenek | Kaynak | C3'te nasıl kullanılıyor |
| --- | --- | --- |
| Qualification kararı | `hermes-autonomous-qualification-runtime.ts` (C2) | `eligibleForOutreachDraft`/`eligibleForMission`/`sales_ready` outreach girdisidir — yeniden değerlendirme yok |
| Draft/Template motoru | `app/components/v2/hermes-courier.ts` | `recommendedTemplate` bu motorun kanal-bazlı template'inin ANAHTARIDIR; ham metin founder onay döngüsünde Courier üretir |
| Founder Approval | Mevcut Courier Draft → Mission Approval → Delivery Gateway → controlled-send zinciri | DOKUNULMADI — outreach hazırlığı yalnız `approval_required` üretir, mevcut akışa düşürülür |
| Decision Queue | `hermes-decision-queue-adapter.ts` `approval_required` stage'i | Hazır mesaj zaten `approve_message` karar öğesine düşer — ikinci kart üretilmez |
| Acquisition orchestrator | `hermes-autonomous-acquisition-runtime.ts` | Qualification'dan sonra, taslağa uygun her aday için outreach hazırlanıp registry'ye yazılır |

### Yeni modüller

- `app/lib/hermes-autonomous-outreach-runtime.ts` — saf, deterministik hazırlık
  katmanı. Hiçbir mesajlaşma modülü import etmez → gönderim tip düzeyinde
  imkânsız.
- `app/lib/hermes-outreach-policy.ts` — `deriveOutreachPolicy(acquisitionPolicy)`;
  yeni env değişkeni yok. `requireFounderApproval` tip düzeyinde `true` sabittir.
- `app/lib/hermes-outreach-registry.ts` — server-only, in-memory, 14 gün TTL,
  lead bazlı upsert; yalnız sanitize karar saklar.
- `app/components/v2/adapters/hermes-outreach-founder-adapter.ts` — "Hermes
  Hazırladığı Mesajlar" bölümünün saf projeksiyonu.
- Route: `GET /api/hermes/outreach` (yalnız okuma, gönderim endpoint'i YOK).

## Durum modeli

| Status | Founder etiketi | Ne zaman |
| --- | --- | --- |
| `waiting` | Hazırlanıyor | Uygun ama güvenilir kanal henüz doğrulanmadı |
| `draft_ready` | Taslak Hazır | (Geçerli durum; evaluate doğrudan approval_required'e taşır) |
| `approval_required` | Founder Onayı Bekliyor | Uygun + kanal hazır → taslak founder onayına düşürüldü |
| `blocked` | Engellendi | Policy kapalı / DNC / geçersiz lead |
| `not_eligible` | Uygun Değil | sales_ready değil / mission yok / duplicate taslak / kanal yok |
| `completed` | Tamamlandı | Hazırlık tamamlandı |

Karar deterministiktir: aynı girdi + aynı `currentTime` → aynı sonuç.

## Eligibility

Outreach YALNIZ şu koşulların tamamında hazırlanır:

- `qualification.status === "sales_ready"`
- mission var (server run'da `eligibleForMission` proxy'si; client'ta gerçek
  mission objesi — qualification'daki "server tarafında missionId hep null"
  gerçeğiyle aynı)
- duplicate taslak yok (`existingDraft !== true`)
- iletişim yolu doğrulanmış (`eligibleForOutreachDraft` + güvenilir kanal:
  telefon veya doğrulanmış/olası WhatsApp — yalnız website yetmez)
- blokaj yok (DNC, geçersiz lead)
- policy açık

Aksi halde ASLA hazırlanmaz.

## Kanal önceliği (yalnız ÖNERİ)

Doğrulanmış WhatsApp → Telefon → Instagram → Website → Bilinmiyor. Bu modül
hiçbir şey göndermez; policy Instagram/website kanallarını kapatabilir.

## Personalization

Yalnız mevcut lead alanlarından türetilir (AI YOK, dış çağrı YOK): otel adı,
şehir, tesis türü/ölçeği, website, rezervasyon altyapısı, OTA bağımlılığı,
dijital talep, reklam izi, iletişim kanalı. Her sinyal founder-güvenli Türkçe
etikettir; ham telefon/secret asla içermez.

## Template

Yeni template metni ÜRETİLMEZ. `recommendedTemplate` mevcut Courier Draft
motorunun kanal-bazlı template'inin anahtarıdır (`whatsapp-intro` /
`instagram-intro` / `email-intro` / `generic-intro`). Birden çok template
varsa buradaki tek seçim kuralı geçerlidir.

## Approval entegrasyonu

Taslak hazırlandığında karar `approval_required` olur ve `approvalNeeded=true`
taşır (founder onayı zorunlu — asla auto-approve). Founder Home'daki "Mesajı
İncele" butonu Karar Merkezi'ne (mevcut `approve_message` akışı) yönlendirir.
Yeni approval modeli/kartı üretilmez.

## Mission timeline / Audit

Runtime yalnız güvenli event üretir: `hermes_outreach_requested`,
`_prepared`, `_blocked`, `_waiting`, `_ready`, `_approval_created`,
`_completed`. **`message_sent` / gönderim eventi ASLA yoktur.** Detaylar
scrubber'dan geçer (Bearer/key/token/telefon görünümleri gizlenir).

## Registry

- Server-only, in-memory (diğer Hermes registry'leriyle aynı tradeoff);
  restart'ta kaybolur.
- TTL 14 gün; en fazla 500 kayıt; lead bazlı upsert (duplicate imkânsız);
  audit geçmişi kayıt başına son 12 event.
- Saklanan: sanitize `AutonomousOutreachDecision` (durum, önerilen kanal/
  template anahtarı/ton/dil, founder-güvenli personalization etiketleri,
  Türkçe copy, audit). **Saklanmaz: ham mesaj metni, API key, secret,
  provider payload'ı, telefon** (tip bu alanları taşımaz).

## API

`GET /api/hermes/outreach` — son 50 sanitize karar + özet
(total/waiting/draftReady/approvalRequired/awaitingFounder). Route girdi okumaz:
client gönderim, onay, kanal veya threshold GÖNDEREMEZ. Gönderim endpoint'i
eklenmedi.

## Founder yüzeyi

- **Hermes Home → "Hermes Hazırladığı Mesajlar"**: 4 sayaç (Onayını Bekliyor /
  Onay Gerekiyor / Taslak Hazır / Hazırlanıyor) + kartlar (otel adı, durum,
  kanal/şablon/dil/ton çipleri, "Hermes neden bu mesajı hazırladı"
  personalization, sonraki adım, "Mesajı İncele"). **Gönderim butonu YOKTUR.**
- **Fırsat Odağı**: seçili otelin "Mesaj Hazırlığı" satırı — durum, önerilen
  kanal/şablon/dil, personalization özeti, founder aksiyonu.
- **Karar Merkezi**: hazır mesaj mevcut `approve_message` karar öğesine düşer;
  ikinci kart üretilmez.

## Aktivasyon / Rollback

Ek adım yoktur: acquisition açıksa outreach otomatik devrededir (policy
acquisition'dan türetilir). `HERMES_AUTONOMOUS_ACQUISITION_ENABLED=false` (veya
`MODE=disabled`) outreach'i de durdurur; `HERMES_ACQUISITION_DRY_RUN=true` tüm
mutasyonları durdurur (dry-run outreach kaydı yazmaz).

## Bilinen sınırlamalar

- Registry in-memory: restart'ta hazırlık geçmişi kaybolur; sonraki run
  yeniden hazırlar (upsert güvenli).
- Server run'da `missionId` null'dır (mission'lar client-side oluşur —
  qualification ile aynı gerçek); founder eşleştirmesi leadId üzerinden yapılır.
- Dry-run outreach hazırlamaz/kaydetmez (sıfır mutation kontratı) — qualification
  dry-run davranışıyla aynı.
- "Taslağı Gör" için ayrı bir taslak görüntüleme ekranı bağlanmadı; tek founder
  aksiyonu "Mesajı İncele" (Karar Merkezi). Ölü buton bırakılmadı.
