import { Panel } from "@/components/Stat";
import { TEMPLATE_COLUMNS } from "@/lib/template";

/**
 * The column guide is generated from the same array the parser matches headers
 * against, so what this page promises and what the import accepts are the same
 * list by construction.
 */
export function TemplatePanel() {
  return (
    <Panel
      title="The import template"
      subtitle="One row per review, whatever the file is called and whichever order the columns are in. Column names are matched loosely, so an existing export usually works untouched."
      action={
        /*
         * Plain anchors on purpose: these are file downloads served by a route
         * handler, so client-side routing and prefetching are exactly what we
         * do not want.
         */
        <div className="flex flex-wrap shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface p-1">
            <span className="px-2 text-[11px] font-medium text-ink-60">Blank:</span>
            <a
              download
              href="/api/template?format=xlsx&blank=1"
              className="rounded bg-teal px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:bg-teal-dark hover:text-white"
              title="Clean spreadsheet with headers only, ready to paste data into"
            >
              .xlsx
            </a>
            <a
              download
              href="/api/template?format=csv&blank=1"
              className="rounded border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-teal hover:text-teal-text"
              title="Clean CSV with headers only, ready to paste data into"
            >
              .csv
            </a>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface p-1">
            <span className="px-2 text-[11px] font-medium text-ink-60">Sample:</span>
            <a
              download
              href="/api/template?format=xlsx"
              className="rounded border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-teal hover:text-teal-text"
              title="Spreadsheet with example rows and product guide"
            >
              .xlsx
            </a>
            <a
              download
              href="/api/template?format=csv"
              className="rounded border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-teal hover:text-teal-text"
              title="CSV with example rows"
            >
              .csv
            </a>
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.06em] text-ink-40">
              <th className="pb-2 font-semibold">Column</th>
              <th className="pb-2 font-semibold">Needed</th>
              <th className="pb-2 font-semibold">What goes in it</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_COLUMNS.map((c) => (
              <tr key={c.key} className="border-b border-line-soft last:border-0 align-top">
                <td className="py-2 pr-4 font-semibold whitespace-nowrap">{c.label}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {c.required ? (
                    <span className="text-brand">Required</span>
                  ) : (
                    <span className="text-ink-40">Optional</span>
                  )}
                </td>
                <td className="py-2 leading-snug text-ink-60">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-ink-40">
        Extra columns are ignored. A row that cannot be read is listed back at
        you with its row number rather than dropped, and re-importing a file you
        have already loaded adds only what is new.
      </p>
    </Panel>
  );
}
