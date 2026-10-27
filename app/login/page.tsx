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
          <h1 style={{ fontSize: 26 }}>See every platform in one place</h1>
          <p className="muted" style={{ fontSize: 15, margin: "8px 0 0" }}>
            Stock, ads, promotions and segment share across e-commerce and quick-commerce platforms, with a clear next action.
          </p>
        </div>
        <form action="/api/login" method="post">
          <label htmlFor="email" style={{ fontWeight: 600, fontSize: 14 }}>Sign in</label>
          <input id="email" name="email" type="text" className="input" placeholder="Email" autoComplete="username" required />
          <input id="pw" name="password" type="password" className="input" placeholder="Password" autoComplete="current-password" required aria-label="Password" />
          {e ? <div className="notice n-bad">That email and password do not match an active account.</div> : null}
          <button className="btn" type="submit">Sign in</button>
        </form>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
        <div className="demo-buttons">
          <div style={{ fontWeight: 600, fontSize: 14 }}>Try the demo (read only)</div>
          <form action="/api/demo?as=manager" method="post"><button className="btn alt" type="submit">Demo: account manager</button></form>
          <form action="/api/demo?as=brand" method="post"><button className="btn alt" type="submit">Demo: Sprout brand user</button></form>
          <div className="muted">Sprout Baby Care is a dummy brand with synthetic data.</div>
        </div>
      </div>
    </div>
  );
}
