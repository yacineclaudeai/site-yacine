import Flash from "@/components/Flash";
import PiecesPicker from "@/components/PiecesPicker";
import { StatusChip } from "@/components/OrderBits";
import { blacklistOrder, confirmOrder, markOrder } from "@/app/actions/orders";
import { loadCatalog, loadOrders, QUEUE } from "@/lib/orders";

type Sp = Promise<{ ok?: string; err?: string }>;
const digits = (p: string) => p.replace(/\D/g, "");
const wa = (p: string) => { const d = digits(p); return d.startsWith("0") ? "213" + d.slice(1) : d; };

export default async function Queue({ searchParams }: { searchParams: Sp }) {
  const [orders, catalog] = await Promise.all([loadOrders(QUEUE), loadCatalog()]);
  const list = orders.sort((a, b) => a.id - b.id);
  return (
    <>
      <Flash searchParams={searchParams} />
      {list.length ? (
        <div className="grid g2">
          {list.map((o) => (
            <article className="order" key={o.id}>
              <div className="o-top"><strong>{o.customer_name}</strong><StatusChip s={o.status} /></div>
              <div className="o-meta">{o.wilaya}{o.commune ? ` · ${o.commune}` : ""}</div>
              <div className="o-row">
                <a className="btn sm" href={`tel:${digits(o.phone)}`}>اتصال</a>
                <a className="btn sm" href={`https://wa.me/${wa(o.phone)}`} target="_blank" rel="noopener">واتساب</a>
                <span className="num" dir="ltr">{o.phone}</span>
              </div>
              <div className="o-row"><b>طلب الزبونة:</b> {o.product_name} × {o.qty}</div>
              <form action={confirmOrder} style={{ display: "grid", gap: 10 }}>
                <input type="hidden" name="id" value={o.id} />
                <PiecesPicker catalog={catalog} defaultPid={o.product_id} qty={o.qty} mode="confirm" />
                <div className="actions"><button className="btn ok" type="submit" disabled={!catalog.length}>تأكيد</button></div>
              </form>
              <div className="actions">
                {([["noans", "ما جاوبش", ""], ["postpone", "تأجيل", ""], ["dup", "مكررة", ""], ["cancel", "إلغاء", "bad"]] as const).map(([a, l, c]) => (
                  <form action={markOrder} key={a}>
                    <input type="hidden" name="id" value={o.id} /><input type="hidden" name="action" value={a} />
                    <button className={`btn ${c}`} type="submit">{l}</button>
                  </form>
                ))}
                <form action={blacklistOrder}>
                  <input type="hidden" name="id" value={o.id} /><input type="hidden" name="reason" value="من المؤكدة عند التأكيد" />
                  <button className="btn bad" type="submit">ليست نوار</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty">خلصت كل الطلبات. بارك الله فيك.</div>}
    </>
  );
}
