import Flash from "@/components/Flash";
import { setLiquidity } from "@/app/actions/branch";
import { held, ledgerSums } from "@/lib/accounting";
import { requireRole } from "@/lib/auth";
import { loadBranches, loadLedger } from "@/lib/data";
import { dzd } from "@/lib/format";
import { LEDGER_LABEL, type LedgerType } from "@/lib/types";

type Sp = Promise<{ ok?: string; err?: string }>;

// كلمات من جهة الفرع
const MINE: Record<LedgerType, string> = {
  collected: "رفدت من شركة التوصيل",
  purchase: "خلصت بيهم المورد",
  sent: "بعثت للمدير",
  ads: "أدس خلصها المدير",
};

export default async function BranchAccount({ searchParams }: { searchParams: Sp }) {
  const me = await requireRole("branch");
  const [[branch], entries] = await Promise.all([loadBranches(), loadLedger(me.branch_id!)]);
  const s = ledgerSums(entries);

  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="grid g2">
        <section className="panel">
          <h3>حسابك مع المدير</h3>
          {(Object.keys(MINE) as LedgerType[]).map((t) => (
            <div className="kv" key={t}><span>{MINE[t]}</span><b className="num">{dzd(s[t])}</b></div>
          ))}
          <div className="kv"><span>عندك دراهم</span><b className="big num">{dzd(held(s))}</b></div>
        </section>
        <section className="panel">
          <h3>السيولة المتوفرة عندك</h3>
          <p className="sub">المدير يشوف هذا الرقم كي يختار أنهي فرع يشري السلعة.</p>
          <form action={setLiquidity} className="o-row">
            <input type="number" name="amount" min={0} defaultValue={branch?.liquidity ?? 0} aria-label="السيولة" style={{ width: 160 }} />
            <button className="btn pri" type="submit">حدّث</button>
          </form>
        </section>
      </div>
      <section className="panel scroll" style={{ marginTop: 14 }}>
        <h3>الحركات</h3>
        {entries.length ? (
          <table>
            <thead><tr><th>النهار</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th></tr></thead>
            <tbody>{entries.map((e) => (
              <tr key={e.id}><td className="num">{e.entry_day}</td><td>{LEDGER_LABEL[e.type]}</td><td className="num">{dzd(e.amount)}</td><td>{e.note ?? ""}</td></tr>
            ))}</tbody>
          </table>
        ) : <div className="empty">ما كاين حتى حركة.</div>}
      </section>
    </>
  );
}
