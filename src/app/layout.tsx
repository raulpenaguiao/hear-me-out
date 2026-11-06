import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ouve Isto", template: "%s · Ouve Isto" },
  description: "Grava histórias e partilha-as em privado, como um podcast só para quem tu quiseres.",
  applicationName: "Ouve Isto",
  // The app is private by design: nothing here should be indexed.
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1512" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-PT" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2"
        >
          Saltar para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
