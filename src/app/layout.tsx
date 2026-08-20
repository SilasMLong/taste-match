import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taste Match",
  description: "Build visual taste through repeated exposure to art.",
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
        </div>
      </body>
    </html>
  );
}
