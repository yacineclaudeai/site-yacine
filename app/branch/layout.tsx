import Header from "@/components/Header";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/branch", label: "عد الستوك اليومي" },
  { href: "/branch/returns", label: "الرتور" },
  { href: "/branch/account", label: "حسابي" },
];

export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("branch");
  return (
    <>
      <Header me={me} nav={NAV} />
      <main>{children}</main>
    </>
  );
}
