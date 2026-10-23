import { createUser, resetPassword, setLocked } from "@/app/actions/manager";
import { ROLE_LABEL, type Branch, type Profile, type Role } from "@/lib/types";

// فورم خلق حساب. role ثابت في المؤكدات والسويفي، وحر في الإعدادات.
export function CreateUserForm({ back, role, branches, label }: { back: string; role?: Role; branches: Branch[]; label: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const needsBranch = !role || role === "branch" || role === "suivi";
  return (
    <form action={createUser} className="o-row">
      <input type="hidden" name="back" value={back} />
      <label className="f">الاسم<input type="text" name="name" required /></label>
      <label className="f">الإيميل<input type="email" name="email" required dir="ltr" /></label>
      <label className="f">الهاتف<input type="tel" name="phone" dir="ltr" /></label>
      <label className="f">تاريخ الدخول<input type="date" name="joined_at" defaultValue={today} /></label>
      {role ? <input type="hidden" name="role" value={role} /> : (
        <label className="f">الدور
          <select name="role" required defaultValue="">
            <option value="" disabled>— اختار —</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
      )}
      {needsBranch && (
        <label className="f">الفرع{!role && " (للفرع والسويفي)"}
          <select name="branch_id" defaultValue="" required={!!role}>
            <option value="">—</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}
      <label className="f">كلمة السر (8 ولا أكثر)<input type="password" name="password" required minLength={8} autoComplete="new-password" dir="ltr" /></label>
      <button className="btn pri" type="submit">{label}</button>
    </form>
  );
}

export function LockButton({ u, back }: { u: Profile; back: string }) {
  return (
    <form action={setLocked} className="o-row">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="id" value={u.id} />
      <input type="hidden" name="lock" value={u.locked ? "0" : "1"} />
      <span className={`chip ${u.locked ? "bad" : "ok"}`}>{u.locked ? "مبلوكي" : "يخدم"}</span>
      <button className="btn sm" type="submit">{u.locked ? "رجعو" : "بلوكي"}</button>
    </form>
  );
}

export function PasswordForm({ u, back }: { u: Profile; back: string }) {
  return (
    <form action={resetPassword} className="o-row">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="id" value={u.id} />
      <input type="password" name="password" minLength={8} required autoComplete="new-password" dir="ltr" aria-label="كلمة سر جديدة" style={{ width: 130 }} />
      <button className="btn sm" type="submit">بدل</button>
    </form>
  );
}
