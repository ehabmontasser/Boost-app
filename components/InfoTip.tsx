"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** Small "i" button that explains a figure. Opens on hover, tap or keyboard focus; closes on Esc, outside click or second tap. */
export default function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const id = useId();

  // keep the bubble on screen: measure it once it opens and slide it sideways to fit, 8px from each edge
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    const dx = r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0;
    el.style.transform = `translateX(${Math.round(Math.max(dx, 8 - r.left))}px)`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <span className="infotip" ref={wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="infotip-btn" aria-label={`About ${label}`} aria-expanded={open}
        aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.9" r="1" fill="currentColor" />
          <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? <span role="tooltip" id={id} ref={pop} className="infotip-pop">{text}</span> : null}
    </span>
  );
}
