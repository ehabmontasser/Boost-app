import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** owner: signs in with ADMIN_PASSWORD, all brands, manages users. manager: assigned brands, can upload and run reviews.
 *  brand: one brand, read only. demo_manager / demo_brand: one-click read-only demos. */
export type Role = "owner" | "manager" | "brand" | "demo_manager" | "demo_brand";
export type Session = { role: Role; uid: string | null; name: string };

const COOKIE = "boost_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours
const ROLES: Role[] = ["owner", "manager", "brand", "demo_manager", "demo_brand"];

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") return "dev-only-secret-change-me";
  throw new Error("SESSION_SECRET is not set (at least 16 characters). Add it in Vercel > Settings > Environment Variables.");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeToken(role: Role, uid: string | null = null, name = ""): string {
  const payload = Buffer.from(JSON.stringify({ r: role, u: uid, n: name, e: Math.floor(Date.now() / 1000) + MAX_AGE })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | undefined): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const a = Buffer.from(sig), b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!ROLES.includes(d.r) || typeof d.e !== "number" || d.e < Date.now() / 1000) return null;
    return { role: d.r, uid: d.u ?? null, name: String(d.n ?? "") };
  } catch { return null; }
}

export const cookieName = COOKIE;
export const cookieMaxAge = MAX_AGE;
/** The brand the user is working on. Always re-checked against the brands the user may see (lib/access.ts). */
export const brandCookie = "boost_brand";

/** Can change data: upload files, run business reviews, edit notes, refresh Claude answers. */
export const canWrite = (s: Session | null) => !!s && (s.role === "owner" || s.role === "manager");
/** Account-manager view (all or several brands): the owner, managers and the manager demo. */
export const isManagerView = (s: Session | null) => !!s && (s.role === "owner" || s.role === "manager" || s.role === "demo_manager");
export const isOwner = (s: Session | null) => s?.role === "owner";
/** Ask BOOST is capped for everyone who is not a working account manager. */
export const askCapped = (s: Session | null) => !canWrite(s);
export const roleLabel = (s: Session) => ({ owner: "Owner", manager: "Account manager", brand: "Brand user", demo_manager: "Demo: account manager (read only)", demo_brand: "Demo: brand user (read only)" })[s.role];

export function checkAdminPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !input) return false;
  const a = Buffer.from(input), b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Password hashing for user accounts: scrypt with a random salt. */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString("base64url")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(pw, salt, 32), b = Buffer.from(hash, "base64url");
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

/** Pages that change data (upload, ingestion log): owner and account managers. */
export async function requireWriter(): Promise<Session> {
  const s = await requireSession();
  if (!canWrite(s)) redirect("/overview");
  return s;
}

export async function requireOwner(): Promise<Session> {
  const s = await requireSession();
  if (!isOwner(s)) redirect("/overview");
  return s;
}
