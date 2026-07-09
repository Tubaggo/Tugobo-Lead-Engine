# Lead Engine v8 — Hermes Operating System

**Mimari ve Ürün Tasarım Dokümanı**
Tarih: 9 Temmuz 2026 · Durum: Taslak → Onay Bekliyor · Kapsam: Sunum katmanı + bilgi mimarisi (runtime mantığına dokunulmaz)

---

## 1. Ürün Teşhisi

Lead Engine bir "lead dashboard" olarak doğdu, ama bugün elimizde olan şey bir dashboard değil: **otonom bir AI Satış Runtime'ı**. Sistem şu anda kendi başına lead keşfediyor, ICP analizi yapıyor, mesaj taslağı üretiyor, WhatsApp üzerinden gönderiyor, cevapları dinliyor, cevap zekâsı çıkarıyor, demo planlıyor, takip yapıyor ve satış sonucu işliyor. 15 runtime tamamlanmış durumda.

Buna rağmen ürünün yüzü hâlâ v3 dönemindeki gibi: **kurucunun bakması gereken ekranlar** sunuyor, **kurucunun karar vermesi gereken işler** değil. Ürünün motoru otonom, ama kokpiti manuel. v8'in çözdüğü çelişki tam olarak bu.

Kurucu profili net: zamanı yok, 13 ekranlık bir menüde gezinmeyecek, "analiz etmek" değil "karar vermek" istiyor. Ürünün değer önerisi de net: **Hermes çalışır, kurucu denetler.** Bu iki gerçek birleştiğinde tek bir sonuç çıkıyor: dashboard paradigması terk edilmeli, yerine tek katmanlı bir **işletim sistemi** gelmeli.

## 2. v7 Neden Hâlâ Dashboard Gibi Hissettiriyor?

v7.0'da Founder Revenue Workspace varsayılan ekran yapıldı ve KPI şeridi sadeleştirildi — doğru yönde bir adımdı ama paradigmayı değiştirmedi. Somut nedenler:

1. **Sidebar hâlâ modül kataloğu.** 6 grup (Genel / Operasyon / Analiz / Gelir / Sistem), 13 ekran: Lead Listesi, ICP Analizi, İletişim Zekası, Gelir Pipeline, Gelir Tahmini, Gelir Risk, Gelir Recovery, Gelir Analizi, Lead Import, Veri Kaynakları... Bunların her biri "kurucu buraya girip incelesin" varsayımıyla tasarlandı. Otonom bir sistemde bu ekranların %80'i **Hermes'in iç organları**dır; kurucuya navigasyon olarak sunulmamalıdır.
2. **Ekranlar veri gösteriyor, karar istemiyor.** Gelir Risk ekranı 5 tip risk taraması yapıyor ama çıktısı "işte riskler" — "şu 3 lead için şu kararı ver" değil. Kurucu ekrandan anlamı kendisi damıtmak zorunda.
3. **Aynı lead'e 8 farklı pencereden bakılıyor.** Bir otel; lead listesinde, ICP analizinde, pipeline'da, risk taramasında, recovery planında ve takip kuyruğunda ayrı ayrı görünüyor. Kurucu bağlamı kendi kafasında birleştiriyor. Bu, dashboard düşüncesinin en net belirtisi: **modül başına görünüm, varlık başına görünüm değil.**
4. **Runtime'lar UI'da teknik kimliğiyle duruyor.** Delivery kartları, reply kartları, bridge durumu, provider runtime panelleri kurucunun gözünün önünde. Bunlar geliştirici gözlemlenebilirliği; kurucu için gürültü.
5. **"Bugün ne oldu?" sorusunun tek cevabı yok.** Kurucu uygulamayı açtığında Hermes'in o gün ne yaptığını tek bir yerden okuyamıyor; parçaları farklı ekranlardan toplamak zorunda.

Özet: v7, otonom bir sistemin üzerine giydirilmiş bir **BI aracı**. v8 bunu bir **denetim katmanına** dönüştürür.

## 3. v8 Ürün İlkesi

> **"Hermes çalışır. Kurucu karar verir. Ekran, karar için var."**

Bundan türeyen beş tasarım yasası:

1. **Karar > Veri.** Bir bilgi kurucudan karar istemiyorsa ana katmanda yer alamaz. Yeri ya Hermes Activity (bilgilendirme) ya da Developer Mode'dur (gözlemlenebilirlik).
2. **Tek katman.** Kurucu deneyimi tek ekrandır: Hermes Home. Gezinme değil, odaklanma vardır. Derinlik sekmeyle değil, seçimle (bir kararı/fırsatı seçince açılan bağlam paneliyle) sağlanır.
3. **Varlık merkezli bağlam.** Kurucu bir otele baktığında o otelin her şeyini (durum, sinyal, gelir potansiyeli, Hermes önerisi, zaman çizelgesi) tek yerde görür. Modül gezmek yok.
4. **İstisna yönetimi.** Normal akış (Hermes buldu → analiz etti → yazdı → gönderdi → takip etti) kurucuya sadece özet olarak raporlanır. Kurucunun önüne yalnızca **istisnalar** ve **onay eşikleri** gelir.
5. **Hiçbir runtime silinmez.** v8 tamamen sunum ve bilgi mimarisi değişimidir. 15 runtime'ın tamamı aynen çalışmaya devam eder; değişen tek şey hangi katmanda görünür oldukları.

## 4. Kurucuya Dönük Bilgi Mimarisi

Kurucu deneyimi 4 üst düzey alandan oluşur; bunlardan yalnızca ilki günlük kullanımdır:

```
Hermes OS
├── Hermes (varsayılan, günlük kullanım — tek ekran)
│   ├── Hermes Today          → "Bugün ne oldu?"
│   ├── Decision Queue        → "Benden ne isteniyor?"  ★ ürünün kalbi
│   ├── Opportunity Focus     → "Seçtiğim şeyin bağlamı" (sağ panel)
│   └── Hermes Activity       → "Hermes ne yapıyor?" (özet zaman çizelgesi)
├── Gelir (haftalık kullanım)
│   └── Revenue Pulse         → kazanılan / kaybedilen / MRR / demo / dönüşüm
├── Ayarlar (nadir kullanım)
│   └── ICP tercihleri, onay eşikleri, çalışma saatleri, kanal ayarları
└── Developer (kurucu için görünmez varsayılan; teknik katman)
    └── v7'nin tüm modülleri + runtime panelleri + debug
```

Kurucunun 5 sorusu ile mimarinin eşleşmesi:

| Soru | Cevap veren bölüm |
|---|---|
| Hermes bugün ne yaptı? | Hermes Today |
| Benim kararımı ne bekliyor? | Decision Queue |
| Gelir fırsatı nerede? | Revenue Pulse + Decision Queue'daki sıcak öğeler |
| Ne tıkanmış durumda? | Decision Queue "blocked" tipi + Hermes Today kritik satırı |
| Sıradaki en iyi aksiyon ne? | Decision Queue'nun en üst öğesi (kuyruk zaten sıralı) |

## 5. Yeni Sidebar Yapısı

Sidebar 6 grup / 13 öğeden **4 öğeye** iner. Grup başlığı yok, hiyerarşi yok:

```
◆ Hermes        (varsayılan; badge: bekleyen karar sayısı)
◆ Gelir         (Revenue Pulse)
◆ Ayarlar
◆ Developer     (badge yok; ayrık, sönük stil — "arka kapı" hissi)
```

Kurallar:

- **Badge yalnızca Hermes'te** ve yalnızca bekleyen karar sayısını gösterir. Başka hiçbir öğe sayı taşımaz — dikkat ekonomisi tek noktaya akar.
- **Developer görsel olarak ayrıştırılır** (alt kısımda, ayırıcı çizgi altında, düşük kontrast). Kurucu oraya "girmesi gerektiğini" hissetmemeli.
- Mevcut `V2Screen` tipi ve ekran bileşenleri korunur; sidebar sadece 4 kök hedefe yönlendirir, eski 13 ekran Developer altında ikincil navigasyonla erişilir kalır.

## 6. Görünür Kalanlar (Kurucu Katmanı)

| Öğe | v8'deki yeri | Kaynağı (v7) |
|---|---|---|
| Günlük operasyonel özet | Hermes Today | Founder Revenue Workspace özet şeridi, DailyOperatingBrief mirası |
| Onay bekleyen mesajlar | Decision Queue | Founder Approval + Courier Draft runtime |
| Sıcak cevaplar | Decision Queue | Reply Listener + Reply Intelligence |
| Demo planlama kararları | Decision Queue | Demo Scheduling runtime |
| Takip kararları | Decision Queue | Follow-up Runtime |
| Sonuç işaretleme (won/lost) | Decision Queue | Sales Outcome Runtime |
| Başarısız teslimat çözümü | Decision Queue | Delivery Gateway / Receipt hataları |
| Tek lead bağlamı | Opportunity Focus | LeadListContextPanel + RevenueQueueContextPanel'in birleşimi |
| Gelir nabzı | Gelir sekmesi | Revenue Pipeline / Forecast / Analytics'in damıtılmış özeti |
| Hermes olay akışı | Hermes Activity | Mission Runtime + timeline olaylarının insan-dili filtresi |

## 7. Developer Mode'a Taşınanlar

Aşağıdakilerin **hiçbiri silinmez**; tamamı Developer altında aynen çalışır durumda kalır:

- Lead Listesi (tam tablo), Lead Import
- ICP Analizi ekranı
- İletişim Zekası ekranı
- Gelir Pipeline / Tahmin / Risk / Recovery / Analiz ekranları (5 ekran)
- Veri Kaynakları, provider durum panelleri (GMaps / Airtable / DeepSeek / OpenAI / Sheets)
- Hermes Monitor (shadow runtime), Mission Bridge, ajan kayıt defteri (ledger)
- Delivery kartları, reply kartları, WhatsApp Cloud API test runtime
- Debug zaman çizelgeleri, ham timeline olayları
- Eski Automation Center / Hermes Workspace görünümleri

Developer Mode'un tanımı: **"Hermes'in iç organlarına bakış."** Kurucu değil; geliştirici, denetçi ve sorun giderici içindir. Kurucu isterse girebilir ama ürün onu asla oraya yönlendirmez.

## 8. Ana Ekran Bölümleri (Hermes Home)

Tek ekran, üç dikey bölge + sağ bağlam paneli:

```
┌──────────────────────────────────────────────┬───────────────┐
│ 1. HERMES TODAY (tek satırlık durum + özet)  │               │
├──────────────────────────────────────────────┤ 3. OPPORTUNITY│
│ 2. DECISION QUEUE (hero — ekranın gövdesi)   │    FOCUS      │
│    ├ öğe                                     │  (seçime göre │
│    ├ öğe                                     │   dolan sağ   │
│    └ öğe                                     │   panel)      │
├──────────────────────────────────────────────┤               │
│ 4. HERMES ACTIVITY (kompakt zaman çizelgesi) │               │
└──────────────────────────────────────────────┴───────────────┘
```

**1. Hermes Today** — Ekranın en üstünde, tek paragraf + 6-8 sayısal rozet:
"Hermes bugün çalıştı: **42** lead değerlendirdi, **7** görev aktif, **3** karar bekliyor, **2** sıcak fırsat, **1** demo planlanmayı bekliyor, **₺12.000** MRR kazanıldı. **1 kritik sorun:** WhatsApp teslimat hatası."
Kritik sorun satırı yalnızca varsa görünür ve tıklanınca ilgili Decision Queue öğesine atlar.

**2. Decision Queue** — Ekranın gövdesi ve ürünün kalbi (detay: §9). Boşsa ekran bunu kutlar: *"Karar bekleyen bir şey yok. Hermes çalışmaya devam ediyor."* — boş kuyruk bir hata durumu değil, ürünün başarı hâlidir.

**3. Opportunity Focus** — Sağ panel (detay: §10). Hiçbir şey seçili değilken günün en yüksek öncelikli fırsatını gösterir; kuyrukta bir öğe seçilince o öğenin bağlamına geçer.

**4. Hermes Activity** — Alt bölge, kompakt (detay: §12).

## 9. Decision Queue Öğe Modeli

Her karar öğesi tek tip bir sözleşmeye uyar:

```
DecisionItem
├── id, createdAt, expiresAt?         (SLA — süresi dolan öğe "aged" görünür)
├── type: "approve-message"           → mesaj onayı (Founder Approval)
│       | "review-hot-reply"          → sıcak cevap incelemesi (Reply Intelligence)
│       | "plan-demo"                 → demo planlama (Demo Scheduling)
│       | "decide-follow-up"          → takip kararı (Follow-up Runtime)
│       | "mark-outcome"              → sonuç işaretleme (Sales Outcome)
│       | "resolve-delivery-failure"  → teslimat hatası (Delivery Gateway/Receipt)
├── lead: { id, hotelName, city, tier }
├── headline                          → tek cümlelik insan-dili özet
│     örn. "Otel Liparis fiyat sordu — Hermes cevap taslağı hazırladı"
├── whyNow                            → aciliyet gerekçesi ("cevap 2 saattir bekliyor")
├── hermesRecommendation              → Hermes'in önerdiği aksiyon + gerekçe
├── actions: [primary, secondary, dismiss]
│     her aksiyon mevcut bir runtime çağrısına bağlanır; yeni mantık yazılmaz
├── revenueImpact?                    → tahmini MRR etkisi (varsa öğeyi yükseltir)
└── sourceRuntime + sourceRef         → Developer Mode'a derin bağlantı (debug için)
```

**Sıralama (deterministik):** `revenueImpact` × aciliyet (expiresAt yakınlığı) × tip ağırlığı. Sıcak cevap > teslimat hatası > demo > onay > takip > sonuç işaretleme. Kurucu sıralamayla oynamaz; kuyruk zaten "sıradaki en iyi aksiyon" cevabıdır.

**Aksiyon kuralı:** Her aksiyon **güvenli** ve **tek dokunuş** olmalıdır — onayla / düzenle-onayla / reddet / ertele. Aksiyonlar mevcut runtime mutasyonlarına (M2.3 kalıcılık kalıbı, M6 hızlı aksiyonlar) bağlanır; v8 yeni yürütme mantığı eklemez.

**Besleme:** Her runtime kendi karar öğesini üretir; Decision Queue adapter'ı bunları tek listede toplar (Founder Command Center adapter'ının saf toplama kalıbı burada yeniden kullanılır — sıfır iş mantığı, sadece birleştirme + sıralama).

## 10. Opportunity Focus Modeli

Kurucu bir öğe seçtiğinde sağ panel **otelin tam hikâyesini** anlatır:

```
OpportunityFocus
├── hotel        → ad, şehir, segment, ICP uyumu (tek rozet, ham skor değil)
├── state        → yaşam döngüsü aşaması insan diliyle
│                  ("İlk mesaj gönderildi, cevap bekleniyor" — "stage: contacted" değil)
├── whyItMatters → gelir potansiyeli + sinyal özeti, tek paragraf
│                  (verifiedOpportunityScore + expectedRevenue damıtması)
├── hermesRecommendation → tek önerilen aksiyon + gerekçe (NBA motoru)
├── safeActions  → bağlama göre 2-4 güvenli buton
│                  (mesajı onayla / demo öner / +3g ertele / DNC / kazanıldı işaretle)
├── timelineSummary → son 5-7 anlamlı olay, insan dilinde
│                  ("3 gün önce Hermes mesaj gönderdi → dün otel cevap verdi")
└── devLink      → "Teknik detay" — Developer Mode'daki tam lead görünümüne gider
```

İlke: Bu panel v7'deki 8 context panelin (lead-list, revenue-queue, risk, recovery, comm...) **varisi ve tekleştirilmiş hâli**dir. Aynı lead'e artık tek pencereden bakılır. Skorlar, olasılıklar, güven aralıkları burada **cümleye çevrilir**; sayı duvarı Developer Mode'da kalır.

## 11. Revenue Pulse Modeli

"Gelir" sekmesinin tamamı — tek sayfa, kaydırmasız hedeflenir:

```
RevenuePulse
├── won           → bu ay kazanılan MRR + anlaşma sayısı (Sales Outcome)
├── lost          → kaybedilen + tek satır neden özeti
├── estimatedMrr  → ağırlıklı beklenen MRR (expectedRevenue motoru; tek bant,
│                   3 senaryo bandı Developer'da kalır)
├── demos         → planlanan / yapılan / sonuç bekleyen
├── activeOpportunities → aşama başına sayı (mini 6-aşama şeridi, board değil)
├── conversionSignals   → 3-5 madde: "Cevap oranı %18'e çıktı",
│                   "Kıyı otelleri segmenti 2× hızlı kapanıyor"
└── founderNote   → Hermes'in tek paragraflık ticari yorumu (deterministik)
```

İlke: Revenue Pulse bir analiz aracı değil, **nabız**dır. Pipeline board'u, forecast bantları, risk/recovery tabloları Developer Mode'daki 5 gelir ekranında yaşamaya devam eder; Pulse onların damıtılmış yüzüdür. Kurucu haftada bir bakar, 30 saniyede okur, çıkar.

## 12. Hermes Activity Modeli

```
ActivityEvent
├── actor     → hangi ajan (insan-dili ad: "Keşif", "Analiz", "Kurye", "Dinleyici"...)
├── verb      → buldu | analiz etti | taslak yazdı | gönderdi | cevap algıladı
│               | demo önerdi | takip planladı | sonuç işledi
├── lead?     → ilgiliyse otel adı
├── summary   → tek cümle: "Hermes, Otel Kilikya'nın cevabını sıcak olarak sınıfladı"
├── at        → göreli zaman ("2 sa önce")
└── devRef    → ham runtime olayına bağlantı (Developer Mode)
```

**Filtre sözleşmesi (kritik):** Activity'ye yalnızca **anlamlı iş olayları** girer. Teknik olaylar (retry, 502, cache, cron tetiklemesi, shadow karar RUN/WAIT/SKIP) kesinlikle girmez — onlar Hermes Monitor'da (Developer) kalır. Ölçüt: *"Kurucu bu cümleyi okuyunca bir şey öğreniyor mu?"* Hayırsa Activity'ye girmez. Günde ~10-30 olay hedeflenir; yüzlerce satırlık log akışı değil.

## 13. Ajan Görünürlük Modeli

11 ajanlık Hermes iş gücü (A2/A3'te kurulan registry) kurucuya **iki seviyede** görünür:

- **Seviye 1 — Kurucu (varsayılan):** Ajanlar tek tek görünmez. Kurucu "Hermes"i tek bir çalışan olarak algılar; Hermes Today ve Activity hep "Hermes ... yaptı" der. Tek istisna: Hermes Today'deki sağlık göstergesi ("Hermes sağlıklı çalışıyor" / "1 ajan sorunlu — teslimat"). Sorun varsa kurucuya ajan adı değil, **etkisi** söylenir.
- **Seviye 2 — Developer:** WorkforceStrip, 11-ajan registry, ajan başına görev/ledger/shadow kararları, MissionQueue — tamamı burada, bugünkü haliyle.

Gerekçe: Kurucuya 11 ajanlık organizasyon şeması göstermek, dashboard hatasının ajan kılığında tekrarıdır. Kurucu bir ekip yönetmiyor; **tek bir otonom sistemi denetliyor.**

## 14. v7 → v8 Geçiş Planı

Strateji: **Strangler pattern** — v7 ekranları silinmez, önce Developer altına alınır, kurucu katmanı üstlerine inşa edilir. Rollback her aşamada mümkündür.

1. **Faz 0 — Dondurma:** v7 ekranlarına yeni özellik eklenmez. `V2Screen` tipi ve tüm ekran bileşenleri aynen kalır.
2. **Faz 1 — Çatı:** Yeni 4 öğeli sidebar + `founderMode/developerMode` ayrımı. Developer seçilince bugünkü 13 ekranlık navigasyon aynen açılır (mevcut V2Sidebar, Developer'ın iç navigasyonu olur). Bu fazda kurucu deneyimi henüz değişmez, sadece yol ayrımı kurulur.
3. **Faz 2 — Decision Queue adapter'ı:** 6 karar tipi için runtime'lardan DecisionItem üreten saf toplama katmanı (Founder Command Center adapter kalıbı). UI'dan önce adapter test edilir.
4. **Faz 3 — Hermes Home:** Today + Decision Queue + Opportunity Focus + Activity tek ekranda birleşir; varsayılan ekran olur. Founder Revenue Workspace, Developer altına iner.
5. **Faz 4 — Revenue Pulse:** 5 gelir ekranının damıtılmış özeti "Gelir" sekmesine; 5 ekran Developer'da kalır.
6. **Faz 5 — Temizlik:** Kurucu katmanından tüm teknik dil ayıklanır; eski ekranlara kurucu katmanından giden bağlantılar kesilir (yalnızca `devLink`'ler kalır).

Veri riski yok: hiçbir adapter silinmiyor, localStorage şemaları (v2-panel-v1 vb.) değişmiyor, mutasyon yolları aynı.

## 15. Sprint Kırılımı

| Sprint | Kapsam | Çıktı / Kabul |
|---|---|---|
| **v8.0 — Information Architecture** | 4 öğeli sidebar, founder/developer katman ayrımı, v7 ekranlarının Developer altına taşınması, `V2Screen` genişletmesi (`hermes-home`, `revenue-pulse`, `settings`, `developer`) | Kurucu 4 öğe görür; Developer'a girince v7'nin tamamı çalışır durumda |
| **v8.1 — Hermes Home** | Hermes Today özet şeridi + Hermes Activity zaman çizelgesi + boş Decision Queue iskeleti; hermes-home varsayılan ekran | Uygulama açılışında "bugün ne oldu" tek bakışta okunur |
| **v8.2 — Decision Queue** | 6 karar tipi adapter'ı, deterministik sıralama, tek-dokunuş aksiyonların mevcut runtime mutasyonlarına bağlanması, SLA/aged görünümü | Her bekleyen onay/cevap/demo/takip/sonuç/hata kuyrukta; aksiyon sonucu kuyruk anında güncellenir (M6.1 kalıbı) |
| **v8.3 — Opportunity Focus** | Birleşik sağ panel: state + whyItMatters + öneri + güvenli aksiyonlar + timeline özeti; boş-seçim hâlinde günün fırsatı | Bir lead'in tüm hikâyesi tek panelde; 8 eski context panelin yerini alır |
| **v8.4 — Developer Isolation** | Tüm teknik dil/kart/panel süpürmesi, devLink'lerin bağlanması, ajan görünürlüğünün Seviye 1/2 ayrımı, Hermes Monitor'un Developer'a sabitlenmesi | Kurucu katmanında tek bir teknik terim, ham skor veya runtime kartı kalmaz |
| **v8.5 — Polish / RC** | Boş durumlar, yükleme durumları, badge davranışı, Turkish copy denetimi, performans (tek ekran ağırlaştı mı), tam regresyon (15 runtime uçtan uca) | Kabul kriterlerinin tamamı (§18) yeşil; release candidate |

## 16. Açık Hedef-Dışılar (Non-Goals)

- **Runtime mantığında hiçbir değişiklik yok.** 15 runtime'ın davranışı, adapter hesapları, skor motorları aynen kalır.
- **Hiçbir ekran/özellik silinmez.** v7'nin tamamı Developer Mode'da yaşar.
- **Yeni otonomi yetkisi verilmez.** Hermes'in onaysız yapabildikleri v8'de genişlemez; A4 yürütme kapsamı ayrı bir karardır.
- **Backend / veri şeması değişikliği yok.** localStorage anahtarları, API rotaları, Airtable/Sheets entegrasyonları dokunulmaz.
- **Mobil uygulama, çoklu kullanıcı, rol/izin sistemi yok.** Tek kurucu varsayımı sürer.
- **Görsel yeniden tasarım yok.** Sprint 15-16'nın tasarım dili (tokenlar, KpiCard, sidebar estetiği) korunur; değişen bilgi mimarisidir, estetik değil.

## 17. Riskler

1. **Decision Queue boş kalırsa ürün "ölü" görünür.** Erken dönemde karar hacmi düşük olabilir. Önlem: boş durum bilinçli tasarlanır (§8) ve Hermes Today + Activity her zaman doludur; ürün "çalışıyorum" der.
2. **Aşırı damıtma → güven kaybı.** Kurucu "Hermes neden böyle önerdi?" diye sorabilir ve cevabı bulamazsa sisteme güveni düşer. Önlem: her öğede `hermesRecommendation` gerekçeli, her öğeden `devLink` ile ham veriye iniş mümkün.
3. **Adapter çoğalması.** 6 karar tipi × runtime kaynakları yeni bir birleştirme katmanı demek; yanlış kurulursa 4. paralel sistem doğar (v3.9.1A denetiminin uyarısı). Önlem: Decision Queue adapter'ı **saf toplama** olarak kısıtlanır; iş mantığı runtime'larda kalır.
4. **Alışkanlık direnci.** Kurucu bazı v7 ekranlarına alışkın olabilir. Önlem: hiçbir şey silinmediği için Developer'dan erişim sürer; v8.1-v8.3 boyunca eski varsayılan ekrana dönüş bir ayarla mümkün tutulur, v8.5'te kaldırılır.
5. **Tek ekran performansı.** Home 4 bölgeyi ve tüm adapter'ları aynı anda besler. Önlem: adapter'lar zaten memo'lu; v8.5'te ölçülür, gerekirse Activity/Focus tembel yüklenir.
6. **Karar tipi enflasyonu.** Zamanla "şunu da kuyruğa koyalım" baskısı gelir ve kuyruk yeni bir dashboard'a dönüşür. Önlem: kuyruğa giriş ölçütü anayasadır — *öğe, kurucunun tek dokunuşla verebileceği bir karar içermiyorsa kuyruğa giremez.*

## 18. Kabul Kriterleri

**Kurucu deneyimi**
- [ ] Uygulama açıldığında kurucu, kaydırmadan ve tıklamadan şu 5 soruya cevap görür: bugün ne oldu, kaç karar bekliyor, en sıcak fırsat ne, tıkanan ne var, sıradaki aksiyon ne.
- [ ] Kurucu sidebar'da en fazla 4 öğe görür; badge yalnızca Hermes öğesinde ve bekleyen karar sayısındadır.
- [ ] Bekleyen her onay, sıcak cevap, demo kararı, takip kararı, sonuç işaretleme ve teslimat hatası Decision Queue'da tek tip öğe olarak görünür; hiçbir karar başka ekranda "saklanmaz".
- [ ] Her karar öğesi tek dokunuşla sonuçlandırılabilir ve sonuç kuyruğa anında yansır.
- [ ] Bir öğe seçildiğinde Opportunity Focus, ilgili otelin durumunu, önemini, Hermes önerisini ve son olaylarını **modül gezmeden** gösterir.
- [ ] Kurucu katmanının hiçbir yerinde ham skor, runtime adı, provider adı veya teknik log görünmez.
- [ ] Hermes Activity günde anlamlı olay sayısı düzeyinde kalır; tek bir teknik olay (retry/502/cron) sızmaz.

**Sistem bütünlüğü**
- [ ] 15 runtime'ın tamamı v7'deki davranışıyla birebir çalışır (uçtan uca regresyon: keşif → ICP → taslak → onay → gönderim → makbuz → cevap → zekâ → demo → takip → sonuç).
- [ ] v7'nin 13 ekranının tamamı Developer Mode altından erişilebilir ve işlevseldir.
- [ ] localStorage şemaları ve mevcut kalıcılık davranışı (M2.3, M6.2) değişmemiştir; typecheck 0 hata, build temiz.
- [ ] Decision Queue adapter'ında iş mantığı yoktur; yalnızca mevcut runtime çıktılarının birleştirilmesi ve sıralanmasıdır (kod denetimiyle doğrulanır).

**Ürün ilkesi**
- [ ] Karar istemeyen hiçbir bilgi kurucu ana katmanında yer almaz (tasarım denetimi).
- [ ] Decision Queue boşken ekran bunu başarı olarak sunar, hata olarak değil.

---

*v8'in tek cümlelik tanımı: v7 kurucuya Hermes'in gördüklerini gösteriyordu; v8 kurucuya yalnızca Hermes'in soramadıklarını soruyor.*
