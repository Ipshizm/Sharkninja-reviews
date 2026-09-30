/**
 * Download the insights report for a view as a PDF.
 *
 * A plain anchor, like the exports: the file is built by a route handler, and
 * client-side navigation would try to render it as a page.
 */
export function ReportLink({
  brand,
  skuId,
  scopeName,
}: {
  brand?: string;
  skuId?: string;
  /** Who the report is about, for the tooltip: "Ninja", "Ninja Blast". */
  scopeName: string;
}) {
  const p = new URLSearchParams();
  if (skuId) p.set("sku", skuId);
  else if (brand) p.set("brand", brand.toLowerCase());
  const qs = p.toString();

  return (
    <a
      download
      href={qs ? `/report?${qs}` : "/report"}
      title={`Download the insights report for ${scopeName} as a PDF`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-canvas"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="M4 1.75h5.5L12.5 4.75v9.5H4z" />
        <path d="M9.5 1.75v3h3M6 8.5h4.5M6 11h4.5" strokeLinecap="round" />
      </svg>
      PDF report
    </a>
  );
}
