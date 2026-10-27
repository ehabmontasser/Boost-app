import { NextResponse } from "next/server";
import { checkAdminPassword, cookieMaxAge, cookieName, makeToken, verifyPassword, brandCookie } from "@/lib/auth";
import { q } from "@/lib/db";

/** Sign in. The owner uses "admin" and the ADMIN_PASSWORD; everyone else their email and password. */
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const fail = () => NextResponse.redirect(new URL("/login?e=1", req.url), 303);
  let token: string;
  if (email === "admin") {
    if (!checkAdminPassword(password)) return fail();
    token = makeToken("owner", null, "Owner");
  } else {
    const r = await q<{ id: string; name: string; role: "manager" | "brand"; password_hash: string }>(
      "SELECT id, name, role, password_hash FROM app_users WHERE email = $1 AND active", [email]);
    if (!r[0] || !verifyPassword(password, r[0].password_hash)) return fail();
    token = makeToken(r[0].role, r[0].id, r[0].name);
  }
  const res = NextResponse.redirect(new URL("/overview", req.url), 303);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: cookieMaxAge });
  res.cookies.set(brandCookie, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  return res;
}
