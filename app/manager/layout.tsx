import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import Assistant from "@/components/Assistant";
import { requireRole } from "@/lib/auth";

// نفس التبويبات ونفس الترتيب تاع النموذج
const TABS = [
  { href: "/manager", label: "نظرة عامة" },
  { href: "/manager/orders", label: "الطلبات" },
  { href: "/manager/branches", label: "الفروع والدراهم" },
  { href: "/manager/products", label: "المنتجات والستوك" },
  { href: "/manager/quantities", label: "الكميات المتبقية" },
  { href: "/manager/analysis", label: "التحليل" },
  { href: "/manager/accounting", label: "محاسبة المنتج" },
  { href: "/manager/delivery", label: "شركات التوصيل" },
  { href: "/manager/confirmers", label: "المؤكدات" },
  { href: "/manager/suivi", label: "السويفي" },
  { href: "/manager/blacklist", label: "ليست نوار" },
  { href: "/manager/settings", label: "الإعدادات" },
];

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("manager");
  return (
    <>
      <Header me={me} />
      <main>
        <h2>لوحة المدير</h2>
        <p className="sub">تشوف كل شيء: الطلبات، الفروع، الدراهم، والستوك.</p>
        <Tabs items={TABS} />
        {children}
      </main>
      <Assistant connected={!!process.env.ANTHROPIC_API_KEY} />
    </>
  );
}
