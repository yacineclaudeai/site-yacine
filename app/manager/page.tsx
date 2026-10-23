import Link from "next/link";
import Flash from "@/components/Flash";
import { supabaseServer } from "@/lib/supabase/server";
import { loadBranches } from "@/lib/data";
import { dzd, variantLabel } from "@/lib/format";
import { BRANCH_TYPE_LABEL } from "@/lib/types";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function ManagerHome({ searchParams }: { searchParams: Sp }) {
  const sb = await supabaseServer();
  const [branches, { data: balances }, { data: alerts }, { count: pending }] = await Promise.all([
    loadBranches(),
    sb.from("branch_balances").select("*"),
    sb.from("stock_alerts").select("*").order("stock"),
    sb.from("products").select("id", { count: "exact", head: true }).eq("pending", true),
  ]);
  const bal = new Map((balances ?? []).map((b) => [b.branch_id, b]));
  const bname = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <>
      <h2>لوحة المدير</h2>
      <p className="sub">الفروع، الستوك، والدراهم اللي عند كل فرع.</p>
      <Flash searchParams={searchParams} />
      {!!pending && (
        <div className="note" style={{ marginBottom: 14, background: "var(--warn-bg)", color: "var(--warn)" }}>
          {pending} منتج جديد من الفروع ينتظر السعر تاعك. <Link href="/manager/products">روح للمنتجات</Link>
        </div>
      )}
      <div className="grid g2">
        <section className="panel">
          <h3>الدراهم اللي عند الفروع</h3>
          {branches.map((b) => (
            <div className="kv" key={b.id}>
              <span>{b.name}<div className="o-meta">{BRANCH_TYPE_LABEL[b.type]} · سيولة مصرح بيها {dzd(b.liquidity)}</div></span>
              <b className="num">{dzd(bal.get(b.id)?.held ?? 0)}</b>
            </div>
          ))}
        </section>
        <section className="panel">
          <h3>ستوك قليل ({alerts?.length ?? 0})</h3>
          {alerts?.length ? alerts.map((a) => (
            <div className="kv" key={a.variant_id}>
              <span>{a.product_name} · {variantLabel(a)}<div className="o-meta">{bname.get(a.branch_id)}</div></span>
              <span className={`chip ${a.stock === 0 ? "bad" : "warn"}`}>{a.stock === 0 ? "خلاص" : `بقاو ${a.stock}`}</span>
            </div>
          )) : <div className="empty">الستوك مليح في كل الفروع.</div>}
        </section>
      </div>
    </>
  );
}
