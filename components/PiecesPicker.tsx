"use client";
import { useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/orders";

type Piece = { pid: string; vid: string };

// يختار القطع: كم قطعة، ولكل قطعة المنتج واللون والمقاس. يبعث variant ids في input مخبي "lines".
// held = القطع اللي راهي محجوزة لهذي الطلبية (في الانتظار) باش تبان متوفرة.
export default function PiecesPicker({ catalog, defaultPid, qty, initial, held, mode }: {
  catalog: CatalogProduct[]; defaultPid?: string | null; qty?: number; initial?: Piece[];
  held?: Record<string, number>; mode: "confirm" | "edit";
}) {
  const avail = (vid: string, stock: number) => stock + (held?.[vid] ?? 0);
  const products = useMemo(
    () => catalog.filter((p) => p.variants.some((v) => avail(v.id, v.stock) > 0) || initial?.some((x) => x.pid === p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog],
  );
  // الكمية اللي باقية لمتغير، من غير القطع المختارة (ما عدا القطعة رقم skip)
  const left = (ps: Piece[], vid: string, stock: number, skip = -1) =>
    avail(vid, stock) - ps.filter((x, j) => j !== skip && x.vid === vid).length;
  const firstVariant = (pid: string, ps: Piece[] = []) => {
    const p = products.find((x) => x.id === pid);
    return p?.variants.find((v) => left(ps, v.id, v.stock) > 0)?.id ?? p?.variants[0]?.id ?? "";
  };
  const add = (ps: Piece[], n: number, pid: string) => {
    const out = [...ps];
    while (out.length < n) out.push({ pid, vid: firstVariant(pid, out) });
    return out;
  };
  const startPid = products.some((p) => p.id === defaultPid) ? defaultPid! : products[0]?.id ?? "";
  const [pieces, setPieces] = useState<Piece[]>(
    () => initial?.length ? initial : add([], Math.min(10, Math.max(1, qty ?? 1)), startPid),
  );
  if (!products.length) return <div className="note" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>كل المنتجات خلصت. ما تقدرش تأكد.</div>;

  const setN = (n: number) => setPieces((ps) => (n <= ps.length ? ps.slice(0, n) : add(ps, n, startPid)));
  const set = (i: number, p: Piece) => setPieces((ps) => ps.map((x, j) => (j === i ? p : x)));
  const total = pieces.reduce((t, x) => t + (products.find((p) => p.id === x.pid)?.price ?? 0), 0);

  return (
    <>
      <input type="hidden" name="lines" value={JSON.stringify(pieces.map((p) => p.vid))} />
      <div className="o-row">
        <label className="f">كم قطعة{mode === "confirm" ? " تاخذ الزبونة؟" : ""}
          <select value={pieces.length} onChange={(e) => setN(+e.target.value)}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <span className="num">المجموع {total.toLocaleString("en-US")} دج</span>
      </div>
      {pieces.map((x, i) => {
        const p = products.find((pp) => pp.id === x.pid);
        return (
          <div className="o-row" key={i}>
            <label className="f">القطعة {i + 1}: المنتج
              <select value={x.pid} onChange={(e) => set(i, { pid: e.target.value, vid: firstVariant(e.target.value, pieces.filter((_, j) => j !== i)) })}>
                {products.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
              </select>
            </label>
            <label className="f">اللون والمقاس
              <select value={x.vid} onChange={(e) => set(i, { pid: x.pid, vid: e.target.value })}>
                {p?.variants.filter((v) => left(pieces, v.id, v.stock, i) > 0 || v.id === x.vid).map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </label>
          </div>
        );
      })}
    </>
  );
}
