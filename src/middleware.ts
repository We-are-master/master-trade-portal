// Auth gate + Supabase session refresh.
// Unauthenticated requests are redirected to /login; signed-in users hitting /login
// are bounced to /. Standard @supabase/ssr middleware pattern.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/get-started") ||
    path.startsWith("/invite") ||
    path.startsWith("/auth");
  // API routes do their own auth (return JSON 401) and the Stripe webhook is public —
  // never redirect them to /login.
  const isApi = path.startsWith("/api");

  if (!user && !isAuthRoute && !isApi) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }
  if (user && (path.startsWith("/login") || path.startsWith("/signup"))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
