import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePublisher } from "@/server/auth";
import { signOutAction } from "../../(auth)/actions";
import { updatePasswordAction, updateProfileAction } from "../actions";

export const metadata: Metadata = { title: "Conta" };

export default async function AccountPage() {
  const { ctx, user } = await requirePublisher();
  const { data: profile } = await ctx.db.from("profiles").select("display_name").eq("id", user.id).maybeSingle();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Conta" description={user.email} />

      <Card>
        <CardTitle className="mb-4">Perfil</CardTitle>
        <ActionForm action={updateProfileAction}>
          <Field label="Nome" htmlFor="displayName">
            <Input id="displayName" name="displayName" defaultValue={profile?.display_name ?? ""} maxLength={80} />
          </Field>
          <SubmitButton pendingLabel="A guardar…" className="w-fit">
            Guardar
          </SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle className="mb-4">Alterar palavra-passe</CardTitle>
        <ActionForm action={updatePasswordAction}>
          <Field label="Nova palavra-passe" htmlFor="password" hint="Pelo menos 8 caracteres.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirmar" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton pendingLabel="A alterar…" className="w-fit">
            Alterar palavra-passe
          </SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <form action={signOutAction}>
          <SubmitButton variant="outline" pendingLabel="A sair…">
            <LogOut aria-hidden />
            Terminar sessão
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
