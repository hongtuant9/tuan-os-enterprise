"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function recordLogin(): Promise<void> {
  const supabase = await createClient();
  const session = await getCurrentSession(supabase);
  if (!session) return;

  await buildContainer(supabase).activityLog.record({
    agent: session.email ?? "Unknown user",
    unit: "CEO Overview",
    businessUnitId: session.businessUnitId,
    message: `${session.email ?? "A user"} signed in.`,
    type: "info",
  });
}
