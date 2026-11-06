import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/validation";
import { createUserClient } from "@/server/supabase/clients";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Handles links from Supabase Auth e-mails (sign-up confirmation and password
 * recovery). Supports both the PKCE `code` flow and `token_hash` templates.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeRedirectPath(url.searchParams.get("next"));
  const supabase = await createUserClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  const target = url.clone();
  target.search = "";
  if (ok) {
    target.pathname = type === "recovery" ? "/painel/conta/nova-palavra-passe" : next;
  } else {
    target.pathname = "/entrar";
    target.searchParams.set("erro", "link");
  }
  return NextResponse.redirect(target);
}
