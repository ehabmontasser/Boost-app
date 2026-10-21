import { NextResponse } from "next/server";
import { checkAdminPassword, cookieMaxAge, cookieName, makeToken } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!checkAdminPassword(password)) return NextResponse.redirect(new URL("/login?e=1", req.url), 303);
  const res = NextResponse.redirect(new URL("/admin/upload", req.url), 303);
  res.cookies.set(cookieName, makeToken("admin"), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: cookieMaxAge });
  return res;
}
