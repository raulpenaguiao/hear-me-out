import { Headphones, Link2, Mic, Rss } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <ButtonLink href="/entrar" variant="ghost" size="sm">
          Entrar
        </ButtonLink>
      </header>

      <main id="conteudo" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 pb-16 pt-8 sm:pt-16">
        <section className="flex max-w-2xl flex-col gap-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Grava as tuas histórias. Partilha-as só com quem quiseres.
          </h1>
          <p className="text-lg text-muted-foreground text-pretty">
            O Ouve Isto é um pequeno podcast privado: gravas no telemóvel, dás um título e publicas. Quem tiver o
            link ouve no navegador ou subscreve na sua app de podcasts — sem contas, sem complicações.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/registar" size="lg">
              <Mic aria-hidden />
              Começar a gravar
            </ButtonLink>
            <ButtonLink href="/entrar" variant="outline" size="lg">
              Já tenho conta
            </ButtonLink>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Como funciona">
          {[
            {
              icon: Mic,
              title: "Grava ou carrega",
              text: "Grava diretamente no navegador ou carrega um ficheiro MP3, M4A, WAV ou WebM.",
            },
            {
              icon: Link2,
              title: "Partilha um link secreto",
              text: "Cada canal tem um link privado. Quem o tiver pode ouvir — sem precisar de conta.",
            },
            {
              icon: Rss,
              title: "Subscreve por RSS",
              text: "Os episódios novos chegam automaticamente à app de podcasts de quem subscreveu.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5">
              <Icon className="mb-3 size-6 text-primary" aria-hidden />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>

        <section className="flex items-start gap-3 rounded-2xl bg-muted p-5 text-sm text-muted-foreground">
          <Headphones className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>
            Privado, mas com bom senso: os links funcionam como uma chave. Qualquer pessoa que receba o link pode
            ouvir e reencaminhá-lo. Se um link circular demais, podes gerar um novo a qualquer momento e o antigo
            deixa de funcionar.
          </p>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-muted-foreground">
        Ouve Isto · sem anúncios, sem rastreamento.
      </footer>
    </div>
  );
}
