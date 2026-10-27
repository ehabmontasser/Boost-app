import { NextResponse } from "next/server";
import { brandCookie, cookieName } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(cookieName, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(brandCookie, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
