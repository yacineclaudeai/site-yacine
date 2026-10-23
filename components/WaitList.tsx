import Countdown from "./Countdown";
import PiecesPicker from "./PiecesPicker";
import { cancelWaiting, sendNow, updateLines } from "@/app/actions/orders";
import { linesText, type CatalogProduct, type Order, type Route } from "@/lib/orders";

// الطلبيات في الانتظار. المؤكدة: تبدل ولا تلغي. المدير: زيد ابعث الآن. عامل الإرسال: ابعث الآن برك.
export default function WaitList({ orders, catalog, back, canEdit, canSend, meta, routes }: {
  orders: Order[]; catalog: CatalogProduct[]; back: string; canEdit: boolean; canSend: boolean;
  meta?: (o: Order) => string; routes?: Map<number, Route[]>; // routes: المدير وعامل الإرسال برك
}) {
  if (!orders.length) return <div className="empty">ما كاين حتى طلبية في الانتظار.</div>;
  return (
    <>
      {orders.map((o) => {
        const held: Record<string, number> = {};
        o.order_lines.forEach((l) => { held[l.variant_id] = (held[l.variant_id] ?? 0) + 1; });
        const pid = (vid: string) => catalog.find((p) => p.variants.some((v) => v.id === vid))?.id ?? "";
        return (
          <div className="wait-item" key={o.id}>
            <div className="o-row">
              {o.send_at && <Countdown sendAt={o.send_at} total={o.wait_seconds ?? 600} />}
              <div><b>{o.customer_name}</b><div className="o-meta">{linesText(o)}{meta ? ` · ${meta(o)}` : ""}</div>
                {routes && (
                  <div className="actions" style={{ marginTop: 4 }}>
                    {(routes.get(o.id) ?? []).map((r) => (
                      <span key={r.branch_name} className={`chip ${r.delivery_company ? "" : "bad"}`} title={r.has_key ? "الـAPI مربوط" : "الـAPI ما تربطش"}>
                        📦 {r.branch_name} ← {r.delivery_company ?? "بلا شركة توصيل!"}{r.has_key ? "" : " (بلا API)"}
                      </span>
                    ))}
                    {(routes.get(o.id)?.length ?? 0) > 1 && <span className="o-meta">{routes.get(o.id)!.length} كوليات</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="actions">
              {canSend && (
                <form action={sendNow}><input type="hidden" name="back" value={back} /><input type="hidden" name="id" value={o.id} />
                  <button className="btn pri" type="submit">ابعث الآن</button></form>
              )}
              {canEdit && (
                <form action={cancelWaiting}><input type="hidden" name="back" value={back} /><input type="hidden" name="id" value={o.id} />
                  <button className="btn bad" type="submit">إلغاء</button></form>
              )}
            </div>
            {canEdit && (
              <details style={{ width: "100%" }}>
                <summary className="o-meta" style={{ cursor: "pointer" }}>بدل القطع (اللون، المقاس، العدد)</summary>
                <form action={updateLines} style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  <input type="hidden" name="back" value={back} /><input type="hidden" name="id" value={o.id} />
                  <PiecesPicker catalog={catalog} held={held} mode="edit"
                    initial={o.order_lines.map((l) => ({ pid: pid(l.variant_id), vid: l.variant_id }))} />
                  <div><button className="btn" type="submit">حفظ التبديل</button></div>
                </form>
              </details>
            )}
          </div>
        );
      })}
    </>
  );
}
