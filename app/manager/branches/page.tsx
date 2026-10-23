import Flash from "@/components/Flash";
import { addLedger, reverseLedger, saveBranch } from "@/app/actions/manager";
import { held, ledgerSums } from "@/lib/accounting";
import { loadBranches, loadLedger } from "@/lib/data";
import { fmt } from "@/lib/format";
import { BRANCH_TYPE_LABEL, LEDGER_LABEL, type BranchType, type LedgerType } from "@/lib/types";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function BranchesMoney({ searchParams }: { searchParams: Sp }) {
  const [branches, entries] = await Promise.all([loadBranches(), loadLedger()]);
  const reversed = new Set(entries.filter((e) => e.reverses).map((e) => e.reverses));

  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="grid g2">
        {branches.map((b) => {
          const list = entries.filter((e) => e.branch_id === b.id);
          const s = ledgerSums(list);
          return (
            <section className="panel" key={b.id}>
              <h3>{b.name}</h3>
              <div className="kv"><span>السيولة اللي صرح بيها</span><b className="num">{fmt(b.liquidity)} دج</b></div>
              <div className="kv"><span>دراهم عند الفرع</span><b className="num">{fmt(held(s))} دج</b></div>
              <div className="kv"><span>أدس خلصتها من جيبك</span><b className="num">{fmt(s.ads)} دج</b></div>
              <div className="note" style={{ margin: "10px 0" }}>دراهم عند الفرع = اللي رفدو من شركة التوصيل − اللي خلص بيه المورد − اللي بعثهولك.</div>

              <form action={saveBranch} style={{ margin: "10px 0", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}>
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="name" value={b.name} />
                <input type="hidden" name="delivery_company" value={b.delivery_company ?? ""} />
                <input type="hidden" name="delivery_account" value={b.delivery_account ?? ""} />
                <div className="o-row">
                  <label className="f" style={{ flex: 1 }}>نوع الفرع
                    <select name="type" defaultValue={b.type}>
                      {(Object.keys(BRANCH_TYPE_LABEL) as BranchType[]).map((t) => <option key={t} value={t}>{BRANCH_TYPE_LABEL[t]}</option>)}
                    </select>
                  </label>
                  <button className="btn sm" type="submit">حفظ</button>
                </div>
                <div className="kv"><span>أدس المنتجات</span><b className="num">{fmt(s.ads)}</b></div>
                <div className="kv"><span>حصتك من الفايدة</span><span className="o-meta">تجي مع محاسبة المنتج (المرحلة 2)</span></div>
                <div className="o-meta" style={{ marginTop: 6 }}>الأدس يرجعها الفرع دايما. في 50/50 الفرع يتحمل نص الفايدة ونص الخسارة. في الشهرية وأدس فقط، يرجع الأدس غير.</div>
              </form>

              <div className="scroll">
                <table><tbody>
                  {list.length ? list.map((e) => (
                    <tr key={e.id} style={e.reverses || reversed.has(e.id) ? { opacity: 0.55 } : undefined}>
                      <td className="num">{e.entry_day.slice(5).split("-").reverse().join("/")}</td>
                      <td>{LEDGER_LABEL[e.type]}{e.note ? <div className="o-meta">{e.note}</div> : null}</td>
                      <td className="num">{fmt(e.amount)}</td>
                      <td>{!e.reverses && !reversed.has(e.id) && (
                        <form action={reverseLedger}><input type="hidden" name="id" value={e.id} /><button className="btn sm bad" type="submit">ألغي</button></form>
                      )}</td>
                    </tr>
                  )) : <tr><td className="empty">ما كاين حتى عملية.</td></tr>}
                </tbody></table>
              </div>
              <form action={addLedger} className="o-row" style={{ marginTop: 10 }}>
                <input type="hidden" name="branch_id" value={b.id} />
                <select name="type" aria-label="نوع العملية">
                  {(Object.keys(LEDGER_LABEL) as LedgerType[]).map((t) => <option key={t} value={t}>{LEDGER_LABEL[t]}</option>)}
                </select>
                <input type="number" name="amount" min={1} required placeholder="المبلغ" aria-label="المبلغ" style={{ width: 120 }} />
                <button className="btn" type="submit">سجل</button>
              </form>
            </section>
          );
        })}
      </div>
    </>
  );
}
