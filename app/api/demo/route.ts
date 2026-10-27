import { NextResponse } from "next/server";
import { brandCookie, cookieMaxAge, cookieName, makeToken } from "@/lib/auth";

/** One-click read-only demos: ?as=manager (all brands, account-manager view) or ?as=brand (Sprout only). */
export async function POST(req: Request) {
  const as = new URL(req.url).searchParams.get("as") === "manager" ? "demo_manager" : "demo_brand";
  const res = NextResponse.redirect(new URL("/overview", req.url), 303);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(cookieName, makeToken(as, null, as === "demo_manager" ? "Demo account manager" : "Demo brand user"), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: cookieMaxAge });
  res.cookies.set(brandCookie, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  return res;
}
