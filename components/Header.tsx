import { signOut } from "@/app/actions/auth";
import { ROLE_LABEL, type Profile } from "@/lib/types";
import Nav from "./Nav";

export default function Header({ me, nav }: { me: Profile; nav: { href: string; label: string }[] }) {
  return (
    <header className="top">
      <div className="top-in">
        <div className="brand">لوحة العمل <small>{ROLE_LABEL[me.role]}</small></div>
        <Nav items={nav} />
        <div className="o-row">
          <span className="who">{me.name}</span>
          <form action={signOut}><button className="btn sm" type="submit" style={{ color: "var(--text)" }}>خروج</button></form>
        </div>
      </div>
    </header>
  );
}
