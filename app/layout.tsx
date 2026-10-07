import type { Metadata } from "next";
import { Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="text-[15px] font-bold tracking-tight">
                SharkNinja India
              </span>
              <span className="hidden text-[13px] text-ink-60 sm:inline">
                Review Sentiment
              </span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-5 py-8 focus:outline-none">{children}</main>
      </body>
    </html>
  );
}
