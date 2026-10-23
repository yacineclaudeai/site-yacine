import { requireRole } from "@/lib/auth";
import { linesText, loadOrders } from "@/lib/orders";

export default async function Sent() {
  const me = await requireRole("confirmer");
  const list = (await loadOrders(["sent", "returned"])).filter((o) => o.confirmed_by === me.id);
  return (
    <div className="panel">
      {list.length ? list.map((o) => (
        <div className="kv" key={o.id}><span>{o.customer_name} · {linesText(o)}</span><span className="chip ok">أُرسلت</span></div>
      )) : <div className="empty">ما كاين حتى طلبية مرسلة.</div>}
    </div>
  );
}
