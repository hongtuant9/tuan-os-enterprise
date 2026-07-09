// Creates demo Supabase Auth accounts and links them to a business unit.
// Raw SQL can't safely create auth.users rows, so this uses the admin API.
// The public.users row is inserted automatically by the on_auth_user_created
// trigger (see supabase/migrations/0003_users.sql).
//
// Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:users

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoUsers = [
  {
    email: "ceo@tuanos.dev",
    password: "tuanos-demo-2026",
    full_name: "TUAN OS CEO",
    role: "owner",
    business_unit_slug: "ceo-overview",
  },
  {
    email: "ops@tuanos.dev",
    password: "tuanos-demo-2026",
    full_name: "Operations Lead",
    role: "member",
    business_unit_slug: "hospitality-ai",
  },
];

async function main() {
  for (const demoUser of demoUsers) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: demoUser.email,
      password: demoUser.password,
      email_confirm: true,
      user_metadata: { full_name: demoUser.full_name },
    });

    if (createError && !createError.message.includes("already been registered")) {
      console.error(`Failed to create ${demoUser.email}:`, createError.message);
      continue;
    }

    const userId = created?.user?.id;
    if (!userId) {
      console.log(`Skipped ${demoUser.email} (already exists, id not returned).`);
      continue;
    }

    const { data: businessUnit } = await supabase
      .from("business_units")
      .select("id")
      .eq("slug", demoUser.business_unit_slug)
      .single();

    const { error: updateError } = await supabase
      .from("users")
      .update({ role: demoUser.role, business_unit_id: businessUnit?.id ?? null })
      .eq("id", userId);

    if (updateError) {
      console.error(`Failed to update profile for ${demoUser.email}:`, updateError.message);
      continue;
    }

    console.log(`Seeded ${demoUser.email} (password: ${demoUser.password})`);
  }
}

main().then(() => process.exit(0));
