import { loadReviews } from "@/lib/data";
import { filterFromParams, isNarrowed } from "@/lib/filter";
import { buildReport, reportFilename, type ReportScope } from "@/lib/report/data";
import { renderReport } from "@/lib/report/pdf";
import { getStoreDescription } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The insights report as a PDF: the whole portfolio, one brand, or one SKU.
 *
 *   /report                 /report?brand=shark          /report?sku=ninja-blast
 *
 * Outside /api for the same reason as /export: whoever can read the dashboard
 * can take its report away, and nobody else.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = filterFromParams(url.searchParams);
  if (!parsed.ok) return plain(parsed.error, 400);

  const f = parsed.filter;
  // The report reads whole listings. A search or star filter would make every
  // average in it describe a slice while looking like the whole.
  if (isNarrowed(f)) {
    return plain("The report covers whole listings; only brand and sku apply. Use /export for filtered reviews.", 400);
  }

  const scope: ReportScope = f.skuId
    ? { kind: "sku", skuId: f.skuId }
    : f.brand
      ? { kind: "brand", brand: f.brand }
      : { kind: "portfolio" };

  const now = new Date();
  const data = buildReport(await loadReviews(), scope, {
    source: getStoreDescription(),
    generatedAt: now,
  });
  const pdf = await renderReport(data);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${reportFilename(scope, now)}"`,
      "cache-control": "no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
