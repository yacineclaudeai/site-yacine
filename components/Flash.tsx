// رسالة نجاح ولا غلط بعد كل عملية (تجي في الرابط ?ok= ولا ?err=)
export default async function Flash({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  if (sp.err) return <div className="err" role="alert" style={{ marginBottom: 14 }}>{sp.err}</div>;
  if (sp.ok) return <div className="okmsg" role="status" style={{ marginBottom: 14 }}>{sp.ok}</div>;
  return null;
}
