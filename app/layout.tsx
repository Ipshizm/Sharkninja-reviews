import type { Metadata } from "next";
import { Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// globals.css names these variables in --font-display and --font-sans. Until
// they were declared here, every heading fell back to the system font.
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SharkNinja India — Review Sentiment",
  description:
    "Amazon.in customer review sentiment for SharkNinja India listings.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${montserrat.variable} ${jakarta.variable}`}>
      <body className="min-h-screen">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="text-[15px] font-bold tracking-tight">
                SharkNinja India
              </span>
              <span className="hidden text-[13px] text-ink-60 sm:inline">
                Review Sentiment
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-[13px] sm:gap-5">
              <Link href="/" className="text-ink-60 hover:text-ink">
                Dashboard
              </Link>
              <a
                download
                href="/api/template?format=xlsx&blank=1"
                className="text-ink-60 hover:text-ink"
                title="Download blank Excel import template"
              >
                Template
              </a>
              <Link href="/upload" className="text-ink-60 hover:text-ink">
                Import data
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
