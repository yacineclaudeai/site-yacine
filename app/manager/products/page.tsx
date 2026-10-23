import Flash from "@/components/Flash";
import VariantChips from "@/components/VariantChips";
import { correctStock, createProduct, managerAddStock, saveProduct } from "@/app/actions/manager";
import { loadBranches, loadProducts } from "@/lib/data";
import { shortDate, variantLabel } from "@/lib/format";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Products({ searchParams }: { searchParams: Sp }) {
  const [branches, products] = await Promise.all([loadBranches(), loadProducts()]);
  const pending = products.filter((p) => p.pending);

  return (
    <>
      <h2>المنتجات والستوك</h2>
      <p className="sub">كل منتج تابع لفرع واحد، وعندو ألوان ومقاسات. الستوك ما يتبدلش باليد: يتزاد، يتعد، ولا يتصحح بسبب.</p>
      <Flash searchParams={searchParams} />
      {!!pending.length && (
        <div className="note" style={{ marginBottom: 14, background: "var(--warn-bg)", color: "var(--warn)" }}>
          {pending.length} منتج جديد من الفروع ينتظر السعر تاعك: {pending.map((p) => p.name).join("، ")}.
        </div>
      )}
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <section className="panel">
          <h3>منتج جديد</h3>
          <form action={createProduct} className="o-row">
            <label className="f">الاسم<input type="text" name="name" required /></label>
            <label className="f">الفرع
              <select name="branch_id" required defaultValue="">
                <option value="" disabled>— اختار —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="f">السعر (دج)<input type="number" name="price" min={0} required /></label>
            <label className="f">تنبيه كي يبقاو<input type="number" name="min_qty" min={0} defaultValue={3} /></label>
            <button className="btn pri" type="submit">زيد</button>
          </form>
        </section>
        <section className="panel">
          <h3>زيد للستوك</h3>
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
            <button className="btn pri" type="submit">زيد</button>
          </form>
        </section>
      </div>

      {branches.map((b) => {
        const list = products.filter((p) => p.branch_id === b.id);
        if (!list.length) return null;
        return (
          <section key={b.id} style={{ marginBottom: 18 }}>
            <h3>{b.name}</h3>
            <div className="grid">
              {list.map((p) => (
                <div className="order" key={p.id}>
                  <form action={saveProduct} className="o-row">
                    <input type="hidden" name="id" value={p.id} />
                    <label className="f">الاسم<input type="text" name="name" defaultValue={p.name} required /></label>
                    <label className="f">السعر (دج)<input type="number" name="price" min={0} defaultValue={p.price} /></label>
                    <label className="f">تنبيه كي يبقاو<input type="number" name="min_qty" min={0} defaultValue={p.min_qty} /></label>
                    <label className="o-row" style={{ gap: 6 }}><input type="checkbox" name="active" defaultChecked={p.active} /> نشط</label>
                    {p.pending && <span className="chip warn">ينتظر السعر</span>}
                    <button className="btn sm pri" type="submit">{p.pending ? "اعتمد" : "حفظ"}</button>
                    <span className="o-meta">آخر تبديل {shortDate(p.updated_at)}</span>
                  </form>
                  <VariantChips variants={p.variants} min={p.min_qty} />
                  {!!p.variants.length && (
                    <details>
                      <summary className="o-meta" style={{ cursor: "pointer" }}>تصحيح الستوك</summary>
                      <form action={correctStock} className="o-row" style={{ marginTop: 8 }}>
                        <label className="f">اللون والمقاس
                          <select name="variant_id">{p.variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)} ({v.stock})</option>)}</select>
                        </label>
                        <label className="f">زيد (+) ولا نقص (−)<input type="number" name="delta" required /></label>
                        <label className="f">السبب<input type="text" name="note" required /></label>
                        <button className="btn sm" type="submit">صحح</button>
                      </form>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
