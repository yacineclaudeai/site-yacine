import Flash from "@/components/Flash";
import { saveBranch } from "@/app/actions/manager";
import { loadBranches } from "@/lib/data";
import { BRANCH_TYPE_LABEL, type Branch, type BranchType } from "@/lib/types";

type Sp = Promise<{ ok?: string; err?: string }>;

function BranchForm({ b }: { b?: Branch }) {
  return (
    <form action={saveBranch} className="o-row">
      {b && <input type="hidden" name="id" value={b.id} />}
      <label className="f">الاسم<input type="text" name="name" defaultValue={b?.name} required /></label>
      <label className="f">النوع
        <select name="type" defaultValue={b?.type ?? "half"}>
          {(Object.keys(BRANCH_TYPE_LABEL) as BranchType[]).map((t) => <option key={t} value={t}>{BRANCH_TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <label className="f">شركة التوصيل<input type="text" name="delivery_company" defaultValue={b?.delivery_company ?? ""} /></label>
      <label className="f">الحساب عند شركة التوصيل<input type="text" name="delivery_account" defaultValue={b?.delivery_account ?? ""} /></label>
      <button className="btn pri" type="submit">{b ? "حفظ" : "زيد الفرع"}</button>
    </form>
  );
}

export default async function Branches({ searchParams }: { searchParams: Sp }) {
  const branches = await loadBranches();
  return (
    <>
      <h2>الفروع</h2>
      <p className="sub">نوع الفرع يحدد الحساب: 50/50 يرجع الأدس ونص الفايدة (ولا يتحمل نص الخسارة)، الشهرية وأدس فقط يرجعو الأدس غير. الربط بشركات التوصيل يجي في المرحلة 2.</p>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}><h3>فرع جديد</h3><BranchForm /></section>
      <div className="grid">
        {branches.map((b) => <section className="panel" key={b.id}><BranchForm b={b} /></section>)}
      </div>
    </>
  );
}
