import { variantLabel } from "@/lib/format";
import type { Variant } from "@/lib/types";

// نفس شكل النموذج: أحمر = خلاص، أصفر = قليل
export default function VariantChips({ variants, min }: { variants: Variant[]; min: number }) {
  if (!variants.length) return <span className="o-meta">ما كاين حتى لون ومقاس</span>;
  return (
    <div className="vchips">
      {variants.map((v) => (
        <span key={v.id} className={`v ${v.stock === 0 ? "zero" : v.stock <= min ? "low" : ""}`}>
          {variantLabel(v)} · <span className="num">{v.stock}</span>
        </span>
      ))}
    </div>
  );
}
