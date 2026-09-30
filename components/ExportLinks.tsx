import { filterToParams, type ReviewFilter } from "@/lib/filter";

/**
 * Excel and CSV downloads of the reviews behind a view.
 *
 * Plain anchors, like the template downloads: the file is built by a route
 * handler, and client-side navigation would try to render it as a page.
 */
export function ExportLinks({
  filter,
  label,
  count,
}: {
  filter: ReviewFilter;
  label: string;
  /** How many rows the file will hold. Zero disables the links. */
  count: number;
}) {
  const href = (format: "xlsx" | "csv") => {
    const p = filterToParams(filter);
    if (format === "csv") p.set("format", "csv");
    const qs = p.toString();
    return qs ? `/export?${qs}` : "/export";
  };
  const rows = `${count} review${count === 1 ? "" : "s"}`;

  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-40">
        Nothing to download
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-lg border border-line bg-surface text-[12px] font-semibold text-ink">
      <a
        download
        href={href("xlsx")}
        title={`Download ${rows} as an Excel workbook`}
        className="inline-flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 hover:bg-canvas"
      >
        <DownloadIcon />
        {label}
      </a>
      <a
        download
        href={href("csv")}
        title={`Download ${rows} as CSV`}
        className="rounded-r-lg border-l border-line px-2.5 py-1.5 text-ink-60 hover:bg-canvas hover:text-ink"
      >
        CSV
      </a>
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
    </svg>
  );
}
