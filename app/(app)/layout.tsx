import { Suspense, type ReactNode } from "react";
import Nav from "@/components/Nav";
import AskProvider from "@/components/AskProvider";
import ReviewProvider from "@/components/ReviewProvider";
import { DEMO_PER_SESSION } from "@/lib/agent/context";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await requireSession();
  return (
    <AskProvider role={s.role} perSession={DEMO_PER_SESSION}>
    <ReviewProvider role={s.role}>
    <div className="shell">
      <aside className="side">
        <div className="brandmark">
          <div className="logo">
            <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 17 L9 10 L13 13 L19 4" fill="none" stroke="#101923" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span>BOOST</span>
        </div>
        <Suspense fallback={null}><Nav admin={s.role === "admin"} /></Suspense>
        <div className="sidefoot">
          <span>{s.role === "admin" ? "Account manager" : "Brand view (read only)"}</span>
          <form action="/api/logout" method="post"><button type="submit">Sign out</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
    </ReviewProvider>
    </AskProvider>
  );
}
