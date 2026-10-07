"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/ninja", label: "Ninja", match: (p: string) => p.startsWith("/ninja") },
  { href: "/shark", label: "Shark", match: (p: string) => p.startsWith("/shark") },
  { href: "/upload", label: "Import data", match: (p: string) => p.startsWith("/upload") },
];

/** Header navigation with the current section marked for sighted and AT users. */
export function SiteNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] sm:gap-x-5">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "border-b-2 border-teal pb-0.5 font-semibold text-ink"
                : "border-b-2 border-transparent pb-0.5 text-ink-60 hover:text-ink"
            }
          >
            {l.label}
          </Link>
        );
      })}
      <a
        download
        href="/api/template?format=xlsx&blank=1"
        className="border-b-2 border-transparent pb-0.5 text-ink-60 hover:text-ink"
        title="Download blank Excel import template"
      >
        Template
      </a>
    </nav>
  );
}
