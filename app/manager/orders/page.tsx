import Flash from "@/components/Flash";
import { StatusChip } from "@/components/OrderBits";
import { createOrder } from "@/app/actions/orders";
import { loadBranches, loadProducts, loadProfiles } from "@/lib/data";
import { loadOrdersFiltered, ORDERS_LIMIT, phoneKey, sendDue, STATUS_GROUPS, type Order, type OrderStatus } from "@/lib/orders";
import { supabaseServer } from "@/lib/supabase/server";

type Sp = Promise<{ ok?: string; err?: string; src?: string; st?: string; q?: string; from?: string; to?: string }>;
type Meta = { order_id: number; kind: string; source: string | null; sheet_ref: string | null; sheet_date: string | null; extra: string | null };
const STATUS_L: Record<string, string> = { new: "جديدة", failed1: "فاشلة 1", failed2: "فاشلة 2", failed3: "فاشلة 3", postponed: "مؤجلة",
  dup: "مكررة", cancelled: "ملغية", wait: "في الانتظار", sent: "في التوصيل", returned: "راجعة" };
const da = (n: number | null) => (n == null ? "-" : Number(n).toLocaleString("fr-DZ"));
const dayDz = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Algiers" });
const when = (iso: string) => new Date(iso).toLocaleString("fr-DZ", { timeZone: "Africa/Algiers", dateStyle: "short", timeStyle: "short" });
type Parcel = { order_id: number; branch_id: string; tracking: string | null; delivery_company: string | null; stub: boolean };

export default async function Orders({ searchParams }: { searchParams: Sp }) {
  const sp = await searchParams;
  await sendDue();
  const sb = await supabaseServer();
  const st = sp.st ?? "";
  const statuses = STATUS_GROUPS[st]?.statuses ?? (st in STATUS_L ? [st as OrderStatus] : undefined);
  const [{ list: orders, count }, branches, products, people, { data: bl }] = await Promise.all([
    loadOrdersFiltered({ statuses, from: sp.from, to: sp.to, q: sp.q }), loadBranches(), loadProducts(), loadProfiles(),
    sb.from("blacklist").select("phone_key"),
  ]);
  const ids = orders.map((o) => o.id);
  const [{ data: meta }, { data: parcels }] = ids.length ? await Promise.all([
    sb.from("order_meta").select("order_id, kind, source, sheet_ref, sheet_date, extra").in("order_id", ids),
    sb.from("parcels").select("order_id, branch_id, tracking, delivery_company, stub").in("order_id", ids),
  ]) : [{ data: [] }, { data: [] }];
  const blocked = new Set((bl ?? []).map((b) => b.phone_key as string));
  const metaOf = new Map(((meta ?? []) as Meta[]).map((m) => [m.order_id, m]));
  const kind = new Map([...metaOf.values()].map((m) => [m.order_id, m.kind]));
  // تاريخ الهاتف في الموقع: قداش من طلبية، قداش تبعثت، قداش رجعت
  const hist = new Map<string, { n: number; sent: number; ret: number }>();
  for (const o of orders) {
    const h = hist.get(phoneKey(o.phone)) ?? { n: 0, sent: 0, ret: 0 };
    h.n++; if (o.status === "sent") h.sent++; if (o.status === "returned") h.ret++;
    hist.set(phoneKey(o.phone), h);
  }
  const srcName = (id: number) => metaOf.get(id)?.source ?? "إدخال يدوي";
  const sourcesList = [...new Set(orders.map((o) => srcName(o.id)))];
  const shown = orders.filter((o) => !sp.src || srcName(o.id) === sp.src);
  // روابط سريعة للمدة: تحافظ على باقي الفلتر
  const today = new Date(), ago = (n: number) => dayDz(new Date(today.getTime() - n * 86400_000));
  const link = (patch: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ src: sp.src ?? "", st, q: sp.q ?? "",
    from: sp.from ?? "", to: sp.to ?? "", ...patch }).filter(([, v]) => v)).toString();
  const periods: [string, string, string][] = [["اليوم", ago(0), ago(0)], ["البارح", ago(1), ago(1)], ["7 أيام", ago(6), ago(0)],
    ["30 يوم", ago(29), ago(0)], ["هذا الشهر", ago(0).slice(0, 8) + "01", ago(0)], ["كل الوقت", "", ""]];
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
        <h3>عادية ومتروكة <span className="o-meta">(حسب الفلتر)</span></h3>
        <div className="scroll"><table>
          <thead><tr><th>النوع</th><th>الطلبات</th><th>المؤكدة</th><th>نسبة التأكيد</th><th>في التوصيل</th><th>الراجعة</th></tr></thead>
          <tbody>{stats.map((s) => (
            <tr key={s.k}><td>{s.label}</td><td className="num">{s.n}</td><td className="num">{s.conf}</td><td className="num">{s.rate}</td><td className="num">{s.sent}</td><td className="num">{s.ret}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="sub" style={{ margin: "8px 0 0" }}>التسليم النهائي يجي من شركة التوصيل أوتوماتيك. المؤكدات ما يشوفوش هذا الفرق.</p>
      </section>

      <details className="panel" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ زيد طلبية بيدك</summary>
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
        <p className="sub" style={{ margin: "8px 0 0" }}>الطلبيات تجي من الشيتات وحدها (الإعدادات ← مصدر الطلبات). هنا تزيد وحدة بيدك.</p>
      </details>

      <form className="panel" style={{ marginBottom: 10, display: "grid", gap: 10 }}>
        <div className="o-row">
          <label className="f">الحالة<select name="st" defaultValue={st}>
            <option value="">الكل</option>
            <optgroup label="مجموعات">{Object.entries(STATUS_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</optgroup>
            <optgroup label="حالة وحدة">{Object.entries(STATUS_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
          </select></label>
          <label className="f">من<input type="date" name="from" defaultValue={sp.from ?? ""} /></label>
          <label className="f">إلى<input type="date" name="to" defaultValue={sp.to ?? ""} /></label>
          <label className="f">المصدر<select name="src" defaultValue={sp.src ?? ""}><option value="">الكل</option>
            {sourcesList.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="f" style={{ flex: 1, minWidth: 180 }}>بحث<input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="اسم، هاتف، ولاية، منتج..." /></label>
          <button className="btn pri" type="submit">صفي</button>
          <a className="btn" href="?">مسح الفلتر</a>
        </div>
        <div className="actions">
          {Object.entries({ "": "الكل", ...Object.fromEntries(Object.entries(STATUS_GROUPS).map(([k, g]) => [k, g.label.split(" (")[0]])) }).map(([k, l]) => (
            <a key={k || "all"} href={link({ st: k })} className={`chip ${st === k ? "ok" : ""}`}>{l}</a>
          ))}
          <span className="o-meta">·</span>
          {periods.map(([l, f, t]) => (
            <a key={l} href={link({ from: f, to: t })} className={`chip ${(sp.from ?? "") === f && (sp.to ?? "") === t ? "ok" : ""}`}>{l}</a>
          ))}
          <span className="o-meta"><b className="num">{shown.length}</b> طلبية{count > ORDERS_LIMIT ? ` (من ${count}، نوريو آخر ${ORDERS_LIMIT}: ضيق الفلتر)` : ""}</span>
        </div>
      </form>

      <div className="panel scroll">
        <table className="otable">
          <thead><tr>
            <th>المصدر</th><th>رقم الطلبية</th><th>التاريخ</th><th>الاسم الكامل</th><th>الهاتف</th><th>الحالة</th><th>العنوان</th>
            <th>الولاية</th><th>البلدية</th><th>نوع التوصيل</th><th>المنتج</th><th>الكمية</th><th>سعر المنتج</th><th>سعر التوصيل</th>
            <th>التخفيض</th><th>السعر الكلي</th><th>ملاحظات</th><th>التفاصيل</th><th>أعمدة أخرى</th><th>أكدتها</th><th>الفرع والتتبع</th>
          </tr></thead>
          <tbody>
            {shown.length ? shown.map((o) => {
              const ps = parcelsOf(o.id), m = metaOf.get(o.id), h = hist.get(phoneKey(o.phone));
              const total = o.total_price ?? (o.unit_price != null ? o.unit_price * o.qty + (o.delivery_price ?? 0) - (o.discount ?? 0) : null);
              return (
                <tr key={o.id} className={m?.kind === "abandoned" ? "row-warn" : undefined}>
                  <td>{m?.source ?? "إدخال يدوي"}{m?.kind === "abandoned" && <div><span className="chip warn">متروكة</span></div>}</td>
                  <td className="num">{m?.sheet_ref ?? `#${o.id}`}</td>
                  <td className="num">{m?.sheet_date ?? when(o.created_at)}</td>
                  <td>{o.customer_name}</td>
                  <td className="num" dir="ltr">{o.phone}
                    {h && h.n > 1 && <div><span className="chip" title="طلبيات بنفس الرقم في الموقع: الكل · في التوصيل · راجعة">{h.n} · {h.sent}✓ · {h.ret}↩</span></div>}
                  </td>
                  <td><StatusChip s={o.status} />{blocked.has(phoneKey(o.phone)) && <> <span className="chip bad">ليست نوار</span></>}</td>
                  <td>{o.address ?? "-"}</td>
                  <td>{o.wilaya}</td>
                  <td>{o.commune ?? "-"}</td>
                  <td>{o.delivery_type ?? "-"}</td>
                  <td>{o.order_lines.length ? [...new Set(o.order_lines.map((l) => l.product_name))].join(" + ") : o.product_name}
                    {!o.product_id && !o.order_lines.length && <div><a className="chip warn" href="/manager/settings">منتج ما تربطش</a></div>}
                    {!!o.order_lines.length && <div className="o-meta">{o.order_lines.map((l) => `${l.color} / ${l.size}`).join(" + ")}</div>}</td>
                  <td className="num">{o.qty}</td>
                  <td className="num">{da(o.unit_price)}</td>
                  <td className="num">{da(o.delivery_price)}</td>
                  <td className="num">{da(o.discount)}</td>
                  <td className="num"><b>{da(total)}</b></td>
                  <td className="cell-long" title={o.notes ?? ""}><div className="clamp">{o.notes ?? "-"}</div></td>
                  <td className="cell-long" title={o.details ?? ""}><div className="clamp">{o.details ?? "-"}</div></td>
                  <td className="cell-long o-meta" title={m?.extra ?? ""}><div className="clamp">{m?.extra ?? "-"}</div></td>
                  <td>{o.confirmed_by ? pname.get(o.confirmed_by) ?? "-" : "-"}</td>
                  <td>{branchIds(o).map((id) => (
                      <div key={id}>{br.get(id)?.name}<div className="o-meta">{br.get(id)?.delivery_company ?? "-"}</div></div>
                    ))}
                    <span className="num">{ps.map((p) => p.tracking).join(" · ")}</span>
                    {ps.some((p) => p.stub) && <div><span className="chip warn">تجريبي</span></div>}
                    {o.status === "sent" && <div className="o-meta">أرسلها: {o.sent_by ? pname.get(o.sent_by) ?? "-" : "تلقائي"}</div>}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={21} className="empty">ما كاين حتى طلبية.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
