import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getMe } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/types";

// المؤكدات والسويفي وعامل الإرسال يجيو في المرحلة 2 (الطلبيات والتوصيل).
export default async function Soon() {
  const me = await getMe();
  if (!me || me.locked) redirect("/login");
  return (
    <>
      <Header me={me} nav={[]} />
      <main>
        <div className="panel empty">
          <h2>مرحبا {me.name}</h2>
          <p>واجهة {ROLE_LABEL[me.role]} تجي في المرحلة 2 (الطلبيات والتأكيد والتوصيل).</p>
        </div>
      </main>
    </>
  );
}
