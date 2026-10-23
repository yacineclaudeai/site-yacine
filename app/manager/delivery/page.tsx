import Flash from "@/components/Flash";
import { saveBranch } from "@/app/actions/manager";
import { loadBranches, loadProducts } from "@/lib/data";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Delivery({ searchParams }: { searchParams: Sp }) {
  const [branches, products] = await Promise.all([loadBranches(), loadProducts()]);
  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="panel scroll">
        <table>
          <thead><tr><th>الفرع</th><th>شركة التوصيل</th><th>المنتجات المربوطة</th><th>الـAPI</th></tr></thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>
                  <form action={saveBranch} className="o-row">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="name" value={b.name} />
                    <input type="hidden" name="type" value={b.type} />
                    <input type="text" name="delivery_company" defaultValue={b.delivery_company ?? ""} aria-label="شركة التوصيل" />
                    <input type="text" name="delivery_account" defaultValue={b.delivery_account ?? ""} aria-label="الحساب" />
                    <button className="btn sm" type="submit">حفظ</button>
                  </form>
                </td>
                <td>{products.filter((p) => p.branch_id === b.id).map((p) => p.name).join("، ") || "-"}</td>
                <td><span className="chip warn">ينتظر الربط</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 12 }}>مفتاح الـAPI تاع كل شركة توصيل ما يتحطش في هذي الصفحة. يتخزن في سيرفر خاص، وهو اللي يبعث الطلبيات ويرجع الحالة (متسلمة، راجعة). الربط يجي في المرحلة 2.</div>
    </>
  );
}
