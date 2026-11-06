"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appUrl, getEnv } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import { emailSchema, firstIssueMessage, safeRedirectPath, signInSchema, signUpSchema } from "@/lib/validation";
import { clientIp, createRateLimiter, RATE_LIMITS, type RateLimitRule } from "@/server/rate-limit";
import { createAdminClient, createUserClient } from "@/server/supabase/clients";

async function allowed(rule: RateLimitRule, extraSubject?: string): Promise<boolean> {
  const env = getEnv();
  const limiter = createRateLimiter({
    admin: createAdminClient(),
    secret: env.TOKEN_HASH_SECRET,
    enabled: env.RATE_LIMIT_ENABLED,
  });
  const ip = clientIp(await headers(), env.TRUST_PROXY_HEADERS);
  const checks = [limiter(rule, `ip:${ip}`)];
  if (extraSubject) checks.push(limiter(rule, `subject:${extraSubject}`));
  return (await Promise.all(checks)).every(Boolean);
}

const TOO_MANY = "Demasiadas tentativas. Aguarda alguns minutos e tenta novamente.";

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  if (!(await allowed(RATE_LIMITS.login, parsed.data.email))) return { error: TOO_MANY };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirma primeiro o teu e-mail (procura a mensagem que te enviámos)." };
    }
    return { error: "E-mail ou palavra-passe incorretos." };
  }
  redirect(safeRedirectPath(formData.get("next")));
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  if (!(await allowed(RATE_LIMITS.signup))) return { error: TOO_MANY };

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/confirm?next=/painel`,
      data: { display_name: parsed.data.displayName ?? null },
    },
  });
  if (error) {
    if (error.code === "weak_password") {
      return { error: "A palavra-passe é demasiado fraca. Escolhe uma mais longa." };
    }
    if (error.code === "user_already_exists") {
      return { error: "Já existe uma conta com este e-mail. Experimenta entrar." };
    }
    return { error: "Não foi possível criar a conta. Tenta novamente." };
  }
  // With e-mail confirmation enabled there is no session yet.
  if (!data.session) {
    return {
      success:
        "Conta criada! Enviámos-te um e-mail de confirmação. Abre o link para começares a publicar.",
    };
  }
  redirect("/painel");
}

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  if (!(await allowed(RATE_LIMITS.passwordReset, parsed.data))) return { error: TOO_MANY };

  const supabase = await createUserClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${appUrl()}/auth/confirm?next=/painel/conta/nova-palavra-passe`,
  });
  // Same response whether or not the account exists (no user enumeration).
  return {
    success: "Se existir uma conta com este e-mail, vais receber um link para definir uma nova palavra-passe.",
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
