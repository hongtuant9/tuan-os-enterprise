import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicBaseUrl } from "@/server/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: unknown };

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const supabase = await createClient();
  const redirectTo =
    getPublicBaseUrl() +
    "/auth/callback?next=" +
    encodeURIComponent("/reset-password");

  try {
    const result = await Promise.race([
      supabase.auth.resetPasswordForEmail(email, { redirectTo }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("password_reset_timeout")), 15000)
      ),
    ]);

    if (result.error) {
      console.error("[password-reset] Supabase recovery request failed", {
        code: result.error.code,
        status: result.error.status,
        name: result.error.name,
      });
      return NextResponse.json(
        { ok: false, error: "recovery_request_failed" },
        { status: 502 }
      );
    }

    // Generic success response: never reveal whether the account exists.
    return NextResponse.json({ ok: true });
  } catch (error) {
    const name = error instanceof Error ? error.message : "password_reset_error";
    console.error("[password-reset] Recovery request exception", { name });
    return NextResponse.json(
      { ok: false, error: name === "password_reset_timeout" ? "timeout" : "recovery_request_failed" },
      { status: name === "password_reset_timeout" ? 504 : 502 }
    );
  }
}
