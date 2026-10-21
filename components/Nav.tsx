"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const brandLinks = [
  ["/overview", "Overview"], ["/replenishment", "Replenishment"], ["/ads", "Ads budget"],
  ["/promotions", "Promotions"], ["/market", "Market segment share"], ["/freshness", "Data freshness"],
] as const;
const adminLinks = [["/admin/upload", "Upload center"], ["/admin/log", "Ingestion log"]] as const;

export default function Nav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const cls = (p: string) => (path === p || path.startsWith(p + "/") ? "on" : "");
  return (
    <nav className="nav" aria-label="Main">
      {brandLinks.map(([href, label]) => (
        <Link key={href} href={href} className={cls(href)}>{label}</Link>
      ))}
      {admin ? <div className="group">Admin</div> : null}
      {admin ? adminLinks.map(([href, label]) => (
        <Link key={href} href={href} className={cls(href)}>{label}</Link>
      )) : null}
    </nav>
  );
}
