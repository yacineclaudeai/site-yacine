"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// نفس شريط التبويبات تاع النموذج
export default function Tabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={path === t.href}>{t.label}</Link>
      ))}
    </div>
  );
}
