import Flash from "@/components/Flash";
import VariantChips from "@/components/VariantChips";
import { correctStock, createProduct, managerAddStock, saveProduct } from "@/app/actions/manager";
import { loadBranches, loadProducts } from "@/lib/data";
import { shortDate, variantLabel } from "@/lib/format";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Products({ searchParams }: { searchParams: Sp }) {
  const [branches, products] = await Promise.all([loadBranches(), loadProducts()]);
  const br = new Map(branches.map((b) => [b.id, b]));

  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="panel scroll">
        <table>
          <thead><tr><th>المنتج</th><th>السعر</th><th>الفرع المربوط</th><th>الستوك حسب اللون</th></tr></thead>
          <tbody>
            {products.length ? products.map((p) => {
              const last = p.variants.map((v) => v.counted_at).filter(Boolean).sort().at(-1) ?? null;
              const fid = `p-${p.id}`;
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b> {p.pending && <span className="chip warn">منتج جديد من الفرع</span>}
                    <div className="o-meta">آخر عد: {shortDate(last)}</div>
                    <form id={fid} action={saveProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="name" value={p.name} />
                      <input type="hidden" name="min_qty" value={p.min_qty} />
                      {p.active && <input type="hidden" name="active" value="on" />}
                    </form>
                  </td>
                  <td className="num">
                    <div className="o-row" style={{ flexWrap: "nowrap" }}>
                      <input form={fid} type="number" name="price" min={0} defaultValue={p.price} aria-label="السعر" />
                      <button form={fid} className={`btn sm ${p.pending ? "pri" : ""}`} type="submit">{p.pending ? "اعتمد" : "حفظ"}</button>
                    </div>
                  </td>
                  <td>
                    <select form={fid} name="branch_id" defaultValue={p.branch_id} aria-label="الفرع">
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <div className="o-meta">{br.get(p.branch_id)?.delivery_company ?? ""}</div>
                  </td>
                  <td>
                    <VariantChips variants={p.variants} min={p.min_qty} />
                    {!!p.variants.length && (
                      <details style={{ marginTop: 6 }}>
                        <summary className="o-meta" style={{ cursor: "pointer" }}>تصحيح الستوك</summary>
                        <form action={correctStock} className="o-row" style={{ marginTop: 8 }}>
                          <select name="variant_id" aria-label="اللون والمقاس">{p.variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)} ({v.stock})</option>)}</select>
                          <input type="number" name="delta" required placeholder="+ / −" aria-label="زيد ولا نقص" />
                          <input type="text" name="note" required placeholder="السبب" aria-label="السبب" />
                          <button className="btn sm" type="submit">صحح</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={4} className="empty">ما كاين حتى منتج. الفروع يزيدو السلعة من "عد الستوك اليومي"، ولا زيد انت من لتحت.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 10 }}>كل منتج مربوط بفرع واحد. كي تتأكد الطلبية، تروح للفرع هذا وشركة التوصيل تاعو.</p>

      <details className="panel" style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>زيد منتج ولا سلعة بيدك</summary>
        <div className="grid g2" style={{ marginTop: 12 }}>
          <form action={createProduct} className="o-row">
            <label className="f">منتج جديد<input type="text" name="name" required /></label>
            <label className="f">الفرع
              <select name="branch_id" required defaultValue="">
                <option value="" disabled>— اختار —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="f">السعر (دج)<input type="number" name="price" min={0} required /></label>
            <input type="hidden" name="min_qty" value={3} />
            <button className="btn pri" type="submit">زيد</button>
          </form>
          <form action={managerAddStock} className="o-row">
            <label className="f">الفرع
              <select name="branch_id" required defaultValue="">
                <option value="" disabled>— اختار —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="f">المنتج<input type="text" name="product_name" list="all-products" required /></label>
            <datalist id="all-products">{[...new Set(products.map((p) => p.name))].map((n) => <option key={n} value={n} />)}</datalist>
            <label className="f">اللون<input type="text" name="color" required /></label>
            <label className="f">المقاس<input type="text" name="size" required /></label>
            <label className="f">الكمية<input type="number" name="qty" min={1} defaultValue={1} required /></label>
            <button className="btn pri" type="submit">زيد للستوك</button>
          </form>
        </div>
      </details>
    </>
  );
}
