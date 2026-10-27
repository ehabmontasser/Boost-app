"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Brief, Step } from "@/lib/agent/engine";

type Saved = { role: string; steps: Step[]; brief: Brief | null; error: string | null; pending: Record<string, unknown> | null; reportId: string | null; label: string };
export type ReviewStart = { view: "week" | "month"; p: string; notes: string; label: string };
type ReviewCtx = { steps: Step[]; brief: Brief | null; error: string | null; busy: boolean; unseen: boolean; reportId: string | null; label: string; run: (start: ReviewStart) => void };

const KEY = "boost_review_v1";
const Ctx = createContext<ReviewCtx | null>(null);
export const useReview = () => useContext(Ctx);

const load = (): Saved | null => { try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
const store = (s: Saved) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked: the run still works */ } };

// one request to the review agent, retried twice on a network or server hiccup (e.g. right after a page reload)
async function post(body: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("/api/agent/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.status >= 500 && attempt < 2) throw new Error("server " + res.status);
      return await res.json();
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

/** Holds the Monday Commercial Review run for the whole app, so it keeps running while the user visits other pages.
 *  Lives in the app layout, which stays mounted across page changes; also kept in sessionStorage so a reload resumes. */
export default function ReviewProvider({ role, children }: { role: string; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [steps, setSteps] = useState<Step[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const saved = useRef<Saved>({ role, steps: [], brief: null, error: null, pending: null, reportId: null, label: "" });
  const running = useRef(false);
  const pathRef = useRef(path);
  pathRef.current = path;

  const save = (patch: Partial<Saved>) => { saved.current = { ...saved.current, ...patch }; store(saved.current); };

  const loop = useCallback(async (start: Record<string, unknown>) => {
    if (running.current) return;
    running.current = true; setBusy(true);
    let body: Record<string, unknown> | null = start;
    try {
      for (let n = 0; n < 12 && body; n++) {
        save({ pending: body });
        const j: any = await post(body);
        if (j.steps?.length) { const all = [...saved.current.steps, ...j.steps]; setSteps(all); save({ steps: all }); }
        if (j.error || !j.state) { const e = j.error ?? "The review stopped."; setError(e); save({ error: e }); break; }
        if (j.final?.brief) {
          setBrief(j.final.brief); setReportId(j.reportId ?? null); save({ brief: j.final.brief, reportId: j.reportId ?? null });
          // open the new report if the user is on the Business Review page; otherwise the sidebar badge says it is ready
          if (pathRef.current === "/review" && j.reportId) router.replace(`/review?report=${j.reportId}`); else router.refresh();
          break;
        }
        if (j.state.done) { const e = "The review finished without a brief."; setError(e); save({ error: e }); break; }
        body = { state: j.state, sig: j.sig, tools: saved.current.steps.length };
      }
    } catch { const e = "Could not reach the server. Check your connection and try again."; setError(e); save({ error: e }); }
    finally {
      save({ pending: null });
      running.current = false; setBusy(false);
      if (pathRef.current !== "/review") setUnseen(true);
    }
  }, [router]);

  // restore after a reload; resume a run that was in progress
  useEffect(() => {
    const s = load();
    if (!s || s.role !== role) { store(saved.current); return; }
    saved.current = s;
    setSteps(s.steps); setBrief(s.brief); setError(s.error); setReportId(s.reportId ?? null); setLabel(s.label ?? "");
    if (s.pending && !s.brief && !s.error) loop(s.pending);
  }, [role, loop]);

  useEffect(() => { if (path === "/review") setUnseen(false); }, [path]);

  const run = (start: ReviewStart) => {
    if (running.current) return;
    saved.current = { role, steps: [], brief: null, error: null, pending: null, reportId: null, label: start.label }; store(saved.current);
    setSteps([]); setBrief(null); setError(null); setReportId(null); setLabel(start.label);
    loop({ start: { view: start.view, p: start.p, notes: start.notes } });
  };

  return <Ctx.Provider value={{ steps, brief, error, busy, unseen, reportId, label, run }}>{children}</Ctx.Provider>;
}
