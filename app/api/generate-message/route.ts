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

/** Rule-based copy — conversational, 2–3 sentences; one of three variants at random. */
function buildMockOutreachMessage(input: GenerateMessageBody): string {
  const { name, location, followUp } = input;
  const city = location.split(",")[0]?.trim() || location;

  if (followUp) {
    const followUps = [
      `Merhaba, dün ${name} için kısa yazmıştım — ${city} tarafındasınız. Müsait olduğunuzda tek cümleyle dönüşünüz yeterli olur, teşekkürler.`,
      `Selam, ${name} hakkında küçük bir not bırakmıştım. Rahatsız etmek istemem; uygun bir zamanda göz atarsanız sevinirim.`,
      `Merhaba, ${city} bölgesindeki ${name} için nazikçe hatırlatayım. Kısa bir yanıtınız benim için yeterli.`,
    ];
    return followUps[Math.floor(Math.random() * followUps.length)]!;
  }

  const variations = [
    `Merhaba, ${name} diye bir yere bakarken denk geldim. ${city} tarafındaki konumunuz ilgimi çekti. Müsaitseniz aklımdaki şeyi paylaşmak isterim.`,
    `Selam, ${name} sayfasına takıldım. ${city} tarafında olduğunuzu görünce durdum. Uygun olursanız kısaca yazmak isterim.`,
    `Merhaba, internette ${name} konusuna takılı kaldım. ${city} civarında olmanız dikkatimi çekti. Zamanınız olursa tek mesajda anlatmak istediğim bir şey var.`,
  ];

  return variations[Math.floor(Math.random() * variations.length)]!;
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

  const message = buildMockOutreachMessage({
    name,
    type,
    location,
    leadScore,
    hotScore,
    followUp,
  });

  return NextResponse.json({ message });
}
