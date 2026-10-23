"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// الدائرة تاع الانتظار. الوقت يجي من القاعدة (send_at) وما يتعاودش.
export default function Countdown({ sendAt, total }: { sendAt: string; total: number }) {
  const router = useRouter();
  const end = new Date(sendAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, end - now);
  useEffect(() => {
    if (left > 0) return;
    const t = setTimeout(() => router.refresh(), 2500); // الصفحة تبعثها وتتحدث
    return () => clearTimeout(t);
  }, [left, router]);
  const r = total > 0 ? Math.min(1, left / (total * 1000)) : 0;
  const s = Math.ceil(left / 1000);
  return (
    <div className="ring" aria-label={`باقي ${s} ثانية`}>
      <svg viewBox="0 0 46 46"><circle className="bg" cx="23" cy="23" r="18" /><circle className="fg" cx="23" cy="23" r="18" strokeDasharray="113.1" strokeDashoffset={(113.1 * (1 - r)).toFixed(1)} /></svg>
      <span className="num">{s >= 120 ? `${Math.ceil(s / 60)}د` : `${s}ث`}</span>
    </div>
  );
}
