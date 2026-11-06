import { Rss } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CopyButton } from "@/components/copy-button";
import { LogoMark } from "@/components/logo";
import { formatDate, formatDuration } from "@/lib/format";
import { getPublicContext } from "@/server/public/context";
import { loadPublicChannelView } from "@/server/public/handlers";

export const dynamic = "force-dynamic";

const loadView = cache((token: string) => loadPublicChannelView(token, getPublicContext()));

export async function generateMetadata({ params }: PageProps<"/c/[token]">): Promise<Metadata> {
  const view = await loadView((await params).token);
  return {
    title: view ? view.title : "Link inválido",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
  };
}

export default async function PublicChannelPage({ params }: PageProps<"/c/[token]">) {
  const view = await loadView((await params).token);
  if (!view) notFound();

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={view.coverUrl}
          alt=""
          width={160}
          height={160}
          className="size-40 shrink-0 rounded-3xl object-cover shadow-md"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Canal privado</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance break-words">{view.title}</h1>
          {view.authorName ? <p className="text-muted-foreground">por {view.authorName}</p> : null}
        </div>
      </header>

      {view.description ? (
        <p className="whitespace-pre-line text-pretty text-muted-foreground">{view.description}</p>
      ) : null}

      <section aria-labelledby="episodios" className="flex flex-col gap-3">
        <h2 id="episodios" className="text-lg font-semibold">
          Episódios
        </h2>
        {view.episodes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Ainda não há episódios publicados. Volta mais tarde — ou subscreve o RSS para saberes quando
            houver.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {view.episodes.map((episode) => (
              <li
                key={episode.guid}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                data-testid="public-episode"
              >
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold break-words">{episode.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={episode.publishedAt}>{formatDate(episode.publishedAt)}</time>
                    {episode.durationSeconds !== null ? ` · ${formatDuration(episode.durationSeconds)}` : ""}
                  </p>
                </div>
                <audio controls preload="none" aria-label={`Ouvir: ${episode.title}`}>
                  <source src={episode.audioUrl} type={episode.mimeType} />O teu navegador não consegue tocar
                  este áudio.
                </audio>
                {episode.description ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{episode.description}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        aria-labelledby="subscrever"
        className="flex flex-col gap-4 rounded-2xl bg-accent/70 p-5 text-accent-foreground"
      >
        <h2 id="subscrever" className="flex items-center gap-2 text-lg font-semibold">
          <Rss className="size-5" aria-hidden />
          Subscrever numa app de podcasts
        </h2>
        <p className="text-sm">
          Copia este link RSS para a tua app de podcasts preferida para seguires este canal. Os episódios
          novos aparecem automaticamente.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code
            className="block min-w-0 flex-1 truncate rounded-xl bg-card px-3 py-2.5 font-mono text-xs text-foreground"
            data-testid="public-rss-url"
          >
            {view.feedUrl}
          </code>
          <CopyButton value={view.feedUrl} label="Copiar link RSS" />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Como adicionar na minha app?</summary>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong>Apple Podcasts (iPhone/iPad):</strong> abre a app, vai a <em>Biblioteca</em>, toca nos
              três pontos (ou em <em>Editar</em>) e escolhe <em>Seguir um programa por URL…</em>. Cola o link.
            </li>
            <li>
              <strong>Apple Podcasts (Mac):</strong> menu <em>Ficheiro → Seguir um programa por URL…</em>.
            </li>
            <li>
              <strong>Pocket Casts, Overcast, AntennaPod, Podcast Addict:</strong> procura a opção{" "}
              <em>Adicionar por URL</em> / <em>Add RSS feed</em> e cola o link.
            </li>
            <li>
              <strong>Spotify e YouTube Music</strong> não aceitam feeds privados. Usa uma das apps acima ou
              ouve aqui mesmo.
            </li>
          </ul>
        </details>
      </section>

      <footer className="flex flex-col items-center gap-2 pt-4 text-center text-xs text-muted-foreground">
        <LogoMark className="size-6" />
        <p>
          Este é um canal privado do Ouve Isto. Quem tiver este link pode ouvir — partilha-o só com quem o
          autor quiser.
        </p>
      </footer>
    </main>
  );
}
