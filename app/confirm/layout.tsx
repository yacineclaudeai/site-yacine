import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import { requireRole } from "@/lib/auth";
import { confirmedCounts, loadOrders, QUEUE, sendDue } from "@/lib/orders";

export default async function ConfirmLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("confirmer");
  await sendDue();
  const [orders, counts] = await Promise.all([loadOrders(), confirmedCounts([me])]);
  const queue = orders.filter((o) => QUEUE.includes(o.status)).length;
  const wait = orders.filter((o) => o.status === "wait" && o.confirmed_by === me.id).length;
  return (
    <>
      <Header me={me} />
      <main>
        <h2>مرحبا {me.name}</h2>
        <p className="sub">أكدت <b className="num">{counts.get(me.id) ?? 0}</b> طلبية هذا الشهر. تشوف غير طلبات المنتجات اللي وزعها عليك المدير.</p>
        <Tabs items={[
          { href: "/confirm", label: `للتأكيد (${queue})` },
          { href: "/confirm/wait", label: `في الانتظار (${wait})` },
          { href: "/confirm/sent", label: "المرسلة" },
        ]} />
        {children}
      </main>
    </>
  );
}
