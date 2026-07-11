# Hermes Autonomous Lead Acquisition (Sprint C1)

## Amaç

Founder'ın her sabah Developer Mode → Lead Import → şehir seçimi → manuel tarama
akışına girmesini ortadan kaldırmak. Hermes, planlanan zamanda (veya güvenli
manuel tetiklemeyle) hedef bölgeyi seçer, işletmeleri bulur, duplicate kontrolü
yapar, mevcut enrichment/ICP akışından geçirir, yalnızca uygun adayları
kontrollü sayıda "satış işi adayı"na dönüştürür ve founder kararlarını Karar
Merkezi'ne bırakır.

**AI works. Founder decides.** Bu runtime hiçbir mesaj göndermez, hiçbir onayı
atlamaz, hiçbir outreach başlatmaz.

## Mimari — mevcut akışın yeniden kullanımı

Yeni bir import/enrichment/ICP motoru YAZILMADI. Orkestrasyon katmanı mevcut
yetenekleri birleştirir:

| Yetenek | Kaynak | C1'de nasıl kullanılıyor |
| --- | --- | --- |
| Google Places keşfi | `app/lib/places-import-server.ts` — `/api/import-leads` route'unun içinden çıkarılan çekirdek (kopya değil, taşıma; route aynı çekirdeği kullanmaya devam eder) | `discoverGooglePlacesLeads` — istek sayısı raporlanır |
| Enrichment / ICP / skor | `enrichLeadsWithHomepageSignalsBatched` + `mapGooglePlaceToScoredLead` → `enrichScoredLeadIntelligence` | Aynen; `verifiedOpportunityScore` eligibility girdisidir |
| Duplicate kontrolü | `app/lib/lead-dedupe.ts` (useLeadImport'un saf yardımcılarının kanonikleştirilmiş hali) + client'ta `mergeImportBatch` | Server tarafında run'lar arası; client tarafında havuz merge'ünde ikinci kez |
| Mission oluşturma | Mevcut client zinciri: lead havuzu → `buildHermesMonitor` → `buildHermesMissions` | Adaylar havuza `ingestExternalLeads` ile girer; mission'lar mevcut yoldan doğar ve founder onayı bekler |
| Teslimat | Mevcut Founder Approval → Courier → Delivery Gateway zinciri | DOKUNULMADI — otonom taraf mesajlaşma koduna hiç bağlanmaz |

### Yeni modüller

- `app/lib/hermes-autonomous-acquisition-policy.ts` — saf policy katmanı
  (eligibility, bölge seçimi, bütçe, aday eligibility, özet, audit event).
- `app/lib/hermes-acquisition-config.ts` — env doğrulama; bozuk env güvenli
  default'a düşer; geçersiz bölge JSON'u taramayı bloklar.
- `app/lib/hermes-acquisition-run-registry.ts` — in-memory run kayıtları,
  active-run lock (10 dk stale-lock emniyeti), idempotency anahtarları,
  bölge cooldown zamanları, aday teslim deposu (48 saat TTL, 200 kayıt cap).
- `app/lib/hermes-autonomous-acquisition-runtime.ts` — orchestrator
  (`runHermesAutonomousAcquisition`); dış dünyaya yalnızca enjekte edilen
  adapter üzerinden dokunur; dry-run'da adapter hiç çağrılmaz.
- `app/lib/hermes-acquisition-server-adapter.ts` — production adapter
  (Places çekirdeği + mevcut enrichment).
- `app/lib/hermes-acquisition-request.ts` — istek parse + cron secret
  doğrulaması (saf, test edilebilir).
- Route'lar: `POST /api/hermes/acquisition/run`,
  `GET /api/hermes/acquisition/status`.

## Env / Config

```bash
# .env.local (örnek — gerçek değer commit etmeyin)
HERMES_AUTONOMOUS_ACQUISITION_ENABLED=false
HERMES_AUTONOMOUS_ACQUISITION_MODE=disabled     # disabled | manual_safe | scheduled_safe
HERMES_ACQUISITION_DRY_RUN=true                 # yalnızca "false" literal'i kapatır
HERMES_ACQUISITION_DAILY_LEAD_LIMIT=20
HERMES_ACQUISITION_DAILY_REQUEST_LIMIT=10
HERMES_ACQUISITION_MAX_REGIONS_PER_RUN=1
HERMES_ACQUISITION_MAX_RESULTS_PER_REGION=20
HERMES_ACQUISITION_MAX_MISSIONS_PER_RUN=5
HERMES_ACQUISITION_MIN_OPPORTUNITY_SCORE=70
HERMES_ACQUISITION_CRON_SECRET=<rastgele-uzun-degerinizi-uretin>
HERMES_ACQUISITION_REGIONS_JSON='[{"id":"antalya-hotel","city":"Antalya","leadType":"Hotel","priority":1,"maxResultsPerRun":10,"cooldownHours":24}]'
```

Kurallar:

- **Safe defaults:** hiçbir env yokken sistem `disabled + dryRun` durumundadır
  ve hiçbir dış çağrı yapmaz.
- Sayısal değerler `POLICY_HARD_LIMITS` tavanlarına clamp'lenir
  (günlük lead ≤ 100, günlük istek ≤ 200, bölge/run ≤ 3, sonuç/bölge ≤ 20,
  mission adayı/run ≤ 10, cooldown 1–168 saat). Bozuk değer → default.
- Bölge JSON'u strict parse edilir: `id`, `city`, geçerli `leadType`
  (`Hotel | Boutique Hotel | Bungalow | Villa | Pension`) zorunlu; bilinmeyen
  alanlar yok sayılır; geçersiz JSON tüm taramayı bloklar.
- `HERMES_ACQUISITION_CRON_SECRET` hiçbir payload'a, log'a veya registry
  kaydına girmez; yalnızca run route'u header karşılaştırmasında okur.

## Scheduler route

`POST /api/hermes/acquisition/run`

```
Authorization: Bearer <HERMES_ACQUISITION_CRON_SECRET>
Content-Type: application/json

{"trigger":"scheduled"}
```

- Secret **header'da** taşınır, body'de asla.
- Yanlış secret → 403, eksik → 401, secret yapılandırılmamış → 503.
- Body yalnızca `trigger` ve `dryRun` alanlarını taşıyabilir; client
  `dryRun`'ı yalnızca **açabilir** — kapatamaz. Limit/onay/enable alanları
  yapısal olarak okunmaz.
- Acquisition disabled → `status: "blocked"`, dış çağrı sıfır.
- Aynı anda ikinci run → `blocked` ("Hermes fırsat taraması zaten çalışıyor.").
- Cron retry koruması: scheduled tetiklemeler saatlik pencere idempotency
  anahtarı alır — aynı saat içinde tekrar eden retry `blocked` döner.

### Cron örnekleri

**Linux cron / VPS (her gün 07:00):**

```cron
0 7 * * * curl -s -X POST https://ornek-alan-adiniz.example/api/hermes/acquisition/run \
  -H "Authorization: Bearer $HERMES_ACQUISITION_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"scheduled"}' >/dev/null
```

**Railway / benzeri scheduler:** aynı `curl` komutunu cron job command olarak
tanımlayın; secret'ı service env'inden okutun.

**Vercel Cron (`vercel.json`):** Vercel Cron istekleri header özelleştirmesini
desteklemediği için ya `CRON_SECRET` entegrasyonu olan bir proxy fonksiyon
kullanın ya da route'u çağıran küçük bir edge fonksiyonu yazın; doğrudan
kullanım şu an önerilmez (bkz. Bilinen Sınırlamalar).

**GitHub Actions:**

```yaml
on:
  schedule:
    - cron: "0 4 * * *"   # 07:00 TRT
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -s -X POST "$APP_URL/api/hermes/acquisition/run" \
            -H "Authorization: Bearer ${{ secrets.HERMES_ACQUISITION_CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            -d '{"trigger":"scheduled"}'
```

## Dry-run kullanımı

- `HERMES_ACQUISITION_DRY_RUN=true` (default) iken her tetikleme plan üretir:
  hangi bölge seçilirdi, en fazla kaç işletme değerlendirilirdi, kaç aday
  oluşurdu. **Hiçbir dış çağrı, import veya mission adayı üretilmez.**
- Developer Mode → Lead Import ekranındaki "Dry-run Önizle" düğmesi
  `{"trigger":"developer","dryRun":true}` gönderir — policy kapalıyken bile
  güvenlidir (blocked sonucu ve nedenlerini gösterir).
- Dry-run'lar idempotency slotu tüketmez (tekrarlanabilir) ve günlük
  bütçelere sayılmaz.

## Maliyet / kota guardrail'leri

Hepsi hard-enforced, sessiz aşım yok:

1. `dailyExternalRequestLimit` — bugünkü Places isteği toplamı (text search +
   detail; cache hit sayılmaz) limiti doldurduysa run bloklanır; run içinde
   kalan bütçe bölge başına sonuç sayısını kısar.
2. `dailyLeadLimit` — bugün havuza aktarılabilecek yeni aday sayısı.
3. `maxRegionsPerRun`, `maxResultsPerRegion`, `maxMissionCandidatesPerRun` —
   run başına tavanlar (hard limit tavanlarıyla çift clamp).
4. Bölge cooldown'u (`cooldownHours`) — aynı bölge dolmadan yeniden taranmaz.
5. Active-run lock + idempotency — paralel/tekrar run engeli.
6. Limit aşımı → `blocked`/`partial` + founder-safe açıklama + audit event.

Not: homepage enrichment'ın kendi HTTP istekleri (otel sitelerine) Places
kotasına sayılmaz; mevcut enrichment zaten kendi batch sınırlarına sahiptir.

## Idempotency ve duplicate davranışı

- **Run düzeyi:** scheduled → saatlik pencere anahtarı; manual/developer →
  2 dakikalık pencere anahtarı. Aynı anahtar tamamlanmış bir run'dan sonra
  tekrar gelirse `blocked` ("Bu tarama kısa süre önce zaten çalıştırıldı.").
- **Lead düzeyi (server):** registry, teslim edilen her adayın dedupe
  anahtarlarını (isim|şehir, telefon, web) hatırlar; sonraki run'lar aynı
  işletmeyi atlar (`duplicateCount`).
- **Lead düzeyi (client):** adaylar havuza mevcut `mergeImportBatch`
  yolundan girer — manuel import'un duplicate kontrolü ikinci savunma hattı
  olarak aynen çalışır. Client ayrıca run-id bazlı bir replay guard tutar
  (`tugobo-lead-engine:acquisition-ingested-runs-v1`).

## Founder approval korunması

Otonom taraf yalnızca **lead bulma → değerlendirme → aday havuza aktarma**
seviyesindedir. Adaylar client'ta mevcut monitor/mission zincirinden geçer;
onay gerektiren her iş Karar Merkezi'nde founder kararı bekler. WhatsApp
gönderimi mevcut Founder Approval → Courier Draft → Delivery Gateway →
controlled-send zincirinin arkasındadır ve bu sprint o zincire hiçbir bağ
eklememiştir.

## Manuel fallback

- Developer Mode → Lead Import ekranı aynen durur (şehir/preset seçimi,
  manuel tarama). Üstündeki "Hermes Otonom Tarama" paneli dry-run önizleme,
  güvenli tarama, config durumu, son run özeti ve blok nedenlerini gösterir.
- Founder Home'da manuel import ana aksiyon değildir; "Tarama Ekranını Aç"
  ikincil düğmesi Developer Lead Import'a gider (v8.1 davranışı korunur).

## Hermes Home / Header

- "Hermes Fırsat Keşfi" bölümü gerçek run verisini gösterir: durum cümlesi
  ("Hermes bugün X işletmeyi değerlendirdi." / "Fırsat taraması henüz etkin
  değil." / "Tarama yapılandırması kontrol gerektiriyor."), bugünkü sayaçlar,
  son tarama zamanı.
- Header: "Son Tarama" = manuel import ile otonom taramanın en yenisi;
  Hermes durumu server'da run varken "Çalışıyor", config bozuksa
  "Kontrol Gerekli", aksi halde "Beklemede".
- Founder'a asla: cron secret, env adı, provider payload, quota tablosu, raw
  hata gösterilmez (release-audit testi `findForbiddenFounderTerm` ile
  doğrular).

## Audit event'leri

Run kaydının `auditEvents` alanında, secret/raw payload içermeden:
`hermes_acquisition_run_requested`, `_run_blocked`, `_run_started`,
`_region_selected`, `_leads_discovered`, `_duplicates_skipped`,
`_candidates_qualified`, `_missions_created`, `_run_completed`,
`_run_partial`, `_run_failed`, `_dry_run_completed`.

## Bilinen sınırlamalar

- Run registry **in-memory**: server restart'ında run geçmişi, cooldown
  zamanları, idempotency anahtarları ve bekleyen aday teslimatları kaybolur.
  Restart sonrası ilk cron tetiklemesi bölgeleri "hiç taranmamış" görür;
  günlük limitler o günkü yeni run'lardan yeniden sayılır. Client'a zaten
  teslim edilen lead'ler localStorage'da güvendedir ve dedupe onları korur.
- Lead havuzu client-side (localStorage) olduğu için adaylar founder
  uygulamayı açtığında havuza katılır; "missionCreatedCount" server'ın mevcut
  mission yoluna devrettiği aday sayısını raporlar.
- Vercel Cron doğrudan header secret gönderemez (yukarıda not edildi).
- Tek server instance varsayımı (mevcut tüm Hermes registry'leriyle aynı).

## Production checklist

1. `HERMES_ACQUISITION_CRON_SECRET` üret (ör. `openssl rand -hex 32`), env'e koy.
2. `HERMES_ACQUISITION_REGIONS_JSON` bölgelerini tanımla (1 bölgeyle başla).
3. `HERMES_AUTONOMOUS_ACQUISITION_ENABLED=true`, `MODE=scheduled_safe`,
   `DRY_RUN=true` ile deploy et.
4. Cron'u kur; ertesi gün Developer panelinden dry-run sonuçlarını doğrula.
5. Sayılar makulse `HERMES_ACQUISITION_DRY_RUN=false` yap ve düşük limitlerle izle.
6. Hermes Home'da "Hermes Fırsat Keşfi" sayaçlarını ve Karar Merkezi'ne düşen
   işleri günlük kontrol et.

## Rollback / devre dışı bırakma

Tek adım: `HERMES_AUTONOMOUS_ACQUISITION_ENABLED=false` (veya
`MODE=disabled`) yapıp yeniden başlat. Route blocked döner, dış çağrı olmaz;
cron'u silmeye gerek yoktur. Acil durumda `HERMES_ACQUISITION_DRY_RUN=true`
tek başına tüm mutasyonları durdurur.
