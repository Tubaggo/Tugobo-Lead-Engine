import type { LeadStatus, OutreachPriorityBucket, RecommendedAction } from "@/app/lib/leads";

export type Locale = "tr" | "en";

const UI = {
  // Nav / chrome
  dashboard: { en: "Dashboard", tr: "Panel" },
  follow_ups: { en: "Follow-ups", tr: "Takipler" },
  navigation: { en: "Navigation", tr: "Menü" },
  language: { en: "Language", tr: "Dil" },

  // Header
  app_tagline: {
    en: "Find and contact high-probability tourism & accommodation leads every morning.",
    tr: "Her sabah turizm ve konaklama için yüksek olasılıklı leadleri bulun ve arayın.",
  },
  today: { en: "Today", tr: "Bugün" },
  session_leads_suffix: { en: "session leads", tr: "oturum leadi" },
  start_new_session: { en: "Start New Session", tr: "Yeni oturum" },

  // Stats
  stat_session_leads: { en: "Session Leads", tr: "Oturum leadleri" },
  stat_session_leads_hint: { en: "Added this session", tr: "Bu oturumda eklenen" },
  stat_hot_leads: { en: "Hot Leads", tr: "Sıcak leadler" },
  stat_hot_leads_hint: { en: "Hot score ≥ 70 in session", tr: "Oturumda sıcak skor ≥ 70" },
  stat_contacted: { en: "Contacted", tr: "İletişime geçildi" },
  stat_replied: { en: "Replied", tr: "Cevap geldi" },
  stat_session: { en: "Session", tr: "Oturum" },
  stat_won: { en: "Won", tr: "Kazanılan" },
  stat_won_hint: {
    en: "{amount} session pipeline / mo",
    tr: "{amount} aylık pipeline",
  },

  // Morning outreach
  morning_outreach: { en: "Morning Outreach", tr: "Sabah iletişimi" },
  queue_word: { en: "Queue", tr: "Kuyruk" },
  follow_ups_due_label: { en: "Follow-ups due", tr: "Takip zamanı" },
  contacted_today_label: { en: "Contacted today", tr: "Bugün iletişim" },
  auto_build_queue: { en: "Auto Build Today's Queue", tr: "Bugünün kuyruğunu kur" },
  start_outreach_session: { en: "Start Outreach Session", tr: "İletişim oturumunu başlat" },
  open_follow_ups_today: { en: "Open Follow-ups Today", tr: "Bugünün takiplerini aç" },
  sync_airtable_short: { en: "Sync Airtable", tr: "Airtable senkron" },

  // Airtable row
  sync_to_airtable: { en: "Sync to Airtable", tr: "Airtable’a gönder" },
  syncing: { en: "Syncing...", tr: "Gönderiliyor…" },
  load_from_airtable: { en: "Load from Airtable", tr: "Airtable’dan yükle" },
  loading: { en: "Loading...", tr: "Yükleniyor…" },
  airtable_connected: { en: "Airtable connected", tr: "Airtable bağlı" },

  // Last import section
  last_import_results: { en: "Last Import Results", tr: "Son içe aktarma" },
  last_import_sub: { en: "Only leads from your latest import", tr: "Yalnızca son içe aktarmadaki leadler" },
  run_import_prompt: { en: "Run an import to see newly added leads here.", tr: "Yeni leadleri görmek için içe aktarma çalıştırın." },
  no_new_leads_import: {
    en: "No new leads in this import — all results already existed.",
    tr: "Bu içe aktarmada yeni lead yok — kayıtlar zaten vardı.",
  },
  latest_import_dupes_only: {
    en: "Latest import returned only duplicates.",
    tr: "Son içe aktarma yalnızca mükerrer döndü.",
  },

  // Table / common columns
  col_lead: { en: "Lead", tr: "Lead" },
  col_type: { en: "Type", tr: "Tür" },
  col_location: { en: "Location", tr: "Konum" },
  col_imported: { en: "Imported", tr: "İçe aktarıldı" },
  first_imported_label: { en: "First imported", tr: "İlk içe aktarma" },
  last_imported_label: { en: "Last imported", tr: "Son içe aktarma" },
  contact_readiness: { en: "Contact Readiness", tr: "İletişim hazırlığı" },
  contact_readiness_title: {
    en: "Readiness = ability to contact immediately",
    tr: "Hazırlık = hemen ulaşılabilirlik",
  },
  hot_score: { en: "Hot Score", tr: "Sıcak skor" },
  hot_score_title: { en: "Hot Score = business opportunity", tr: "Sıcak skor = iş fırsatı" },
  lead_score: { en: "Lead Score", tr: "Lead skoru" },
  actions: { en: "Actions", tr: "İşlemler" },
  new_to_database: { en: "New to database", tr: "Veritabanına yeni" },
  reimported: { en: "Re-imported", tr: "Yeniden içe aktarıldı" },
  last_contact: { en: "Last contact", tr: "Son iletişim" },
  outreach_prefix: { en: "Outreach", tr: "İletişim" },

  readiness_ready_now: { en: "Ready Now", tr: "Hemen hazır" },
  readiness_good_contact: { en: "Good Contact", tr: "İyi kanal" },
  readiness_needs_finder: { en: "Needs Finder", tr: "Finder gerekli" },
  readiness_weak_contact: { en: "Weak Contact", tr: "Zayıf kanal" },
  readiness_no_contact: { en: "No Contact", tr: "Kanal yok" },

  ai_message: { en: "AI Message", tr: "AI mesajı" },
  follow_up: { en: "Follow Up", tr: "Takip" },
  add_to_queue: { en: "Add to Queue", tr: "Kuyruğa ekle" },
  open: { en: "Open", tr: "Aç" },
  queue_short: { en: "Queue", tr: "Kuyruk" },

  // Chips / outreach row
  do_not_contact: { en: "Do Not Contact", tr: "İletişim kurma" },
  chip_new: { en: "New", tr: "Yeni" },
  chip_new_import: { en: "New import", tr: "Yeni içe aktarma" },
  follow_up_due: { en: "Follow-Up Due", tr: "Takip zamanı" },
  followed_up_before: { en: "Followed up before", tr: "Daha önce takip" },
  high_priority: { en: "⭐ High Priority", tr: "⭐ Yüksek öncelik" },
  outreach_risk: { en: "\u26A0 Outreach Risk", tr: "\u26A0 İletişim riski" },
  readiness_prefix: { en: "Readiness", tr: "Hazırlık" },
  contact_quality_prefix: { en: "Contact", tr: "Kalite" },
  weak_booking_flow: { en: "Weak booking flow", tr: "Rezervasyon akışı zayıf" },
  ota_dependent: { en: "OTA dependent", tr: "OTA’ya bağımlı" },
  active_instagram: { en: "Active Instagram", tr: "Aktif Instagram" },
  instagram_verified: { en: "Instagram verified", tr: "Instagram doğrulandı" },
  broken_ig_link: { en: "Broken IG link", tr: "Bozuk IG linki" },
  possible_instagram: { en: "Possible Instagram", tr: "Olası Instagram" },
  manual_ig_check: { en: "Manual IG check", tr: "Manuel IG kontrolü" },
  very_high_opportunity: { en: "Very High Opportunity", tr: "Çok yüksek fırsat" },
  high_opportunity: { en: "High Opportunity", tr: "Yüksek fırsat" },

  // Priority chips (full phrase)
  outreach_priority_today: { en: "Priority Today", tr: "Bugünün önceliği" },
  outreach_priority_high: { en: "Priority High", tr: "Yüksek öncelik" },
  outreach_priority_medium: { en: "Priority Medium", tr: "Orta öncelik" },
  outreach_priority_low: { en: "Priority Low", tr: "Düşük öncelik" },
  outreach_priority_archive: { en: "Priority Archive", tr: "Arşiv önceliği" },

  // Recommended actions
  action_send_whatsapp: { en: "Send WhatsApp", tr: "WhatsApp gönder" },
  action_follow_up: { en: "Follow Up", tr: "Takip" },
  action_research_more: { en: "Research More", tr: "Daha fazla ara" },
  action_wait: { en: "Wait", tr: "Bekle" },
  action_skip: { en: "Skip", tr: "Atla" },

  // Acquisition chips
  paid_traffic_possible: { en: "Paid Traffic Possible", tr: "Ücretli trafik olası" },
  paid_traffic_possible_title: {
    en: "Heuristic score only — not verified against Meta Ads, Google Ads, or ad libraries.",
    tr: "Yalnızca sezgisel skor — Meta/Google reklamlarıyla doğrulanmadı.",
  },
  acq_paid_signals_title: {
    en: "Possible paid acquisition signals from copy and surfaces — not verified ad detection.",
    tr: "Metin ve yüzeylerden ücretli edinim sinyali olabilir — reklam tespiti yok.",
  },
  high_acquisition_intent: { en: "High Acquisition Intent", tr: "Yüksek edinim niyeti" },
  acquisition_active: { en: "Acquisition Active", tr: "Etkin müşteri edinimi" },
  multi_channel_demand: { en: "Multi-Channel Demand", tr: "Çok kanallı talep" },
  strong_conversion_opportunity: { en: "Strong Conversion Opportunity", tr: "Güçlü dönüşüm fırsatı" },
  strong_conversion_opportunity_title: {
    en: "OTA or listing distribution plus social demand — booking path may still be under-optimized.",
    tr: "OTA/sosyal talep var — doğrudan rezervasyon yolu zayıf olabilir.",
  },
  traffic_booking_gap: { en: "Traffic → Booking Gap", tr: "Trafik → rezervasyon açığı" },
  traffic_booking_gap_title: {
    en: "Demand signals present with a weaker direct booking path.",
    tr: "Talep sinyali var; doğrudan rezervasyon yolu zayıf.",
  },
  acquisition_pressure: { en: "Acquisition pressure", tr: "Etkin edinim baskısı" },
  acquisition_pressure_title: {
    en: "Composite pressure score from social, paid proxies, and channel mix.",
    tr: "Sosyal, ücretli proxy ve kanal karmasından bileşik baskı skoru.",
  },

  // Status pipeline (UI only)
  status_new: { en: "New", tr: "Yeni" },
  status_contacted: { en: "Contacted", tr: "İletişime geçildi" },
  status_needs_follow_up: { en: "Follow-Up", tr: "Takip" },
  status_replied: { en: "Replied", tr: "Cevap geldi" },
  status_meeting: { en: "Meeting", tr: "Görüşme" },
  status_won: { en: "Won", tr: "Kazanıldı" },
  status_lost: { en: "Lost", tr: "Kayıp" },

  // Contact quality
  cq_high: { en: "High", tr: "Yüksek" },
  cq_medium: { en: "Medium", tr: "Orta" },
  cq_low: { en: "Low", tr: "Düşük" },

  // Outreach activity labels
  not_contacted: { en: "Not contacted", tr: "İletişim yok" },
  message_prepared: { en: "Message prepared", tr: "Mesaj hazır" },
  message_copied: { en: "Message copied", tr: "Mesaj kopyalandı" },
  whatsapp_opened: { en: "WhatsApp opened", tr: "WhatsApp açıldı" },
  contacted_activity: { en: "Contacted", tr: "İletişime geçildi" },

  // Hot card
  hot_badge: { en: "HOT", tr: "SICAK" },
  from_latest_import: { en: "From Latest Import", tr: "Son içe aktarmadan" },
  outreach_angle: { en: "Outreach angle", tr: "İletişim açısı" },
  model_rules: { en: "Model", tr: "Model" },
  rules: { en: "Rules", tr: "Kurallar" },
  opportunity: { en: "Opportunity", tr: "Fırsat" },
  temp: { en: "Temp", tr: "Sıcaklık" },
  approach: { en: "Approach", tr: "Yaklaşım" },

  // Import panel
  import_leads: { en: "Import Leads", tr: "Lead içe aktar" },
  city: { en: "City", tr: "Şehir" },
  niche_type: { en: "Niche / Type", tr: "Niş / tür" },
  source: { en: "Source", tr: "Kaynak" },
  import_10_leads: { en: "Import 10 Leads", tr: "10 lead içe aktar" },
  importing: { en: "Importing…", tr: "İçe aktarılıyor…" },
  refresh_from_google: { en: "Refresh from Google", tr: "Google’dan yenile" },
  use_cached_results: { en: "Use Cached Results", tr: "Önbelleği kullan" },
  cached_results_found: { en: "Cached results found for this search.", tr: "Bu arama için önbellek var." },
  import_hint_footer: {
    en: "Server needs GOOGLE_MAPS_API_KEY (Places API enabled).",
    tr: "Sunucuda GOOGLE_MAPS_API_KEY gerekir (Places API açık olmalı).",
  },
  enter_city_first: { en: "Enter a city first.", tr: "Önce şehir girin." },
  import_failed: { en: "Import failed", tr: "İçe aktarma başarısız" },
  source_cached: { en: "Cached", tr: "Önbellek" },
  source_google_label: { en: "Google", tr: "Google" },
  import_no_businesses: {
    en: "No businesses found for this search. Try another city or niche.",
    tr: "Bu aramada işletme bulunamadı. Başka şehir veya niş deneyin.",
  },
  import_no_new_line: {
    en: "No new leads — {updated} existing updated | {skipped} duplicates skipped | Source: {source}",
    tr: "Yeni lead yok — {updated} kayıt güncellendi | {skipped} mükerrer atlandı | Kaynak: {source}",
  },
  import_summary_line: {
    en: "{added} new {leadWord} added | {updated} existing updated | {hot} {hotWord} | {skipped} duplicates skipped | Source: {source}",
    tr: "{added} yeni {leadWord} | {updated} güncelleme | {hot} {hotWord} | {skipped} mükerrer | Kaynak: {source}",
  },
  import_word_lead: { en: "lead", tr: "lead" },
  import_word_leads: { en: "leads", tr: "lead" },
  import_word_hot_lead: { en: "hot lead", tr: "sıcak lead" },
  import_word_hot_leads: { en: "hot leads", tr: "sıcak lead" },

  // Follow-ups page
  follow_ups_today_title: { en: "🔥 Follow-ups Today", tr: "🔥 Bugünün takipleri" },
  follow_ups_today_sub: {
    en: "leads need follow-up today",
    tr: "lead için bugün takip var",
  },
  hot_leads_count: { en: "Hot leads", tr: "Sıcak lead" },
  refresh: { en: "Refresh", tr: "Yenile" },
  no_outreach_yet: { en: "No outreach activity yet.", tr: "Henüz iletişim kaydı yok." },
  unknown: { en: "Unknown", tr: "Bilinmiyor" },
  no_whatsapp: { en: "No WhatsApp", tr: "WhatsApp yok" },
  attempts: { en: "Attempts", tr: "Deneme" },
  last_short: { en: "Last", tr: "Son" },
  next_short: { en: "Next", tr: "Sonraki" },
  next_follow_up_label: { en: "Next follow-up", tr: "Sonraki takip" },
  stage: { en: "Stage", tr: "Aşama" },
  last_action_status: { en: "Last action", tr: "Son işlem" },
  status_word: { en: "Status", tr: "Durum" },
  send_whatsapp: { en: "Send WhatsApp", tr: "WhatsApp gönder" },
  mark_contacted: { en: "Mark Contacted", tr: "İletişime geçildi işaretle" },
  no_response: { en: "No Response", tr: "Yanıt yok" },
  follow_up_status_dnc: { en: "Do not contact", tr: "İletişim kurulmasın" },
  follow_up_status_due: { en: "Follow-up due", tr: "Takip zamanı" },
  airtable_not_connected: { en: "Airtable not connected", tr: "Airtable bağlı değil" },
  failed_load_followups: { en: "Failed to load follow-ups", tr: "Takipler yüklenemedi" },
  update_failed: { en: "Update failed", tr: "Güncellenemedi" },

  // Bulk / queue / follow-up section
  todays_queue: { en: "Today's Outreach Queue", tr: "Bugünün iletişim kuyruğu" },
  sent_today: { en: "Sent today", tr: "Bugün gönderilen" },
  skipped: { en: "Skipped", tr: "Atlanan" },
  start_session: { en: "Start Session", tr: "Oturumu başlat" },
  clear_queue: { en: "Clear Queue", tr: "Kuyruğu temizle" },
  queue_empty_hint: {
    en: 'Use "Add to Queue" on import or All Leads rows, or add selected leads in bulk.',
    tr: "İçe aktarma veya Tüm leadler satırlarından kuyruğa ekleyin veya toplu seçin.",
  },
  follow_up_due_section: { en: "Follow-Up Due", tr: "Takip zamanı gelenler" },
  follow_up_due_sub: { en: "Contacted leads due now (max 3 attempts)", tr: "İletişim kurulmuş, sırası gelen (en fazla 3 deneme)" },
  due_count: { en: "due", tr: "bekleyen" },
  no_follow_up_due: { en: "No follow-up due right now.", tr: "Şu an takip zamanı gelen yok." },
  attempts_label: { en: "Attempts", tr: "Deneme" },
  due_label: { en: "Due", tr: "Zaman" },
  preparing: { en: "Preparing...", tr: "Hazırlanıyor…" },
  mark_follow_up_sent: { en: "Mark Follow-Up Sent", tr: "Takip gönderildi işaretle" },
  selected_count: { en: "selected", tr: "seçili" },
  add_selected_to_queue: { en: "Add Selected to Queue", tr: "Seçilenleri kuyruğa ekle" },
  start_outreach_queue: { en: "Start Outreach Queue", tr: "Kuyruk iletişimini başlat" },

  // All leads filters
  all_leads: { en: "All Leads", tr: "Tüm leadler" },
  all_leads_sub: { en: "Full database for browsing and follow-up", tr: "Tarama ve takip için tam liste" },
  all_leads_explainer: {
    en: "Hot Score = business opportunity · Readiness = ability to contact immediately",
    tr: "Sıcak skor = iş fırsatı · Hazırlık = hemen ulaşılabilirlik",
  },
  hide: { en: "Hide", tr: "Gizle" },
  show: { en: "Show", tr: "Göster" },
  search_placeholder: {
    en: "Search lead, city, contact, or @instagram",
    tr: "Lead, şehir, iletişim veya @instagram ara",
  },
  sort_outreach_priority: { en: "Sort: Outreach Priority", tr: "Sırala: İletişim önceliği" },
  sort_contact_readiness: { en: "Sort: Contact Readiness", tr: "Sırala: İletişim hazırlığı" },
  sort_hot_score: { en: "Sort: Hot Score", tr: "Sırala: Sıcak skor" },
  sort_lead_score: { en: "Sort: Lead Score", tr: "Sırala: Lead skoru" },
  sort_name: { en: "Sort: Name", tr: "Sırala: İsim" },
  focus_mode: { en: "Focus Mode", tr: "Odak modu" },
  on: { en: "On", tr: "Açık" },
  off: { en: "Off", tr: "Kapalı" },
  filter_all_types: { en: "All types", tr: "Tüm türler" },
  filter_all_status: { en: "All status", tr: "Tüm durumlar" },
  filter_contact_all: { en: "Contact: all", tr: "Kanal: tümü" },
  filter_contact_ready: { en: "Contact Ready", tr: "Kanal hazır" },
  filter_needs_finder: { en: "Needs Finder", tr: "Finder gerekli" },
  filter_no_contact: { en: "No Contact", tr: "Kanal yok" },
  filter_last_import: { en: "Last Import", tr: "Son içe aktarma" },
  filter_all_time: { en: "All Time", tr: "Tüm zamanlar" },
  filter_todays_work: { en: "Today's Work", tr: "Bugünün işi" },
  filter_focused: { en: "Focused", tr: "Odak" },
  filter_hot: { en: "Hot", tr: "Sıcak" },
  filter_all_tab: { en: "All", tr: "Tümü" },
  filter_new_tab: { en: "New", tr: "Yeni" },
  filter_follow_up_time: { en: "Follow-Up", tr: "Takip" },
  showing_leads: { en: "Showing", tr: "Gösterilen" },
  of: { en: "of", tr: "/" },
  leads_word: { en: "leads", tr: "lead" },
  select_all_visible: { en: "Select All (visible)", tr: "Tümünü seç (görünen)" },
  focus_hint: { en: "Focused: status New + hot score ≥ 70", tr: "Odak: Yeni + sıcak skor ≥ 70" },
  no_leads_filters: { en: "No leads match your filters.", tr: "Filtrelere uyan lead yok." },
  show_more: { en: "Show more", tr: "Daha fazla" },
  show_less: { en: "Show less", tr: "Daha az" },
  session_import_badge: { en: "Session import", tr: "Oturum içe aktarması" },

  // Calendar snippets
  cal_today: { en: "Today", tr: "Bugün" },
  cal_yesterday: { en: "Yesterday", tr: "Dün" },
  imported_prefix: { en: "Imported:", tr: "İçe aktarıldı:" },

  // Queue list
  source_latest_import: { en: "Latest Import", tr: "Son içe aktarma" },
  source_airtable: { en: "Airtable", tr: "Airtable" },
  source_local_pool: { en: "Local Pool", tr: "Yerel havuz" },
  ready_label: { en: "Ready", tr: "Hazır" },
  rank_label: { en: "Rank", tr: "Sıra" },
  contact_ready: { en: "Contact ready", tr: "Kanal hazır" },
  needs_finder_lower: { en: "Needs finder", tr: "Finder gerekli" },
  no_channel: { en: "No channel", tr: "Kanal yok" },

  // AI modal
  ai_message_title: { en: "AI Message", tr: "AI mesajı" },
  in_outreach_queue: { en: "In outreach queue", tr: "İletişim kuyruğunda" },
  close_aria: { en: "Close", tr: "Kapat" },
  generating_message: { en: "Generating message…", tr: "Mesaj oluşturuluyor…" },
  retry: { en: "Retry", tr: "Tekrar dene" },
  style_soft: { en: "Soft", tr: "Yumuşak" },
  style_direct: { en: "Direct", tr: "Direkt" },
  style_consultative: { en: "Consultative", tr: "Danışman" },
  manual_outreach_note: {
    en: "Manual outreach only — review before sending.",
    tr: "Manuel iletişim — göndermeden önce gözden geçirin.",
  },
  copy: { en: "Copy", tr: "Kopyala" },
  copied: { en: "Copied", tr: "Kopyalandı" },
  send_via_whatsapp: { en: "Send via WhatsApp", tr: "WhatsApp ile gönder" },

  // Outreach session modal (partial)
  session_complete: { en: "Session complete", tr: "Oturum bitti" },
  todays_outreach_session: { en: "Today's outreach session", tr: "Bugünün iletişim oturumu" },
  summary_for_run: { en: "Summary for this run", tr: "Bu çalışma özeti" },
  nice_work: { en: "Nice work.", tr: "Ellerine sağlık." },
  sent_label: { en: "Sent", tr: "Gönderilen" },
  dnc_label: { en: "Do not contact", tr: "İletişim kurulmasın" },
  close: { en: "Close", tr: "Kapat" },
  lead_score_lower: { en: "Lead score", tr: "Lead skoru" },
  hot_score_lower: { en: "Hot score", tr: "Sıcak skor" },
  readiness_lower: { en: "Readiness", tr: "Hazırlık" },
  contact_quality: { en: "Contact quality", tr: "İletişim kalitesi" },
  best_contact: { en: "Best contact", tr: "En iyi kanal" },
  pipeline: { en: "Pipeline", tr: "Pipeline" },
  queue_status: { en: "Queue status", tr: "Kuyruk durumu" },
  selected_because: { en: "Selected because:", tr: "Seçilme nedeni:" },
  ai_message_preview: { en: "AI message preview", tr: "AI mesaj önizleme" },

  // Footer
  footer_mvp: {
    en: "Tugobo Lead Engine · founder MVP · data is local to this browser",
    tr: "Tugobo Lead Engine · MVP · veriler bu tarayıcıda",
  },

  // Detail drawer (frequently visible)
  lead_detail_close: { en: "Close panel", tr: "Paneli kapat" },

  // Acquisition summary (one-liners)
  acq_summary_active_multi: {
    en: "Actively acquiring customers through multiple channels.",
    tr: "Birden fazla kanalla aktif müşteri edinimi var.",
  },
  acq_summary_social_gap: {
    en: "Strong social demand but possible booking conversion weakness.",
    tr: "Güçlü sosyal talep; rezervasyon dönüşümü zayıf olabilir.",
  },
  acq_summary_investing: {
    en: "Likely investing in customer acquisition.",
    tr: "Müşteri edinimine yatırım yapıyor olabilir.",
  },
  acq_summary_elevated: {
    en: "Elevated acquisition posture versus typical listings in this set.",
    tr: "Bu sete kıyasla daha yüksek edinim profili.",
  },
  acq_intel_title: { en: "Acquisition intelligence", tr: "Müşteri edinimi özeti" },
  acq_intel_limited: {
    en: "Limited acquisition signals for this lead.",
    tr: "Bu lead için sınırlı edinim sinyali.",
  },
  less: { en: "Less", tr: "Az" },
  detail: { en: "Detail", tr: "Detay" },
  signals: { en: "Signals", tr: "Sinyaller" },
  gaps: { en: "Gaps", tr: "Açıklar" },
  search_ig: { en: "Search IG", tr: "IG’de ara" },
  instagram_link_broken_long: {
    en: "Broken Instagram link",
    tr: "Bozuk Instagram bağlantısı",
  },
  instagram_none_on_file: { en: "No Instagram on file", tr: "Kayıtta Instagram yok" },
  suggested_prefix: { en: "Suggested", tr: "Önerilen" },
  also_handles: { en: "also", tr: "ayrıca" },

  // Queue status display (UI labels for enum-like values)
  qstatus_queued: { en: "queued", tr: "kuyruk" },
  qstatus_prepared: { en: "prepared", tr: "hazır" },
  qstatus_opened: { en: "opened", tr: "açıldı" },
  qstatus_contacted: { en: "contacted", tr: "iletişim" },
  qstatus_skipped: { en: "skipped", tr: "atlandı" },

  chip_contacted_today: { en: "Contacted today", tr: "Bugün iletişim" },
  chip_contacted_before: { en: "Contacted before", tr: "Daha önce iletişim" },
  chip_max_attempts: { en: "Max attempts reached", tr: "Üst deneme sınırı" },
  chip_reimported: { en: "Re-imported", tr: "Yeniden içe aktarıldı" },
  chip_in_queue: { en: "In queue", tr: "Kuyrukta" },
  chip_synced_airtable: { en: "Synced to Airtable", tr: "Airtable’a işlendi" },
  ig_try_handles: { en: "Try", tr: "Dene" },

  queue_section_summary: {
    en: "{active}/{limit} active · Sent today {sent} · Skipped {skip} · DNC {dnc}",
    tr: "{active}/{limit} aktif · Bugün gönderilen {sent} · Atlanan {skip} · DNC {dnc}",
  },
  hot_targets: { en: "Today's Best Outreach Targets", tr: "En iyi iletişim hedefleri" },
  hot_targets_import: {
    en: "Today's Best Outreach Targets (Last Import)",
    tr: "En iyi hedefler (son içe aktarma)",
  },
  hot_targets_sub: {
    en: "Prioritized by real outreach opportunity",
    tr: "Gerçek iletişim fırsatına göre sıralı",
  },
  open_whatsapp: { en: "Open WhatsApp", tr: "WhatsApp aç" },
  no_whatsapp_contact: { en: "No WhatsApp contact", tr: "WhatsApp yok" },
  copy_message: { en: "Copy Message", tr: "Mesajı kopyala" },
  mark_sent: { en: "Mark Sent", tr: "Gönderildi işaretle" },
  remove_from_queue: { en: "Remove from Queue", tr: "Kuyruktan çıkar" },
  mark_dnc_long: { en: "Mark Do Not Contact", tr: "İletişim kurulmasın işaretle" },
  invalid_whatsapp: { en: "Invalid WhatsApp", tr: "WhatsApp geçersiz" },
  next_lead: { en: "Next Lead", tr: "Sonraki lead" },
  prepare_message: { en: "Prepare Message", tr: "Mesaj hazırla" },
  prepare_placeholder: {
    en: "Prepare Message to generate AI outreach copy",
    tr: "AI metni üretmek için mesaj hazırlayın",
  },
  max_contact_warning: {
    en: "Already contacted multiple times — proceed carefully.",
    tr: "Birden fazla iletişim var — dikkatli ilerleyin.",
  },
  yes_word: { en: "Yes", tr: "Evet" },
  no_word: { en: "No", tr: "Hayır" },
  pipeline_stage_label: { en: "Pipeline stage", tr: "Pipeline aşaması" },
  next_action_header: { en: "Next Action", tr: "Sonraki adım" },
} as const;

export type UiKey = keyof typeof UI;

export function t(key: UiKey, locale: Locale): string {
  const row = UI[key];
  return locale === "tr" ? row.tr : row.en;
}

/** Replace `{name}` placeholders in a translated template string. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export function outreachPriorityChipLabel(bucket: OutreachPriorityBucket, locale: Locale): string {
  const map: Record<OutreachPriorityBucket, UiKey> = {
    today: "outreach_priority_today",
    high: "outreach_priority_high",
    medium: "outreach_priority_medium",
    low: "outreach_priority_low",
    archive: "outreach_priority_archive",
  };
  return t(map[bucket], locale);
}

export function recommendedActionUiLabel(action: RecommendedAction, locale: Locale): string {
  const map: Record<RecommendedAction, UiKey> = {
    send_whatsapp: "action_send_whatsapp",
    follow_up: "action_follow_up",
    research_more: "action_research_more",
    wait: "action_wait",
    skip: "action_skip",
  };
  return t(map[action], locale);
}

export function statusUiLabel(status: LeadStatus, locale: Locale): string {
  const map: Record<LeadStatus, UiKey> = {
    new: "status_new",
    contacted: "status_contacted",
    needs_follow_up: "status_needs_follow_up",
    replied: "status_replied",
    meeting: "status_meeting",
    won: "status_won",
    lost: "status_lost",
  };
  return t(map[status], locale);
}

export function contactQualityUiLabel(q: "high" | "medium" | "low", locale: Locale): string {
  const map: Record<"high" | "medium" | "low", UiKey> = {
    high: "cq_high",
    medium: "cq_medium",
    low: "cq_low",
  };
  return t(map[q], locale);
}

export function queueSourceUiLabel(
  source: "latest_import" | "airtable" | "local_pool" | undefined,
  locale: Locale,
): string {
  if (source === "latest_import") return t("source_latest_import", locale);
  if (source === "airtable") return t("source_airtable", locale);
  return t("source_local_pool", locale);
}

/** Display label for daily queue message status (persisted enum values unchanged). */
export function queueMessageStatusUiLabel(status: string, locale: Locale): string {
  const map: Record<string, UiKey> = {
    queued: "qstatus_queued",
    prepared: "qstatus_prepared",
    opened: "qstatus_opened",
    contacted: "qstatus_contacted",
    skipped: "qstatus_skipped",
  };
  const key = map[status];
  return key ? t(key, locale) : status;
}
