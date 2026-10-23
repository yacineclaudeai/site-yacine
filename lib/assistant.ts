import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "./supabase/server";

// المساعد: يخدم غير كي المدير يبعث رسالة. عندو أداتين برك، ويخدم بجلسة المدير (RLS + السجل).
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const MAX_ROUNDS = 6;

const RULES = `أنت مساعد داخل لوحة عمل ياسين (تجارة إلكترونية في الجزائر، الدفع عند الاستلام).
تهضر بالدارجة الجزائرية البسيطة وباختصار. ما تقولش "دابا" ولا "الفلوس" ولا "يتسالاو"، قل "ذركا" و"الدراهم" و"يتسلمو".
مهمتك الوحيدة: توزيع المنتجات على المؤكدات. كل منتج يتوزع على مؤكدة وحدة، والطلبات تاعو تروحلها.
استعمل get_state قبل أي تعديل، ومن بعد assign_product.
ما تخترعش أسماء منتجات ولا مؤكدات. إذا الاسم ماشي واضح، ولا يشبه لأكثر من واحد، ولا ما لقيتوش، سقسي ياسين وما تبدل والو.
إذا طلب حاجة خارج التوزيع، قولو بلي ذركا تخدم على التوزيع برك.
بعد ما تنفذ، قولو واش تبدل بالضبط.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_state",
    description: "يرجع المنتجات (الاسم والمؤكدة اللي موزع عليها، ولا null) وأسماء المؤكدات اللي يخدمو. استعملو قبل أي تعديل.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "assign_product",
    description: "يوزع منتج على مؤكدة. product: اسم المنتج كيما جا في get_state. confirmer: اسم المؤكدة كيما جا في get_state. يرجع واش تبدل، ولا غلط إذا الاسم ماشي واضح.",
    input_schema: {
      type: "object",
      properties: { product: { type: "string" }, confirmer: { type: "string" } },
      required: ["product", "confirmer"],
      additionalProperties: false,
    },
    strict: true,
  },
];

type Named = { id: string; name: string };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// اسم واحد بالضبط، وإلا غلط فيه الاحتمالات باش المساعد يسقسي
function findOne(list: Named[], q: string, what: string): Named | string {
  const exact = list.filter((x) => norm(x.name) === norm(q));
  if (exact.length === 1) return exact[0];
  const part = list.filter((x) => norm(x.name).includes(norm(q)) || norm(q).includes(norm(x.name)));
  if (part.length === 1) return part[0];
  if (!part.length) return `ما لقيتش ${what} بهذا الاسم: "${q}". الموجودين: ${list.map((x) => x.name).join("، ") || "حتى واحد"}.`;
  return `الاسم "${q}" يشبه لأكثر من ${what}: ${part.map((x) => x.name).join("، ")}. سقسي ياسين على أنهي واحد.`;
}

async function state() {
  const sb = await supabaseServer();
  const [{ data: products }, { data: people }, { data: assign }] = await Promise.all([
    sb.from("products").select("id, name").eq("pending", false).eq("active", true).order("name"),
    sb.from("profiles").select("id, name").eq("role", "confirmer").eq("locked", false).order("name"),
    sb.from("product_confirmers").select("product_id, confirmer_id"),
  ]);
  return { products: (products ?? []) as Named[], confirmers: (people ?? []) as Named[], assign: assign ?? [] };
}

async function runTool(name: string, input: unknown, changes: string[]): Promise<{ content: string; is_error?: boolean }> {
  const s = await state();
  if (name === "get_state") {
    const who = new Map(s.confirmers.map((c) => [c.id, c.name]));
    const owner = new Map(s.assign.map((a) => [a.product_id as string, a.confirmer_id as string]));
    return { content: JSON.stringify({
      products: s.products.map((p) => ({ name: p.name, assigned_to: who.get(owner.get(p.id) ?? "") ?? null })),
      confirmers: s.confirmers.map((c) => c.name),
    }) };
  }
  if (name === "assign_product") {
    const i = input as { product?: unknown; confirmer?: unknown };
    if (typeof i?.product !== "string" || typeof i?.confirmer !== "string") return { content: "لازم product و confirmer نصوص", is_error: true };
    const p = findOne(s.products, i.product, "منتج");
    if (typeof p === "string") return { content: p, is_error: true };
    const c = findOne(s.confirmers, i.confirmer, "مؤكدة");
    if (typeof c === "string") return { content: c, is_error: true };
    const sb = await supabaseServer();
    const { error } = await sb.from("product_confirmers").upsert({ product_id: p.id, confirmer_id: c.id });
    if (error) return { content: "ما قدرتش نحفظ: " + error.message, is_error: true };
    changes.push(`${p.name} ← ${c.name}`);
    return { content: `تمام: "${p.name}" ولا عند "${c.name}".` };
  }
  return { content: "أداة ما نعرفهاش", is_error: true };
}

export type Turn = { role: "user" | "assistant"; content: string };

export async function chat(turns: Turn[]): Promise<{ text: string; changes: string[] }> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY من السيرفر برك
  const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const changes: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await client.messages.create({ model: MODEL, max_tokens: 4000, system: RULES, tools: TOOLS, messages });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (msg.stop_reason === "refusal") return { text: "ما نقدرش نجاوب على هذي.", changes };
    const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !uses.length) {
      if (changes.length) revalidatePath("/manager", "layout");
      return { text: text || "تمام.", changes };
    }
    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const r = await runTool(u.name, u.input, changes);
      results.push({ type: "tool_result", tool_use_id: u.id, content: r.content, is_error: r.is_error });
    }
    messages.push({ role: "user", content: results });
  }
  if (changes.length) revalidatePath("/manager", "layout");
  return { text: "حبست باش ما نطولش. قولي واش نكمل.", changes };
}
