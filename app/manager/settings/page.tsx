import Flash from "@/components/Flash";
import { CreateUserForm, LockButton, PasswordForm } from "@/components/Accounts";
import { loadBranches, loadProfiles } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/types";

type Sp = Promise<{ ok?: string; err?: string }>;
const B = "/manager/settings";

export default async function Settings({ searchParams }: { searchParams: Sp }) {
  const [users, branches] = await Promise.all([loadProfiles(), loadBranches()]);
  const bname = new Map(branches.map((b) => [b.id, b.name]));
  return (
    <>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>الحسابات</h3>
        <p className="sub" style={{ margin: "0 0 8px" }}>انت وحدك تخلق الحسابات (الفروع، عمال الإرسال، ولا أي دور). المؤكدات والسويفي تقدر تزيدهم تاني من التبويبات تاعهم.</p>
        <CreateUserForm back={B} branches={branches} label="خلق الحساب" />
        <p className="o-meta" style={{ marginTop: 8 }}>نصيحة: دير كلمة سر مختلفة لكل واحد. إذا واحد خرج من الخدمة، بلوكيه وما تمسحوش، باش يبقى التاريخ تاعو.</p>
        <div className="scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>الاسم</th><th>الدور</th><th>الفرع</th><th>الإيميل</th><th>الحالة</th><th>كلمة سر جديدة</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td><td>{ROLE_LABEL[u.role]}</td><td>{u.branch_id ? bname.get(u.branch_id) : "-"}</td>
                  <td className="num">{u.email}</td><td><LockButton u={u} back={B} /></td><td><PasswordForm u={u} back={B} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>مصدر الطلبات <span className="chip warn">المرحلة 2</span></h3>
        <p className="sub" style={{ margin: 0 }}>شيتات جوجل (العادي والمتروك، كل واحد بالأعمدة تاعو) ولا بلا شيت. نحتاجو الروابط والأعمدة.</p>
      </section>
      <section className="panel">
        <h3>وقت الانتظار قبل الإرسال <span className="chip warn">المرحلة 2</span></h3>
        <p className="sub" style={{ margin: 0 }}>10 دقايق افتراضيا، وتقدر تبدلها. كل طلبية مؤكدة تستنى هذي المدة وبعدها تتبعث لشركة التوصيل.</p>
      </section>
    </>
  );
}
