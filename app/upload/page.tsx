import Link from "next/link";
import { UploadForm } from "@/components/UploadForm";
import { loadReviews } from "@/lib/data";
import { getStore, getStoreDescription, usingSnapshot } from "@/lib/store";
import { dateRange } from "@/lib/aggregate";
import { Panel } from "@/components/Stat";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const store = getStore();
  await store.init();
  const [reviews, imports] = await Promise.all([
    loadReviews(),
    store.listImports(),
  ]);
  const range = dateRange(reviews);
  const snapshot = usingSnapshot();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import data</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-snug text-ink-60">
          Drop your review workbook or paste reviews directly from Amazon.
          Duplicates are skipped automatically, so re-importing is always safe.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[12px] text-ink-60">
        <div>
          Active database: <strong className="text-ink">{getStoreDescription()}</strong>
        </div>
        <div className="text-[11px]">
          {reviews.length} reviews loaded {range ? `(${range.from} to ${range.to})` : ""}
        </div>
      </div>

      {snapshot ? (
        <div className="rounded-lg border border-warn-line bg-warn-bg p-4 text-[13px] text-warn">
          <b>Showing bundled snapshot (read-only mode).</b> Connect a database (DATABASE_URL) or run locally to save new imports.
        </div>
      ) : null}

      <UploadForm />

      <Panel
        title="What is loaded"
        subtitle={
          reviews.length === 0
            ? "Nothing yet"
            : `${reviews.length} reviews${range ? `, dated ${range.from} to ${range.to}` : ""}`
        }
      >
        {reviews.length > 0 ? (
          <Link
            href="/"
            className="inline-block rounded-md bg-teal px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-teal-dark hover:text-white"
          >
            Open the dashboard
          </Link>
        ) : (
          <p className="text-[13px] text-ink-60">
            Import a workbook and the dashboard fills itself in.
          </p>
        )}
      </Panel>

      {imports.length > 0 ? (
        <Panel title="Import history" subtitle="Most recent first">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px]">
            <caption className="sr-only">Previous imports, most recent first</caption>
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-60">
                <th scope="col" className="pb-2 font-semibold">When</th>
                <th scope="col" className="pb-2 font-semibold">File</th>
                <th scope="col" className="pb-2 text-right font-semibold">Parsed</th>
                <th scope="col" className="pb-2 text-right font-semibold">Added</th>
                <th scope="col" className="pb-2 text-right font-semibold">Already had</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} className="border-b border-line-soft last:border-0">
                  <td className="py-2 text-ink-60">
                    {new Date(i.createdAt).toLocaleString("en-GB")}
                  </td>
                  <td className="py-2">{i.filename}</td>
                  <td className="tabular py-2 text-right">{i.report.parsed}</td>
                  <td className="tabular py-2 text-right font-semibold">
                    {i.report.inserted}
                  </td>
                  <td className="tabular py-2 text-right text-ink-60">
                    {i.report.duplicates}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Panel>
      ) : null}
    </div>
  );
}
