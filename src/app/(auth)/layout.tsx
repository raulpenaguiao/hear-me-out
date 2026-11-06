import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <main id="conteudo" className="w-full max-w-sm">
        {children}
      </main>
    </div>
  );
}
