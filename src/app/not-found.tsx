import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="conteudo"
      className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground">O que procuras não existe ou deixou de estar disponível.</p>
      <ButtonLink href="/" variant="outline">
        Ir para o início
      </ButtonLink>
    </main>
  );
}
