import { requireOwner } from "@/lib/auth";
import { q } from "@/lib/db";
import { Header } from "@/components/ui";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function Users() {
  await requireOwner();
  const [users, brands] = await Promise.all([
    q<{ id: string; name: string; email: string; role: "manager" | "brand"; active: boolean; brand_ids: string[] | null }>(
      `SELECT u.id, u.name, u.email, u.role, u.active, array_remove(array_agg(ub.brand_id::text), NULL) AS brand_ids
       FROM app_users u LEFT JOIN app_user_brands ub ON ub.user_id = u.id GROUP BY u.id ORDER BY u.active DESC, u.name`),
    q<{ id: string; name: string; loaded: boolean }>("SELECT id, name, EXISTS (SELECT 1 FROM skus s WHERE s.brand_id = b.id) AS loaded FROM brands b ORDER BY name"),
  ]);
  return (
    <>
      <Header title="Users" sub="Owner only · account managers handle one or more brands; brand users see only their own brand. Passwords are stored hashed and never shown." />
      <UsersAdmin users={users.map((u) => ({ ...u, brandIds: u.brand_ids ?? [] }))} brands={brands} />
    </>
  );
}
