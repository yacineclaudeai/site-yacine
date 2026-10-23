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
  start_row: number; last_sync_at: string | null; headers: string[]; product_map?: Record<string, string>; imported_total?: number;
};

// ---------- الرابط ----------
// يقبل: رابط التعديل (/d/ID/edit#gid=..)، رابط المشاركة (?usp=sharing)، ورابط "النشر على الويب" (/d/e/2PACX.../pub)
export type SheetRef = { id: string; gid: string | null; published: boolean };
export function parseSheetUrl(url: string): SheetRef | null {
  const u = url.trim();
  const pub = u.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  const m = pub ?? u.match(/^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{10,})/);
  if (!m) return null;
  const gid = u.match(/[#&?]gid=(\d+)/)?.[1] ?? null;
  return { id: m[1], gid, published: !!pub };
}

// الروابط اللي نجربوهم بالترتيب (بلا حساب خدمة)
export function csvUrls(p: SheetRef): string[] {
  const g = p.gid != null ? `&gid=${p.gid}` : "";
  if (p.published) return [`https://docs.google.com/spreadsheets/d/e/${p.id}/pub?output=csv${g}`];
  return [
    `https://docs.google.com/spreadsheets/d/${p.id}/export?format=csv${g}`,
    `https://docs.google.com/spreadsheets/d/${p.id}/gviz/tq?tqx=out:csv${g}`,
  ];
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

const NOT_SHARED = "الشيت ماشي مشارك. افتح الشيت ← Partager (Share) ← \"Accès général\" ← \"Tous les utilisateurs disposant du lien\" ← Lecteur، وعاود جرب.";

async function get(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(25_000), ...init });
  } catch (e) {
    const why = e instanceof Error && e.name === "TimeoutError" ? "جوجل طول بزاف وما جاوبش" : "ما قدرتش نوصل لجوجل";
    throw new SheetError(`${why}. عاود جرب بعد دقيقة.`);
  }
}

export async function fetchRows(url: string): Promise<string[][]> {
  const p = parseSheetUrl(url);
  if (!p) throw new SheetError("هذا ماشي رابط شيت جوجل. لازم يبدا بـ https://docs.google.com/spreadsheets/d/ ... (انسخو من فوق في المتصفح كي يكون الشيت محلول).");
  const token = p.published ? null : await googleToken();
  if (token) {
    const auth = { authorization: `Bearer ${token}` };
    const meta = await get(`https://sheets.googleapis.com/v4/spreadsheets/${p.id}?fields=sheets.properties(sheetId,title)`, { headers: auth });
    if (meta.status === 403 || meta.status === 404) {
      throw new SheetError(`الموقع ما يقدرش يدخل للشيت. شارك الشيت مع ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} كـLecteur (Viewer).`);
    }
    if (meta.status === 400) throw new SheetError("هذا الملف Excel ماشي Google Sheet. افتحو ← Fichier ← Enregistrer au format Google Sheets، وحط الرابط الجديد.");
    if (!meta.ok) throw new SheetError(`جوجل ما جاوبش (${meta.status}).`);
    const sheets = ((await meta.json()).sheets ?? []) as { properties: { sheetId: number; title: string } }[];
    const tab = (p.gid != null && sheets.find((s) => String(s.properties.sheetId) === p.gid)) || sheets[0];
    if (!tab) throw new SheetError("الشيت فارغ.");
    const range = encodeURIComponent(`'${tab.properties.title.replace(/'/g, "''")}'`);
    const v = await get(`https://sheets.googleapis.com/v4/spreadsheets/${p.id}/values/${range}?majorDimension=ROWS`, { headers: auth });
    if (!v.ok) throw new SheetError(`ما قدرتش نقرا الورقة (${v.status}).`);
    return ((await v.json()).values ?? []) as string[][];
  }
  if (/[?&]rtpof=true/.test(url)) {
    throw new SheetError("هذا الملف Excel (.xlsx) ماشي Google Sheet، جوجل ما يعطيهش للموقع. افتحو ← Fichier ← Enregistrer au format Google Sheets، وحط الرابط تاع النسخة الجديدة.");
  }
  let last = "";
  for (const u of csvUrls(p)) {
    const r = await get(u);
    const type = r.headers.get("content-type") ?? "";
    if (r.ok && !type.includes("text/html")) return parseCsv(await r.text());
    if (r.status === 404) last = "الشيت ما كانش: الرابط غالط ولا الشيت تمحى. انسخ الرابط من جديد.";
    else if (r.status === 400) last = "الورقة اللي في الرابط (gid) ما كانتش. افتح الورقة اللي فيها الطلبات وانسخ الرابط من فوق.";
    else if (r.status === 401 || r.status === 403 || type.includes("text/html")) last = NOT_SHARED;
    else last = `جوجل رجع خطأ (${r.status}). عاود جرب.`;
  }
  throw new SheetError(last || NOT_SHARED);
}

// ---------- الجدول ----------
// سطر العناوين: أول سطر فيه 2 خانات معمرين ولا أكثر (من 10 الأولين). عنوان فارغ ولا معاود ياخذ اسم.
const letter = (i: number) => (i < 26 ? "" : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26));
export function table(rows: string[][]) {
  let h = rows.slice(0, 10).findIndex((r) => r.filter((c) => String(c ?? "").trim()).length >= 2);
  if (h < 0) h = 0;
  const seen = new Map<string, number>();
  const headers = (rows[h] ?? []).map((c, i) => {
    let t = String(c ?? "").trim() || `عمود ${letter(i)}`;
    const n = (seen.get(t) ?? 0) + 1; seen.set(t, n);
    if (n > 1) t = `${t} (${n})`;
    return t;
  });
  return { headerRow: h + 1, headers };
}

// ---------- التطابق ----------
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const digits = (s: string) => s.replace(/\D/g, "");
// الشيت يمحي الـ0 كي يكون الرقم "nombre": 776351302 → 0776351302. و+213 / 00213 → 0
export function fixPhone(p: string) {
  const d = digits(p).replace(/^00213/, "").replace(/^213(?=[567]\d{8}$)/, "");
  return /^[567]\d{8}$/.test(d) ? "0" + d : p.trim();
}

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

export const prodKey = (s: string) => norm(s).slice(0, 200);

// المنتجات المختلفة اللي في عمود المنتج (للربط مع منتجات الموقع)
// كل السطور (حتى القدام): باش المدير يربط المنتجات قبل ما تجي الطلبات الجديدة
export function sheetProducts(rows: string[][], mapping: Mapping) {
  const { headerRow, headers } = table(rows);
  const c = mapping.product ? headers.indexOf(mapping.product) : -1;
  if (c < 0) return [];
  const count = new Map<string, { text: string; n: number }>();
  for (let i = headerRow; i < rows.length; i++) {
    const t = String(rows[i][c] ?? "").trim();
    if (!t) continue;
    const k = prodKey(t), e = count.get(k) ?? { text: t, n: 0 };
    e.n++; count.set(k, e);
  }
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 150);
}

export function mapRows(sourceId: number, rows: string[][], mapping: Mapping, startRow: number, products: { id: string; name: string }[],
  productMap: Record<string, string> = {}) {
  const { headerRow, headers } = table(rows);
  const col = (f: Field) => (mapping[f] ? headers.indexOf(mapping[f]!) : -1);
  const missing = (["name", "phone", "product"] as Field[]).filter((f) => col(f) < 0);
  if (missing.length) {
    const L: Record<string, string> = { name: "الاسم", phone: "الهاتف", product: "المنتج" };
    throw new SheetError(`طابق هذو الأعمدة قبل: ${missing.map((f) => L[f]).join("، ")}.`);
  }
  const used = new Set(FIELDS.map(col).filter((i) => i >= 0));
  const others = headers.map((h, i) => [h, i] as const).filter(([h, i]) => h && !used.has(i));
  const ok: ImportRow[] = [], errors: { row: number; reason: string }[] = [];
  const byId = new Map(products.map((p) => [p.id, p]));
  for (let i = Math.max(headerRow, startRow - 1); i < rows.length; i++) {
    const r = rows[i], get = (f: Field) => (col(f) >= 0 ? String(r[col(f)] ?? "").trim() : "");
    const rowNo = i + 1, name = get("name"), phone = get("phone"), prod = get("product");
    if (!name && !phone && !prod) continue; // سطر فارغ
    if (digits(phone).length < 9 || digits(phone).length > 13) { errors.push({ row: rowNo, reason: `الهاتف ماشي صحيح: "${phone}"` }); continue; }
    if (!name) { errors.push({ row: rowNo, reason: "الاسم فارغ" }); continue; }
    if (!prod) { errors.push({ row: rowNo, reason: "المنتج فارغ" }); continue; }
    // منتج ما تربطش: الطلبية تدخل عند المدير بالاسم تاع الشيت، وتتربط كي يربطو
    const p = byId.get(productMap[prodKey(prod)] ?? "") ?? matchProduct(prod, products) ?? { id: "", name: prod.slice(0, 200) };
    const qty = Math.min(10, Math.max(1, parseInt(digits(get("qty")) || "1", 10)));
    const ref = get("ref");
    // رقم الطلبية + الهاتف هو البصمة (يصبر حتى لو تبدلت خانة أخرى)، وإلا بصمة القيم
    const key = ref ? `ref:${digits(phone)}:${ref}`.slice(0, 120)
      : createHash("sha256").update([sourceId, norm(name), digits(phone), norm(prod), qty, norm(get("date"))].join("|")).digest("hex").slice(0, 32);
    const extra = others.map(([h, j]) => [h, String(r[j] ?? "").trim()]).filter(([, v]) => v).map(([h, v]) => `${h}: ${v}`).join(" | ");
    ok.push({ key, row: rowNo, ref, date: get("date"), name, phone: fixPhone(phone), address: get("address"), wilaya: get("wilaya"), commune: get("commune"),
      delivery_type: get("delivery_type"), product_id: p.id, product_name: p.name, details: get("details") || (p.id && norm(prod) !== norm(p.name) ? prod : ""),
      qty, price: money(get("price")), delivery_price: money(get("delivery_price")), discount: money(get("discount")),
      total: money(get("total")), notes: get("notes"), extra: extra.slice(0, 2000) });
  }
  return { headers, ok, errors };
}

// ---------- التزامن ----------
const reason = (e: unknown) =>
  e instanceof SheetError ? e.message : `صرا مشكل ما كانش متوقع: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400);

// في كل تزامن ندخلو 1000 طلبية على الأكثر، والباقي في التزامن الجاي (باش ما يطولش)
export const MAX_BATCH = 1000;

// تجميع الأسباب: "المنتج ... ما تربطش" × 25000
export function summarize(errors: { reason: string }[]) {
  const m = new Map<string, number>();
  for (const e of errors) {
    const k = e.reason.includes("ربط المنتجات") ? "المنتج ما تربطش بمنتج في الموقع" : e.reason.split(":")[0].split("\"")[0].trim();
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function prepare(admin: SupabaseClient, s: Source) {
  if (!s.url) throw new SheetError("ما كاينش رابط. حط رابط الشيت واحفظ.");
  const [rows, { data: products, error }] = await Promise.all([
    fetchRows(s.url),
    admin.from("products").select("id, name").eq("active", true).eq("pending", false),
  ]);
  if (error) throw new SheetError("ما قدرتش نقرا المنتجات من قاعدة البيانات: " + error.message);
  if (!products?.length) throw new SheetError("ما كاين حتى منتج مفعل في الموقع. زيد المنتجات قبل (تبويب المنتجات والستوك).");
  // أسماء المنتجات اللي في الشيت تتجدد كل مرة (منتج جديد في الحملة يبان وحدو في "ربط المنتجات")
  const texts = sheetProducts(rows, s.columns ?? {});
  const product_map = { ...(s.product_map ?? {}) };
  for (const t of texts) {
    const k = prodKey(t.text), m = matchProduct(t.text, products);
    if (!product_map[k] && m) product_map[k] = m.id;
  }
  await admin.from("sheet_sources").update({ product_texts: texts, product_map }).eq("id", s.id);
  return { rows, products, product_map, ...mapRows(s.id, rows, s.columns ?? {}, s.start_row, products, product_map) };
}

async function importedKeys(admin: SupabaseClient, id: number) {
  const { data, error } = await admin.rpc("sheet_keys", { p_source: id });
  if (error) throw new SheetError(/function|does not exist|schema cache/i.test(error.message)
    ? "قاعدة البيانات ناقصة: الصق آخر ملف SQL تاع ربط الشيت في Supabase." : "ما قدرتش نقرا الطلبات اللي دخلو: " + error.message);
  return new Set((data ?? []) as string[]);
}

const linkedMap = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v));

// admin = client بالـservice role (السيرفر برك)
export async function syncSource(admin: SupabaseClient, s: Source) {
  const done = async (patch: Record<string, unknown>) =>
    admin.from("sheet_sources").update({ last_sync_at: new Date().toISOString(), ...patch }).eq("id", s.id);
  try {
    const { ok, errors, product_map } = await prepare(admin, s);
    const keys = await importedKeys(admin, s.id);
    const fresh = ok.filter((r) => !keys.has(r.key)), batch = fresh.slice(0, MAX_BATCH);
    let n = 0;
    for (let i = 0; i < batch.length; i += 250) {
      const { data, error } = await admin.rpc("import_sheet_orders", { p_source: s.id, p_rows: batch.slice(i, i + 250) });
      if (error) throw new SheetError("ما قدرتش نحفظ الطلبات: " + error.message);
      n += data as number;
    }
    await admin.rpc("apply_product_map", { p_source: s.id, p_map: linkedMap(product_map) });
    const unlinked = fresh.filter((r) => !r.product_id).length;
    const msg = `${n} طلبية جديدة` + (fresh.length > batch.length ? `، والباقي (${fresh.length - batch.length}) يدخلو في التزامن الجاي` : "") +
      (unlinked ? `، منهم ${unlinked} منتجهم ما تربطش (يبانو عندك برك)` : "") + (errors.length ? `، ${errors.length} سطر فيه غلطة` : "");
    await done({ last_status: errors.length || unlinked ? "warn" : "ok", last_message: msg, last_count: n, last_errors: errors.slice(0, 50) });
    return { imported: n, errors: errors.length, message: undefined as string | undefined };
  } catch (e) {
    const msg = reason(e);
    await done({ last_status: "error", last_message: msg, last_count: 0 });
    return { imported: 0, errors: 1, message: msg };
  }
}

// تجربة بلا استيراد: يقرا، يطابق، ويقول قداش يدخل وعلاه الباقي لا
export async function testSource(admin: SupabaseClient, s: Source) {
  try {
    const { rows, ok, errors, headers } = await prepare(admin, s);
    const keys = await importedKeys(admin, s.id);
    const fresh = ok.filter((r) => !keys.has(r.key));
    const unlinked = fresh.filter((r) => !r.product_id).length;
    const lines = [
      `✓ الموقع دخل للشيت وقرا ${rows.length} سطر و${headers.length} عمود.`,
      `✓ ${ok.length} طلبية صحيحة: ${keys.size} دخلو من قبل، و${fresh.length} يدخلو في التزامن الجاي` +
        (fresh.length > MAX_BATCH ? ` (${MAX_BATCH} في كل مرة)` : "") + ".",
      ...(unlinked ? [`• ${unlinked} منهم منتجهم ما تربطش: يدخلو لقسم الطلبات، بصح المؤكدات ما يشوفوهمش حتى تربط المنتج (الخطوة 3) وتعطيه لمؤكدة.`] : []),
      ...summarize(errors).slice(0, 5).map(([k, n]) => `✗ ${n} سطر ما يدخلش: ${k}`),
    ];
    return { ok: true as const, lines, errors };
  } catch (e) {
    return { ok: false as const, lines: [`✗ ${reason(e)}`], errors: [] };
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
  ["delivery_type", ["delivery type", "type de livraison", "type livraison", "mode de livraison", "stopdesk", "stop desk", "نوع التوصيل"]],
  ["delivery_price", ["shipping", "prix livraison", "prix de livraison", "frais", "delivery price", "سعر التوصيل", "livraison", "التوصيل"]],
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
