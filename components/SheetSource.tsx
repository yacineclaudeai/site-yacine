// خانة شيت وحدة في الإعدادات: 4 خطوات (الرابط، الأعمدة، المنتجات، التفعيل) + نتيجة التجربة والتزامن.
import { deleteSource, readColumns, saveSource, syncNow, testConnection } from "@/app/actions/settings";

export type SheetSourceRow = { id: number; name: string; kind: "normal" | "abandoned"; url: string | null; columns: Record<string, string>;
  sync_minutes: number; active: boolean; last_sync_at: string | null; headers: string[]; preview: string[][]; start_row: number;
  last_status: "ok" | "warn" | "error" | null; last_message: string | null; imported_total: number; last_errors: { row: number; reason: string }[];
  product_map?: Record<string, string>; product_texts?: { text: string; n: number }[];
  last_test?: { at: string; ok: boolean; lines: string[] } | null };

// كيما أوكتوماتيك: كل خانة تتطابق مع عمود
export const COLS: [string, string][] = [["ref", "رقم الطلبية"], ["date", "التاريخ"], ["name", "الاسم الكامل"], ["phone", "الهاتف"],
  ["address", "العنوان"], ["wilaya", "الولاية"], ["commune", "البلدية"], ["delivery_type", "نوع التوصيل"], ["product", "المنتج"],
  ["details", "التفاصيل (لون، مقاس)"], ["qty", "الكمية"], ["price", "سعر المنتج"], ["delivery_price", "سعر التوصيل"],
  ["discount", "التخفيض"], ["total", "السعر الكلي"], ["notes", "ملاحظات"]];
const REQUIRED = ["name", "phone", "product"];
const STATUS: Record<string, [string, string]> = { ok: ["يخدم", "ok"], warn: ["يخدم، فيه سطور ما دخلوش", "warn"], error: ["ما خدمش", "bad"] };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-DZ", { timeZone: "Africa/Algiers", dateStyle: "short", timeStyle: "short" }) : "-");
const pkey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
const row = { display: "flex", gap: 6, alignItems: "center", cursor: "pointer" } as const;

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
      <div className="o-top" style={{ justifyContent: "flex-start", gap: 8 }}>
        <span className={`chip ${done ? "ok" : ""}`}>{done ? "✓" : n}</span><b>{title}</b>
      </div>
      {children}
    </div>
  );
}

export default function SheetSource({ x, products }: { x: SheetSourceRow; products: { id: string; name: string }[] }) {
  const st = x.last_status ? STATUS[x.last_status] : null;
  const mapped = REQUIRED.every((k) => x.columns?.[k] && x.headers?.includes(x.columns[k]));
  const texts = x.product_texts ?? [];
  const unlinked = texts.filter((t) => !x.product_map?.[pkey(t.text)]);
  const label = (k: string) => COLS.find((c) => c[0] === k)?.[1];
  return (
    <form action={saveSource} className="panel" style={{ display: "grid", gap: 10, marginBottom: 12 }}>
      <input type="hidden" name="id" value={x.id} />
      <div className="o-top">
        <b>{x.name}</b>
        {!x.url ? <span className="chip">بلا رابط</span> : st ? <span className={`chip ${st[1]}`}>{st[0]}</span> : <span className="chip warn">ما تزامنش بعد</span>}
      </div>
      <div className="o-row">
        <label className="f" style={{ minWidth: 150 }}>الاسم<input type="text" name="name" defaultValue={x.name} /></label>
        <label className="f">النوع<select name="kind" defaultValue={x.kind}><option value="normal">طلبات عادية</option><option value="abandoned">طلبات متروكة</option></select></label>
      </div>

      <Step n={1} done={!!x.headers?.length} title="الرابط">
        <div className="o-row">
          <label className="f" style={{ flex: 1, minWidth: 240 }}>رابط الشيت (انسخو من فوق في المتصفح، وأنت في الورقة اللي فيها الطلبات)
            <input type="url" name="url" dir="ltr" defaultValue={x.url ?? ""} placeholder="https://docs.google.com/spreadsheets/d/..." pattern="https://docs\.google\.com/spreadsheets/.*" />
          </label>
        </div>
        <div className="actions">
          <button className="btn pri" type="submit" formAction={readColumns}>اقرا الشيت</button>
          <button className="btn" type="submit" formAction={testConnection}>جرب الاتصال</button>
          <label style={row}><input type="checkbox" name="skip_old" /> ما تدخلش الطلبات القدام اللي راهم في الشيت ذركا</label>
        </div>
        {x.last_test && (
          <div className={`note ${x.last_test.ok ? "" : "bad"}`}>
            <div className="o-meta">آخر تجربة: <span className="num">{when(x.last_test.at)}</span></div>
            {x.last_test.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </Step>

      <Step n={2} done={mapped} title="تطابق الأعمدة">
        {x.headers?.length ? (
          <>
            <div className="o-meta">قدام كل خانة، اختار العمود تاعها في الشيت. <b>الاسم والهاتف والمنتج لازمين</b>. الموقع خمن وحدو، صحح إذا لزم. الأعمدة اللي ما تطابقهاش يبانو في "أعمدة أخرى" في جدول الطلبيات.</div>
            <div className="o-row">
              {COLS.map(([k, l]) => (
                <label className="f" key={k} style={{ width: 150 }}>{l}{REQUIRED.includes(k) ? " *" : ""}
                  <select name={`col_${k}`} defaultValue={x.columns?.[k] ?? ""}>
                    <option value="">— ما كاينش —</option>
                    {x.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
              <label className="f" style={{ width: 150 }}>نبداو من السطر<input type="number" name="start_row" min={2} defaultValue={x.start_row} /></label>
            </div>
            {!!x.preview?.length && (
              <div className="scroll"><table>
                <thead><tr>{x.headers.map((h) => {
                  const m = Object.entries(x.columns ?? {}).filter(([, v]) => v === h);
                  return <th key={h}>{h}{m.length ? m.map(([k]) => <div key={k} className="chip ok">{label(k)}</div>) : <div className="chip">أعمدة أخرى</div>}</th>;
                })}</tr></thead>
                <tbody>{x.preview.map((r, i) => <tr key={i}>{x.headers.map((_, j) => <td key={j}>{r[j] ?? ""}</td>)}</tr>)}</tbody>
              </table></div>
            )}
          </>
        ) : <div className="o-meta">حط الرابط واضغط "اقرا الشيت". الموقع يقرا أسماء الأعمدة و3 سطور مثال.</div>}
      </Step>

      <Step n={3} done={!!texts.length && !unlinked.length} title="ربط المنتجات">
        {texts.length ? (
          <>
            <div className="o-meta">الأسماء اللي في الشيت ماشي ديما كيما أسماء المنتجات في الموقع. اربط كل اسم بالمنتج تاعو مرة وحدة، والموقع يتفكرها.
              {unlinked.length ? <> <span className="chip warn">{unlinked.length} ما تربطوش</span> الطلبات تاعهم يدخلو لقسم الطلبات، بصح المؤكدات ما يشوفوهمش حتى تربط المنتج وتعطيه لمؤكدة (تبويب المؤكدات).</> : null}</div>
            <div className="scroll"><table>
              <thead><tr><th>المنتج في الشيت</th><th>الطلبات</th><th>المنتج في الموقع</th></tr></thead>
              <tbody>{texts.map((t, i) => (
                <tr key={i}>
                  <td style={{ maxWidth: 360 }}>{t.text}<input type="hidden" name={`prod_text_${i}`} value={t.text} /></td>
                  <td className="num">{t.n}</td>
                  <td><select name={`prod_id_${i}`} defaultValue={x.product_map?.[pkey(t.text)] ?? ""}>
                    <option value="">— ما تربطش —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></td>
                </tr>
              ))}</tbody>
            </table></div>
            {!products.length && <div className="note bad">ما كاين حتى منتج مفعل في الموقع. زيد المنتجات قبل من تبويب "المنتجات والستوك".</div>}
          </>
        ) : <div className="o-meta">{mapped ? "اضغط \"اقرا الشيت\" مرة أخرى باش نجيب أسماء المنتجات اللي في الشيت." : "طابق عمود المنتج قبل."}</div>}
      </Step>

      <Step n={4} done={x.active && x.last_status === "ok"} title="التفعيل والتزامن">
        <div className="actions">
          <label style={row}><input type="checkbox" name="active" defaultChecked={x.active} /> مفعل: يتزامن وحدو كل</label>
          <input type="number" name="sync_minutes" min={1} max={1440} defaultValue={x.sync_minutes} style={{ width: 70 }} /> دقيقة
        </div>
        <div className="o-meta">
          آخر تزامن: <span className="num">{when(x.last_sync_at)}</span> · {x.last_message ?? "-"} · دخلو في الكل: <b className="num">{x.imported_total}</b>
        </div>
        {!!x.last_errors?.length && (
          <details><summary className="o-meta" style={{ cursor: "pointer" }}>{x.last_errors.length} سطر ما دخلش: شوف علاش (يتعاودو وحدهم كي تصلح)</summary>
            {x.last_errors.map((e, i) => <div className="kv" key={i}><span>السطر <span className="num">{e.row}</span></span><span>{e.reason}</span></div>)}
          </details>
        )}
      </Step>

      <div className="actions">
        <button className="btn pri" type="submit">حفظ</button>
        <button className="btn" type="submit" formAction={syncNow} disabled={!x.url || !x.headers?.length}>زامن ذركا</button>
        <button className="btn sm bad" type="submit" formAction={deleteSource}>حذف</button>
      </div>
    </form>
  );
}
