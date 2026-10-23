import Flash from "@/components/Flash";
import { addLedger, reverseLedger } from "@/app/actions/manager";
import { held, ledgerSums } from "@/lib/accounting";
import { loadBranches, loadLedger } from "@/lib/data";
import { dzd } from "@/lib/format";
import { BRANCH_TYPE_LABEL, LEDGER_LABEL, type LedgerType } from "@/lib/types";

type Sp = Promise<{ ok?: string; err?: string }>;

export default async function Ledger({ searchParams }: { searchParams: Sp }) {
  const [branches, entries] = await Promise.all([loadBranches(), loadLedger()]);
  const reversed = new Set(entries.filter((e) => e.reverses).map((e) => e.reverses));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h2>حسابات الفروع</h2>
      <p className="sub">كل حركة تتسجل وما تتمسحش. إذا غلطت، ألغيها وتتسجل حركة معاكسة. حساب الفايدة ونص الفايدة يجي مع كونطابيليتي المنتجات في المرحلة 2.</p>
      <Flash searchParams={searchParams} />
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>سجل حركة</h3>
        <form action={addLedger} className="o-row">
          <label className="f">الفرع
            <select name="branch_id" required defaultValue="">
              <option value="" disabled>— اختار —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="f">النوع
            <select name="type" required>
              {(Object.keys(LEDGER_LABEL) as LedgerType[]).map((t) => <option key={t} value={t}>{LEDGER_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="f">المبلغ (دج)<input type="number" name="amount" min={1} required /></label>
          <label className="f">النهار<input type="date" name="entry_day" defaultValue={today} /></label>
          <label className="f">ملاحظة<input type="text" name="note" /></label>
          <button className="btn pri" type="submit">سجل</button>
        </form>
      </section>
      <div className="grid">
        {branches.map((b) => {
          const list = entries.filter((e) => e.branch_id === b.id);
          const s = ledgerSums(list);
          return (
            <section className="panel" key={b.id}>
              <div className="o-top"><h3 style={{ margin: 0 }}>{b.name}</h3><span className="chip">{BRANCH_TYPE_LABEL[b.type]}</span></div>
              <div className="grid g2" style={{ marginTop: 10 }}>
                <div>
                  {(Object.keys(LEDGER_LABEL) as LedgerType[]).map((t) => (
                    <div className="kv" key={t}><span>{LEDGER_LABEL[t]}</span><b className="num">{dzd(s[t])}</b></div>
                  ))}
                  <div className="kv"><span>عندو دراهم</span><b className="big num">{dzd(held(s))}</b></div>
                </div>
                <div className="scroll">
                  {list.length ? (
                    <table>
                      <thead><tr><th>النهار</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr></thead>
                      <tbody>
                        {list.map((e) => (
                          <tr key={e.id} style={e.reverses || reversed.has(e.id) ? { opacity: 0.55 } : undefined}>
                            <td className="num">{e.entry_day}</td>
                            <td>{LEDGER_LABEL[e.type]}</td>
                            <td className="num">{dzd(e.amount)}</td>
                            <td>{e.note ?? ""}</td>
                            <td>
                              {!e.reverses && !reversed.has(e.id) && (
                                <form action={reverseLedger}><input type="hidden" name="id" value={e.id} /><button className="btn sm bad" type="submit">ألغي</button></form>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="empty">ما كاين حتى حركة.</div>}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
