import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const PUBLIC_PATHS = [
  "/health",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/review",
  "/feedback",
  "/cozy/review",
  "/cozy/feedback",
  "/lavender/review",
  "/lavender/feedback",
  "/ruby/review",
  "/ruby/feedback",
  "/zalo_verifierVFIbDv_oTHD5vU0de-rp8M3JndgCfHqaCZaq.html",
];

// API routes authenticate themselves (see src/server/auth/api-auth.ts) since
// they accept either a dashboard session *or* an x-api-key service caller
// (n8n, webhooks) — a caller with no cookies must not be redirected/401'd
// here before the route gets a chance to check for an API key.
function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Nothing to enforce until a Supabase project is actually wired up.
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalidRefreshToken = /invalid refresh token|refresh token.*already used|refresh_token_not_found/i.test(message);
    if (!invalidRefreshToken) throw error;

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
    loginUrl.searchParams.set("reason", "session_expired");
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of request.cookies.getAll()) {
      if (/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)) {
        redirect.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
      }
    }
    return redirect;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
