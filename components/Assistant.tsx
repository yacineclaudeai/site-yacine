"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Turn = { role: "user" | "assistant"; content: string };

// زر "المساعد" العايم ونافذة الشات، كيما النموذج. المحادثة تبقى في الصفحة برك.
export default function Assistant({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [turns, busy, err]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: t }];
    setTurns(next); setText(""); setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turns: next }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "صرا مشكل، عاود جرب."); setTurns(turns); setText(t); return; }
      setTurns([...next, { role: "assistant", content: j.text }]);
      if (j.changes?.length) router.refresh();
    } catch {
      setErr("ما قدرتش نوصل للسيرفر."); setTurns(turns); setText(t);
    } finally { setBusy(false); }
  }

  return (
    <>
      <button className="fab" type="button" onClick={() => setOpen((o) => !o)}>المساعد</button>
      <aside className="aipanel" hidden={!open} aria-label="المساعد">
        <div className="ai-head"><b>المساعد</b>
          <span className="o-row">
            <button className="btn sm" type="button" onClick={() => { setTurns([]); setErr(""); }}>محادثة جديدة</button>
            <button className="btn sm" type="button" onClick={() => setOpen(false)}>سد</button>
          </span>
        </div>
        <div className="ai-log" ref={log}>
          {!connected && <div className="ai-m" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>المساعد مازال ما تربطش. لازم تحط مفتاح Anthropic في Netlify (ANTHROPIC_API_KEY).</div>}
          {connected && !turns.length && <div className="ai-m">قولي مثلا: بيجامة قطيفة عطيها للمؤكدة ب. ولا: وزع كل المنتجات على المؤكدة ج.</div>}
          {turns.map((t, i) => <div key={i} className={`ai-m${t.role === "user" ? " me" : ""}`}>{t.content}</div>)}
          {busy && <div className="ai-m">يفكر...</div>}
          {err && <div className="ai-m" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{err}</div>}
        </div>
        <form className="ai-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="مثلا: بيجامة قطيفة عطيها للمؤكدة ب" aria-label="رسالتك" disabled={!connected || busy} maxLength={4000} />
          <button className="btn pri" type="submit" disabled={!connected || busy || !text.trim()}>ابعث</button>
        </form>
      </aside>
    </>
  );
}
