import Flash from "@/components/Flash";
import { recordReturn } from "@/app/actions/branch";
import { requireRole } from "@/lib/auth";
import { loadProducts } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { shortDate, variantLabel } from "@/lib/format";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function BranchReturns({ searchParams }: { searchParams: Sp }) {
  const me = await requireRole("branch");
  const sb = await supabaseServer();
  const [products, { data: returns }] = await Promise.all([
    loadProducts(me.branch_id!),
    sb.from("returns").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  const vmap = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, `${p.name} · ${variantLabel(v)}`] as const)));

  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel">
        <h3>سجل كولي راجع من شركة التوصيل</h3>
        <p className="sub">اختار المنتج واللون والمقاس والكمية. ما تكتب والو. الاختيار من الكوليات المبعوثة يجي مع الطلبيات في المرحلة 2.</p>
        <form action={recordReturn} className="o-row">
          <label className="f" style={{ minWidth: 240 }}>المنتج واللون والمقاس
            <select name="variant_id" required defaultValue="">
              <option value="" disabled>— اختار —</option>
              {products.filter((p) => p.variants.length).map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} · {variantLabel(v)}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="f">الكمية
            <select name="qty" defaultValue="1">{Array.from({ length: 70 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <button className="btn pri" type="submit">سجل الرتور</button>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 12 }}>
        <h3>الرتور المسجل</h3>
        {returns?.length ? returns.map((r) => (
          <div className="kv" key={r.id}>
            <span>{shortDate(r.created_at)} · {vmap.get(r.variant_id) ?? "-"} × <span className="num">{r.qty}</span></span>
            <span className="chip ok">رجع للستوك</span>
          </div>
        )) : <div className="empty">ما سجلت حتى رتور.</div>}
      </section>
    </>
  );
}
