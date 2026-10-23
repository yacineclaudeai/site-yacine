import { signOut } from "@/app/actions/auth";
import { ROLE_LABEL, type Profile } from "@/lib/types";

export default function Header({ me }: { me: Profile }) {
  return (
    <header className="top">
      <div className="top-in">
        <div className="brand">لوحة العمل <small>{ROLE_LABEL[me.role]}</small></div>
        <div className="o-row">
          <span className="who">{me.name}</span>
          <form action={signOut}><button className="btn sm" type="submit" style={{ color: "var(--text)" }}>خروج</button></form>
        </div>
      </div>
    </header>
  );
}
