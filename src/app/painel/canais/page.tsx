import { ChevronRight, Plus, Radio } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { pluralize } from "@/lib/format";
import { requirePublisher } from "@/server/auth";
import { listChannels } from "@/server/services/channels";

export const metadata: Metadata = { title: "Os meus canais" };

export default async function ChannelsPage({ searchParams }: PageProps<"/painel/canais">) {
  const { ctx } = await requirePublisher();
  const [channels, params] = await Promise.all([listChannels(ctx), searchParams]);

  return (
    <>
      <PageHeader
        title="Os meus canais"
        actions={
          <ButtonLink href="/painel/canais/novo">
            <Plus aria-hidden />
            Novo canal
          </ButtonLink>
        }
      />
      {params.apagado ? <Notice>Canal apagado.</Notice> : null}
      {channels.length === 0 ? (
        <EmptyState icon={<Radio />} title="Ainda não tens canais">
          <p className="text-sm text-muted-foreground">Cria um canal para começares a publicar episódios.</p>
          <ButtonLink href="/painel/canais/novo">
            <Plus aria-hidden />
            Criar canal
          </ButtonLink>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {channels.map((channel) => (
            <li key={channel.id}>
              <Link
                href={`/painel/canais/${channel.id}`}
                className="flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={channel.hasCover ? `/api/publisher/channels/${channel.id}/cover?v=${encodeURIComponent(channel.updatedAt)}` : "/default-cover.png"}
                  alt=""
                  className="size-16 shrink-0 rounded-xl object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-semibold">{channel.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {pluralize(channel.publishedEpisodeCount, "episódio publicado", "episódios publicados")}
                  </span>
                  {!channel.published ? <Badge className="w-fit">Desativado</Badge> : null}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
