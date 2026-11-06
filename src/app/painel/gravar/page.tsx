import { Plus, Radio } from "lucide-react";
import type { Metadata } from "next";
import { NewEpisodeForm } from "@/components/episodes/new-episode-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { uploadLimits } from "@/lib/env";
import { requirePublisher } from "@/server/auth";
import { listChannels } from "@/server/services/channels";

export const metadata: Metadata = { title: "Novo episódio" };

export default async function RecordPage({ searchParams }: PageProps<"/painel/gravar">) {
  const { ctx } = await requirePublisher();
  const [channels, params] = await Promise.all([listChannels(ctx), searchParams]);
  const limits = uploadLimits();

  if (channels.length === 0) {
    return (
      <>
        <PageHeader title="Novo episódio" />
        <EmptyState icon={<Radio />} title="Primeiro, cria um canal">
          <p className="text-sm text-muted-foreground">Os episódios vivem dentro de um canal.</p>
          <ButtonLink href="/painel/canais/novo">
            <Plus aria-hidden />
            Criar canal
          </ButtonLink>
        </EmptyState>
      </>
    );
  }

  const requested = typeof params.canal === "string" ? params.canal : undefined;
  const defaultChannelId = channels.find((c) => c.id === requested)?.id ?? channels[0]!.id;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Novo episódio" description="Grava, dá-lhe um título e publica." />
      <Card>
        <NewEpisodeForm
          channels={channels.map((c) => ({ id: c.id, title: c.title }))}
          defaultChannelId={defaultChannelId}
          maxBytes={limits.audioMaxBytes}
          maxDurationSeconds={limits.audioMaxDurationSeconds}
        />
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Dica: no iPhone e no Safari as gravações ficam em M4A, compatível com quase todas as apps de podcasts.
        Noutros navegadores ficam em WebM/Opus, que toca no navegador e em várias apps (p. ex. AntennaPod),
        mas não na Apple Podcasts. Para máxima compatibilidade podes carregar um MP3 ou M4A.
      </p>
    </div>
  );
}
