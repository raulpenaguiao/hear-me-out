import { KeyRound, Mic, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { CoverUpload } from "@/components/channels/cover-upload";
import { ShareLinks } from "@/components/channels/share-links";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EpisodeRow } from "@/components/episodes/episode-row";
import { EmptyState, Notice, PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { uploadLimits } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requirePublisher } from "@/server/auth";
import { orNotFound, uuidParamOr404 } from "@/server/page-helpers";
import { getChannel, getChannelLinks } from "@/server/services/channels";
import { listEpisodes } from "@/server/services/episodes";
import { deleteChannelAction, rotateTokensAction } from "../../actions";

export const metadata: Metadata = { title: "Canal" };

export default async function ChannelPage({ params, searchParams }: PageProps<"/painel/canais/[id]">) {
  const { ctx } = await requirePublisher();
  const id = uuidParamOr404((await params).id);
  const query = await searchParams;
  const [channel, links, episodes] = await Promise.all([
    orNotFound(getChannel(ctx, id)),
    orNotFound(getChannelLinks(ctx, id)),
    listEpisodes(ctx, { channelId: id }),
  ]);
  const limits = uploadLimits();

  return (
    <>
      <PageHeader
        title={channel.title}
        description={channel.description || undefined}
        back={{ href: "/painel/canais", label: "Os meus canais" }}
        actions={
          <>
            <ButtonLink href={`/painel/canais/${channel.id}/editar`} variant="outline">
              <Pencil aria-hidden />
              Editar
            </ButtonLink>
            <ButtonLink href={`/painel/gravar?canal=${channel.id}`}>
              <Mic aria-hidden />
              Novo episódio
            </ButtonLink>
          </>
        }
      />

      {query.novo ? <Notice>Canal criado! Partilha o link abaixo com quem quiseres.</Notice> : null}
      {query.guardado ? <Notice>Alterações guardadas.</Notice> : null}
      {query["episodio-apagado"] ? <Notice>Episódio apagado.</Notice> : null}
      {!channel.published ? (
        <p className="mb-6 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          Este canal está desativado: a página e o feed não estão acessíveis.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <div className="mb-2 flex items-center justify-between gap-2">
              <CardTitle>Episódios</CardTitle>
              <Badge>{episodes.length}</Badge>
            </div>
            {episodes.length === 0 ? (
              <EmptyState icon={<Mic />} title="Ainda sem episódios">
                <ButtonLink href={`/painel/gravar?canal=${channel.id}`}>
                  <Mic aria-hidden />
                  Gravar o primeiro
                </ButtonLink>
              </EmptyState>
            ) : (
              <ul className="-mx-3 flex flex-col">
                {episodes.map((episode) => (
                  <EpisodeRow key={episode.id} episode={episode} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-4">Partilhar</CardTitle>
            <ShareLinks webUrl={links.webUrl} rssUrl={links.rssUrl} />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col items-center gap-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                channel.hasCover
                  ? `/api/publisher/channels/${channel.id}/cover?v=${encodeURIComponent(channel.updatedAt)}`
                  : "/default-cover.png"
              }
              alt="Capa do canal"
              className="aspect-square w-40 rounded-2xl object-cover shadow-sm"
            />
            <CoverUpload channelId={channel.id} maxBytes={limits.coverMaxBytes} />
          </Card>

          <Card>
            <CardTitle className="mb-1 flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden />
              Revogar acesso
            </CardTitle>
            <p className="mb-4 text-sm text-muted-foreground">
              Gera links novos. Os antigos deixam de funcionar de imediato — terás de partilhar os novos com quem
              deve continuar a ouvir. Ficheiros já descarregados não podem ser apagados dos dispositivos.
            </p>
            <p className="mb-4 text-xs text-muted-foreground">
              Última alteração: {formatDateTime(channel.tokensRotatedAt)}
            </p>
            <div className="flex flex-col gap-3">
              {(
                [
                  ["rss", "Novo link RSS"],
                  ["web", "Novo link da página"],
                  ["both", "Novos links (ambos)"],
                ] as const
              ).map(([which, label]) => (
                <ActionForm key={which} action={rotateTokensAction} className="gap-2">
                  <input type="hidden" name="channelId" value={channel.id} />
                  <input type="hidden" name="which" value={which} />
                  <ConfirmSubmit
                    label={label}
                    confirmLabel="Sim, gerar novo link"
                    variant="outline"
                    message="O link atual vai deixar de funcionar imediatamente. Continuar?"
                  />
                </ActionForm>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-1">Apagar canal</CardTitle>
            <p className="mb-4 text-sm text-muted-foreground">
              Apaga o canal, todos os episódios e os ficheiros de áudio. Não há volta atrás.
            </p>
            <ActionForm action={deleteChannelAction}>
              <input type="hidden" name="channelId" value={channel.id} />
              <ConfirmSubmit
                label="Apagar canal"
                icon={<Trash2 aria-hidden />}
                confirmLabel="Apagar definitivamente"
                message={
                  <>
                    Vais apagar <strong>{channel.title}</strong> e {episodes.length} episódio(s). Tens a certeza?
                  </>
                }
              />
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
