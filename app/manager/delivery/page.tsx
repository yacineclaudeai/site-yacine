import Flash from "@/components/Flash";
import { clearDeliveryKey, saveDelivery } from "@/app/actions/manager";
import { loadBranches, loadProducts } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";

type Sp = Promise<{ ok?: string; err?: string }>;
type Key = { branch_id: string; api_url: string | null; key_hint: string | null; updated_at: string };

export default async function Delivery({ searchParams }: { searchParams: Sp }) {
  const sb = await supabaseServer();
  const [branches, products, { data }] = await Promise.all([
    loadBranches(), loadProducts(), sb.from("delivery_keys").select("branch_id, api_url, key_hint, updated_at"),
  ]);
  const keys = new Map(((data ?? []) as Key[]).map((k) => [k.branch_id, k]));
  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="note" style={{ marginBottom: 12 }}>
        كل فرع عندو حساب عند شركة التوصيل. دخل اسم الشركة، اسم الحساب، رابط الـAPI، والمفتاح (Token) اللي تلقاه في حسابك عند شركة التوصيل (غالبا في الإعدادات، "API").
        المفتاح يتخزن مشفر، وحتى واحد ما يقدر يشوفو من بعد، حتى انت: تشوف غير آخر 4 حروف. إذا تحب تبدلو، دخل الجديد. إذا تخلي الخانة فارغة، القديم يبقى.
      </div>
      <div className="grid g2">
        {branches.map((b) => {
          const k = keys.get(b.id);
          return (
            <section className="panel" key={b.id}>
              <div className="o-top">
                <h3>{b.name}</h3>
                {k?.key_hint ? <span className="chip ok">مفتاح محفوظ ••••{k.key_hint}</span> : <span className="chip warn">ما كاينش مفتاح</span>}
              </div>
              <form action={saveDelivery} style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="id" value={b.id} />
                <div className="o-row">
                  <label className="f">شركة التوصيل<input type="text" name="delivery_company" defaultValue={b.delivery_company ?? ""} placeholder="مثلا: HHD Express (Ecotrack)" /></label>
                  <label className="f">اسم الحساب<input type="text" name="delivery_account" defaultValue={b.delivery_account ?? ""} /></label>
                </div>
                <label className="f">رابط الـAPI<input type="url" name="api_url" dir="ltr" defaultValue={k?.api_url ?? ""} placeholder="https://..." /></label>
                <label className="f">مفتاح الـAPI (Token)
                  <input type="password" name="api_key" dir="ltr" autoComplete="off" placeholder={k?.key_hint ? `محفوظ ••••${k.key_hint}، خليها فارغة باش يبقى` : "لصق المفتاح هنا"} />
                </label>
                <div className="actions"><button className="btn pri" type="submit">حفظ</button></div>
              </form>
              {k?.key_hint && (
                <form action={clearDeliveryKey} style={{ marginTop: 8 }}><input type="hidden" name="id" value={b.id} />
                  <button className="btn sm bad" type="submit">امسح المفتاح</button></form>
              )}
              <div className="o-meta" style={{ marginTop: 8 }}>المنتجات: {products.filter((p) => p.branch_id === b.id).map((p) => p.name).join("، ") || "-"}</div>
            </section>
          );
        })}
      </div>
      <p className="sub" style={{ marginTop: 12 }}><span className="chip warn">تجريبي</span> المفتاح يتحفظ بصح، بصح الإرسال لشركة التوصيل مازال تجريبي (رقم تتبع STUB) حتى نقراو وثائق الـAPI تاع كل شركة ونجربو بطلبية وحدة.</p>
    </>
  );
}
