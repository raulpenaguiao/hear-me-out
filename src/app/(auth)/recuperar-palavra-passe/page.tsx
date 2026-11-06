import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requestPasswordResetAction } from "../actions";

export const metadata: Metadata = { title: "Recuperar palavra-passe" };

export default function ResetPasswordPage() {
  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar palavra-passe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indica o teu e-mail e enviamos-te um link para definires uma nova.
        </p>
      </div>
      <ActionForm action={requestPasswordResetAction}>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton size="lg" pendingLabel="A enviar…">
          Enviar link
        </SubmitButton>
      </ActionForm>
      <Link href="/entrar" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        Voltar a entrar
      </Link>
    </Card>
  );
}
