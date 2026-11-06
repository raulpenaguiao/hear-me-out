import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { safeRedirectPath } from "@/lib/validation";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const linkError = params.erro === "link";

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá de novo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entra para gravar e publicar.</p>
      </div>
      {linkError ? (
        <FormMessage error="Esse link já expirou ou não é válido. Pede um novo, se precisares." />
      ) : null}
      <ActionForm action={signInAction}>
        <input type="hidden" name="next" value={next} />
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Palavra-passe" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton size="lg" pendingLabel="A entrar…">
          Entrar
        </SubmitButton>
      </ActionForm>
      <div className="flex flex-col gap-2 text-center text-sm">
        <Link href="/recuperar-palavra-passe" className="text-muted-foreground underline-offset-4 hover:underline">
          Esqueci-me da palavra-passe
        </Link>
        <p className="text-muted-foreground">
          Ainda não tens conta?{" "}
          <Link href="/registar" className="font-medium text-primary underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </Card>
  );
}
