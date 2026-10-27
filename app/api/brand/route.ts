import { NextResponse } from "next/server";
import { brandCookie, cookieMaxAge, getSession } from "@/lib/auth";
import { allowedBrands } from "@/lib/access";

/** Switch the brand being worked on. Only a brand the user is allowed to see is accepted. Form or JSON: { brandId, next }. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/login", req.url), 303);
  let brandId = "", next = "/overview";
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) { const b = await req.json().catch(() => ({})); brandId = String(b.brandId ?? ""); next = String(b.next ?? next); }
  else { const f = await req.formData(); brandId = String(f.get("brandId") ?? ""); next = String(f.get("next") ?? next); }
  if (!next.startsWith("/") || next.startsWith("//")) next = "/overview";
  const brands = await allowedBrands(s);
  if (!brands.some((b) => b.id === brandId)) return NextResponse.json({ ok: false, error: "You do not have access to that brand." }, { status: 403 });
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(brandCookie, brandId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: cookieMaxAge });
  return res;
}
