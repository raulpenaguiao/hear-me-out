"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Algo correu mal</h1>
      <p className="text-muted-foreground">Ocorreu um erro inesperado. Tenta novamente daqui a pouco.</p>
      <Button onClick={reset} variant="outline">
        Tentar novamente
      </Button>
    </main>
  );
}
