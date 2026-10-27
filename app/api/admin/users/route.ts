import { NextResponse } from "next/server";
import { getSession, hashPassword, isOwner } from "@/lib/auth";
import { q, withTx } from "@/lib/db";

/** Owner only. Body: { action: "create", name, email, role, password, brandIds } | { action: "update", id, name, role, brandIds, active }
 *  | { action: "password", id, password } | { action: "brand", name } (adds an empty brand). */
export async function POST(req: Request) {
  const s = await getSession();
  if (!isOwner(s)) return NextResponse.json({ ok: false, error: "Only the owner can manage users." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const role = b.role === "brand" ? "brand" : b.role === "manager" ? "manager" : null;
  const brandIds: string[] = Array.isArray(b.brandIds) ? b.brandIds.map(String) : [];
  const name = String(b.name ?? "").trim().slice(0, 80);
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

  const checkBrands = async () => {
    if (role === "brand" && brandIds.length !== 1) return "A brand user needs exactly one brand.";
    if (role === "manager" && brandIds.length < 1) return "An account manager needs at least one brand.";
    const known = await q<{ id: string }>("SELECT id FROM brands WHERE id = ANY($1::uuid[])", [brandIds]);
    return known.length === brandIds.length ? null : "Unknown brand.";
  };
  const setBrands = (c: any, id: string) => withBrands(c, id, brandIds);

  try {
    if (b.action === "create") {
      if (!name) return bad("Enter a name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === "admin") return bad("Enter a valid email address.");
      if (!role) return bad("Choose a role.");
      if (password.length < 10) return bad("The password needs at least 10 characters.");
      const e = await checkBrands(); if (e) return bad(e);
      const exists = await q("SELECT 1 FROM app_users WHERE email = $1", [email]);
      if (exists.length) return bad("A user with this email already exists.");
      await withTx(async (c) => {
        const r = await c.query("INSERT INTO app_users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id", [email, name, role, hashPassword(password)]);
        await setBrands(c, r.rows[0].id);
      });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "update") {
      const id = String(b.id ?? "");
      if (!name) return bad("Enter a name.");
      if (!role) return bad("Choose a role.");
      const e = await checkBrands(); if (e) return bad(e);
      await withTx(async (c) => {
        await c.query("UPDATE app_users SET name = $2, role = $3, active = $4 WHERE id = $1", [id, name, role, b.active !== false]);
        await setBrands(c, id);
      });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "brand") {
      if (name.length < 2) return bad("Enter a brand name.");
      // same code rule as the Brand Master import, so a later Brand Master for this name fills this brand
      const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!code) return bad("Use letters or numbers in the brand name.");
      const exists = await q("SELECT 1 FROM brands WHERE code = $1 OR lower(name) = lower($2)", [code, name]);
      if (exists.length) return bad("A brand with this name already exists.");
      await q("INSERT INTO brands (code, name) VALUES ($1, $2)", [code, name]);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "password") {
      if (password.length < 10) return bad("The password needs at least 10 characters.");
      const r = await q("UPDATE app_users SET password_hash = $2 WHERE id = $1 RETURNING id", [String(b.id ?? ""), hashPassword(password)]);
      return r.length ? NextResponse.json({ ok: true }) : bad("User not found.");
    }
    return bad("Unknown action.");
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Could not save: ${(err as Error).message}` }, { status: 500 });
  }
}

async function withBrands(c: { query: (sql: string, p: unknown[]) => Promise<unknown> }, id: string, brandIds: string[]) {
  await c.query("DELETE FROM app_user_brands WHERE user_id = $1", [id]);
  for (const bid of brandIds) await c.query("INSERT INTO app_user_brands (user_id, brand_id) VALUES ($1, $2)", [id, bid]);
}
