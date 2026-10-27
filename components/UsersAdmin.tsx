"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; name: string; email: string; role: "manager" | "brand"; active: boolean; brandIds: string[] };
type Brand = { id: string; name: string };
const ROLE = { manager: "Account manager", brand: "Brand user" };

async function send(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ ok: false, error: "Unexpected server answer." }));
}

/** Owner's user management: add users, assign brands, deactivate, set a new password. */
export default function UsersAdmin({ users, brands }: { users: User[]; brands: Brand[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "?";
  return (
    <>
      <section className="card">
        <h2>Add a user</h2>
        <UserForm brands={brands} onDone={() => router.refresh()} />
      </section>
      <section className="card">
        <h2>Users</h2>
        {users.length === 0 ? <div className="muted">No users yet. The owner signs in with "admin" and the admin password.</div> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Brands</th><th>Status</th><th></th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td><td>{u.email}</td><td>{ROLE[u.role]}</td>
                <td>{u.brandIds.map(brandName).join(", ") || <span className="bad">none</span>}</td>
                <td>{u.active ? <span className="good">Active</span> : <span className="muted">Deactivated</span>}</td>
                <td><button type="button" className="linkbtn dark" onClick={() => setEditing(editing === u.id ? null : u.id)}>{editing === u.id ? "Close" : "Edit"}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {editing ? (() => { const u = users.find((x) => x.id === editing)!; return (
          <div className="useredit">
            <h3>Edit {u.name}</h3>
            <UserForm brands={brands} user={u} onDone={() => { setEditing(null); router.refresh(); }} />
            <PasswordForm id={u.id} />
          </div>
        ); })() : null}
      </section>
    </>
  );
}

function UserForm({ brands, user, onDone }: { brands: Brand[]; user?: User; onDone: () => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<"manager" | "brand">(user?.role ?? "manager");
  const [picked, setPicked] = useState<string[]>(user?.brandIds ?? []);
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => (role === "brand" ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg("Saving...");
    const j = await send(user ? { action: "update", id: user.id, name, role, brandIds: picked, active } : { action: "create", name, email, role, password, brandIds: picked });
    if (j.ok) { setMsg(user ? "Saved." : "User added."); if (!user) { setName(""); setEmail(""); setPassword(""); setPicked([]); } onDone(); } else setMsg(j.error ?? "Could not save.");
  }
  return (
    <form className="userform" onSubmit={submit}>
      <label className="review-field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label>
      <label className="review-field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!user} /></label>
      <label className="review-field">Role
        <select value={role} onChange={(e) => { const r = e.target.value as "manager" | "brand"; setRole(r); if (r === "brand") setPicked((p) => p.slice(0, 1)); }}>
          <option value="manager">Account manager (one or more brands)</option>
          <option value="brand">Brand user (one brand, read only)</option>
        </select>
      </label>
      {!user ? <label className="review-field">Password (at least 10 characters)<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" /></label> : null}
      <fieldset className="brandchecks"><legend>{role === "brand" ? "Brand" : "Brands"}</legend>
        {brands.map((b) => (
          <label key={b.id}><input type={role === "brand" ? "radio" : "checkbox"} name={`brand-${user?.id ?? "new"}`} checked={picked.includes(b.id)} onChange={() => toggle(b.id)} /> {b.name}</label>
        ))}
      </fieldset>
      {user ? <label className="checkline"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (can sign in)</label> : null}
      <div className="report-note-actions"><button className="btn" type="submit">{user ? "Save changes" : "Add user"}</button>{msg ? <span className="note">{msg}</span> : null}</div>
    </form>
  );
}

function PasswordForm({ id }: { id: string }) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="userform" onSubmit={async (e) => { e.preventDefault(); setMsg("Saving..."); const j = await send({ action: "password", id, password }); setMsg(j.ok ? "Password changed." : j.error ?? "Could not save."); if (j.ok) setPassword(""); }}>
      <label className="review-field">New password (at least 10 characters)<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" /></label>
      <div className="report-note-actions"><button className="btn ghost" type="submit">Set new password</button>{msg ? <span className="note">{msg}</span> : null}</div>
    </form>
  );
}
