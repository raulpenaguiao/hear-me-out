import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { ChannelFields } from "@/components/channels/channel-fields";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { requirePublisher } from "@/server/auth";
import { orNotFound, uuidParamOr404 } from "@/server/page-helpers";
import { getChannel } from "@/server/services/channels";
import { updateChannelAction } from "../../../actions";

export const metadata: Metadata = { title: "Editar canal" };

export default async function EditChannelPage({ params }: PageProps<"/painel/canais/[id]/editar">) {
  const { ctx } = await requirePublisher();
  const id = uuidParamOr404((await params).id);
  const channel = await orNotFound(getChannel(ctx, id));

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Editar canal"
        back={{ href: `/painel/canais/${channel.id}`, label: channel.title }}
      />
      <Card>
        <ActionForm action={updateChannelAction}>
          <input type="hidden" name="channelId" value={channel.id} />
          <ChannelFields values={channel} showPublished />
          <SubmitButton size="lg" pendingLabel="A guardar…">
            Guardar alterações
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
