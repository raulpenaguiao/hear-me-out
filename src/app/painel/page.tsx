import { Mic, Plus, Radio } from "lucide-react";
import type { Metadata } from "next";
import { EpisodeRow } from "@/components/episodes/episode-row";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { requirePublisher } from "@/server/auth";
import { listChannels } from "@/server/services/channels";
import { countPublishedEpisodes, listEpisodes } from "@/server/services/episodes";

export const metadata: Metadata = { title: "Início" };

export default async function DashboardPage() {
  const { ctx } = await requirePublisher();
  const [channels, publishedCount, recent, profile] = await Promise.all([
    listChannels(ctx),
    countPublishedEpisodes(ctx),
    listEpisodes(ctx, { limit: 6 }),
    ctx.db.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle(),
  ]);
  const name = profile.data?.display_name;

  return (
    <>
      <PageHeader title={name ? `Olá, ${name}!` : "Olá!"} description="O que vais contar hoje?" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col items-start justify-between gap-4 bg-primary text-primary-foreground sm:col-span-1">
          <div>
            <p className="text-sm opacity-90">Tens uma história para contar?</p>
            <p className="text-xl font-semibold">Grava um episódio</p>
          </div>
          <ButtonLink
            href={channels.length ? "/painel/gravar" : "/painel/canais/novo"}
            variant="secondary"
            size="lg"
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            <Mic aria-hidden />
            {channels.length ? "Gravar agora" : "Criar o primeiro canal"}
          </ButtonLink>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Canais</p>
          <p className="text-4xl font-semibold tabular-nums" data-testid="stat-channels">
            {channels.length}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Episódios publicados</p>
          <p className="text-4xl font-semibold tabular-nums" data-testid="stat-published">
            {publishedCount}
          </p>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <CardTitle>Atividade recente</CardTitle>
        </div>
        {recent.length === 0 ? (
          channels.length === 0 ? (
            <EmptyState icon={<Radio />} title="Ainda não tens canais">
              <p className="text-sm text-muted-foreground">
                Um canal é como um podcast: um sítio onde juntas episódios sobre um tema.
              </p>
              <ButtonLink href="/painel/canais/novo">
                <Plus aria-hidden />
                Criar canal
              </ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState icon={<Mic />} title="Ainda não gravaste nada">
              <ButtonLink href="/painel/gravar">
                <Mic aria-hidden />
                Gravar o primeiro episódio
              </ButtonLink>
            </EmptyState>
          )
        ) : (
          <ul className="-mx-3 flex flex-col">
            {recent.map((episode) => (
              <EpisodeRow key={episode.id} episode={episode} showChannel />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
