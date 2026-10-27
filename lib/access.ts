// Which brands a signed-in user may see, and which one they are working on. Every page and API route gets its brand
// from here, so a user can never read another brand's data by changing the brand cookie.
import { cache } from "react";
import { cookies } from "next/headers";
import { q } from "./db";
import { brandCookie, getSession, type Session } from "./auth";

export type BrandRef = { id: string; name: string; code: string };
const DEMO_BRAND_CODE = "sprout-baby-care";

export async function allowedBrands(s: Session | null): Promise<BrandRef[]> {
  if (!s) return [];
  if (s.role === "owner" || s.role === "demo_manager") return q<BrandRef>("SELECT id, name, code FROM brands ORDER BY name");
  if (s.role === "demo_brand") {
    const r = await q<BrandRef>("SELECT id, name, code FROM brands WHERE code = $1", [DEMO_BRAND_CODE]);
    return r.length ? r : q<BrandRef>("SELECT id, name, code FROM brands ORDER BY created_at LIMIT 1");
  }
  if (!s.uid) return [];
  return q<BrandRef>(
    `SELECT b.id, b.name, b.code FROM app_user_brands ub JOIN brands b ON b.id = ub.brand_id
     JOIN app_users u ON u.id = ub.user_id WHERE ub.user_id = $1 AND u.active ORDER BY b.name`, [s.uid]);
}

/** The session, its brands and the brand in use (the cookie's brand if allowed; the only brand if there is one). */
export const brandContext = cache(async () => {
  const s = await getSession();
  const brands = await allowedBrands(s);
  const store = await cookies();
  const chosen = store.get(brandCookie)?.value;
  const current = brands.find((b) => b.id === chosen) ?? (brands.length === 1 ? brands[0] : null);
  return { session: s, brands, current, needsChoice: !current && brands.length > 1 };
});

/** The brand in use for this request, or null (not signed in, no brands, or a choice still to make). */
export async function currentBrand(): Promise<BrandRef | null> {
  return (await brandContext()).current;
}
