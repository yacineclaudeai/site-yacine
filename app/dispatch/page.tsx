import Flash from "@/components/Flash";
import Header from "@/components/Header";
import WaitList from "@/components/WaitList";
import { sendAll } from "@/app/actions/orders";
import { requireRole } from "@/lib/auth";
import { loadWaiting, sendDue } from "@/lib/orders";

type Sp = Promise<{ ok?: string; err?: string }>;

// عامل الإرسال: يبعث بكري، وحدة وحدة ولا كامل. ما يبدلش ما يلغيش.
export default async function Dispatch({ searchParams }: { searchParams: Sp }) {
  const me = await requireRole("dispatch");
  await sendDue();
  const w = await loadWaiting();
  return (
    <>
      <Header me={me} />
      <main>
        <h2>مرحبا {me.name}</h2>
        <p className="sub">الطلبيات المؤكدة تستنى قبل ما تتبعث وحدها. تقدر تبعثها قبل الوقت.</p>
        <Flash searchParams={searchParams} />
        <div className="strip">
          <div><b className="num">{w.length}</b> طلبية في الانتظار قبل الإرسال لشركة التوصيل</div>
          <form action={sendAll} className="actions"><input type="hidden" name="back" value="/dispatch" />
            <button className="btn pri" type="submit" disabled={!w.length}>ابعث الكل الآن</button></form>
        </div>
        <section className="panel"><WaitList orders={w} catalog={[]} back="/dispatch" canEdit={false} canSend /></section>
      </main>
    </>
  );
}
