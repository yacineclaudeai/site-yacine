import Flash from "@/components/Flash";
import { StatusChip } from "@/components/OrderBits";
import { createOrder } from "@/app/actions/orders";
import { loadBranches, loadProducts, loadProfiles } from "@/lib/data";
import { loadOrders, phoneKey, sendDue, type Order } from "@/lib/orders";
import { supabaseServer } from "@/lib/supabase/server";

type Sp = Promise<{ ok?: string; err?: string }>;
type Parcel = { order_id: number; branch_id: string; tracking: string | null; delivery_company: string | null; stub: boolean };

export default async function Orders({ searchParams }: { searchParams: Sp }) {
  await sendDue();
  const sb = await supabaseServer();
  const [orders, branches, products, people, { data: meta }, { data: parcels }, { data: bl }] = await Promise.all([
    loadOrders(), loadBranches(), loadProducts(), loadProfiles(),
    sb.from("order_meta").select("order_id, kind, source"),
    sb.from("parcels").select("order_id, branch_id, tracking, delivery_company, stub"),
    sb.from("blacklist").select("phone_key"),
  ]);
  const blocked = new Set((bl ?? []).map((b) => b.phone_key as string));
  const kind = new Map((meta ?? []).map((m) => [m.order_id as number, m.kind as string]));
  const br = new Map(branches.map((b) => [b.id, b]));
  const pname = new Map(people.map((p) => [p.id, p.name]));
  const pbranch = new Map(products.map((p) => [p.id, p.branch_id]));
  const vbranch = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, p.branch_id] as const)));
  const parcelsOf = (id: number) => ((parcels ?? []) as Parcel[]).filter((p) => p.order_id === id);
  // الفروع: من القطع إذا تأكدت، وإلا من المنتج اللي طلبتو
  const branchIds = (o: Order) => [...new Set(o.order_lines.length
    ? o.order_lines.map((l) => vbranch.get(l.variant_id) ?? "")
    : [pbranch.get(o.product_id ?? "") ?? ""])].filter(Boolean);

  const stats = (["normal", "abandoned"] as const).map((k) => {
    const L = orders.filter((o) => (kind.get(o.id) ?? "normal") === k);
    const conf = L.filter((o) => ["wait", "sent", "returned"].includes(o.status)).length;
    return { k, label: k === "normal" ? "عادية" : "متروكة", n: L.length, conf, rate: L.length ? `${Math.round((conf * 100) / L.length)}%` : "-",
      sent: L.filter((o) => o.status === "sent").length, ret: L.filter((o) => o.status === "returned").length };
  });

  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>عادية ومتروكة</h3>
        <div className="scroll"><table>
          <thead><tr><th>النوع</th><th>الطلبات</th><th>المؤكدة</th><th>نسبة التأكيد</th><th>في التوصيل</th><th>الراجعة</th></tr></thead>
          <tbody>{stats.map((s) => (
            <tr key={s.k}><td>{s.label}</td><td className="num">{s.n}</td><td className="num">{s.conf}</td><td className="num">{s.rate}</td><td className="num">{s.sent}</td><td className="num">{s.ret}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="sub" style={{ margin: "8px 0 0" }}>التسليم النهائي يجي من شركة التوصيل أوتوماتيك. المؤكدات ما يشوفوش هذا الفرق.</p>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>زيد طلبية بيدك</h3>
        <form action={createOrder} className="o-row">
          <label className="f">اسم الزبون<input type="text" name="name" required /></label>
          <label className="f">الهاتف<input type="tel" name="phone" required dir="ltr" /></label>
          <label className="f">الولاية<input type="text" name="wilaya" required /></label>
          <label className="f">البلدية<input type="text" name="commune" /></label>
          <label className="f">المنتج
            <select name="product_id" required defaultValue="">
              <option value="" disabled>— اختار —</option>
              {products.filter((p) => !p.pending && p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="f">الكمية<select name="qty" defaultValue="1">{Array.from({ length: 10 }, (_, i) => <option key={i}>{i + 1}</option>)}</select></label>
          <label className="f">النوع<select name="kind" defaultValue="normal"><option value="normal">عادية</option><option value="abandoned">متروكة</option></select></label>
          <button className="btn pri" type="submit">زيد</button>
        </form>
        <p className="sub" style={{ margin: "8px 0 0" }}>الطلبيات تجي من الشيتات أوتوماتيك كي نربطوها (نستناو الروابط والأعمدة). ذركا تقدر تدخلها بيدك.</p>
      </section>

      <div className="panel scroll">
        <table>
          <thead><tr><th>الزبون</th><th>المنتج</th><th>اللون</th><th>الفرع وشركة التوصيل</th><th>النوع</th><th>الحالة</th><th>أكدتها</th><th>التتبع</th></tr></thead>
          <tbody>
            {orders.length ? orders.map((o) => {
              const ps = parcelsOf(o.id);
              return (
                <tr key={o.id}>
                  <td>{o.customer_name}<div className="o-meta">{o.wilaya}</div></td>
                  <td>{o.order_lines.length ? [...new Set(o.order_lines.map((l) => l.product_name))].join(" + ") : o.product_name} × {o.qty}</td>
                  <td>{o.order_lines.length ? o.order_lines.map((l) => `${l.color} / ${l.size}`).join(" + ") : "-"}</td>
                  <td>{branchIds(o).map((id) => (
                    <div key={id}>{br.get(id)?.name}<div className="o-meta">{br.get(id)?.delivery_company ?? "-"}</div></div>
                  ))}</td>
                  <td>{kind.get(o.id) === "abandoned" ? <span className="chip warn">متروكة</span> : "عادية"}</td>
                  <td><StatusChip s={o.status} />{blocked.has(phoneKey(o.phone)) && <> <span className="chip bad">ليست نوار</span></>}</td>
                  <td>{o.confirmed_by ? pname.get(o.confirmed_by) ?? "-" : "-"}</td>
                  <td className="num">{ps.map((p) => p.tracking).join(" · ") || "-"}
                    {ps.some((p) => p.stub) && <div><span className="chip warn">تجريبي</span></div>}
                    {o.status === "sent" && <div className="o-meta">أرسلها: {o.sent_by ? pname.get(o.sent_by) ?? "-" : "تلقائي"}</div>}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="empty">ما كاين حتى طلبية.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
