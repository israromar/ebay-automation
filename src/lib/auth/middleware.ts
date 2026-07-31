import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthDisabled, isEmailAllowed } from "@/lib/auth/allowlist";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (isAuthDisabled()) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Misconfigured auth: send everyone to login with a clear failure mode.
    if (!request.nextUrl.pathname.startsWith("/login")) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/login";
      redirect.searchParams.set("error", "auth_not_configured");
      return NextResponse.redirect(redirect);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/auth/logout") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";
  const isApi = path.startsWith("/api/");

  if (!user && !isPublic) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (user?.email && !isEmailAllowed(user.email)) {
    await supabase.auth.signOut();
    if (isApi) {
      return NextResponse.json({ error: "Email not allowlisted" }, { status: 403 });
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("error", "not_allowed");
    return NextResponse.redirect(redirect);
  }

  if (user && path.startsWith("/login")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}
