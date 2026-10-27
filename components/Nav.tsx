"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAsk } from "./AskProvider";
import { useReview } from "./ReviewProvider";

const brandLinks = [
  ["/overview", "Overview"], ["/replenishment", "Inventory Management"], ["/ads", "Performance Marketing"],
  ["/promotions", "Deals and Promotions"], ["/market", "Market Share"], ["/platform", "Platform Analysis"],
  ["/freshness", "Data freshness"],
] as const;
const agentLinks = [["/review", "Business Review"], ["/ask", "Ask BOOST"]] as const;
const adminLinks = [["/admin/upload", "Upload center"], ["/admin/log", "Ingestion log"]] as const;
const ownerLinks = [["/admin/users", "Users"]] as const;

export default function Nav({ writer, owner }: { writer: boolean; owner: boolean }) {
  const path = usePathname();
  const ask = useAsk();
  const review = useReview();
  // the agents keep working in the background: show their state next to their links
  const badge = (href: string) => {
    const a = href === "/ask" ? ask : href === "/review" ? review : null;
    return !a ? null : a.busy ? <span className="navbadge busy">working</span> : a.unseen ? <span className="navbadge">new</span> : null;
  };
  // keep the chosen reporting period when moving between dashboards
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["view", "p", "from", "to", "cmp"]) { const v = sp.get(k); if (v) keep.set(k, v); }
  const period = keep.toString() ? `?${keep.toString()}` : "";
  const withPeriod = (href: string) => (href === "/freshness" ? href : href + period);
  const cls = (p: string) => (path === p || path.startsWith(p + "/") ? "on" : "");
  return (
    <nav className="nav" aria-label="Main">
      {brandLinks.map(([href, label]) => (
        <Link key={href} href={withPeriod(href)} className={cls(href)}>{label}</Link>
      ))}
      <div className="group">AI agents</div>
      {agentLinks.map(([href, label]) => (
        <Link key={href} href={href} className={cls(href)}>{label}{badge(href)}</Link>
      ))}
      {writer ? <div className="group">Admin</div> : null}
      {writer ? adminLinks.map(([href, label]) => (
        <Link key={href} href={href} className={cls(href)}>{label}</Link>
      )) : null}
      {owner ? ownerLinks.map(([href, label]) => (
        <Link key={href} href={href} className={cls(href)}>{label}</Link>
      )) : null}
    </nav>
  );
}
