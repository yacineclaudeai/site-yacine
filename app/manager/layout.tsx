import Header from "@/components/Header";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/manager", label: "نظرة عامة" },
  { href: "/manager/products", label: "المنتجات والستوك" },
  { href: "/manager/ledger", label: "حسابات الفروع" },
  { href: "/manager/branches", label: "الفروع" },
  { href: "/manager/users", label: "الحسابات" },
];

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("manager");
  return (
    <>
      <Header me={me} nav={NAV} />
      <main>{children}</main>
    </>
  );
}
