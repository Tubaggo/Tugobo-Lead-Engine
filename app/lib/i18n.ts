import type { LeadStatus, OutreachPriorityBucket, RecommendedAction } from "@/app/lib/leads";
import type {
  LeadTemperature,
  OutreachStyle,
  OutreachUrgency,
  RecommendedChannel,
  SalesApproach,
} from "@/app/lib/intelligence/outreach-intelligence";

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
  readiness_good_contact: { en: "Good Contact", tr: "İyi iletişim" },
  readiness_needs_finder: { en: "Needs Finder", tr: "Kanal gerekli" },
  readiness_weak_contact: { en: "Weak Contact", tr: "Zayıf kanal" },
  readiness_no_contact: { en: "No Contact", tr: "İletişim yok" },

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
  manual_ig_check: { en: "Manual IG Check", tr: "Manuel IG kontrolü" },
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
  acquisition_active: { en: "Acquisition Active", tr: "Müşteri edinimi aktif" },
  multi_channel_demand: { en: "Multi-Channel Demand", tr: "Çok kanallı talep" },
  strong_conversion_opportunity: { en: "Strong Conversion Opportunity", tr: "Güçlü dönüşüm fırsatı" },
  strong_conversion_opportunity_title: {
    en: "OTA or listing distribution plus social demand — booking path may still be under-optimized.",
    tr: "OTA/sosyal talep var — doğrudan rezervasyon yolu zayıf olabilir.",
  },
  traffic_booking_gap: { en: "Traffic → Booking Gap", tr: "Trafik → rezervasyon boşluğu" },
  traffic_booking_gap_title: {
    en: "Demand signals present with a weaker direct booking path.",
    tr: "Talep sinyali var; doğrudan rezervasyon yolu zayıf.",
  },
  acquisition_pressure: { en: "Acquisition pressure", tr: "Müşteri edinme baskısı" },
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
  filter_needs_finder: { en: "Needs Finder", tr: "Kanal gerekli" },
  filter_no_contact: { en: "No Contact", tr: "İletişim yok" },
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
  needs_finder_lower: { en: "Needs finder", tr: "Kanal gerekli" },
  no_channel: { en: "No channel", tr: "İletişim yok" },

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

  // Why-this-lead chips (stable reason ids from why-this-lead.ts)
  why_tl_review_response_delay: {
    en: "Review signals indicate possible response delays",
    tr: "Yorumlar gecikmeli yanıt riski gösteriyor",
  },
  why_tl_review_unreachable: {
    en: "Review signals suggest guests may struggle to reach the property",
    tr: "Yorumlar ulaşım zorluğu sinyali veriyor",
  },
  why_tl_review_reservation: {
    en: "Review signals mention reservation friction",
    tr: "Yorumlarda rezervasyon sürtünmesi var",
  },
  why_tl_review_communication: {
    en: "Review signals indicate communication gaps",
    tr: "Yorumlarda iletişim boşlukları belirtiliyor",
  },
  why_tl_review_generic: {
    en: "Review signals show a relevant guest pain point",
    tr: "Yorumlarda misafir tarafı sıkıntı sinyali var",
  },
  why_tl_communication_risk: {
    en: "Communication or reputation risk is worth reviewing",
    tr: "İletişim veya itibar riski incelenmeli",
  },
  why_tl_whatsapp_available: {
    en: "WhatsApp is available for direct outreach",
    tr: "WhatsApp ile doğrudan ulaşım mümkün",
  },
  why_tl_instagram_active: {
    en: "Active Instagram presence supports sales context",
    tr: "Aktif Instagram satış sinyali oluşturuyor",
  },
  why_tl_website_conversion_gap: {
    en: "Website exists but conversion path may be weak",
    tr: "Site var; dönüşüm yolu zayıf olabilir",
  },
  why_tl_booking_flow_gap: {
    en: "Missing booking flow may create conversion gaps",
    tr: "Rezervasyon akışı zayıf olabilir",
  },
  why_tl_weak_booking_cta: {
    en: "Owned site may need a clearer booking path",
    tr: "Sitede net rezervasyon yolu eksik olabilir",
  },
  why_tl_direct_booking_opportunity: {
    en: "High direct booking opportunity",
    tr: "Yüksek doğrudan rezervasyon fırsatı",
  },
  why_tl_growth_oriented: { en: "Growth-Oriented", tr: "Büyüme odaklı" },
  why_tl_commercially_active: { en: "Commercially Active", tr: "Ticari olarak aktif" },
  why_tl_operationally_mature: { en: "Operationally Mature", tr: "Operasyonel olarak olgun" },
  why_tl_high_roi_potential: { en: "High ROI Potential", tr: "Yüksek ROI potansiyeli" },
  why_tl_outreach_potential: { en: "Strong outreach potential", tr: "Güçlü iletişim potansiyeli" },
  why_tl_high_priority_score: { en: "High priority score", tr: "Yüksek öncelik skoru" },

  // Conversion leak row chips (keys clk-*)
  chip_clk_gap: { en: "Traffic → Booking Gap", tr: "Trafik → rezervasyon boşluğu" },
  chip_clk_resp: { en: "Response Delay Risk", tr: "Geç dönüş riski" },
  chip_clk_book: { en: "Weak Booking Flow", tr: "Zayıf rezervasyon akışı" },
  chip_clk_ota: { en: "OTA Dependency Risk", tr: "OTA bağımlılık riski" },
  conversion_leak_chip_title: {
    en: "Heuristic signal — not on-site analytics.",
    tr: "Sezgisel sinyal — site analitiği değil.",
  },

  // Outreach intelligence panel (enums + chrome)
  outreach_intel_section: { en: "Outreach intelligence", tr: "İletişim özeti" },
  urgency_label_header: { en: "Urgency", tr: "Aciliyet" },
  best_approach_header: { en: "Best approach", tr: "Önerilen yaklaşım" },
  style_header: { en: "Style", tr: "Üslup" },
  best_channel_header: { en: "Best channel", tr: "Önerilen kanal" },
  lead_temperature_header: { en: "Lead temperature", tr: "Lead sıcaklığı" },
  lead_intelligence_section: { en: "Lead intelligence", tr: "Lead özeti" },
  why_this_lead_heading: { en: "Why this lead?", tr: "Neden bu lead?" },
  why_this_lead_chip_title: { en: "Why this lead?", tr: "Neden bu lead?" },
  why_this_lead_fallback: {
    en: "No strong intelligence signals yet. Enrich this lead to generate better recommendations.",
    tr: "Henüz güçlü sinyal yok. Daha iyi öneriler için leadi zenginleştirin.",
  },

  style_outreach_consultative: { en: "Consultative", tr: "Danışman" },
  style_outreach_direct: { en: "Direct", tr: "Direkt" },
  style_outreach_educational: { en: "Educational", tr: "Eğitici" },
  style_outreach_relationship: { en: "Relationship", tr: "İlişki odaklı" },
  style_outreach_conversion_focused: { en: "Conversion-focused", tr: "Dönüşüm odaklı" },

  sales_whatsapp_speed: { en: "WhatsApp Speed", tr: "WhatsApp hızı" },
  sales_direct_booking: { en: "Direct Booking", tr: "Doğrudan rezervasyon" },
  sales_conversion_gap: { en: "Close Conversion Gap", tr: "Dönüşüm boşluğunu kapat" },
  sales_operational_efficiency: { en: "Operational Efficiency", tr: "Operasyonel verim" },
  sales_social_demand: { en: "Social Demand", tr: "Sosyal talep" },
  sales_guest_experience: { en: "Guest Experience", tr: "Misafir deneyimi" },

  channel_whatsapp: { en: "WhatsApp", tr: "WhatsApp" },
  channel_instagram: { en: "Instagram", tr: "Instagram" },
  channel_phone: { en: "Phone", tr: "Telefon" },
  channel_website_form: { en: "Website Form", tr: "Web formu" },

  urgency_low: { en: "Low", tr: "Düşük" },
  urgency_medium: { en: "Medium", tr: "Orta" },
  urgency_high: { en: "High", tr: "Yüksek" },

  temp_cold: { en: "Cold", tr: "Soğuk" },
  temp_warm: { en: "Warm", tr: "Ilık" },
  temp_hot: { en: "Hot", tr: "Sıcak" },

  opportunity_level_low: { en: "low", tr: "düşük" },
  opportunity_level_medium: { en: "medium", tr: "orta" },
  opportunity_level_high: { en: "high", tr: "yüksek" },
  opportunity_level_very_high: { en: "very high", tr: "çok yüksek" },

  ai_insight_section: { en: "AI insight", tr: "AI özeti" },
  ai_insight_fallback: {
    en: "Not enough intelligence signals yet. Enrich this lead to generate better insight.",
    tr: "Henüz yeterli sinyal yok. Daha iyi özet için leadi zenginleştirin.",
  },
  insight_summary_header: { en: "Insight summary", tr: "Özet" },
  pain_points_header: { en: "Pain points", tr: "Sıkıntı noktaları" },
  channel_pill_header: { en: "Channel", tr: "Kanal" },
  consultative_angle_prefix: { en: "Consultative angle ·", tr: "Danışman açısı ·" },

  // Scoring / hot / readiness chip reasons (exact English keys from scoring code)
  score_hot_new_review_today: { en: "New review today", tr: "Bugün yeni yorum" },
  score_hot_recent_review: { en: "Recent review", tr: "Son dönem yorum" },
  score_hot_selling_out: { en: "Selling out", tr: "Doluluk yüksek" },
  score_hot_needs_website: { en: "Needs own website", tr: "Kendi sitesi gerekli" },
  score_hot_channel_diversification: { en: "Channel diversification", tr: "Kanal çeşitlendirme" },
  score_hot_premium_margin: { en: "Premium leaking margin", tr: "Premium marj kaçağı" },
  score_hot_sweet_spot: { en: "Sweet-spot maturity", tr: "Olgunluk tatlı bölgesi" },
  score_hot_missing_social: { en: "Missing social presence", tr: "Sosyal görünürlük zayıf" },
  score_readiness_whatsapp: { en: "WhatsApp available", tr: "WhatsApp var" },
  score_readiness_website: { en: "Website available", tr: "Web sitesi var" },
  score_readiness_instagram: { en: "Instagram available", tr: "Instagram var" },
  score_readiness_phone: { en: "Phone available", tr: "Telefon var" },
  score_readiness_email: { en: "Email available", tr: "E-posta var" },
  score_readiness_verified: { en: "Contact verified", tr: "İletişim doğrulandı" },
  score_readiness_recent_reviews: { en: "Recent review activity", tr: "Son yorum hareketi" },
  score_readiness_high_hot: { en: "High hot score", tr: "Yüksek sıcak skor" },
  score_v3_whatsapp_reachable: { en: "WhatsApp reachable", tr: "WhatsApp erişilebilir" },
  score_v3_low_contact_quality: { en: "Low contact quality", tr: "Düşük kanal kalitesi" },
  score_v3_no_instant_channel: { en: "No instant channel", tr: "Anında kanal yok" },
  score_v3_conversion_gap: { en: "Conversion gap", tr: "Dönüşüm boşluğu" },
  score_v3_ota_dependency: { en: "OTA dependency", tr: "OTA bağımlılığı" },
  score_v3_social_acquisition: { en: "Social acquisition intent", tr: "Sosyal edinim niyeti" },
  score_v3_paid_traffic: { en: "Paid traffic candidate", tr: "Ücretli trafik adayı" },
  score_v3_acq_vs_conversion: {
    en: "Acquisition intent vs. conversion path",
    tr: "Edinim niyeti / dönüşüm dengesiz",
  },
  score_v3_limited_acquisition: { en: "Limited acquisition activity", tr: "Sınırlı edinim aktivitesi" },
  score_v3_commercial_roi: {
    en: "Commercial readiness supports ROI adoption",
    tr: "Ticari olgunluk ROI görüşmesine uygun",
  },
  score_v3_commercial_early: {
    en: "Commercial readiness is early-stage",
    tr: "Ticari olgunluk erken aşamada",
  },
  score_v3_medium_tier: { en: "Medium tier (ROI fit)", tr: "Orta segment (ROI uyumu)" },
  score_v3_premium_tier: { en: "Premium independent tier", tr: "Premium bağımsız segment" },
  score_v3_operationally_active: { en: "Operationally active", tr: "Operasyonel olarak aktif" },
  score_opp_acquisition_active: { en: "Acquisition intent is active", tr: "Edinim niyeti aktif" },
  score_opp_leak_signals: {
    en: "Strong conversion opportunity from leak signals",
    tr: "Sızıntı sinyalleri güçlü dönüşüm fırsatı",
  },
  score_opp_commercial_roi: {
    en: "Commercial readiness supports ROI conversation",
    tr: "Ticari olgunluk ROI görüşmesini destekler",
  },
  score_opp_whatsapp_path: {
    en: "WhatsApp-reachable contact path",
    tr: "WhatsApp ile ulaşılabilir kanal",
  },
  score_opp_ota_upside: {
    en: "OTA dependency indicates direct-booking upside",
    tr: "OTA bağımlılığı doğrudan rezervasyon fırsatı",
  },
  score_opp_social_demand: {
    en: "Social activity indicates demand",
    tr: "Sosyal aktivite talep gösteriyor",
  },
  score_opp_booking_weakness: {
    en: "Booking flow weakness creates improvement potential",
    tr: "Rezervasyon akışı zayıf — iyileştirme alanı",
  },
  score_opp_outreach_likely: {
    en: "High outreach execution likelihood",
    tr: "Yüksek iletişim başarı olasılığı",
  },

  // Outreach rationale lines (rule text from outreach-intelligence.ts)
  rat_whatsapp_pain: {
    en: "WhatsApp reachable + communication pain signals",
    tr: "WhatsApp var + iletişim sıkıntısı sinyalleri",
  },
  rat_ota_direct: {
    en: "OTA-leaning channel mix without strong direct path",
    tr: "OTA ağırlıklı; doğrudan yol zayıf",
  },
  rat_acq_under_booking: {
    en: "Acquisition-active business with underdeveloped booking flow",
    tr: "Edinim aktif; rezervasyon akışı gelişmemiş",
  },
  rat_social_weak_capture: {
    en: "High social acquisition intent with weak booking capture",
    tr: "Sosyal talep yüksek; rezervasyon zayıf",
  },
  rat_ig_weak_booking: {
    en: "Active Instagram with weak booking flow",
    tr: "Aktif Instagram; rezervasyon akışı zayıf",
  },
  rat_conversion_gap_attention: {
    en: "Conversion gap between attention and reservation",
    tr: "İlgi ile rezervasyon arasında boşluk",
  },
  rat_review_guest: {
    en: "Review-derived guest experience signals",
    tr: "Yorumlardan misafir deneyimi sinyalleri",
  },
  rat_no_pain_ops: {
    en: "No dominant pain — lead with operational efficiency",
    tr: "Belirgin acı yok — operasyonel verim",
  },
  rat_commercial_high: {
    en: "Commercial readiness is high — consultative ROI framing preferred",
    tr: "Ticari olgunluk yüksek — ROI çerçevesi uygun",
  },
  rat_commercial_low: {
    en: "Low commercial readiness — softer relationship-first approach",
    tr: "Ticari olgunluk düşük — yumuşak ilişki tonu",
  },
  rat_high_direct_booking: {
    en: "High direct-booking opportunity on a reachable lead",
    tr: "Ulaşılabilir leadde yüksek doğrudan rezervasyon fırsatı",
  },
  rat_comm_risk_brief: {
    en: "Communication risk high — keep tone brief and concrete",
    tr: "İletişim riski yüksek — kısa ve somut ton",
  },
  rat_premium_guest_frame: {
    en: "Premium tier — guest experience deserves a strategic frame",
    tr: "Premium segment — stratejik çerçeve uygun",
  },
  rat_micro_warm: {
    en: "Micro tier — keep tone warm, avoid sounding transactional",
    tr: "Mikro işletme — sıcak ton, satış dili yumuşat",
  },
  rat_high_acq_pressure: {
    en: "High acquisition pressure with weak booking capture path",
    tr: "Yüksek edinim baskısı; zayıf rezervasyon yolu",
  },
  rat_heuristic_leak: {
    en: "Heuristic conversion leak on an acquisition-active business",
    tr: "Edinim aktif işletmede sezgisel dönüşüm sızıntısı",
  },
  rat_strong_acq_friction: {
    en: "Strong acquisition intent with booking or conversion friction",
    tr: "Güçlü edinim niyeti; rezervasyon sürtünmesi",
  },
  rat_high_opp_reachable: {
    en: "High opportunity score and reachable",
    tr: "Yüksek fırsat skoru ve ulaşılabilir",
  },
  rat_high_opp_comm: {
    en: "High opportunity + communication risk window",
    tr: "Yüksek fırsat + iletişim riski penceresi",
  },
  rat_hot_reachable: {
    en: "Hot score above 75 with a reachable channel",
    tr: "Sıcak skor 75+ ve erişilebilir kanal",
  },
  rat_medium_opp: {
    en: "Medium opportunity / hot score",
    tr: "Orta fırsat / sıcak skor",
  },
  rat_no_urgency: {
    en: "No strong urgency signals",
    tr: "Güçlü aciliyet sinyali yok",
  },
  rat_social_ota_whatsapp: {
    en: "Active social + OTA-heavy mix — WhatsApp for fast outreach",
    tr: "Sosyal + OTA ağırlıklı — hızlı iletişim için WhatsApp",
  },
  rat_whatsapp_ready_mobile: {
    en: "WhatsApp-ready mobile",
    tr: "WhatsApp uyumlu mobil",
  },
  rat_whatsapp_likely: {
    en: "Mobile WhatsApp likely usable",
    tr: "Mobilde WhatsApp kullanılabilir olabilir",
  },
  rat_ig_next_surface: {
    en: "Active Instagram is the next-best surface",
    tr: "Aktif Instagram ikinci en iyi yüzey",
  },
  rat_phone_unclear_form: {
    en: "Phone unclear — owned site form is the safest path",
    tr: "Telefon belirsiz — site formu daha güvenli",
  },
  rat_phone_outbound: {
    en: "Phone available for outbound call",
    tr: "Giden arama için telefon uygun",
  },
  rat_no_fast_channel: {
    en: "No fast channel — fall back to website form",
    tr: "Hızlı kanal yok — web formuna dön",
  },
  rat_reachable_hot_high_opp: {
    en: "Reachable + hot + high opportunity",
    tr: "Ulaşılabilir + sıcak + yüksek fırsat",
  },
  rat_acq_leak_signal: {
    en: "Acquisition-active with strong heuristic conversion-leak signal",
    tr: "Edinim aktif; güçlü dönüşüm sızıntısı sinyali",
  },
  rat_reachable_mid: {
    en: "Reachable with mid-range signals",
    tr: "Ulaşılabilir; orta seviye sinyaller",
  },
  rat_strong_channel_weak: {
    en: "Strong potential but channel fit weak",
    tr: "Potansiyel güçlü; kanal uyumu zayıf",
  },
  rat_limited_reach: {
    en: "Limited urgency / reachability",
    tr: "Sınırlı aciliyet / erişilebilirlik",
  },

  // Business signal badges (internal ids unchanged)
  sig_weak_digital_presence: { en: "Weak digital presence", tr: "Dijital görünürlük zayıf" },
  sig_active_marketing_surface: { en: "Active marketing surface", tr: "Aktif pazarlama yüzeyi" },
  sig_conversion_gap: { en: "Conversion gap", tr: "Dönüşüm boşluğu" },
  sig_reputation_risk: { en: "Reputation risk", tr: "İtibar riski" },
  sig_direct_contact_possible: { en: "Direct contact possible", tr: "Doğrudan iletişim mümkün" },
  sig_ota_dependency: { en: "OTA dependency", tr: "OTA bağımlılığı" },
  sig_single_channel_risk: { en: "Single channel risk", tr: "Tek kanal riski" },
  sig_missing_own_website: { en: "Missing own website", tr: "Kendi sitesi yok" },
  sig_instagram_presence_gap: { en: "Instagram presence gap", tr: "Instagram boşluğu" },
  sig_review_recency_stale: { en: "Review recency stale", tr: "Yorumlar güncel değil" },
  sig_review_volume_scale: { en: "Review volume operational scale", tr: "Yorum hacmi / ölçek" },
  sig_landline_or_unclear_phone: { en: "Landline or unclear phone", tr: "Sabit / belirsiz hat" },
  sig_no_listed_phone: { en: "No listed phone", tr: "Telefon yok" },
  sig_premium_without_owned_funnel: {
    en: "Premium without owned funnel",
    tr: "Premium; kendi hunisi yok",
  },
  sig_weak_booking_cta: { en: "Weak booking cta", tr: "Zayıf rezervasyon çağrısı" },
  sig_no_booking_flow: { en: "No booking flow", tr: "Rezervasyon akışı yok" },
  sig_external_only_booking_dependency: {
    en: "External only booking dependency",
    tr: "Yalnızca dış rezervasyon",
  },
  sig_weak_contact_visibility: { en: "Weak contact visibility", tr: "İletişim görünürlüğü zayıf" },
  sig_low_operational_activity: { en: "Low operational activity", tr: "Düşük operasyonel aktivite" },
  sig_social_acquisition_intent: { en: "Social acquisition intent", tr: "Sosyal edinim niyeti" },
  sig_paid_traffic_candidate: { en: "Paid traffic candidate", tr: "Ücretli trafik adayı" },
  sig_commercially_active: { en: "Commercially active", tr: "Ticari olarak aktif" },
  sig_operationally_mature: { en: "Operationally mature", tr: "Operasyonel olarak olgun" },
  sig_growth_oriented: { en: "Growth oriented", tr: "Büyüme odaklı" },
  sig_high_roi_potential: { en: "High roi potential", tr: "Yüksek ROI potansiyeli" },
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

const WHY_THIS_LEAD_ID_TO_UI: Partial<Record<string, UiKey>> = {
  "communication-risk": "why_tl_communication_risk",
  "whatsapp-available": "why_tl_whatsapp_available",
  "instagram-active": "why_tl_instagram_active",
  "website-conversion-gap": "why_tl_website_conversion_gap",
  "booking-flow-gap": "why_tl_booking_flow_gap",
  "weak-booking-cta": "why_tl_weak_booking_cta",
  "direct-booking-opportunity": "why_tl_direct_booking_opportunity",
  "growth-oriented": "why_tl_growth_oriented",
  "commercially-active": "why_tl_commercially_active",
  "operationally-mature": "why_tl_operationally_mature",
  "high-roi-potential": "why_tl_high_roi_potential",
  "outreach-potential": "why_tl_outreach_potential",
  "high-priority-score": "why_tl_high_priority_score",
};

const REVIEW_CATEGORY_TO_UI: Record<string, UiKey> = {
  response_delay: "why_tl_review_response_delay",
  unreachable: "why_tl_review_unreachable",
  reservation: "why_tl_review_reservation",
  communication: "why_tl_review_communication",
};

/** Localized “why this lead” chip text; keeps AI / free-text lines as fallback. */
export function getWhyThisLeadReasonLabel(id: string, fallback: string, locale: Locale): string {
  const mapped = WHY_THIS_LEAD_ID_TO_UI[id];
  if (mapped) return t(mapped, locale);
  if (id.startsWith("existing-")) return fallback;
  if (id.startsWith("review-")) {
    const cat = id.slice("review-".length);
    const rk = REVIEW_CATEGORY_TO_UI[cat];
    if (rk) return t(rk, locale);
  }
  return fallback;
}

const CONVERSION_LEAK_CHIP_KEYS: Record<string, UiKey> = {
  "clk-gap": "chip_clk_gap",
  "clk-resp": "chip_clk_resp",
  "clk-book": "chip_clk_book",
  "clk-ota": "chip_clk_ota",
};

export function conversionLeakChipDisplay(
  chipKey: string,
  locale: Locale,
): { label: string; title: string } {
  const title = t("conversion_leak_chip_title", locale);
  const ui = CONVERSION_LEAK_CHIP_KEYS[chipKey];
  return { label: ui ? t(ui, locale) : chipKey, title };
}

const OUTREACH_STYLE_UI: Record<OutreachStyle, UiKey> = {
  consultative: "style_outreach_consultative",
  direct: "style_outreach_direct",
  educational: "style_outreach_educational",
  relationship: "style_outreach_relationship",
  "conversion-focused": "style_outreach_conversion_focused",
};

const SALES_APPROACH_UI: Record<SalesApproach, UiKey> = {
  "whatsapp-speed": "sales_whatsapp_speed",
  "direct-booking": "sales_direct_booking",
  "conversion-gap": "sales_conversion_gap",
  "operational-efficiency": "sales_operational_efficiency",
  "social-demand": "sales_social_demand",
  "guest-experience": "sales_guest_experience",
};

const RECOMMENDED_CHANNEL_UI: Record<RecommendedChannel, UiKey> = {
  whatsapp: "channel_whatsapp",
  instagram: "channel_instagram",
  phone: "channel_phone",
  "website-form": "channel_website_form",
};

const URGENCY_UI: Record<OutreachUrgency, UiKey> = {
  low: "urgency_low",
  medium: "urgency_medium",
  high: "urgency_high",
};

const LEAD_TEMPERATURE_UI: Record<LeadTemperature, UiKey> = {
  cold: "temp_cold",
  warm: "temp_warm",
  hot: "temp_hot",
};

export function outreachStyleUiLabel(style: OutreachStyle, locale: Locale): string {
  return t(OUTREACH_STYLE_UI[style], locale);
}

export function salesApproachUiLabel(approach: SalesApproach, locale: Locale): string {
  return t(SALES_APPROACH_UI[approach], locale);
}

export function recommendedChannelUiLabel(channel: RecommendedChannel, locale: Locale): string {
  return t(RECOMMENDED_CHANNEL_UI[channel], locale);
}

export function urgencyUiLabel(urgency: OutreachUrgency, locale: Locale): string {
  return t(URGENCY_UI[urgency], locale);
}

export function leadTemperatureUiLabel(temp: LeadTemperature, locale: Locale): string {
  return t(LEAD_TEMPERATURE_UI[temp], locale);
}

const OPPORTUNITY_LEVEL_UI: Record<string, UiKey> = {
  low: "opportunity_level_low",
  medium: "opportunity_level_medium",
  high: "opportunity_level_high",
  very_high: "opportunity_level_very_high",
};

export function opportunityLevelUiLabel(level: string, locale: Locale): string {
  const key = OPPORTUNITY_LEVEL_UI[level];
  return key ? t(key, locale) : level;
}

const SCORING_REASON_UI: Record<string, UiKey> = {
  "New review today": "score_hot_new_review_today",
  "Recent review": "score_hot_recent_review",
  "Selling out": "score_hot_selling_out",
  "Needs own website": "score_hot_needs_website",
  "Channel diversification": "score_hot_channel_diversification",
  "Premium leaking margin": "score_hot_premium_margin",
  "Sweet-spot maturity": "score_hot_sweet_spot",
  "Missing social presence": "score_hot_missing_social",
  "WhatsApp available": "score_readiness_whatsapp",
  "Website available": "score_readiness_website",
  "Instagram available": "score_readiness_instagram",
  "Phone available": "score_readiness_phone",
  "Email available": "score_readiness_email",
  "Contact verified": "score_readiness_verified",
  "Recent review activity": "score_readiness_recent_reviews",
  "High hot score": "score_readiness_high_hot",
  "WhatsApp reachable": "score_v3_whatsapp_reachable",
  "Low contact quality": "score_v3_low_contact_quality",
  "No instant channel": "score_v3_no_instant_channel",
  "Conversion gap": "score_v3_conversion_gap",
  "OTA dependency": "score_v3_ota_dependency",
  "Social acquisition intent": "score_v3_social_acquisition",
  "Paid traffic candidate": "score_v3_paid_traffic",
  "Acquisition intent vs. conversion path": "score_v3_acq_vs_conversion",
  "Limited acquisition activity": "score_v3_limited_acquisition",
  "Commercial readiness supports ROI adoption": "score_v3_commercial_roi",
  "Commercial readiness is early-stage": "score_v3_commercial_early",
  "Medium tier (ROI fit)": "score_v3_medium_tier",
  "Premium independent tier": "score_v3_premium_tier",
  "Operationally active": "score_v3_operationally_active",
  "Acquisition intent is active": "score_opp_acquisition_active",
  "Strong conversion opportunity from leak signals": "score_opp_leak_signals",
  "Commercial readiness supports ROI conversation": "score_opp_commercial_roi",
  "WhatsApp-reachable contact path": "score_opp_whatsapp_path",
  "OTA dependency indicates direct-booking upside": "score_opp_ota_upside",
  "Social activity indicates demand": "score_opp_social_demand",
  "Booking flow weakness creates improvement potential": "score_opp_booking_weakness",
  "High outreach execution likelihood": "score_opp_outreach_likely",
};

/** Maps known scoring / hot / lead reason English strings to localized chips. */
export function scoringChipReasonUiLabel(reason: string, locale: Locale): string {
  if (locale !== "tr") return reason;
  const key = SCORING_REASON_UI[reason];
  return key ? t(key, locale) : reason;
}

const BUSINESS_SIGNAL_UI: Record<string, UiKey> = {
  weak_digital_presence: "sig_weak_digital_presence",
  active_marketing_surface: "sig_active_marketing_surface",
  conversion_gap: "sig_conversion_gap",
  reputation_risk: "sig_reputation_risk",
  direct_contact_possible: "sig_direct_contact_possible",
  ota_dependency: "sig_ota_dependency",
  single_channel_risk: "sig_single_channel_risk",
  missing_own_website: "sig_missing_own_website",
  instagram_presence_gap: "sig_instagram_presence_gap",
  review_recency_stale: "sig_review_recency_stale",
  review_volume_operational_scale: "sig_review_volume_scale",
  landline_or_unclear_phone: "sig_landline_or_unclear_phone",
  no_listed_phone: "sig_no_listed_phone",
  premium_without_owned_funnel: "sig_premium_without_owned_funnel",
  weak_booking_cta: "sig_weak_booking_cta",
  no_booking_flow: "sig_no_booking_flow",
  external_only_booking_dependency: "sig_external_only_booking_dependency",
  weak_contact_visibility: "sig_weak_contact_visibility",
  low_operational_activity: "sig_low_operational_activity",
  social_acquisition_intent: "sig_social_acquisition_intent",
  paid_traffic_candidate: "sig_paid_traffic_candidate",
  commercially_active: "sig_commercially_active",
  operationally_mature: "sig_operationally_mature",
  growth_oriented: "sig_growth_oriented",
  high_roi_potential: "sig_high_roi_potential",
};

export function businessSignalUiLabel(signal: string, locale: Locale): string {
  if (locale !== "tr") return signal.replace(/_/g, " ");
  const key = BUSINESS_SIGNAL_UI[signal];
  return key ? t(key, locale) : signal.replace(/_/g, " ");
}

const OUTREACH_RATIONALE_UI: Record<string, UiKey> = {
  "WhatsApp reachable + communication pain signals": "rat_whatsapp_pain",
  "OTA-leaning channel mix without strong direct path": "rat_ota_direct",
  "Acquisition-active business with underdeveloped booking flow": "rat_acq_under_booking",
  "High social acquisition intent with weak booking capture": "rat_social_weak_capture",
  "Active Instagram with weak booking flow": "rat_ig_weak_booking",
  "Conversion gap between attention and reservation": "rat_conversion_gap_attention",
  "Review-derived guest experience signals": "rat_review_guest",
  "No dominant pain — lead with operational efficiency": "rat_no_pain_ops",
  "Commercial readiness is high — consultative ROI framing preferred": "rat_commercial_high",
  "Low commercial readiness — softer relationship-first approach": "rat_commercial_low",
  "High direct-booking opportunity on a reachable lead": "rat_high_direct_booking",
  "Communication risk high — keep tone brief and concrete": "rat_comm_risk_brief",
  "Premium tier — guest experience deserves a strategic frame": "rat_premium_guest_frame",
  "Micro tier — keep tone warm, avoid sounding transactional": "rat_micro_warm",
  "High acquisition pressure with weak booking capture path": "rat_high_acq_pressure",
  "Heuristic conversion leak on an acquisition-active business": "rat_heuristic_leak",
  "Strong acquisition intent with booking or conversion friction": "rat_strong_acq_friction",
  "High opportunity score and reachable": "rat_high_opp_reachable",
  "High opportunity + communication risk window": "rat_high_opp_comm",
  "Hot score above 75 with a reachable channel": "rat_hot_reachable",
  "Medium opportunity / hot score": "rat_medium_opp",
  "No strong urgency signals": "rat_no_urgency",
  "Active social + OTA-heavy mix — WhatsApp for fast outreach": "rat_social_ota_whatsapp",
  "WhatsApp-ready mobile": "rat_whatsapp_ready_mobile",
  "Mobile WhatsApp likely usable": "rat_whatsapp_likely",
  "Active Instagram is the next-best surface": "rat_ig_next_surface",
  "Phone unclear — owned site form is the safest path": "rat_phone_unclear_form",
  "Phone available for outbound call": "rat_phone_outbound",
  "No fast channel — fall back to website form": "rat_no_fast_channel",
  "Reachable + hot + high opportunity": "rat_reachable_hot_high_opp",
  "Acquisition-active with strong heuristic conversion-leak signal": "rat_acq_leak_signal",
  "Reachable with mid-range signals": "rat_reachable_mid",
  "Strong potential but channel fit weak": "rat_strong_channel_weak",
  "Limited urgency / reachability": "rat_limited_reach",
};

const TIER_STYLE_REASON_RE = /^Tier '([^']+)' default style$/;

/** Localizes fixed outreach rationale sentences; unknown lines pass through. */
export function outreachRationaleUiLine(line: string, locale: Locale): string {
  if (locale !== "tr") return line;
  const key = OUTREACH_RATIONALE_UI[line];
  if (key) return t(key, locale);
  const m = TIER_STYLE_REASON_RE.exec(line);
  if (m) {
    return `‘${m[1]}’ için varsayılan üslup`;
  }
  return line;
}
