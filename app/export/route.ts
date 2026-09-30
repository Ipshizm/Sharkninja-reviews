import { loadReviews } from "@/lib/data";
import { exportCsv, exportFilename, exportWorkbook } from "@/lib/export";
import { filterFromParams, filterReviews } from "@/lib/filter";
import { getStoreDescription } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the reviews a reader is looking at, as .xlsx (default) or .csv.
 *
 * Deliberately outside /api: the proxy gives this path the same access rule
 * as the dashboard pages that link to it. Whoever can see the reviews on
 * screen can take them away, and nobody else.
 *
 *   /export?sku=ninja-blast&rating=1&format=csv
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = filterFromParams(url.searchParams);
  if (!parsed.ok) {
    return new Response(parsed.error, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const format = url.searchParams.get("format") ?? "xlsx";
  if (format !== "xlsx" && format !== "csv") {
    return new Response(`Format must be "xlsx" or "csv", not "${format}".`, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const filter = parsed.filter;
  const reviews = filterReviews(await loadReviews(), filter);
  const now = new Date();
  const filename = exportFilename(filter, now, format);
  const disposition = `attachment; filename="${filename}"`;

  if (format === "csv") {
    return new Response(exportCsv(reviews), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": disposition,
        "cache-control": "no-store",
      },
    });
  }

  const buf = exportWorkbook(reviews, {
    filter,
    source: getStoreDescription(),
    generatedAt: now,
  });
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": disposition,
      "cache-control": "no-store",
    },
  });
}
