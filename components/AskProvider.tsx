"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Step } from "@/lib/agent/engine";

export type Turn = { question: string; steps: Step[]; answer: string | null; error: string | null };
type Saved = { role: string; turns: Turn[]; conv: { state: unknown; sig: string } | null; remaining: number | null; pending: Record<string, unknown> | null };
type AskCtx = { turns: Turn[]; busy: boolean; remaining: number | null; unseen: boolean; ask: (q: string) => void; reset: () => void };

const KEY = "boost_ask_v1";
const Ctx = createContext<AskCtx | null>(null);
export const useAsk = () => useContext(Ctx);

// one request to the agent, retried twice on a network or server hiccup (e.g. right after a page reload)
async function post(body: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("/api/agent/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.status >= 500 && attempt < 2) throw new Error("server " + res.status);
      return await res.json();
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

const load = (): Saved | null => { try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
const store = (s: Saved) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked: the chat still works */ } };

/** Holds the Ask BOOST conversation for the whole app, so an answer keeps running while the user visits other pages.
 *  Lives in the app layout, which stays mounted across page changes; also kept in sessionStorage so a reload resumes. */
export default function AskProvider({ role, perSession, children }: { role: string; perSession: number; children: ReactNode }) {
  const path = usePathname();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(role === "admin" ? null : perSession);
  const [unseen, setUnseen] = useState(false);
  const saved = useRef<Saved>({ role, turns: [], conv: null, remaining: role === "admin" ? null : perSession, pending: null });
  const running = useRef(false);
  const pathRef = useRef(path);
  pathRef.current = path;

  const save = (patch: Partial<Saved>) => { saved.current = { ...saved.current, ...patch }; store(saved.current); };
  const setAll = (t: Turn[]) => { setTurns(t); save({ turns: t }); };

  // the request loop: keeps calling until the agent finishes, whatever page is open
  const loop = useCallback(async (start: Record<string, unknown>) => {
    if (running.current) return;
    running.current = true; setBusy(true);
    let body: Record<string, unknown> | null = start;
    const i = saved.current.turns.length - 1;
    const update = (patch: Partial<Turn>) => setAll(saved.current.turns.map((x, k) => (k === i ? { ...x, ...patch } : x)));
    try {
      for (let n = 0; n < 12 && body; n++) {
        save({ pending: body });
        const j: any = await post(body);
        if (j.remaining !== undefined && j.remaining !== null) { setRemaining(j.remaining); save({ remaining: j.remaining }); }
        if (j.steps?.length) update({ steps: [...(saved.current.turns[i]?.steps ?? []), ...j.steps] });
        if (j.state) save({ conv: { state: j.state, sig: j.sig } });
        if (j.error || !j.state) { update({ error: j.error ?? "No answer." }); break; }
        if (j.final?.text !== undefined) { update({ answer: j.final.text || "No answer." }); break; }
        body = { state: j.state, sig: j.sig };
      }
    } catch { update({ error: "Could not reach the server. Check your connection and try again." }); }
    finally {
      save({ pending: null });
      running.current = false; setBusy(false);
      if (pathRef.current !== "/ask") setUnseen(true);
    }
  }, []);

  // restore after a reload; resume a run that was in progress
  useEffect(() => {
    const s = load();
    if (!s || s.role !== role) { store(saved.current); return; }
    saved.current = s;
    setTurns(s.turns); setRemaining(s.remaining);
    const last = s.turns[s.turns.length - 1];
    if (s.pending && last && !last.answer && !last.error) loop(s.pending);
  }, [role, loop]);

  useEffect(() => { if (path === "/ask") setUnseen(false); }, [path]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || running.current) return;
    setAll([...saved.current.turns, { question: q, steps: [], answer: null, error: null }]);
    loop({ question: q, ...(saved.current.conv ?? {}) });
  };
  const reset = () => { if (running.current) return; saved.current = { ...saved.current, turns: [], conv: null, pending: null }; store(saved.current); setTurns([]); };

  return <Ctx.Provider value={{ turns, busy, remaining, unseen, ask, reset }}>{children}</Ctx.Provider>;
}
