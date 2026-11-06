import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { ChannelFields } from "@/components/channels/channel-fields";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { createChannelAction } from "../../actions";

export const metadata: Metadata = { title: "Novo canal" };

export default function NewChannelPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Novo canal"
        description="Um canal junta episódios — como um podcast privado."
        back={{ href: "/painel/canais", label: "Os meus canais" }}
      />
      <Card>
        <ActionForm action={createChannelAction}>
          <ChannelFields />
          <SubmitButton size="lg" pendingLabel="A criar…">
            Criar canal
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
