export type PackageTier = "Starter" | "Professional" | "Growth" | "Enterprise";
export type Priority = "critical" | "high" | "medium" | "low";
export type ActionChannel = "WhatsApp" | "Arama" | "Email";

export type QueueRow = {
  rank: number;
  id: string;
  hotelName: string;
  city: string;
  packageTier: PackageTier;
  weightedMrr: number;
  conversion: number;
  priority: Priority;
  priorityScore: number;
  channel: ActionChannel;
  actionLabel: string;
  actionSub: string;
  lastActionChannel: string;
  lastActionAgo: string;
};

export type MockKpi = {
  totalWeightedMrr: number;
  totalWeightedArr: number;
  opportunityCount: number;
  avgConversion: number;
  callsToday: number;
  messagesToday: number;
  followUpsToday: number;
  pendingApprovals: number;
};

export type MockContext = {
  rankingReasons: string[];
  queueSummary: {
    totalExpected: number;
    closableThisWeek: number;
    atRiskRevenue: number;
    avgWaitDays: number;
  };
};

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${(n / 1_000).toFixed(0)}K`;
  return `₺${n}`;
}

export function fmtCurrencyTR(n: number): string {
  return "₺" + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export const MOCK_KPI: MockKpi = {
  totalWeightedMrr: 286_400,
  totalWeightedArr: 3_436_800,
  opportunityCount: 23,
  avgConversion: 42,
  callsToday: 7,
  messagesToday: 9,
  followUpsToday: 6,
  pendingApprovals: 4,
};

export const MOCK_QUEUE_ROWS: QueueRow[] = [
  {
    rank: 1,
    id: "q1",
    hotelName: "Grand Sapphire Hotel & Spa",
    city: "İstanbul",
    packageTier: "Enterprise",
    weightedMrr: 40_000,
    conversion: 100,
    priority: "critical",
    priorityScore: 95,
    channel: "Arama",
    actionLabel: "Hemen Ara",
    actionSub: "En yüksek gelir",
    lastActionChannel: "WhatsApp",
    lastActionAgo: "2 saat önce",
  },
  {
    rank: 2,
    id: "q2",
    hotelName: "Bodrum Marina Hotel",
    city: "Bodrum",
    packageTier: "Enterprise",
    weightedMrr: 23_800,
    conversion: 68,
    priority: "critical",
    priorityScore: 88,
    channel: "Arama",
    actionLabel: "Ara",
    actionSub: "Sıcak fırsat",
    lastActionChannel: "Web Ziyareti",
    lastActionAgo: "1 gün önce",
  },
  {
    rank: 3,
    id: "q3",
    hotelName: "Antalya Palace Resort",
    city: "Antalya",
    packageTier: "Growth",
    weightedMrr: 16_000,
    conversion: 64,
    priority: "high",
    priorityScore: 82,
    channel: "Arama",
    actionLabel: "Ara",
    actionSub: "Demo talebi iste",
    lastActionChannel: "WhatsApp",
    lastActionAgo: "3 saat önce",
  },
  {
    rank: 4,
    id: "q4",
    hotelName: "Cappadocia Cave Suites",
    city: "Nevşehir",
    packageTier: "Professional",
    weightedMrr: 9_000,
    conversion: 60,
    priority: "high",
    priorityScore: 75,
    channel: "Arama",
    actionLabel: "Ara",
    actionSub: "Karar vericiye görüş",
    lastActionChannel: "Instagram",
    lastActionAgo: "2 gün önce",
  },
  {
    rank: 5,
    id: "q5",
    hotelName: "İzmir Kordon Boutique",
    city: "İzmir",
    packageTier: "Growth",
    weightedMrr: 7_500,
    conversion: 50,
    priority: "medium",
    priorityScore: 65,
    channel: "WhatsApp",
    actionLabel: "WhatsApp",
    actionSub: "Bilgi paylaş",
    lastActionChannel: "WhatsApp",
    lastActionAgo: "1 gün önce",
  },
  {
    rank: 6,
    id: "q6",
    hotelName: "Pamukkale Thermal Resort",
    city: "Denizli",
    packageTier: "Professional",
    weightedMrr: 4_000,
    conversion: 40,
    priority: "medium",
    priorityScore: 55,
    channel: "WhatsApp",
    actionLabel: "WhatsApp",
    actionSub: "İlgi ölçekle",
    lastActionChannel: "Form",
    lastActionAgo: "2 gün önce",
  },
  {
    rank: 7,
    id: "q7",
    hotelName: "Fethiye Blue Cruise Hotel",
    city: "Fethiye",
    packageTier: "Professional",
    weightedMrr: 3_600,
    conversion: 24,
    priority: "low",
    priorityScore: 35,
    channel: "Email",
    actionLabel: "E-posta",
    actionSub: "Teklif gönder",
    lastActionChannel: "E-posta",
    lastActionAgo: "3 gün önce",
  },
  {
    rank: 8,
    id: "q8",
    hotelName: "Alanya Cleopatra Beach",
    city: "Alanya",
    packageTier: "Starter",
    weightedMrr: 2_400,
    conversion: 28,
    priority: "low",
    priorityScore: 28,
    channel: "WhatsApp",
    actionLabel: "WhatsApp",
    actionSub: "Ücretsiz deneme sun",
    lastActionChannel: "Görüşme",
    lastActionAgo: "3 hafta önce",
  },
];

export const MOCK_CONTEXT: MockContext = {
  rankingReasons: [
    "Ağırlıklı Aylık Gelir (MRR)",
    "Dönüşüm Olasılığı",
    "Revenue Priority Score",
    "Aksiyon Zamanı (Zaman aşımı)",
    "Lead Sıcaklık & Niyet Sinyalleri",
  ],
  queueSummary: {
    totalExpected: 286_400,
    closableThisWeek: 3,
    atRiskRevenue: 87_000,
    avgWaitDays: 12,
  },
};
