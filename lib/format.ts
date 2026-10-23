export const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-US");
export const dzd = (n: number) => `${fmt(n)} دج`;
export const variantLabel = (v: { color: string; size: string }) => `${v.color} / ${v.size}`;
export function shortDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
