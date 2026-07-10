import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { UsersRepository } from "@/server/repositories/users.repository";
import { normalizeRole, type Role } from "./roles";

export type CurrentSession = {
  userId: string;
  email: string | null;
  role: Role;
  businessUnitId: string | null;
};

export async function getCurrentSession(
  db: SupabaseClient<Database>
): Promise<CurrentSession | null> {
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return null;

  const profile = await new UsersRepository(db).findById(user.id);

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? null,
    role: normalizeRole(profile?.role),
    businessUnitId: profile?.business_unit_id ?? null,
  };
}
