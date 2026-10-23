// تبويب كاين في النموذج بصح يتبنى في المرحلة 2
export default function Soon({ title, what }: { title: string; what: string }) {
  return (
    <section className="panel">
      <h3>{title} <span className="chip warn">المرحلة 2</span></h3>
      <p className="sub" style={{ margin: 0 }}>{what}</p>
    </section>
  );
}
