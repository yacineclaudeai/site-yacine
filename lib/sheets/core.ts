// قراية شيتات جوجل واستيراد الطلبات. بلا Next: يخدم من صفحة المدير ومن الـscheduled function تاع Netlify.
import { createHash, createSign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// كيما أوكتوماتيك: كل خانة تتطابق مع عمود. الأعمدة اللي ما تطابقوش يروحو لـ"أعمدة أخرى".
export const FIELDS = ["ref", "date", "name", "phone", "address", "wilaya", "commune", "delivery_type", "product", "details",
  "qty", "price", "delivery_price", "discount", "total", "notes"] as const;
export type Field = (typeof FIELDS)[number];
export type Mapping = Partial<Record<Field, string>>; // اسم العمود كيما في الشيت

export type Source = {
  id: number; name: string; url: string | null; columns: Mapping; sync_minutes: number; active: boolean;
  start_row: number; last_sync_at: string | null; headers: string[];
};

// ---------- الرابط ----------
export function parseSheetUrl(url: string): { id: string; gid: string } | null {
  const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return { id: m[1], gid };
}

// ---------- CSV ----------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------- القراية ----------
// 1) حساب خدمة جوجل (الشيت يبقى خاص، مشارك مع إيميل الحساب)  2) وإلا رابط مفتوح (CSV)
export class SheetError extends Error {}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function googleToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
  });
  if (!r.ok) throw new SheetError("حساب الخدمة تاع جوجل ما خدمش. شوف GOOGLE_SERVICE_ACCOUNT_EMAIL و GOOGLE_PRIVATE_KEY في Netlify.");
  return (await r.json()).access_token as string;
}

export async function fetchRows(url: string): Promise<string[][]> {
  const p = parseSheetUrl(url);
  if (!p) throw new SheetError("الرابط ماشي رابط شيت جوجل.");
  const token = await googleToken();
  if (token) {
    const auth = { authorization: `Bearer ${token}` };
    const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${p.id}?fields=sheets.properties(sheetId,title)`, { headers: auth });
    if (meta.status === 403 || meta.status === 404) {
      throw new SheetError(`الموقع ما يقدرش يدخل للشيت. شارك الشيت مع ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} (Viewer).`);
    }
    if (!meta.ok) throw new SheetError(`جوجل ما جاوبش (${meta.status}).`);
    const sheets = ((await meta.json()).sheets ?? []) as { properties: { sheetId: number; title: string } }[];
    const tab = sheets.find((s) => String(s.properties.sheetId) === p.gid) ?? sheets[0];
    if (!tab) throw new SheetError("الشيت فارغ.");
    const range = encodeURIComponent(`'${tab.properties.title.replace(/'/g, "''")}'`);
    const v = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${p.id}/values/${range}?majorDimension=ROWS`, { headers: auth });
    if (!v.ok) throw new SheetError(`ما قدرتش نقرا الورقة (${v.status}).`);
    return ((await v.json()).values ?? []) as string[][];
  }
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${p.id}/export?format=csv&gid=${p.gid}`, { redirect: "follow" });
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || type.includes("text/html")) {
    throw new SheetError("الشيت ماشي مشارك. يا حط حساب الخدمة تاع جوجل، يا خلي الشيت \"أي واحد عندو الرابط يقدر يشوف\".");
  }
  return parseCsv(await r.text());
}

// ---------- التطابق ----------
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const digits = (s: string) => s.replace(/\D/g, "");

// المنتج: الاسم بالضبط، وإلا أطول اسم منتج موجود داخل النص (مثلا "بيجامة قطيفة - أحمر L")
export function matchProduct(text: string, products: { id: string; name: string }[]) {
  const t = norm(text);
  if (!t) return null;
  const exact = products.find((p) => norm(p.name) === t);
  if (exact) return exact;
  const inside = products.filter((p) => t.includes(norm(p.name))).sort((a, b) => b.name.length - a.name.length);
  return inside[0] ?? null;
}

export type ImportRow = { key: string; row: number; ref: string; date: string; name: string; phone: string; address: string;
  wilaya: string; commune: string; delivery_type: string; product_id: string; product_name: string; details: string; qty: number;
  price: string; delivery_price: string; discount: string; total: string; notes: string; extra: string };

// مبلغ: "2 900,00 DA" → "2900". فارغ إذا ما فيهش رقم.
export function money(s: string) {
  const t = s.replace(/\s|da|دج/gi, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  const m = t.match(/\d+(\.\d+)?/);
  return m ? String(Number(m[0])) : "";
}

export function mapRows(sourceId: number, rows: string[][], mapping: Mapping, startRow: number, products: { id: string; name: string }[]) {
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const col = (f: Field) => (mapping[f] ? headers.indexOf(mapping[f]!) : -1);
  const missing = (["name", "phone", "product"] as Field[]).filter((f) => col(f) < 0);
  if (missing.length) {
    const L: Record<string, string> = { name: "الاسم", phone: "الهاتف", product: "المنتج" };
    throw new SheetError(`طابق هذو الأعمدة قبل: ${missing.map((f) => L[f]).join("، ")}.`);
  }
  const used = new Set(FIELDS.map(col).filter((i) => i >= 0));
  const others = headers.map((h, i) => [h, i] as const).filter(([h, i]) => h && !used.has(i));
  const ok: ImportRow[] = [], errors: { row: number; reason: string }[] = [];
  for (let i = Math.max(1, startRow - 1); i < rows.length; i++) {
    const r = rows[i], get = (f: Field) => (col(f) >= 0 ? String(r[col(f)] ?? "").trim() : "");
    const rowNo = i + 1, name = get("name"), phone = get("phone"), prod = get("product");
    if (!name && !phone && !prod) continue; // سطر فارغ
    if (digits(phone).length < 9) { errors.push({ row: rowNo, reason: `الهاتف ماشي صحيح: "${phone}"` }); continue; }
    if (!name) { errors.push({ row: rowNo, reason: "الاسم فارغ" }); continue; }
    const p = matchProduct(prod, products);
    if (!p) { errors.push({ row: rowNo, reason: `المنتج "${prod}" ما لقيتوش في الموقع` }); continue; }
    const qty = Math.min(10, Math.max(1, parseInt(digits(get("qty")) || "1", 10)));
    const ref = get("ref");
    // رقم الطلبية + الهاتف هو البصمة (يصبر حتى لو تبدلت خانة أخرى)، وإلا بصمة القيم
    const key = ref ? `ref:${digits(phone)}:${ref}`.slice(0, 120)
      : createHash("sha256").update([sourceId, norm(name), digits(phone), norm(prod), qty, norm(get("date"))].join("|")).digest("hex").slice(0, 32);
    const extra = others.map(([h, j]) => [h, String(r[j] ?? "").trim()]).filter(([, v]) => v).map(([h, v]) => `${h}: ${v}`).join(" | ");
    ok.push({ key, row: rowNo, ref, date: get("date"), name, phone, address: get("address"), wilaya: get("wilaya"), commune: get("commune"),
      delivery_type: get("delivery_type"), product_id: p.id, product_name: p.name, details: get("details") || (norm(prod) !== norm(p.name) ? prod : ""),
      qty, price: money(get("price")), delivery_price: money(get("delivery_price")), discount: money(get("discount")),
      total: money(get("total")), notes: get("notes"), extra: extra.slice(0, 2000) });
  }
  return { headers, ok, errors };
}

// ---------- التزامن ----------
// admin = client بالـservice role (السيرفر برك)
export async function syncSource(admin: SupabaseClient, s: Source) {
  const done = async (patch: Record<string, unknown>) =>
    admin.from("sheet_sources").update({ last_sync_at: new Date().toISOString(), ...patch }).eq("id", s.id);
  try {
    if (!s.url) throw new SheetError("ما كاينش رابط.");
    const [rows, { data: products }] = await Promise.all([
      fetchRows(s.url),
      admin.from("products").select("id, name").eq("active", true).eq("pending", false),
    ]);
    const { headers, ok, errors } = mapRows(s.id, rows, s.columns ?? {}, s.start_row, products ?? []);
    const { data: n, error } = ok.length ? await admin.rpc("import_sheet_orders", { p_source: s.id, p_rows: ok }) : { data: 0, error: null };
    if (error) throw new SheetError("ما قدرتش نحفظ الطلبات: " + error.message);
    const msg = `${n} طلبية جديدة` + (errors.length ? `، ${errors.length} سطر فيه مشكل` : "");
    await done({ headers, last_status: errors.length ? "warn" : "ok", last_message: msg, last_count: n, last_errors: errors.slice(-20) });
    return { imported: n as number, errors: errors.length };
  } catch (e) {
    const msg = e instanceof SheetError ? e.message : "صرا مشكل في القراية، عاود جرب.";
    await done({ last_status: "error", last_message: msg, last_count: 0 });
    return { imported: 0, errors: 1, message: msg };
  }
}

// الشيتات المفعلة اللي فات الوقت تاعهم
export async function syncDue(admin: SupabaseClient) {
  const { data } = await admin.from("settings").select("order_source").maybeSingle();
  if (data?.order_source === "direct") return [];
  const { data: list } = await admin.from("sheet_sources").select("*").eq("active", true).not("url", "is", null);
  const now = Date.now(), out = [];
  for (const s of (list ?? []) as Source[]) {
    if (s.last_sync_at && now - new Date(s.last_sync_at).getTime() < s.sync_minutes * 60_000 - 15_000) continue;
    out.push({ id: s.id, ...(await syncSource(admin, s)) });
  }
  return out;
}

// تخمين أولي للتطابق من أسماء الأعمدة (المدير يصحح)
// الترتيب مهم: الخانات الدقيقة قبل (سعر التوصيل قبل السعر، رقم الطلبية قبل الهاتف)
const GUESS: [Field, string[]][] = [
  ["ref", ["order id", "order number", "order no", "commande", "رقم الطلب", "رقم الطلبية", "id"]],
  ["delivery_price", ["shipping", "livraison", "delivery price", "frais", "سعر التوصيل", "التوصيل"]],
  ["delivery_type", ["delivery type", "type de livraison", "stopdesk", "stop desk", "نوع التوصيل"]],
  ["discount", ["discount", "remise", "réduction", "promo", "تخفيض"]],
  ["total", ["total", "السعر الكلي", "المجموع", "الإجمالي"]],
  ["name", ["full name", "name", "nom", "client", "الاسم", "اسم"]],
  ["phone", ["phone", "tel", "tél", "mobile", "الهاتف", "رقم"]],
  ["address", ["address", "adresse", "العنوان"]],
  ["wilaya", ["wilaya", "state", "province", "ولاية", "الولاية"]],
  ["commune", ["commune", "city", "ville", "بلدية", "البلدية"]],
  ["details", ["variant", "variation", "option", "détail", "detail", "التفاصيل", "المتغير"]],
  ["product", ["product", "produit", "item", "المنتج", "منتج"]],
  ["qty", ["qty", "quantity", "quantité", "quantite", "الكمية", "كمية"]],
  ["price", ["price", "prix", "السعر", "سعر"]],
  ["date", ["date", "time", "التاريخ", "تاريخ"]],
  ["notes", ["note", "remarque", "comment", "ملاحظ"]],
];
export function guessMapping(headers: string[], current: Mapping): Mapping {
  const out: Mapping = {};
  for (const f of FIELDS) if (current[f] && headers.includes(current[f]!)) out[f] = current[f];
  const taken = () => new Set(Object.values(out));
  for (const [f, words] of GUESS) {
    if (out[f]) continue;
    const t = taken();
    const h = headers.find((x) => !t.has(x) && words.some((g) => (g === "id" ? norm(x) === g : norm(x).includes(g))));
    if (h) out[f] = h;
  }
  return out;
}
