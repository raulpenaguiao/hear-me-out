import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Só quem publica precisa de conta. Quem ouve não precisa de nada.
        </p>
      </div>
      <ActionForm action={signUpAction}>
        <Field label="Como te chamas? (opcional)" htmlFor="displayName">
          <Input id="displayName" name="displayName" autoComplete="name" maxLength={80} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Palavra-passe" htmlFor="password" hint="Pelo menos 8 caracteres.">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </Field>
        <SubmitButton size="lg" pendingLabel="A criar conta…">
          Criar conta
        </SubmitButton>
      </ActionForm>
      <p className="text-center text-sm text-muted-foreground">
        Já tens conta?{" "}
        <Link href="/entrar" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
