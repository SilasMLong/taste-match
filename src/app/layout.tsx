import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SITE_URL } from "./legal";

export const metadata: Metadata = {
  // Without this, relative URLs in metadata resolve against localhost in
  // development and against the deployment URL in production -- so anything
  // shared would carry whichever Vercel preview built it.
  metadataBase: new URL(SITE_URL),
  title: "Taste Match",
  description: "Build visual taste through repeated exposure to art.",
  openGraph: {
    title: "Taste Match",
    description: "Build visual taste through repeated exposure to art.",
    url: SITE_URL,
    siteName: "Taste Match",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="flex items-center justify-between px-6 py-5 sm:px-10">
            <Link
              href="/"
              className="font-serif text-lg tracking-tight text-foreground"
            >
              Taste Match
            </Link>
            <nav className="flex items-center gap-6">
              <Link
                href="/taste"
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                Taste
              </Link>
              <Link
                href="/liked"
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                Liked
              </Link>
            </nav>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
          {/* Discreet, but present on every page: Google's OAuth consent screen
              requires a reachable privacy policy and terms of service, and a
              site that stores anything should link them anyway. */}
          <footer className="flex items-center justify-center gap-5 px-6 py-6 text-xs text-muted">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
