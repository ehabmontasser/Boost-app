import { NextResponse } from "next/server";
import { cookieMaxAge, cookieName, makeToken } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/overview", req.url), 303);
  res.cookies.set(cookieName, makeToken("brand"), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: cookieMaxAge });
  return res;
}
