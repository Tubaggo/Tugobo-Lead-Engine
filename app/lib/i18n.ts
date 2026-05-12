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
  import_places_recent_cache_note: {
    en: "The same search ran recently. Showing saved results to protect API quota.",
    tr: "Yakın zamanda aynı arama yapıldı. API kotasını korumak için kayıtlı sonuçlar gösteriliyor.",
  },
  import_places_rate_limit_user: {
    en: "Google Places hit a short-term request limit. Wait a few minutes and try again.",
    tr: "Google Places kısa süreli istek limitine takıldı. Birkaç dakika bekleyip tekrar deneyin.",
  },

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
  acq_intel_title: { en: "Acquisition intelligence", tr: "Müşteri edinimi içgörüsü" },
  acq_intel_limited: {
    en: "Limited acquisition signals for this lead.",
    tr: "Bu lead için sınırlı edinim sinyali.",
  },
  chip_acq_maturity: { en: "Acquisition maturity", tr: "Edinim olgunluğu" },
  chip_conf_website: { en: "Website", tr: "Web sitesi" },
  chip_conf_instagram: { en: "Instagram", tr: "Instagram" },
  chip_conf_whatsapp: { en: "WhatsApp", tr: "WhatsApp" },
  chip_conf_ota: { en: "OTA", tr: "OTA" },
  chip_conf_ads: { en: "Ads", tr: "Reklam" },
  confidence_confirmed: { en: "confirmed", tr: "yüksek güven" },
  confidence_likely: { en: "likely", tr: "olası" },
  confidence_weak: { en: "weak", tr: "düşük güven" },
  confidence_missing: { en: "missing", tr: "tespit edilmedi" },
  detail_whatsapp_disabled_title: {
    en: "No mobile WhatsApp path from this number — verify or try another channel",
    tr: "Bu numara için WhatsApp (mobil) yolu net değil — doğrulayın veya başka kanal deneyin",
  },
  detail_badge_reservation_cta: {
    en: "Reservation CTA detected",
    tr: "Rezervasyon CTA bulundu",
  },
  detail_badge_contact_page: {
    en: "Contact page signal",
    tr: "İletişim sayfası sinyali",
  },
  detail_badge_contact_extracted: {
    en: "Contact details extracted",
    tr: "İletişim bilgileri çıkarıldı",
  },
  maturity_low: { en: "low", tr: "düşük" },
  maturity_medium: { en: "medium", tr: "orta" },
  maturity_high: { en: "high", tr: "yüksek" },
  less: { en: "Less", tr: "Az" },
  detail: { en: "Detail", tr: "Detay" },
  signals: { en: "Signals", tr: "Sinyaller" },
  gaps: { en: "Gaps", tr: "Açıklar" },
  search_ig: { en: "Search IG", tr: "IG’de ara" },
  instagram_link_broken_long: {
    en: "Broken Instagram link",
    tr: "Bozuk Instagram bağlantısı",
  },
  instagram_none_on_file: { en: "Instagram not listed", tr: "Instagram listede görünmüyor" },
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
  ai_sales_insight_section: { en: "AI Sales Insight", tr: "AI satış içgörüsü" },
  ai_sales_commentary_section: { en: "AI Sales Commentary", tr: "AI Satış Yorumu" },
  ai_signal_sources_header: { en: "Signal sources", tr: "Sinyal kaynakları" },
  ai_sales_interp_durum: { en: "Status", tr: "Durum" },
  ai_sales_interp_firsat: { en: "Opportunity", tr: "Fırsat" },
  ai_sales_interp_yaklasim: { en: "Approach", tr: "Yaklaşım" },
  ai_confidence_label: { en: "Confidence", tr: "Güven" },
  ai_recommended_approach_label: { en: "Recommended approach", tr: "Önerilen yaklaşım" },
  ai_sales_angle_label: { en: "Outreach angle", tr: "İletişim açısı" },
  ai_acquisition_profile_label: { en: "Acquisition interpretation", tr: "Edinim yorumu" },
  ai_reinterpret: { en: "Re-interpret", tr: "Yeniden yorumla" },
  ai_last_updated_label: { en: "Last updated", tr: "Son güncelleme" },
  ai_interpretation_label_rules: { en: "Rule-based interpretation", tr: "Kural bazlı yorum" },
  ai_interpretation_label_ai: { en: "Interpreted with AI", tr: "AI ile yorumlandı" },
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

  // Lead detail drawer — header / metrics
  detail_units: { en: "Units", tr: "Birim sayısı" },
  detail_adr: { en: "ADR", tr: "Ortalama gecelik" },
  detail_occupancy_30d: { en: "Occupancy 30d", tr: "Doluluk (30 gün)" },
  detail_rating: { en: "Rating", tr: "Puan" },
  detail_reviews: { en: "Reviews", tr: "Yorumlar" },
  detail_channels: { en: "Channels", tr: "Kanallar" },
  detail_source: { en: "Source", tr: "Kaynak" },
  detail_source_google_maps: { en: "Google Maps", tr: "Google Haritalar" },

  // Lead detail drawer — contact section
  detail_signals_header: { en: "Signals", tr: "Sinyaller" },
  detail_dnc_helper: {
    en: "(disables outreach and hides from Focused / Hot)",
    tr: "(iletişimi kapatır ve Odak / Sıcak listelerinden çıkarır)",
  },
  detail_contact_finder_header: { en: "Contact Finder", tr: "İletişim bulucu" },
  detail_find_best_contact: { en: "Find Best Contact", tr: "En iyi kanalı bul" },
  detail_find_best_contact_hint: {
    en: "Click \"Find Best Contact\" to analyze homepage contact channels.",
    tr: "İletişim kanallarını analiz etmek için “En iyi kanalı bul”a tıklayın.",
  },
  detail_analyzing_website: { en: "Analyzing website...", tr: "Site analiz ediliyor…" },
  detail_best_contact_label: { en: "Best Contact:", tr: "En iyi kanal:" },
  detail_value_label: { en: "Value:", tr: "Değer:" },
  detail_confidence_label: { en: "Confidence:", tr: "Güven:" },
  detail_reason_label: { en: "Reason:", tr: "Gerekçe:" },
  detail_copy_number: { en: "Copy Number", tr: "Numarayı kopyala" },
  detail_google_places_phone: { en: "Google Places phone", tr: "Google Places telefonu" },
  detail_verified_whatsapp: { en: "Verified WhatsApp", tr: "Doğrulanmış WhatsApp" },
  detail_whatsapp_available: { en: "WhatsApp Available", tr: "WhatsApp mevcut" },
  detail_phone_only: { en: "Phone Only", tr: "Yalnızca telefon" },
  detail_confidence_high: { en: "high", tr: "yüksek" },
  detail_confidence_medium: { en: "medium", tr: "orta" },
  detail_confidence_low: { en: "low", tr: "düşük" },

  // Lead detail drawer — workflow / next action / status
  detail_status_header: { en: "Status", tr: "Durum" },
  detail_status_updated_prefix: { en: "Updated", tr: "Güncellendi" },
  detail_send_message: { en: "Send Message", tr: "Mesaj gönder" },
  detail_preparing_message: { en: "Preparing…", tr: "Hazırlanıyor…" },
  detail_send_title_dnc: { en: "Do not contact", tr: "İletişim kurulmasın" },
  detail_send_title_pipeline_closed: { en: "Pipeline closed", tr: "Pipeline kapandı" },
  detail_send_title_open_wa: {
    en: "Generate message and open WhatsApp",
    tr: "Mesajı oluştur ve WhatsApp’ı aç",
  },
  detail_send_title_prepare: {
    en: "Generate message (copy or send when ready)",
    tr: "Mesajı oluştur (hazır olunca kopyala veya gönder)",
  },
  next_action_completed: { en: "Completed", tr: "Tamamlandı" },
  next_action_close_deal: { en: "Close deal", tr: "Anlaşmayı kapat" },
  next_action_move_to_meeting: { en: "Move to meeting", tr: "Görüşmeye geç" },
  next_action_send_follow_up: { en: "Send follow-up message", tr: "Takip mesajı gönder" },
  next_action_follow_up: { en: "Follow up", tr: "Takibi sürdür" },
  next_action_send_first_message: { en: "Send first message", tr: "İlk iletişimi başlat" },
  next_action_review_lead: { en: "Review lead", tr: "Leadi gözden geçir" },
  follow_up_now: { en: "Follow up now", tr: "Şimdi takip et" },
  follow_up_in_hours_one: { en: "Follow up in 1 hour", tr: "1 saat içinde takip" },
  follow_up_in_hours_many: { en: "Follow up in {hours} hours", tr: "{hours} saat içinde takip" },
  pipeline_stage_dnc: { en: "do not contact", tr: "iletişim kurulmasın" },

  // Lead detail drawer — AI insight panel
  detail_polish_with_ai: { en: "Polish with AI", tr: "AI ile cilala" },
  detail_refining_with_ai: { en: "Refining…", tr: "İyileştiriliyor…" },
  detail_refine_failed: { en: "Refine failed", tr: "İyileştirilemedi" },

  // Lead detail drawer — reply helper
  detail_reply_helper_header: { en: "Reply Helper", tr: "Yanıt yardımcısı" },
  detail_owner_reply_placeholder: {
    en: "Paste owner's reply here…",
    tr: "İşletme sahibinin yanıtını buraya yapıştırın…",
  },
  detail_generate_reply: { en: "Generate Reply", tr: "Yanıt oluştur" },
  detail_generating_reply: { en: "Generating…", tr: "Hazırlanıyor…" },
  detail_suggested_reply_header: { en: "Suggested Reply", tr: "Önerilen yanıt" },
  detail_copy_reply: { en: "Copy Reply", tr: "Yanıtı kopyala" },
  detail_copied: { en: "Copied", tr: "Kopyalandı" },
  detail_send_via_whatsapp: { en: "Send via WhatsApp", tr: "WhatsApp ile gönder" },
  detail_apply_suggested_status: { en: "Apply Suggested Status", tr: "Önerilen durumu uygula" },
  detail_suggested_next_status: { en: "Suggested next status:", tr: "Önerilen sonraki durum:" },
  detail_lost_plus_dnc: { en: "Lost + Do Not Contact", tr: "Kayıp + İletişim kurulmasın" },
  detail_no_status_suggestion: { en: "No status suggestion", tr: "Durum önerisi yok" },

  // Lead detail drawer — notes
  detail_notes_header: { en: "Notes", tr: "Notlar" },
  detail_notes_chars_suffix: { en: "chars", tr: "karakter" },
  detail_notes_placeholder: {
    en: "Owner picks up calls in the afternoon. Interested in direct booking site. Follow up Tuesday.",
    tr: "İşletme sahibi öğleden sonra arıyor. Doğrudan rezervasyon sayfasıyla ilgileniyor. Salı günü takip edilecek.",
  },
  detail_notes_reset: { en: "Reset", tr: "Sıfırla" },
  detail_notes_save: { en: "Save note", tr: "Notu kaydet" },

  detail_reenrich_button: { en: "Re-enrich", tr: "Yeniden zenginleştir" },
  detail_reenrich_loading: { en: "Enriching…", tr: "Zenginleştiriliyor…" },
  detail_reenrich_no_new: {
    en: "No new verifiable signals found.",
    tr: "Yeni doğrulanabilir sinyal bulunamadı.",
  },
  detail_reenrich_error: { en: "Re-enrich failed.", tr: "Zenginleştirme başarısız." },
  detail_website_candidate_label: { en: "Website candidate", tr: "Web sitesi adayı" },

  // Drawer chrome
  drawer_close_aria: { en: "Close panel", tr: "Paneli kapat" },
  intelligence_score_title: {
    en: "Signal-based opportunity score (structured data, not star rating)",
    tr: "Sinyal tabanlı fırsat skoru (yıldız puanı değil; yapılandırılmış veri)",
  },

  // Import intelligence labels (shown in drawer beside Next Action)
  import_label_new_import: { en: "New import", tr: "Yeni içe aktarma" },
  import_label_reimported: { en: "Re-imported", tr: "Yeniden içe aktarıldı" },
  import_label_contacted_before: { en: "Contacted before", tr: "Daha önce iletişim" },
  import_label_followed_up_before: { en: "Followed up before", tr: "Daha önce takip edildi" },
  import_label_in_queue: { en: "In queue", tr: "Kuyrukta" },

  // Instagram discovery panel
  ig_discovery_broken_title: { en: "Broken Instagram link", tr: "Bozuk Instagram bağlantısı" },
  ig_discovery_possible_title: { en: "Possible Instagram", tr: "Olası Instagram hesabı" },

  // AI insight — pain-point summary fallback lines
  pain_possible_response_delay: {
    en: "Possible response delay",
    tr: "Olası geç dönüş riski",
  },
  pain_guest_reachability: {
    en: "Guest reachability concerns in reviews",
    tr: "Yorumlarda misafir ulaşımı sıkıntısı",
  },
  pain_reservation_friction: {
    en: "Reservation or booking friction in reviews",
    tr: "Yorumlarda rezervasyon sürtünmesi",
  },
  pain_communication_gaps: {
    en: "Communication gaps mentioned in reviews",
    tr: "Yorumlarda iletişim eksikliği belirtiliyor",
  },
  pain_cleanliness_ops: {
    en: "Operations/cleanliness signals in reviews",
    tr: "Yorumlarda operasyon / temizlik sinyalleri",
  },
  pain_value_concerns: {
    en: "Value-for-money concerns in reviews",
    tr: "Yorumlarda fiyat / değer kaygısı",
  },
  pain_review_other: {
    en: "Review-flagged guest concern",
    tr: "Yorumlardan misafir tarafı sıkıntı",
  },
  pain_weak_booking_flow: {
    en: "Weak or unclear direct booking flow",
    tr: "Doğrudan rezervasyon akışı zayıf görünüyor",
  },
  pain_no_owned_website: {
    en: "No owned website on listing",
    tr: "Listede kendi web sitesi yok",
  },
  pain_limited_owned_footprint: {
    en: "Limited owned digital footprint",
    tr: "Kendine ait dijital varlık sınırlı",
  },
  pain_heavy_platform_dependence: {
    en: "Heavy platform dependence",
    tr: "OTA/platform bağımlılığı yüksek olabilir",
  },
  pain_revenue_concentrated: {
    en: "Revenue concentrated on few channels",
    tr: "Gelir az sayıda kanalda yoğunlaşmış",
  },
  pain_reputation_attention: {
    en: "Reputation attention may help",
    tr: "İtibar tarafı dikkat gerektirebilir",
  },
  pain_reviews_less_recent: {
    en: "Reviews look less recent online",
    tr: "Yorumlar yakın tarihli görünmüyor",
  },
  pain_social_funnel_gap: {
    en: "Social funnel gap for this scale",
    tr: "Bu ölçek için sosyal huni eksik",
  },
  pain_premium_no_funnel: {
    en: "Premium positioning without a strong owned funnel",
    tr: "Premium konum; kendi hunisi güçsüz",
  },
  pain_phone_not_ideal: {
    en: "Phone not ideal for instant outreach",
    tr: "Telefon anlık iletişim için ideal değil",
  },
  pain_no_listed_phone: {
    en: "No listed phone",
    tr: "Listelenmiş telefon yok",
  },
  pain_weak_booking_cta: {
    en: "Booking CTA appears weak or unclear",
    tr: "Rezervasyon çağrısı zayıf veya net değil",
  },
  pain_no_clear_booking_flow: {
    en: "No clear direct booking flow",
    tr: "Net bir doğrudan rezervasyon akışı yok",
  },
  pain_external_only_booking: {
    en: "Booking path appears external/OTA dependent",
    tr: "Rezervasyon yolu dışa / OTA’ya bağlı görünüyor",
  },
  pain_weak_contact_visibility: {
    en: "Weak contact visibility on public surfaces",
    tr: "Açık yüzeylerde iletişim görünürlüğü zayıf",
  },
  pain_low_operational_activity: {
    en: "Recent operational activity looks softer",
    tr: "Son dönem operasyonel hareket düşük görünüyor",
  },
  pain_website_lacks_cta: {
    en: "Website may lack a clear booking call-to-action",
    tr: "Sitede net bir rezervasyon çağrısı eksik olabilir",
  },
  pain_site_booking_thin: {
    en: "Owned site present but booking path looks thin",
    tr: "Kendi sitesi var; rezervasyon yolu zayıf görünüyor",
  },
  pain_direct_outreach_ready: {
    en: "Direct outreach available (WhatsApp-ready)",
    tr: "Doğrudan iletişim açık (WhatsApp uyumlu)",
  },
  pain_instagram_surface: {
    en: "Instagram available as a contact surface",
    tr: "İletişim için Instagram kullanılabilir",
  },

  // AI insight — outreach angle fallbacks
  angle_prevent_lost_reservations: {
    en: "Prevent lost reservations from late or missed WhatsApp replies.",
    tr: "Geciken veya kaçan WhatsApp dönüşlerinin yol açtığı kayıp rezervasyonların önüne geçin.",
  },
  angle_tighten_inquiry_path: {
    en: "Tighten the path from inquiry to confirmed booking on your fastest channel.",
    tr: "İlk talepten onaylı rezervasyona giden yolu en hızlı kanalınızda sıkılaştırın.",
  },
  angle_capture_more_direct: {
    en: "Capture more direct demand while guests are already messaging you.",
    tr: "Misafir size yazmışken doğrudan rezervasyonu kazanın.",
  },
  angle_close_gap_attention: {
    en: "Close the gap between attention and a clear reservation action.",
    tr: "İlgi ile net bir rezervasyon adımı arasındaki açığı kapatın.",
  },
  angle_lightweight_inquiry: {
    en: "Offer a lightweight way to handle reservation inquiries faster.",
    tr: "Rezervasyon taleplerini daha hızlı yönetecek hafif bir akış sunun.",
  },
  angle_explore_inquiry_handling: {
    en: "Explore whether inquiry handling and direct booking match guest expectations.",
    tr: "Talep yönetimi ve doğrudan rezervasyonun misafir beklentisiyle örtüşüp örtüşmediğini değerlendirin.",
  },
  angle_reduce_response_delays: {
    en: "Reduce response delays during peak inquiry hours.",
    tr: "Yoğun talep saatlerinde yanıt gecikmelerini azaltın.",
  },
  angle_improve_booking_conversion: {
    en: "Improve direct booking conversion flow.",
    tr: "Doğrudan rezervasyon dönüşüm akışını güçlendirin.",
  },
  angle_capture_instagram_demand: {
    en: "Capture more Instagram-driven reservations.",
    tr: "Instagram kaynaklı rezervasyonların payını artırın.",
  },
  angle_no_strong_angle: {
    en: "No strong outreach angle detected yet.",
    tr: "Henüz güçlü bir iletişim açısı bulunamadı.",
  },

  // AI insight — paragraph sentence fallbacks
  insight_para_direct_booking_upside: {
    en: "This business appears to have direct booking upside alongside platform visibility.",
    tr: "İşletme; platform görünürlüğüne ek olarak doğrudan rezervasyon potansiyeli taşıyor.",
  },
  insight_para_direct_potential: {
    en: "This business shows direct-booking potential based on listing signals.",
    tr: "Liste sinyalleri doğrudan rezervasyon potansiyeline işaret ediyor.",
  },
  insight_para_strengthen_owned: {
    en: "Public signals suggest room to strengthen owned reservation channels.",
    tr: "Sinyaller; işletmenin kendi rezervasyon kanallarında güçlenme alanı olduğunu gösteriyor.",
  },
  insight_para_review_hints: {
    en: "Review and listing signals hint at {pain}.",
    tr: "Yorum ve liste sinyalleri {pain} işaret ediyor.",
  },
  insight_para_notable_themes: {
    en: "Notable themes include {pain}.",
    tr: "Öne çıkan tema: {pain}.",
  },
  insight_para_whatsapp_consultative: {
    en: "WhatsApp availability makes consultative outreach practical.",
    tr: "WhatsApp erişimi danışman tonlu iletişimi pratikleştiriyor.",
  },
  insight_para_instagram_surface: {
    en: "Instagram offers a workable surface for a light-touch conversation.",
    tr: "Instagram, yumuşak tonlu bir görüşme için uygun bir yüzey sunuyor.",
  },
  insight_para_opp_very_high: {
    en: "Overall opportunity is very high for immediate outreach.",
    tr: "Toplam fırsat seviyesi çok yüksek; hızlı temas önerilir.",
  },
  insight_para_opp_high: {
    en: "Overall opportunity looks strong for a focused reservation-ops conversation.",
    tr: "Fırsat seviyesi güçlü; rezervasyon operasyonlarına odaklı bir görüşme uygun.",
  },
  insight_para_opp_medium: {
    en: "Worth a short discovery touch if the channel fit looks right.",
    tr: "Kanal uyumu yerindeyse kısa bir keşif teması anlamlı.",
  },

  // Acquisition signals (rendered in detail expand)
  acq_sig_ig_verified: {
    en: "Instagram discovery: validated link/handle",
    tr: "Instagram keşfi: bağlantı / kullanıcı adı doğrulandı",
  },
  acq_sig_ig_handle_present: {
    en: "Instagram handle or URL present",
    tr: "Instagram kullanıcı adı veya URL’si mevcut",
  },
  acq_sig_ig_possible: {
    en: "Instagram may exist (plausible handles; verify manually)",
    tr: "Instagram hesabı bulunabilir (olası kullanıcı adlarıyla manuel doğrulama önerilir)",
  },
  acq_sig_whatsapp_available: {
    en: "WhatsApp available (phone or site link)",
    tr: "WhatsApp erişimi mevcut (telefon veya site bağlantısı)",
  },
  acq_sig_website_exists: {
    en: "Website exists",
    tr: "Kendi web sitesi mevcut",
  },
  acq_sig_ota_footprint: {
    en: "OTA / platform listing footprint",
    tr: "OTA / platform tarafında görünürlük mevcut",
  },
  acq_sig_high_ota: {
    en: "Elevated OTA likelihood (distribution-led acquisition)",
    tr: "OTA bağımlılığı yüksek görünüyor (dağıtım odaklı edinim)",
  },
  acq_sig_strong_social: {
    en: "Strong social demand",
    tr: "Sosyal tarafta talep güçlü",
  },
  acq_sig_moderate_social: {
    en: "Moderate social demand",
    tr: "Sosyal tarafta talep orta düzeyde",
  },
  acq_sig_campaign_lang: {
    en: "Campaign / promo language in copy",
    tr: "Metinde kampanya / promosyon dili",
  },
  acq_sig_paid_traffic: {
    en: "Possible paid traffic (tracking params or modeled likelihood)",
    tr: "Ücretli trafik olasılığı mevcut (izleme parametreleri / model tahmini)",
  },
  acq_sig_booking_pressure: {
    en: "Booking or conversion pressure relative to social attention",
    tr: "Sosyal ilgiye kıyasla rezervasyon dönüşümünde baskı işareti",
  },
  acq_sig_strong_booking_surface: {
    en: "Stronger direct booking surface / CTAs",
    tr: "Doğrudan rezervasyon yüzeyi ve çağrı dili güçlü",
  },

  // Acquisition weaknesses
  acq_weak_ig_invalid: {
    en: "Instagram surface appears invalid or broken",
    tr: "Instagram yüzeyi geçersiz ya da bozuk görünüyor",
  },
  acq_weak_no_whatsapp: {
    en: "No clear WhatsApp path",
    tr: "Net bir WhatsApp erişim yolu görünmüyor",
  },
  acq_weak_no_website: {
    en: "No owned website",
    tr: "Sahipli web yüzeyi görünmüyor",
  },
  acq_weak_weak_booking: {
    en: "Weak direct booking flow",
    tr: "Doğrudan rezervasyon akışı zayıf görünüyor",
  },
  acq_weak_social_outpace: {
    en: "Social attention may outpace booking capture",
    tr: "Sosyal talep, rezervasyona dönüşüm kapasitesini aşıyor olabilir",
  },
  acq_weak_single_surface: {
    en: "Limited acquisition channel mix (single-surface risk)",
    tr: "Edinim kanal karması sınırlı (tek yüzey riski)",
  },
  acq_weak_heavy_ota: {
    en: "Heavy OTA reliance with thin owned conversion path",
    tr: "OTA bağımlılığı yüksek; sahipli dönüşüm yolu zayıf",
  },
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

const PAIN_POINT_UI: Record<string, UiKey> = {
  "Possible response delay": "pain_possible_response_delay",
  "Guest reachability concerns in reviews": "pain_guest_reachability",
  "Reservation or booking friction in reviews": "pain_reservation_friction",
  "Communication gaps mentioned in reviews": "pain_communication_gaps",
  "Operations/cleanliness signals in reviews": "pain_cleanliness_ops",
  "Value-for-money concerns in reviews": "pain_value_concerns",
  "Review-flagged guest concern": "pain_review_other",
  "Weak or unclear direct booking flow": "pain_weak_booking_flow",
  "No owned website on listing": "pain_no_owned_website",
  "Limited owned digital footprint": "pain_limited_owned_footprint",
  "Heavy platform dependence": "pain_heavy_platform_dependence",
  "Revenue concentrated on few channels": "pain_revenue_concentrated",
  "Reputation attention may help": "pain_reputation_attention",
  "Reviews look less recent online": "pain_reviews_less_recent",
  "Social funnel gap for this scale": "pain_social_funnel_gap",
  "Premium positioning without a strong owned funnel": "pain_premium_no_funnel",
  "Phone not ideal for instant outreach": "pain_phone_not_ideal",
  "No listed phone": "pain_no_listed_phone",
  "Booking CTA appears weak or unclear": "pain_weak_booking_cta",
  "No clear direct booking flow": "pain_no_clear_booking_flow",
  "Booking path appears external/OTA dependent": "pain_external_only_booking",
  "Weak contact visibility on public surfaces": "pain_weak_contact_visibility",
  "Recent operational activity looks softer": "pain_low_operational_activity",
  "Website may lack a clear booking call-to-action": "pain_website_lacks_cta",
  "Owned site present but booking path looks thin": "pain_site_booking_thin",
  "Direct outreach available (WhatsApp-ready)": "pain_direct_outreach_ready",
  "Instagram available as a contact surface": "pain_instagram_surface",
};

/** Localize a single rule-based pain-point summary line; pass-through for unknown text. */
export function painPointUiLine(line: string, locale: Locale): string {
  if (locale !== "tr") return line;
  const key = PAIN_POINT_UI[line];
  return key ? t(key, locale) : line;
}

const OUTREACH_ANGLE_UI: Record<string, UiKey> = {
  "Prevent lost reservations from late or missed WhatsApp replies.":
    "angle_prevent_lost_reservations",
  "Tighten the path from inquiry to confirmed booking on your fastest channel.":
    "angle_tighten_inquiry_path",
  "Capture more direct demand while guests are already messaging you.":
    "angle_capture_more_direct",
  "Close the gap between attention and a clear reservation action.":
    "angle_close_gap_attention",
  "Offer a lightweight way to handle reservation inquiries faster.":
    "angle_lightweight_inquiry",
  "Explore whether inquiry handling and direct booking match guest expectations.":
    "angle_explore_inquiry_handling",
  "Reduce response delays during peak inquiry hours.":
    "angle_reduce_response_delays",
  "Improve direct booking conversion flow.":
    "angle_improve_booking_conversion",
  "Capture more Instagram-driven reservations.":
    "angle_capture_instagram_demand",
  "No strong outreach angle detected yet.":
    "angle_no_strong_angle",
};

/** Localize a rule-derived outreach angle sentence; LLM Turkish text passes through. */
export function outreachAngleUiLine(line: string, locale: Locale): string {
  if (locale !== "tr") return line;
  const key = OUTREACH_ANGLE_UI[line.trim()];
  return key ? t(key, locale) : line;
}

const AI_INSIGHT_SENTENCE_UI: Record<string, UiKey> = {
  "This business appears to have direct booking upside alongside platform visibility.":
    "insight_para_direct_booking_upside",
  "This business shows direct-booking potential based on listing signals.":
    "insight_para_direct_potential",
  "Public signals suggest room to strengthen owned reservation channels.":
    "insight_para_strengthen_owned",
  "WhatsApp availability makes consultative outreach practical.":
    "insight_para_whatsapp_consultative",
  "Instagram offers a workable surface for a light-touch conversation.":
    "insight_para_instagram_surface",
  "Overall opportunity is very high for immediate outreach.":
    "insight_para_opp_very_high",
  "Overall opportunity looks strong for a focused reservation-ops conversation.":
    "insight_para_opp_high",
  "Worth a short discovery touch if the channel fit looks right.":
    "insight_para_opp_medium",
};

const INSIGHT_REVIEW_HINT_RE = /^Review and listing signals hint at (.+)\.$/i;
const INSIGHT_NOTABLE_THEMES_RE = /^Notable themes include (.+)\.$/i;

/** Localize a rule-derived AI insight paragraph; falls back to the whole text. */
export function aiInsightParagraphUiText(text: string, locale: Locale): string {
  if (locale !== "tr") return text;
  const raw = text.trim();
  if (!raw) return raw;

  const sentences = raw
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return raw;

  const translated = sentences.map((sentence) => {
    const key = AI_INSIGHT_SENTENCE_UI[sentence];
    if (key) return t(key, locale);

    const reviewMatch = INSIGHT_REVIEW_HINT_RE.exec(sentence);
    if (reviewMatch) {
      const pain = painPointUiLine(reviewMatch[1].trim(), locale).toLowerCase();
      return fillTemplate(t("insight_para_review_hints", locale), { pain });
    }

    const notableMatch = INSIGHT_NOTABLE_THEMES_RE.exec(sentence);
    if (notableMatch) {
      const pain = painPointUiLine(notableMatch[1].trim(), locale).toLowerCase();
      return fillTemplate(t("insight_para_notable_themes", locale), { pain });
    }

    return sentence;
  });

  return translated.join(" ").replace(/\s+/g, " ").trim();
}

const ACQUISITION_SIGNAL_UI: Record<string, UiKey> = {
  "Instagram discovery: validated link/handle": "acq_sig_ig_verified",
  "Instagram handle or URL present": "acq_sig_ig_handle_present",
  "Instagram may exist (plausible handles; verify manually)": "acq_sig_ig_possible",
  "WhatsApp available (phone or site link)": "acq_sig_whatsapp_available",
  "Website exists": "acq_sig_website_exists",
  "OTA / platform listing footprint": "acq_sig_ota_footprint",
  "Elevated OTA likelihood (distribution-led acquisition)": "acq_sig_high_ota",
  "Strong social demand": "acq_sig_strong_social",
  "Moderate social demand": "acq_sig_moderate_social",
  "Campaign / promo language in copy": "acq_sig_campaign_lang",
  "Possible paid traffic (tracking params or modeled likelihood)": "acq_sig_paid_traffic",
  "Booking or conversion pressure relative to social attention": "acq_sig_booking_pressure",
  "Stronger direct booking surface / CTAs": "acq_sig_strong_booking_surface",
};

const ACQUISITION_WEAKNESS_UI: Record<string, UiKey> = {
  "Instagram surface appears invalid or broken": "acq_weak_ig_invalid",
  "No clear WhatsApp path": "acq_weak_no_whatsapp",
  "No owned website": "acq_weak_no_website",
  "Weak direct booking flow": "acq_weak_weak_booking",
  "Social attention may outpace booking capture": "acq_weak_social_outpace",
  "Limited acquisition channel mix (single-surface risk)": "acq_weak_single_surface",
  "Heavy OTA reliance with thin owned conversion path": "acq_weak_heavy_ota",
};

export function acquisitionSignalUiLine(line: string, locale: Locale): string {
  if (locale !== "tr") return line;
  const key = ACQUISITION_SIGNAL_UI[line];
  return key ? t(key, locale) : line;
}

export function acquisitionWeaknessUiLine(line: string, locale: Locale): string {
  if (locale !== "tr") return line;
  const key = ACQUISITION_WEAKNESS_UI[line];
  return key ? t(key, locale) : line;
}

/** Localize the next-action copy for the lead detail drawer. */
export function nextActionUiCopy(
  status:
    | "new"
    | "contacted"
    | "needs_follow_up"
    | "replied"
    | "meeting"
    | "won"
    | "lost",
  locale: Locale,
): string {
  switch (status) {
    case "won":
    case "lost":
      return t("next_action_completed", locale);
    case "meeting":
      return t("next_action_close_deal", locale);
    case "replied":
      return t("next_action_move_to_meeting", locale);
    case "needs_follow_up":
      return t("next_action_send_follow_up", locale);
    case "contacted":
      return t("next_action_follow_up", locale);
    case "new":
      return t("next_action_send_first_message", locale);
    default:
      return t("next_action_review_lead", locale);
  }
}

/** Localize follow-up countdown text. */
export function followUpTimerUiLabel(hoursUntil: number, locale: Locale): string {
  if (hoursUntil <= 0) return t("follow_up_now", locale);
  if (hoursUntil === 1) return t("follow_up_in_hours_one", locale);
  return fillTemplate(t("follow_up_in_hours_many", locale), { hours: hoursUntil });
}

/** Localize the pipeline-stage chip in the drawer. */
export function pipelineStageUiLabel(
  status:
    | "new"
    | "contacted"
    | "needs_follow_up"
    | "replied"
    | "meeting"
    | "won"
    | "lost",
  doNotContact: boolean,
  locale: Locale,
): string {
  if (doNotContact) return t("pipeline_stage_dnc", locale);
  return statusUiLabel(status, locale);
}

/** Localize contact-finder confidence enum ("high" | "medium" | "low"). */
export function contactFinderConfidenceUiLabel(
  confidence: string,
  locale: Locale,
): string {
  switch (confidence) {
    case "high":
      return t("detail_confidence_high", locale);
    case "medium":
      return t("detail_confidence_medium", locale);
    case "low":
      return t("detail_confidence_low", locale);
    default:
      return confidence;
  }
}

const LEAD_SIGNAL_UI: Record<string, string> = {
  "High season pricing": "Yüksek sezon fiyatlaması",
  "Sold out next 2 weekends": "Önümüzdeki 2 hafta sonu dolu",
  "Premium ADR": "Premium gecelik fiyat",
  "No own website": "Doğrudan rezervasyon akışı zayıf olabilir",
  "High occupancy": "Doluluk yüksek",
  "Booking #1 in district": "Bölgede Booking 1 numara",
  "Single channel only": "Yalnızca tek kanal",
  "Low online presence": "Çevrimiçi görünürlük zayıf",
  "No Instagram": "Instagram hesabı bulunabilir",
  "High ADR": "Yüksek gecelik fiyat",
  "Repeat guest signals": "Tekrar gelen misafir sinyali",
  "Trending category": "Yükselen kategori",
  "Backpacker favorite": "Sırt çantalı misafir favorisi",
  "High review velocity": "Yorum hızı yüksek",
  "High volume": "Yüksek hacim",
  "Stable bookings": "Rezervasyon trendi stabil",
  "Fast-growing region": "Hızlı büyüyen bölge",
  "Direct-only": "Yalnızca doğrudan rezervasyon",
  "5.0 rating": "5.0 puan",
  "Low channel count": "Düşük kanal sayısı",
  "Soft season": "Ölü sezon",
  "Tasteful brand": "Özenli marka",
  Established: "Köklü işletme",
  "Quiet shoulder season": "Sakin ara sezon",
  "GCC inbound trend": "Körfez bölgesi inbound trendi",
  "Weekend demand from İstanbul": "İstanbul’dan hafta sonu talebi",
  "Arabic-speaking demand": "Arapça konuşan misafir talebi",
  "Premium villa segment": "Premium villa segmenti",
  "Hot island summer": "Adada yoğun yaz",
  "Single channel": "Tek kanal",
  "Weekend city break demand": "Hafta sonu şehir kaçamağı talebi",
  "Stable demand": "Stabil talep",
};

/** Localize a mock / data-driven lead signal line; unknown values pass through. */
export function leadSignalUiLine(line: string, locale: Locale): string {
  if (locale !== "tr") return line;
  return LEAD_SIGNAL_UI[line] ?? line;
}

/** Localize the contact-finder source enum. */
export function contactFinderSourceUiLabel(source: string, locale: Locale): string {
  if (locale !== "tr") return source;
  switch (source) {
    case "Website WhatsApp link":
      return "Sitedeki WhatsApp bağlantısı";
    case "Website phone number":
      return "Sitedeki telefon numarası";
    case "Website Instagram link":
      return "Sitedeki Instagram bağlantısı";
    case "Website email":
      return "Sitedeki e-posta";
    case "Website homepage":
      return "Site ana sayfası";
    default:
      return source;
  }
}
