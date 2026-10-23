import Flash from "@/components/Flash";
import { CreateUserForm, LockButton, PasswordForm } from "@/components/Accounts";
import { loadBranches, loadProfiles } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/types";
import { supabaseServer } from "@/lib/supabase/server";
import { addSource, deleteSource, readColumns, saveLimits, saveSource, saveWait, setOrderSource, syncNow } from "@/app/actions/settings";

type Source = { id: number; name: string; kind: "normal" | "abandoned"; url: string | null; columns: Record<string, string>;
  sync_minutes: number; active: boolean; last_sync_at: string | null; headers: string[]; preview: string[][]; start_row: number;
  last_status: "ok" | "warn" | "error" | null; last_message: string | null; imported_total: number; last_errors: { row: number; reason: string }[] };
const SA = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-DZ", { timeZone: "Africa/Algiers", dateStyle: "short", timeStyle: "short" }) : "-");
const STATUS: Record<string, [string, string]> = { ok: ["يخدم", "ok"], warn: ["يخدم، فيه سطور فيهم مشكل", "warn"], error: ["ما خدمش", "bad"] };
type Set = { wait_minutes: number; order_source: "sheet" | "direct"; low_qty: number; big_qty: number; return_pct: number;
  min_sample: number; ret_low: number; ret_high: number };
// الأعمدة تختلف بين الشيت العادي والمتروك، لهذا كل شيت عندو الأعمدة تاعو
const COLS: [string, string][] = [["ref", "رقم الطلبية"], ["date", "التاريخ"], ["name", "الاسم الكامل"], ["phone", "الهاتف"],
  ["address", "العنوان"], ["wilaya", "الولاية"], ["commune", "البلدية"], ["delivery_type", "نوع التوصيل"], ["product", "المنتج"],
  ["details", "التفاصيل (لون، مقاس)"], ["qty", "الكمية"], ["price", "سعر المنتج"], ["delivery_price", "سعر التوصيل"],
  ["discount", "التخفيض"], ["total", "السعر الكلي"], ["notes", "ملاحظات"]];

type Sp = Promise<{ ok?: string; err?: string }>;
const B = "/manager/settings";

export default async function Settings({ searchParams }: { searchParams: Sp }) {
  const sb = await supabaseServer();
  const [users, branches, { data: set }, { data: src }] = await Promise.all([
    loadProfiles(), loadBranches(),
    sb.from("settings").select("*").maybeSingle(),
    sb.from("sheet_sources").select("*").order("id"),
  ]);
  const S = (set ?? { wait_minutes: 10, order_source: "sheet", low_qty: 10, big_qty: 100, return_pct: 50, min_sample: 20, ret_low: 25, ret_high: 30 }) as Set;
  const sources = (src ?? []) as Source[];
  const bname = new Map(branches.map((b) => [b.id, b.name]));
  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>مصدر الطلبات</h3>
        <form action={setOrderSource} className="o-row" style={{ marginBottom: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input type="radio" name="order_source" value="sheet" defaultChecked={S.order_source === "sheet"} /> نقرا الطلبات من شيتات جوجل</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input type="radio" name="order_source" value="direct" defaultChecked={S.order_source === "direct"} /> بلا شيت (الطلبات تدخل مباشرة)</label>
          <button className="btn sm" type="submit">حفظ</button>
        </form>
        {S.order_source === "sheet" ? (
          <>
            <div className="note" style={{ marginBottom: 12 }}>زيد قدما تحب من الشيتات. كل شيت عندو نوع: طلبات عادية، ولا طلبات متروكة (abandoned checkout) اللي تدخل لقائمة المؤكدات مع الباقي. المؤكدة ما تعرفش أنها متروكة، وأنت وحدك تشوف النوع. كل شيت عندو الأعمدة تاعو.</div>
            <div className="note" style={{ marginBottom: 12 }}>
              {SA ? <>باش الموقع يقرا الشيت: افتح الشيت ← Partager / Share ← زيد هذا الإيميل كـ<b>Lecteur / Viewer</b>: <b className="num" dir="ltr">{SA}</b></>
                : <>حساب جوجل تاع الموقع مازال ما تربطش. حتى نربطوه، الموقع يقدر يقرا غير الشيت اللي مشارك بـ"أي واحد عندو الرابط يقدر يشوف".</>}
            </div>
            {sources.map((x) => {
              const st = x.last_status ? STATUS[x.last_status] : null;
              return (
              <form action={saveSource} className="panel" key={x.id} style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                <input type="hidden" name="id" value={x.id} />
                <div className="o-top">
                  <b>{x.name}</b>
                  {!x.url ? <span className="chip">بلا رابط</span> : st ? <span className={`chip ${st[1]}`}>{st[0]}</span> : <span className="chip warn">ما تزامنش بعد</span>}
                </div>
                <div className="o-row">
                  <label className="f" style={{ minWidth: 150 }}>الاسم<input type="text" name="name" defaultValue={x.name} /></label>
                  <label className="f">النوع<select name="kind" defaultValue={x.kind}><option value="normal">طلبات عادية</option><option value="abandoned">طلبات متروكة</option></select></label>
                  <label className="f" style={{ flex: 1, minWidth: 220 }}>رابط الشيت<input type="url" name="url" dir="ltr" defaultValue={x.url ?? ""} placeholder="https://docs.google.com/spreadsheets/..." pattern="https://docs\.google\.com/spreadsheets/.*" /></label>
                  <label className="f">كل (دقيقة)<input type="number" name="sync_minutes" min={1} max={1440} defaultValue={x.sync_minutes} /></label>
                  <label className="f">نبداو من السطر<input type="number" name="start_row" min={2} defaultValue={x.start_row} /></label>
                </div>
                <div className="actions">
                  <button className="btn" type="submit" formAction={readColumns}>اقرا الأعمدة</button>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" name="skip_old" /> ما تدخلش الطلبات اللي راهم في الشيت ذركا</label>
                </div>
                {x.headers?.length ? (
                  <>
                    <div className="o-meta">طابق كل خانة مع العمود تاعها في الشيت. الاسم والهاتف والمنتج لازمين. الأعمدة اللي ما تطابقهاش ما يضيعوش: يبانو في "أعمدة أخرى" في جدول الطلبيات. إذا طابقت "رقم الطلبية"، هو اللي يمنع التكرار.</div>
                    <div className="o-row">
                      {COLS.map(([k, l]) => (
                        <label className="f" key={k} style={{ width: 140 }}>{l}{["name", "phone", "product"].includes(k) ? " *" : ""}
                          <select name={`col_${k}`} defaultValue={x.columns?.[k] ?? ""}>
                            <option value="">— ما كاينش —</option>
                            {x.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                    {!!x.preview?.length && (
                      <div className="scroll"><table>
                        <thead><tr>{x.headers.map((h) => {
                          const m = Object.entries(x.columns ?? {}).filter(([, v]) => v === h);
                          return <th key={h}>{h}{m.length ? m.map(([k]) => <div key={k} className="chip ok">{COLS.find((c) => c[0] === k)?.[1]}</div>)
                            : <div className="chip">أعمدة أخرى</div>}</th>;
                        })}</tr></thead>
                        <tbody>{x.preview.map((r, i) => <tr key={i}>{x.headers.map((_, j) => <td key={j}>{r[j] ?? ""}</td>)}</tr>)}</tbody>
                      </table></div>
                    )}
                  </>
                ) : <div className="o-meta">حط الرابط واضغط "اقرا الأعمدة". الموقع يقرا السطر الأول تاع الشيت (أسماء الأعمدة) و3 سطور مثال.</div>}
                <div className="o-meta">
                  آخر تزامن: <span className="num">{when(x.last_sync_at)}</span> · {x.last_message ?? "-"} · دخلو في الكل: <b className="num">{x.imported_total}</b>
                </div>
                {!!x.last_errors?.length && (
                  <details><summary className="o-meta" style={{ cursor: "pointer" }}>{x.last_errors.length} سطر ما دخلش (يتعاود كل تزامن)</summary>
                    {x.last_errors.map((e, i) => <div className="kv" key={i}><span>السطر <span className="num">{e.row}</span></span><span>{e.reason}</span></div>)}
                  </details>
                )}
                <div className="actions">
                  <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" name="active" defaultChecked={x.active} /> مفعل (يتزامن وحدو)</label>
                  <button className="btn sm pri" type="submit">حفظ</button>
                  <button className="btn sm" type="submit" formAction={syncNow} disabled={!x.url || !x.headers?.length}>زامن ذركا</button>
                  <button className="btn sm bad" type="submit" formAction={deleteSource}>حذف</button>
                </div>
              </form>
              );
            })}
            <form action={addSource} style={{ marginTop: 12 }}><button className="btn" type="submit">زيد شيت</button></form>
            <div className="note" style={{ marginTop: 12 }}>السيرفر يقرا الشيتات المفعلة كل دقيقة، ويدخل غير اللي فات الوقت تاعهم. كل سطر يدخل مرة وحدة (البصمة: الاسم، الهاتف، المنتج، الكمية، والتاريخ). السطر اللي فيه مشكل (منتج ما لقيتوش، هاتف ماشي صحيح) ما يدخلش ويتعاود كل مرة حتى تصلحو.</div>
          </>
        ) : (
          <div className="note">بلا شيت، الطلبات تدخل مباشرة من الحملة (فورم صفحة الهبوط ولا فيسبوك Leads) للموقع، وما تحتاج حتى ورقة وسيطة. <span className="chip warn">تجريبي</span> هذا الربط مازال ما تبناش، ذركا تدخلها بيدك من تبويب "الطلبات".</div>
        )}
      </section>
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>وقت الانتظار قبل الإرسال</h3>
        <form action={saveWait} className="o-row">
          <label className="f">بالدقائق<input type="number" name="wait_minutes" min={0} max={1440} defaultValue={S.wait_minutes} /></label>
          <button className="btn pri" type="submit">حفظ</button>
        </form>
        <p className="sub" style={{ margin: "8px 0 0" }}>كل طلبية مؤكدة تستنى هذي المدة وبعدها تتبعث لشركة التوصيل. التبديل يخدم على اللي تتأكد من بعد، واللي راهي تستنى ما يتبدلش الوقت تاعها.</p>
      </section>
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>حدود الكمية</h3>
        <p className="sub" style={{ margin: "0 0 8px" }}>تستعملها اقتراحات تبويب "الكميات المتبقية" و"التحليل".</p>
        <form action={saveLimits} className="o-row">
          <label className="f">قليلة (أو أقل)<input type="number" name="low_qty" min={0} defaultValue={S.low_qty} /></label>
          <label className="f">كبيرة (أو أكثر)<input type="number" name="big_qty" min={0} defaultValue={S.big_qty} /></label>
          <label className="f">رتور افتراضي (%) كي ما تكفيش المعطيات<input type="number" name="return_pct" min={0} max={100} defaultValue={S.return_pct} /></label>
          <label className="f">أقل كوليات مغلقة باش نثق في نسبة المنتج<input type="number" name="min_sample" min={1} defaultValue={S.min_sample} /></label>
          <label className="f">رتور عادي من (%)<input type="number" name="ret_low" min={0} max={100} defaultValue={S.ret_low} /></label>
          <label className="f">رتور عادي إلى (%)<input type="number" name="ret_high" min={0} max={100} defaultValue={S.ret_high} /></label>
          <button className="btn pri" type="submit">حفظ</button>
        </form>
      </section>
      <section className="panel">
        <h3>الحسابات</h3>
        <p className="sub" style={{ margin: "0 0 8px" }}>انت وحدك تخلق الحسابات (الفروع، عمال الإرسال، ولا أي دور). المؤكدات والسويفي تقدر تزيدهم تاني من التبويبات تاعهم.</p>
        <CreateUserForm back={B} branches={branches} label="خلق الحساب" />
        <p className="o-meta" style={{ marginTop: 8 }}>نصيحة: دير كلمة سر مختلفة لكل واحد. إذا واحد خرج من الخدمة، بلوكيه وما تمسحوش، باش يبقى التاريخ تاعو.</p>
        <div className="scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>الاسم</th><th>الدور</th><th>الفرع</th><th>الإيميل</th><th>الحالة</th><th>كلمة سر جديدة</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td><td>{ROLE_LABEL[u.role]}</td><td>{u.branch_id ? bname.get(u.branch_id) : "-"}</td>
                  <td className="num">{u.email}</td><td><LockButton u={u} back={B} /></td><td><PasswordForm u={u} back={B} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
