import { supabaseServer } from "@/lib/supabase/server";

type Row = { parcel_id: number; tracking: string | null; delivery_company: string | null; status: string; wilaya: string; commune: string | null; lines: string | null };

export default async function ToPack() {
  const sb = await supabaseServer();
  await sb.rpc("send_due_orders");
  const { data } = await sb.rpc("branch_parcels");
  const list = ((data ?? []) as Row[]).filter((r) => r.status === "sent");
  return (
    <>
      <div className="panel">
        {list.length ? list.map((r) => (
          <div className="kv" key={r.parcel_id}>
            <span><b>{r.lines}</b><div className="o-meta">{r.wilaya}{r.commune ? ` · ${r.commune}` : ""}</div></span>
            <span className="num chip ok">{r.tracking ?? "-"}</span>
          </div>
        )) : <div className="empty">ما كاين حتى طلبية للتغليف ذركا.</div>}
      </div>
      <p className="sub" style={{ marginTop: 10 }}>هذي الطلبيات وصلت لحساب شركة التوصيل تاعك. غلفها وسلمها. إذا الطلبية فيها منتجات من فروع أخرى، تشوف غير قطعك.</p>
    </>
  );
}
