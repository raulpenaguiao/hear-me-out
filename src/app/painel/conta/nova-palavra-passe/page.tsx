import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { updatePasswordAction } from "../../actions";

export const metadata: Metadata = { title: "Nova palavra-passe" };

/** Landing page of the password-recovery e-mail link (session already set). */
export default function NewPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Define uma nova palavra-passe" />
      <Card>
        <ActionForm action={updatePasswordAction}>
          <Field label="Nova palavra-passe" htmlFor="password" hint="Pelo menos 8 caracteres.">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirmar" htmlFor="confirm">
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <SubmitButton size="lg" pendingLabel="A guardar…">
            Guardar palavra-passe
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
