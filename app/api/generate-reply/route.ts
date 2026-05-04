import { NextResponse } from "next/server";

type GenerateReplyBody = {
  ownerReply: string;
  city?: string;
};

type SuggestedStatus = "replied" | "meeting" | "needs_follow_up" | "lost" | null;

type ReplySuggestion = {
  message: string;
  suggestedStatus: SuggestedStatus;
  suggestDoNotContact: boolean;
  nextFollowUpAt: number | null;
  intent:
    | "ack_problem"
    | "ask_explain"
    | "reject"
    | "ready_call"
    | "ask_price"
    | "delay"
    | "unknown";
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function includesAny(text: string, tokens: readonly string[]): boolean {
  for (const t of tokens) {
    if (text.includes(t)) return true;
  }
  return false;
}

function detectIntent(raw: string): ReplySuggestion["intent"] {
  const txt = raw.toLocaleLowerCase("tr-TR");

  if (
    includesAny(txt, [
      "ilgilenmiyorum",
      "gerek yok",
      "istemiyoruz",
      "istemiyorum",
      "olmaz",
      "teşekkürler gerek yok",
    ])
  ) {
    return "reject";
  }

  if (
    includesAny(txt, ["arayın", "telefonla konuşalım", "müsaitim", "ara", "konuşalım"])
  ) {
    return "ready_call";
  }

  if (includesAny(txt, ["fiyat", "ücret", "ne kadar", "fiyatı", "fiyati"])) {
    return "ask_price";
  }

  if (includesAny(txt, ["nasıl", "ne demek", "kimsiniz", "ne yapıyorsunuz"])) {
    return "ask_explain";
  }

  if (
    includesAny(txt, [
      "evet",
      "oluyor",
      "bazen",
      "doğru",
      "maalesef",
      "geç dönüyoruz",
    ])
  ) {
    return "ack_problem";
  }

  if (includesAny(txt, ["bakalım", "sonra", "şu an değil", "daha sonra"])) {
    return "delay";
  }

  return "unknown";
}

function buildReplySuggestion(body: GenerateReplyBody): ReplySuggestion {
  const intent = detectIntent(body.ownerReply);

  if (intent === "ack_problem") {
    return {
      intent,
      message:
        "Tam da onu kastettim.\nÇoğu işletmede sorun mesaj gelmemesi değil, gelen talebin rezervasyona çevrilememesi.\nİsterseniz 2 dakikada nasıl çözülebileceğini göstereyim.",
      suggestedStatus: "replied",
      suggestDoNotContact: false,
      nextFollowUpAt: null,
    };
  }

  if (intent === "ask_explain") {
    return {
      intent,
      message:
        "Kısaca şöyle:\nWhatsApp, Instagram ve web'den gelen rezervasyon taleplerini kaçırmadan karşılayan bir akış kuruyoruz.\nİsterseniz size örnek üzerinden gösterebilirim.",
      suggestedStatus: "replied",
      suggestDoNotContact: false,
      nextFollowUpAt: null,
    };
  }

  if (intent === "reject") {
    return {
      intent,
      message:
        "Tabii, sorun değil.\nRahatsız ettiysem kusura bakmayın, iyi çalışmalar.",
      suggestedStatus: "lost",
      suggestDoNotContact: true,
      nextFollowUpAt: null,
    };
  }

  if (intent === "ready_call") {
    return {
      intent,
      message: "Tabii, kaç gibi aramam uygun olur?",
      suggestedStatus: "meeting",
      suggestDoNotContact: false,
      nextFollowUpAt: null,
    };
  }

  if (intent === "ask_price") {
    return {
      intent,
      message:
        "İşletmenin ihtiyacına göre değişiyor.\nÖnce mevcut mesaj/rezervasyon akışına bakıp netleştirmek daha doğru olur.\nİsterseniz 10 dakikalık kısa bir demo üzerinden göstereyim.",
      suggestedStatus: "replied",
      suggestDoNotContact: false,
      nextFollowUpAt: null,
    };
  }

  if (intent === "delay") {
    return {
      intent,
      message:
        "Tabii.\nUygun olduğunuzda kısa bir örnek üzerinden gösterebilirim.",
      suggestedStatus: "needs_follow_up",
      suggestDoNotContact: false,
      nextFollowUpAt: Date.now() + 48 * 60 * 60 * 1000,
    };
  }

  return {
    intent: "unknown",
    message:
      "Anladım.\nEn çok nerede kaçırılıyor; gece dönüşte mi, rezervasyona çevirme tarafında mı?",
    suggestedStatus: "replied",
    suggestDoNotContact: false,
    nextFollowUpAt: null,
  };
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

  const ownerReply =
    typeof body.ownerReply === "string" ? body.ownerReply.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : undefined;

  if (!ownerReply) {
    return NextResponse.json(
      { error: "ownerReply zorunludur" },
      { status: 400 },
    );
  }

  const suggestion = buildReplySuggestion({ ownerReply, city });
  return NextResponse.json(suggestion);
}

