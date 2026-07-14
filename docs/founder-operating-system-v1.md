# Hermes — Founder Operating System v1.0 (Sprint C7)

> Bu sprint bir **feature freeze / production polish** sürümüdür. Yeni runtime,
> yeni AI davranışı, yeni satış mantığı EKLENMEDİ. Mevcut çalışan mimari
> korundu; Hermes ticari sürüme hazırlandı.

## Hermes nedir?

Hermes bir AI modeli, chatbot, CRM veya klasik dashboard **değildir**. Hermes,
satış operasyonunu uçtan uca yürüten bir **agent orchestrator/runtime**'dır.

Temel felsefe: **AI works. Founder decides.** (Hermes çalışır, kurucu karar
verir.) Hermes fırsatı bulur, değerlendirir, mesaj hazırlar, cevabı anlar, demo
ve takip planlar, geliri izler — ama **hiçbir mesajı otomatik göndermez, hiçbir
satış sonucunu otomatik kapatmaz.** Her kritik adım founder onayının arkasındadır.

Tamamlanan ticari zincir: C1 Acquisition → C1.5 Explainability → C2 Qualification
→ C3 Outreach → Founder Approval → Controlled Send → Delivery → Reply Listener →
Conversation (C4) → Demo → Follow-up (C5) → Revenue Pipeline Intelligence (C6) →
Sales Outcome.

## Founder günlük kullanım akışı

Kurucu sabah bilgisayarını açtığında **yalnızca Hermes'i açarak** bütün satış
operasyonunu yönetebilir. Hermes Home'un kanonik günlük akışı (Developer Mode
KAPALI) tam olarak altı bölümdür, bu sırayla:

1. **Karar Merkezi** — bugün senden beklenen tek-dokunuşluk kararlar
2. **Fırsat Odağı** — seçili fırsat için "şimdi ne yapmalıyım?"
3. **Gelir Nabzı** — fırsatların satışa yakınlığı, riskleri, gelir tablosu
4. **Hermes Takip Planı** — hangi takip bugün/yaklaşan/onay bekliyor
5. **Hermes Bugün Bunları Buldu** — bugünkü keşif ve gerekçeleri
6. **Hermes Aktivitesi** — gerçek operasyon günlüğü

Bu akış dışında founder'a bölüm gösterilmez.

## Karar Merkezi

Founder'ın ana ekranı. Yalnızca gerçek, tek-dokunuşluk founder kararları görünür
(mesaj onayı, sıcak cevap incelemesi, demo planlama, takip kararı, satış sonucu,
teslimat sorunu, fırsat incelemesi). Kartlar önem sırasına göre: **Kritik →
Yüksek → Orta → Düşük**. Bekleyen karar yoksa pozitif bir "her şey yolunda"
mesajı gösterilir — asla boş uyarı kutusu. Teknik/developer bilgisi gösterilmez.

## Fırsat Odağı

Seçili fırsat için tek soruyu cevaplar: **"Bu fırsat için şu anda ne
yapmalıyım?"** Founder aksiyonu ön plandadır; teknik detay minimumdur. Mesaj/
Cevap/Demo/Takip/Sonuç durumu kompakt bir şeritte gösterilir.

## Gelir Nabzı (Revenue Pipeline Intelligence — C6)

Ayrık gelir kategorileri: **Kazanılan (realized)**, **Potansiyel (potential)**,
**Risk Altındaki (risked)**. Bilinmeyen tutar her zaman **"Henüz belirlenmedi"**
gösterilir — asla sahte ₺0. "Gelire En Yakın Fırsatlar" ve "Riskteki Fırsatlar"
listeleri karar vermeyi kolaylaştırır. Tahmini gelir tahsil edilmiş gelir
değildir; pipeline zekâsı muhasebe değildir. Sales Outcome tek doğruluk
kaynağıdır.

## Takip Planı (C5)

Takipler dört grupta: Bugün Takip / Yaklaşan / Founder Onayı Bekleyen / Kanal
Kontrolü Gereken. Takip taslağı yalnız founder onayıyla gönderilir; Hermes hiçbir
takip mesajını otomatik göndermez.

## Hermes Aktivitesi

Gerçek operasyon günlüğü gibi görünür — teknik event isimleri, runtime/registry/
webhook gibi terimler founder'a asla gösterilmez.

## Developer Mode

Developer Mode tamamen korunmuştur.

- **Developer KAPALI:** yalnız Founder deneyimi — kanonik altı bölüm. Pipeline-
  detay bölümleri (Hermes Bugün, Hermes Fırsat Keşfi, Satışa Hazır Fırsatlar,
  Hazırladığı Mesajlar, Konuşmalar) ve gelir alt-ekranları gizlidir.
- **Developer AÇIK:** tüm eski ekranlar (Gelir Pipeline/Tahmini/Risk/Recovery/
  Analizi, Lead ekranları, veri kaynakları) ve pipeline-detay bölümleri görünür.

Developer bölümleri **silinmedi**, yalnızca founder deneyiminden gizlendi
(`developerMode` bayrağı + CSS). Kanonik akış CSS `order` ile sağlanır; fiziksel
JSX ve tüm veri akışı korunmuştur (gizli bölümler de Karar Merkezi'ni ve Gelir
Nabzı'nı beslemeye devam eder).

## Production kurulumu

1. `npm install`
2. Ortam değişkenleri (gerektiğinde): `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
   `HERMES_ACQUISITION_CRON_SECRET`, `HERMES_FOLLOW_UP_CRON_SECRET` — hiçbiri
   client'a sızmaz, yalnız ilgili route'larda okunur.
3. `npm run build` (Windows'ta önce çalışan `next dev` durdurulmalı — `.next`
   kilidi build'i bloklar).
4. `npm run start`

Not: Otonom acquisition varsayılan olarak **kapalıdır** (güvenli default);
konuşma/takip/gelir zekâsı inbound sinyallere bağlıdır ve varsayılan olarak
açıktır ama hiçbiri otomatik gönderim yapmaz.

## İlk müşteri kurulumu

1. Developer Mode KAPALI ile aç — founder yalnız Hermes Home'u görür.
2. Lead havuzu içe aktarıldığında Karar Merkezi ve Gelir Nabzı dolmaya başlar.
3. Founder yalnızca Karar Merkezi'ndeki kararları onaylar; gönderim controlled-
   send zincirinden geçer.
4. Gelir tahmini founder tarafından Sales Outcome üzerinden girilene kadar
   "Henüz belirlenmedi" kalır — bu doğru ve dürüst davranıştır.

## Rollback

Her ticari katman bağımsız kapatılabilir (policy `enabled=false`):
conversation / follow-up / revenue-pipeline. Kapatıldığında ilgili bölüm boş/
fallback gösterir; diğer zincirler etkilenmez. C7 yalnız görünüm sırası ve
Developer gating ekledi — geri almak için CSS `order`/`hidden` sınıflarını
kaldırmak yeterlidir; hiçbir veri/runtime değişmedi.

## Known limitations

- Tüm registry'ler in-memory'dir; server restart'ında türetilmiş görünümler
  sıfırlanır (kalıcı DB yok — bilinçli MVP tradeoff'u).
- Gelir yalnız Sales Outcome'dan gelir; founder tahmin girmedikçe çoğu erken
  fırsat "Henüz belirlenmedi" kalır.
- Legacy `/` (Dashboard v1) rotası korunur ama Founder OS `/v2` üzerindedir;
  founder deneyimi `/v2`'dir.
- Arka plan cron altyapısı kurulmadı; evaluate route'ları scheduler-uyumlu
  bırakıldı.
