import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import { requireRole } from "@/lib/auth";
import { loadBranches } from "@/lib/data";

const TABS = [
  { href: "/branch", label: "للتغليف" },
  { href: "/branch/count", label: "عد الستوك اليومي" },
  { href: "/branch/returns", label: "الرتور" },
  { href: "/branch/account", label: "حسابي" },
];

export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("branch");
  const [branch] = await loadBranches();
  return (
    <>
      <Header me={me} />
      <main>
        <h2>{branch?.name ?? "الفرع"}</h2>
        <p className="sub">تشوف غير الطلبات والستوك والحساب تاعك. وما تشوفش الفروع الأخرى ولا الأرباح.</p>
        <Tabs items={TABS} />
        {children}
      </main>
    </>
  );
}
