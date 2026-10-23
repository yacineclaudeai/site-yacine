"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="القائمة">
      {items.map((n) => (
        <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>{n.label}</Link>
      ))}
    </nav>
  );
}
