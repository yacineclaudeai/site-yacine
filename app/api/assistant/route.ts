import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { chat, type Turn } from "@/lib/assistant";

// المساعد: للمدير برك، ويخدم غير كي يبعث رسالة.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me || me.locked || me.role !== "manager") return NextResponse.json({ error: "ما عندكش الصلاحية" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "المساعد مازال ما تربطش. لازم تحط ANTHROPIC_API_KEY في Netlify." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const turns = (Array.isArray(body?.turns) ? body.turns : []) as Turn[];
  const ok = turns.length > 0 && turns.length <= 40 && turns[turns.length - 1].role === "user"
    && turns.every((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.length > 0 && t.content.length <= 4000);
  if (!ok) return NextResponse.json({ error: "الرسالة ماشي صحيحة" }, { status: 400 });
  try {
    return NextResponse.json(await chat(turns));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "مفتاح Anthropic ماشي صحيح." }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "بزاف طلبات، عاود بعد شوية." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `المساعد ما جاوبش (${e.status}). عاود جرب.` }, { status: 502 });
    return NextResponse.json({ error: "صرا مشكل، عاود جرب." }, { status: 500 });
  }
}
