import { NextResponse } from "next/server";

type GenerateMessageBody = {
  name: string;
  type: string;
  location: string;
  leadScore: number;
  hotScore: number;
  followUp?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Rule-based copy — konuşma dilinde, 3 satır ve kısa akış.
 * Yapı: gözlem → problem → cevap daveti.
 */
function buildOutreachVariations(input: GenerateMessageBody): string[] {
  const { location, followUp } = input;
  const city = location.split(",")[0]?.trim() || location;

  if (followUp) {
    return [
      `Selam, ${city} tarafında yine aynı tabloyu görüyoruz
gece gelen taleplerin bir kısmı cevaplanmadan düşüyor
sizde de bu durum oluyor mu?`,
      `Selam, çoğu işletmede takip tam bu noktada aksıyor
mesaj geliyor ama rezervasyona dönen taraf zayıf kalıyor
siz de son dönemde yaşıyor musunuz?`,
      `Selam, genelde gece saatlerinde burada kaçırılıyor
rezervasyon soruları geç kalınca konuşma yarım kalıyor
siz de buna denk geliyor musunuz?`,
    ];
  }

  return [
    `Selam, ${city} tarafında çoğu işletmede aynı durum var
gece gelen taleplerin ciddi kısmı çoğu zaman cevapsız kalıyor
siz de bu durumu yaşıyor musunuz?`,
    `Selam, genelde tam burada kaçırılıyor gibi oluyor
mesaj geliyor ama rezervasyona dönüşen taraf zayıf kalıyor
siz de bunu fark ettiniz mi?`,
    `Selam, çoğu küçük otelde benzerini sık görüyoruz
WhatsApp dolu ama gece gelen rezervasyon talebi sönüyor
sizde de bu taraf bazen kopuyor mu?`,
  ];
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON gövdesi" },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const location =
    typeof body.location === "string" ? body.location.trim() : "";
  const leadScore = Number(body.leadScore);
  const hotScore = Number(body.hotScore);
  const followUp = body.followUp === true;

  if (!name || !type || !location) {
    return NextResponse.json(
      { error: "name, type ve location zorunludur" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(leadScore) || !Number.isFinite(hotScore)) {
    return NextResponse.json(
      { error: "leadScore ve hotScore sayı olmalıdır" },
      { status: 400 },
    );
  }

  const variations = buildOutreachVariations({
    name,
    type,
    location,
    leadScore,
    hotScore,
    followUp,
  });
  const message = pick(variations);

  return NextResponse.json({ message, variations });
}
