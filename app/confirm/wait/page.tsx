import Flash from "@/components/Flash";
import WaitList from "@/components/WaitList";
import { requireRole } from "@/lib/auth";
import { loadCatalog, loadWaiting } from "@/lib/orders";
import { supabaseServer } from "@/lib/supabase/server";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Waiting({ searchParams }: { searchParams: Sp }) {
  const me = await requireRole("confirmer");
  const sb = await supabaseServer();
  const [orders, catalog, { data: set }] = await Promise.all([loadWaiting(), loadCatalog(), sb.from("settings").select("wait_minutes").maybeSingle()]);
  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="panel">
        <p className="sub" style={{ marginBottom: 6 }}>الطلبية تبقى هنا {set?.wait_minutes ?? 10} دقايق وتقدر تبدل اللون ولا تلغيها. بعدها تتبعث بروحها. الوقت ما يتعاودش كي تبدل.</p>
        <WaitList orders={orders.filter((o) => o.confirmed_by === me.id)} catalog={catalog} back="/confirm/wait" canEdit canSend={false} />
      </div>
    </>
  );
}
