import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Role = "admin" | "brand";
export type Session = { role: Role };

const COOKIE = "boost_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") return "dev-only-secret-change-me";
  throw new Error("SESSION_SECRET is not set (at least 16 characters). Add it in Vercel > Settings > Environment Variables.");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeToken(role: Role): string {
  const payload = `${role}.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | undefined): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, exp, sig] = parts;
  const expected = sign(`${role}.${exp}`);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (role !== "admin" && role !== "brand") return null;
  return { role };
}

export const cookieName = COOKIE;
export const cookieMaxAge = MAX_AGE;

export function checkAdminPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !input) return false;
  const a = Buffer.from(input), b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return readToken(store.get(COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "admin") redirect("/overview");
  return s;
}
