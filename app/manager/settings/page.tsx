import Flash from "@/components/Flash";
import { CreateUserForm, LockButton, PasswordForm } from "@/components/Accounts";
import { loadBranches, loadProfiles } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/types";
import { supabaseServer } from "@/lib/supabase/server";
import { addSource, deleteSource, saveLimits, saveSource, saveWait, setOrderSource } from "@/app/actions/settings";

type Source = { id: number; name: string; kind: "normal" | "abandoned"; url: string | null; columns: Record<string, string>;
  sync_minutes: number; active: boolean; last_sync_at: string | null };
type Set = { wait_minutes: number; order_source: "sheet" | "direct"; low_qty: number; big_qty: number; return_pct: number;
  min_sample: number; ret_low: number; ret_high: number };
// الأعمدة تختلف بين الشيت العادي والمتروك، لهذا كل شيت عندو الأعمدة تاعو
const COLS: [string, string][] = [["name", "الاسم"], ["phone", "الهاتف"], ["wilaya", "الولاية"], ["commune", "البلدية"], ["product", "المنتج"],
  ["qty", "الكمية"], ["price", "السعر"], ["date", "التاريخ"], ["notes", "ملاحظات"]];

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
            <div className="note" style={{ marginBottom: 12 }}>زيد قدما تحب من الشيتات. كل شيت عندو نوع: طلبات عادية، ولا طلبات متروكة (abandoned checkout) اللي تدخل لقائمة المؤكدات مع الباقي. المؤكدة ما تعرفش أنها متروكة، وأنت وحدك تشوف النوع. الأعمدة: اكتب اسم العمود كيما راهو في الشيت، ولا الحرف (A، B، ...).</div>
            {sources.map((x) => (
              <form action={saveSource} className="wait-item" key={x.id} style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="id" value={x.id} />
                <div className="o-row">
                  <label className="f" style={{ minWidth: 150 }}>الاسم<input type="text" name="name" defaultValue={x.name} /></label>
                  <label className="f">النوع<select name="kind" defaultValue={x.kind}><option value="normal">طلبات عادية</option><option value="abandoned">طلبات متروكة</option></select></label>
                  <label className="f" style={{ flex: 1, minWidth: 220 }}>رابط الشيت<input type="url" name="url" dir="ltr" defaultValue={x.url ?? ""} placeholder="https://docs.google.com/spreadsheets/..." pattern="https://docs\.google\.com/spreadsheets/.*" /></label>
                  <label className="f">كل (دقيقة)<input type="number" name="sync_minutes" min={1} max={1440} defaultValue={x.sync_minutes} /></label>
                </div>
                <div className="o-row">
                  {COLS.map(([k, l]) => (
                    <label className="f" key={k} style={{ width: 110 }}>{l}<input type="text" name={`col_${k}`} defaultValue={x.columns?.[k] ?? ""} /></label>
                  ))}
                </div>
                <div className="actions">
                  <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" name="active" defaultChecked={x.active} /> مفعل</label>
                  <span className={`chip ${x.url ? "warn" : ""}`}>{x.url ? "ينتظر الربط" : "بلا رابط"}</span>
                  <button className="btn sm pri" type="submit">حفظ</button>
                  <button className="btn sm bad" type="submit" formAction={deleteSource}>حذف</button>
                </div>
              </form>
            ))}
            <form action={addSource} style={{ marginTop: 12 }}><button className="btn" type="submit">زيد شيت</button></form>
            <div className="note" style={{ marginTop: 12 }}>السيرفر هو اللي يقرا الشيتات بإذن من حساب جوجل تاعك، وكل صف يتقرا مرة وحدة. <span className="chip warn">تجريبي</span> القراية مازال ما تربطتش: الإعدادات تتحفظ بصح، والطلبات تدخلها بيدك من تبويب "الطلبات" حتى نربطو.</div>
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
