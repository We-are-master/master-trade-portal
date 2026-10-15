import { NextResponse, type NextRequest } from "next/server";
import { enterPartnerInvite } from "@/lib/partner-invite-enter";
import { createClientForRoute } from "@/lib/supabase/route-handler";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function loginFallbackUrl(req: NextRequest, email?: string, inviteCode?: string): URL {
  const url = new URL("/login", req.url);
  if (email) url.searchParams.set("email", email);
  if (inviteCode) url.searchParams.set("invite", inviteCode);
  url.searchParams.set("invite_error", "1");
  return url;
}

/** GET /api/auth/invite/enter?invite= — one-click OS invite → session + onboarding. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const inviteCode = (params.get("invite") || params.get("token") || "").trim();
  if (!inviteCode) {
    return NextResponse.redirect(loginFallbackUrl(req));
  }

  try {
    const admin = createServiceClient();
    /**
     * Destino depois de entrar (15/10/2026): o link do report no e-mail manda o parceiro
     * direto para a aba Report do job. Só caminho interno, nada de outro domínio.
     */
    const next = params.get("next") ?? "";
    const destinoInterno = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
    const redirectUrl = new URL(destinoInterno ? next : "/", req.url);
    if (!destinoInterno) redirectUrl.searchParams.set("welcome", "1");
    let response = NextResponse.redirect(redirectUrl);

    const supabase = await createClientForRoute(response);
    const result = await enterPartnerInvite(admin, supabase, inviteCode);

    if (!result.ok) {
      return NextResponse.redirect(loginFallbackUrl(req, result.email, result.inviteCode));
    }

    return response;
  } catch (e) {
    console.error("[auth/invite/enter]", e);
    return NextResponse.redirect(loginFallbackUrl(req));
  }
}
