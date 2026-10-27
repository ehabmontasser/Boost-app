"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

/** Sidebar brand picker for users with several brands; a plain label when there is only one. */
export default function BrandSwitcher(props: { brands: { id: string; name: string }[]; current: string | null }) {
  return <Suspense fallback={null}><Inner {...props} /></Suspense>;
}

function Inner({ brands, current }: { brands: { id: string; name: string }[]; current: string | null }) {
  const path = usePathname();
  const sp = useSearchParams();
  const next = path + (sp.toString() ? `?${sp.toString()}` : "");
  const name = brands.find((b) => b.id === current)?.name;
  if (brands.length <= 1) return name ? <div className="brandswitch"><span className="brandswitch-label">Brand</span><span className="brandswitch-one">{name}</span></div> : null;
  return (
    <form className="brandswitch" action="/api/brand" method="post">
      <label className="brandswitch-label" htmlFor="brand-switch">Brand</label>
      <input type="hidden" name="next" value={next} />
      <select id="brand-switch" name="brandId" defaultValue={current ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <noscript><button type="submit">Switch</button></noscript>
    </form>
  );
}
