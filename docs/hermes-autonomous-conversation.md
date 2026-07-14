# Hermes Autonomous Conversation (Sprint C4)

> **Konuşma zekâsı ≠ mesaj gönderimi.**
> Conversation intelligence does not equal message sending. C4 gelen bir
> cevabın ticari anlamını tek, güvenli ve açıklanabilir bir karara dönüştürür;
> hiçbir mesaj göndermez, hiçbir onay üretmez.

## 1. Amaç (Objective)

Hermes zaten gelen WhatsApp cevabını dinleyebiliyor, sınıflandırabiliyor
(fiyat/demo/arama/ilgi/daha sonra/ilgilenmiyor/yanlış numara) ve demo/takip
adayları oluşturabiliyordu. Ancak bu katmanlar founder açısından **parçalı**
kalıyordu.

C4 her inbound reply için mevcut Reply Intelligence çıktısını kullanarak
**tek bir `ConversationDecision`** üretir. Founder tek ekranda görür:

- Otel ne cevap verdi? (güvenli önizleme)
- Bu cevabın ticari anlamı ne? (konuşma durumu)
- Hermes ne öneriyor?
- Founder'dan hangi karar bekleniyor?
- Taslak / demo / görüşme / takip / kapatma gerekli mi?

## 2. Mevcut runtime'ların yeniden kullanımı (Existing reuse)

C4 **yeni parser, classifier, inbox, demo/follow-up/outcome runtime veya send
sistemi yazmadı.** Şunları OKUR / yeniden kullanır:

| Katman | Modül | Kullanım |
|---|---|---|
| Reply parser | `whatsapp-reply-listener-runtime.ts` | değişmedi |
| Reply registry | `whatsapp-reply-registry.ts` | değişmedi |
| Intent classifier | `reply-intelligence-runtime.ts` | `intent/confidence/urgency/founderActionHint` okunur |
| Intelligence registry | `reply-intelligence-registry.ts` | **choke point** — burada birleştirme yapılır |
| Demo scheduling | `demo-scheduling-registry.ts` | mevcut seeding korunur; C4 ikinci demo üretmez |
| Follow-up | `follow-up-registry.ts` | mevcut seeding korunur; C4 ikinci follow-up üretmez |
| Sales outcome | `sales-outcome-registry.ts` | won/lost **source-of-truth** override için okunur |
| Courier / Approval | mevcut zincir | taslak yalnız `approval_required` olarak işaretlenir |

## 3. Konuşma durum modeli (State model)

`ConversationState` (13 durum) → founder karşılığı:

| State | Founder | Öncelik | Sonraki adım |
|---|---|---|---|
| `awaiting_reply` | Yanıt Bekleniyor | low | wait |
| `reply_received` | Cevap Geldi | low | wait |
| `hot_opportunity` | Sıcak Fırsat | high | prepare_reply_draft |
| `pricing_discussion` | Fiyat Görüşmesi | high | prepare_reply_draft |
| `demo_requested` | Demo Talebi | high | schedule_demo |
| `call_requested` | Görüşme Talebi | high | schedule_call |
| `follow_up_later` | Daha Sonra Takip | medium | create_follow_up |
| `human_review_required` | Founder İncelemesi Gerekli | medium | founder_review |
| `not_interested` | İlgilenmiyor | low | mark_not_interested |
| `wrong_number` | Yanlış Numara | critical | mark_wrong_number |
| `closed_won` | Satış Kazanıldı | low | wait |
| `closed_lost` | Satış Kaybedildi | low | wait |
| `blocked` | İşlem Engellendi | critical | blocked |

## 4. Intent → state eşlemesi (Mapping)

Mevcut `ReplyIntent` değerleri **tahmin edilmeden** eşlenir:

| Reply intent | State | Bayraklar |
|---|---|---|
| `demo_requested` | demo_requested | demoSchedulingNeeded, founderActionRequired |
| `call_requested` | call_requested | callSchedulingNeeded, founderActionRequired |
| `pricing_question` | pricing_discussion | replyDraftNeeded, approvalRequired, founderActionRequired |
| `interested` | hot_opportunity | replyDraftNeeded, approvalRequired, founderActionRequired |
| `later` | follow_up_later | followUpNeeded |
| `not_interested` | not_interested | conversationClosed |
| `wrong_number` | wrong_number | conversationClosed, founderActionRequired |
| `human_review_required` | human_review_required | founderActionRequired |
| `unknown` (mapped) | reply_received | — (pasif, tahmin yok) |
| `unknown` (unmapped) | human_review_required | founderActionRequired |

**Sales Outcome source-of-truth override:** mission `won` → `closed_won`,
`lost` → `closed_lost` (reply intent'i geçersiz kılar).

**Eşleşmemiş otomasyon düşüşü:** policy `requireMappedReplyForAutomation` açıkken,
otomasyon gerektiren bir ticari intent (demo/call/pricing/interested) eşleşmemiş
(unmapped) bir cevaptan geldiyse `human_review_required`'a düşürülür — Hermes
lead'i tahmin etmez, founder önce lead'i bulur.

## 5. Cevap taslağı güvenliği (Reply draft safety)

- Taslak yalnız `hot_opportunity` / `pricing_discussion` (ve founder
  `founder_review` sonrası devam etmeyi seçerse) için hazırlanabilir.
- `replyDraftNeeded=true` **her zaman** `approvalRequired=true` getirir
  (yapısal koruma — `deriveConversationFlags` bunu garanti eder).
- C4 **yeni serbest metin üretmez, yeni template registry kurmaz, yeni AI
  provider eklemez, yeni send route açmaz.** Gerçek metin mevcut Courier +
  template motoru tarafından, founder onay döngüsünde üretilir.

## 6. Founder onayı koruması (No-auto-approve / No-auto-send)

`ConversationDecision` üzerinde **`sendAllowed` / `founderApproved` alanı
YOKTUR** → onay/gönderim tip düzeyinde imkânsızdır. Runtime hiçbir
mesajlaşma/provider/gateway/send modülünü import etmez.

## 7. Demo / görüşme / takip / sonuç entegrasyonu

- **demo_requested:** mevcut Demo Scheduling seeding (choke point'te, C4'ten
  önce) tek demo öğesini oluşturur; C4 ikinci öğe üretmez, yalnız
  `demoSchedulingNeeded` bayrağıyla founder'ı bilgilendirir.
- **call_requested:** mevcut scheduling modeli kullanılır (`callSchedulingNeeded`);
  yeni calendar API eklenmez.
- **later:** mevcut Follow-up seeding tek adayı oluşturur; C4 duplicate üretmez.
- **not_interested:** konuşma operasyonel olarak kapanır; **asla otomatik
  `lost` üretmez** — Sales Outcome kaydı oluşturulmaz.
- **wrong_number:** konuşma kapanır; mevcut pipeline zaten demo/follow-up
  seed etmez (yapısal), böylece gelecekteki otomasyon engellenir.
- **won/lost:** mevcut Sales Outcome source-of-truth; C4 sonucu uydurmaz.

## 8. Kayıt defteri (Registry)

`hermes-conversation-registry.ts`: server-only, in-memory, 14 gün TTL, max 500
kayıt, **provider message id bazlı upsert** (webhook retry duplicate üretmez).
Yalnız sanitize edilmiş `ConversationDecision` saklanır; audit detay son
savunma hattı olarak scrub edilir (telefon/token/secret). Lead/mission
indeksleri + `getOpenConversationDecisions` (yalnız aktif konuşmalar).

## 9. Webhook dayanıklılığı (Resilience)

Entegrasyon `recordReplyIntelligence` choke point'inde, mevcut demo/follow-up
seeding'in yanında, **try/catch içinde** yapılır:

```
Webhook → Reply Parser → Reply Registry → Reply Intelligence
        → Autonomous Conversation Decision → Conversation Registry
        → (mevcut Demo / Follow-up / Outcome yolları değişmeden)
```

- Reply Listener / Reply Intelligence davranışı değişmedi.
- Classifier hatası reply kaydını düşürmez.
- Conversation hatası webhook'u düşürmez (Meta hızlı HTTP 200 alır).
- Retry aynı konuşma/demo/follow-up öğesini tekrar oluşturmaz.
- Delivery receipt işleme etkilenmedi.

## 10. Eşleme sınırları (Mapping limitations)

- Intent tahmini yapılmaz: unmapped/belirsiz cevaplar `human_review_required`.
- İşletme adı reply intelligence çıktısında olmadığından registry fallback ad
  saklar; founder görünümü adı ekranın lead havuzundan (`leadNameById`) zenginleştirir.
- `call_requested` mevcut demo scheduling modelini kullanır (ayrı çağrı runtime
  yok).

## 11. Gönderim yapılmama garantisi (No-auto-send guarantee)

Bkz. §6. Yapısal + testlerle doğrulanmıştır (`hermes-conversation-integration.test.ts`:
"no conversation decision exposes a send or delivery path").

## 12. QA kontrol listesi

- [x] interested → hot_opportunity + approval-required draft, no send
- [x] pricing → pricing_discussion + approval-required draft, no send
- [x] demo → tek demo adayı + Planla aksiyonu
- [x] call → scheduling aksiyonu, calendar API yok
- [x] later → tek follow-up
- [x] not_interested → operasyonel kapanış, otomatik lost yok
- [x] wrong_number → engellendi, gelecekte otomasyon yok
- [x] unknown mapped → reply_received (tahmin yok); unmapped → founder review
- [x] retry → duplicate yok
- [x] Founder Home → Türkçe, güvenli, "Gönder" butonu yok, teknik terim yok
- [x] mevcut controlled send → değişmedi

## 13. Etkinleştirme / geri alma (Activation / rollback)

- **Etkinleştirme:** `DEFAULT_CONVERSATION_POLICY.enabled = true` (default).
  Konuşma orchestration inbound cevaplara bağlıdır, autonomous acquisition'dan
  bağımsızdır.
- **Geri alma:** choke point (`seedConversationForIntelligence`) `!policy.enabled`
  olduğunda erken döner; policy'yi kapatmak tüm konuşma kaydını durdurur, mevcut
  reply/demo/follow-up davranışı hiç etkilenmez.

## 14. Bilinen sınırlamalar (Known limitations)

- In-memory store; server restart'ında kaybolur (tüm Hermes registry'leri gibi).
- İşletme adı zenginleştirmesi client lead havuzuna bağlıdır (server fallback ad).
- `call_requested` demo scheduling adayını kullanır; ayrı çağrı takvimi yoktur.
- Conversation kararı bir okuma/birleştirme katmanıdır; mevcut Decision Queue
  zaten hot_reply/demo/follow-up/outcome kararlarını ürettiğinden C4 Karar
  Merkezi'ne **paralel ikinci kart eklemez** (duplicate önleme).
