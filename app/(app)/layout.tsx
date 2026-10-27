import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import AskProvider from "@/components/AskProvider";
import ReviewProvider from "@/components/ReviewProvider";
import BrandSwitcher from "@/components/BrandSwitcher";
import { DEMO_PER_SESSION } from "@/lib/agent/context";
import { askCapped, canWrite, isOwner, requireSession, roleLabel } from "@/lib/auth";
import { brandContext } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await requireSession();
  const { brands, current, needsChoice } = await brandContext();
  if (needsChoice) redirect("/select-brand");
  // conversations and review runs are kept per user and per brand, so switching brand starts fresh
  const scope = `${s.role}:${s.uid ?? "-"}:${current?.id ?? "none"}`;
  return (
    <AskProvider role={scope} capped={askCapped(s)} perSession={DEMO_PER_SESSION}>
    <ReviewProvider role={scope}>
    <div className="shell">
      <aside className="side">
        <div className="brandmark">
          <div className="logo">
            <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 17 L9 10 L13 13 L19 4" fill="none" stroke="#101923" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span>BOOST</span>
        </div>
        <BrandSwitcher brands={brands.map((b) => ({ id: b.id, name: b.name }))} current={current?.id ?? null} />
        <Suspense fallback={null}><Nav writer={canWrite(s)} owner={isOwner(s)} /></Suspense>
        <div className="sidefoot">
          <span>{s.name && !s.role.startsWith("demo") ? `${s.name} · ` : ""}{roleLabel(s)}</span>
          <form action="/api/logout" method="post"><button type="submit">Sign out</button></form>
        </div>
      </aside>
      <main className="main">{current ? children : <NoBrand />}</main>
    </div>
    </ReviewProvider>
    </AskProvider>
  );
}

function NoBrand() {
  return (
    <div className="card">
      <h2>No brand assigned yet</h2>
      <div className="muted" style={{ fontSize: 15 }}>Your account has no brand to work on. Ask the owner to assign one on the Users page.</div>
    </div>
  );
}
