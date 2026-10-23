import Link from "next/link";
import Flash from "@/components/Flash";
import { supabaseServer } from "@/lib/supabase/server";
import WaitList from "@/components/WaitList";
import { sendAll } from "@/app/actions/orders";
import { loadBranches, loadProducts, loadProfiles } from "@/lib/data";
import { confirmedCounts, loadCatalog, loadWaiting, PAY_PER_CONFIRM, sendDue } from "@/lib/orders";
import { fmt, variantLabel } from "@/lib/format";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Overview({ searchParams }: { searchParams: Sp }) {
  const sb = await supabaseServer();
  await sendDue();
  const [branches, confirmers, waiting, catalog, products, { data: alerts }, { data: pending }] = await Promise.all([
    loadBranches(),
    loadProfiles("confirmer"),
    loadWaiting(),
    loadCatalog(),
    loadProducts(),
    sb.from("stock_alerts").select("*").order("stock"),
    sb.from("products").select("name, branch_id").eq("pending", true),
  ]);
  const bname = new Map(branches.map((b) => [b.id, b.name]));
  const cname = new Map(confirmers.map((c) => [c.id, c.name]));
  const vbranch = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, p.branch_id] as const)));
  const counts = await confirmedCounts(confirmers);

  return (
    <>
      <Flash searchParams={searchParams} />
      {!!pending?.length && (
        <div className="note" style={{ marginBottom: 14, background: "var(--warn-bg)", color: "var(--warn)" }}>
          {pending.length} منتج جديد من الفروع ينتظر مراجعتك: {pending.map((p) => `${p.name} (${bname.get(p.branch_id)})`).join("، ")}. حط السعر في تبويب <Link href="/manager/products">"المنتجات والستوك"</Link>.
        </div>
      )}
      <div className="strip">
        <div><b className="num">{waiting.length}</b> طلبية في الانتظار قبل الإرسال لشركة التوصيل</div>
        <form action={sendAll} className="actions"><input type="hidden" name="back" value="/manager" />
          <button className="btn pri" type="submit" disabled={!waiting.length}>ابعث الكل الآن</button></form>
      </div>
      <div className="grid g2">
        <section className="panel">
          <h3>الطلبيات في الانتظار</h3>
          <WaitList orders={waiting} catalog={catalog} back="/manager" canEdit canSend
            meta={(o) => `أكدتها ${cname.get(o.confirmed_by ?? "") ?? "المدير"} · ${[...new Set(o.order_lines.map((l) => bname.get(vbranch.get(l.variant_id) ?? "")))].join(" + ")}`} />
        </section>
        <section className="panel">
          <h3>ألوان خلصت ولا قربت تخلص</h3>
          {alerts?.length ? alerts.map((a) => (
            <div className="kv" key={a.variant_id}>
              <span>{a.product_name} · {variantLabel(a)} <span className="o-meta">({bname.get(a.branch_id)})</span></span>
              <span className={`chip ${a.stock === 0 ? "bad" : "warn"} num`}>{a.stock}</span>
            </div>
          )) : <div className="empty">كل شيء مليح.</div>}
        </section>
        <section className="panel">
          <h3>السيولة عند الفروع</h3>
          {branches.map((b) => (
            <div className="kv" key={b.id}><span>{b.name}</span><b className="num">{fmt(b.liquidity)} دج</b></div>
          ))}
        </section>
        <section className="panel">
          <h3>مستحقات المؤكدات هذا الشهر</h3>
          {confirmers.length ? confirmers.map((c) => (
            <div className="kv" key={c.id}><span>{c.name}</span><b className="num">{fmt((counts.get(c.id) ?? 0) * PAY_PER_CONFIRM)} دج</b></div>
          )) : <div className="empty">ما زال ما زدت حتى مؤكدة. <Link href="/manager/confirmers">زيد من تبويب المؤكدات</Link>.</div>}
        </section>
      </div>
    </>
  );
}
