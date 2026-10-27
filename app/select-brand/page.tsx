import { redirect } from "next/navigation";
import { requireSession, roleLabel } from "@/lib/auth";
import { brandContext } from "@/lib/access";

export const dynamic = "force-dynamic";

/** After sign-in, a user with several brands picks the one to work on. */
export default async function SelectBrand() {
  const s = await requireSession();
  const { brands, current } = await brandContext();
  if (current && brands.length <= 1) redirect("/overview");
  return (
    <div className="login">
      <div className="loginbox">
        <div className="brandmark" style={{ padding: 0 }}>
          <div className="logo" style={{ background: "var(--ink)" }}>
            <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 17 L9 10 L13 13 L19 4" fill="none" stroke="#c6f432" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span style={{ color: "var(--ink)" }}>BOOST</span>
        </div>
        <div>
          <h1 style={{ fontSize: 26 }}>Choose a brand</h1>
          <p className="muted" style={{ fontSize: 15, margin: "8px 0 0" }}>{s.name ? `${s.name}, ` : ""}{roleLabel(s).toLowerCase()}. Pick the brand to work on. You can switch any time from the sidebar.</p>
        </div>
        {brands.length ? (
          <div className="brandpick">
            {brands.map((b) => (
              <form key={b.id} action="/api/brand" method="post">
                <input type="hidden" name="brandId" value={b.id} />
                <input type="hidden" name="next" value="/overview" />
                <button className="btn alt" type="submit">{b.name}</button>
              </form>
            ))}
          </div>
        ) : <div className="notice n-warn">No brand is assigned to your account yet. Ask the owner to assign one.</div>}
        <form action="/api/logout" method="post"><button className="linkbtn dark" type="submit">Sign out</button></form>
      </div>
    </div>
  );
}
