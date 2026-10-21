export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
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
          <h1 style={{ fontSize: 26 }}>See every channel in one place</h1>
          <p className="muted" style={{ fontSize: 15, margin: "8px 0 0" }}>
            Stock, ads, promotions and segment share across e-commerce and quick-commerce platforms, with a clear next action.
          </p>
        </div>
        <form action="/api/demo" method="post">
          <button className="btn" type="submit">Open the demo brand (read only)</button>
          <div className="muted">Sprout Baby Care, a dummy brand with synthetic data.</div>
        </form>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
        <form action="/api/login" method="post">
          <label htmlFor="pw" style={{ fontWeight: 600, fontSize: 14 }}>Account manager sign in</label>
          <input id="pw" name="password" type="password" className="input" placeholder="Password" autoComplete="current-password" required />
          {e ? <div className="notice n-bad">That password is not correct.</div> : null}
          <button className="btn alt" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
