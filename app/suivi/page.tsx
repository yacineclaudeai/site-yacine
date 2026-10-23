import Flash from "@/components/Flash";
import Header from "@/components/Header";
import { blacklistOrder, setFollow } from "@/app/actions/orders";
import { requireRole } from "@/lib/auth";
import { FOLLOW, sendDue } from "@/lib/orders";
import { supabaseServer } from "@/lib/supabase/server";

type Sp = Promise<{ ok?: string; err?: string }>;
type Row = { parcel_id: number; order_id: number; tracking: string | null; delivery_company: string | null; customer_name: string;
  phone: string; wilaya: string; commune: string | null; lines: string | null; follow: string | null; stub: boolean };

// السويفي: كوليات شركة التوصيل تاع فرعو برك. الحالة النهائية تجي من شركة التوصيل.
export default async function Suivi({ searchParams }: { searchParams: Sp }) {
  const me = await requireRole("suivi");
  await sendDue();
  const sb = await supabaseServer();
  const [{ data }, { data: branch }] = await Promise.all([
    sb.rpc("suivi_parcels"),
    sb.from("branches").select("name, delivery_company").maybeSingle(),
  ]);
  const list = (data ?? []) as Row[];
  return (
    <>
      <Header me={me} />
      <main>
        <h2>{me.name}</h2>
        <p className="sub">تتبع كوليات {branch?.delivery_company ?? "شركة التوصيل"}. تشوف غير كوليات فرعك.</p>
        <Flash searchParams={searchParams} />
        <div className="panel">
          {list.length ? list.map((r) => (
            <div className="wait-item" key={r.parcel_id}>
              <div>
                <b>{r.customer_name}</b> <span className="num chip ok">{r.tracking ?? "-"}</span>{r.stub && <span className="chip warn">تجريبي</span>}
                <div className="o-meta">{r.lines} · {r.wilaya}{r.commune ? ` · ${r.commune}` : ""}</div>
                <div className="o-row" style={{ marginTop: 6 }}>
                  <a className="btn sm" href={`tel:${r.phone.replace(/\D/g, "")}`}>اتصال</a>
                  <span className="num" dir="ltr">{r.phone}</span>
                  <form action={blacklistOrder}>
                    <input type="hidden" name="back" value="/suivi" /><input type="hidden" name="id" value={r.order_id} />
                    <input type="hidden" name="reason" value={r.follow ?? FOLLOW[0]} />
                    <button className="btn sm bad" type="submit">حط الرقم في ليست نوار</button>
                  </form>
                </div>
              </div>
              <form action={setFollow} className="o-row">
                <input type="hidden" name="id" value={r.parcel_id} />
                <label className="f">آخر متابعة
                  <select name="follow" defaultValue={r.follow ?? FOLLOW[0]}>{FOLLOW.map((f) => <option key={f}>{f}</option>)}</select>
                </label>
                <button className="btn sm" type="submit">حفظ</button>
              </form>
            </div>
          )) : <div className="empty">ما كاين حتى كولي في التوصيل.</div>}
        </div>
        <p className="sub" style={{ marginTop: 10 }}>الحالة النهائية (متسلمة ولا راجعة) تجي من شركة التوصيل أوتوماتيك كي نربطوها. هنا تسجل غير متابعتك.</p>
      </main>
    </>
  );
}
