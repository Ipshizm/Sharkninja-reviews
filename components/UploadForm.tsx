"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseSheet } from "@/lib/parse/records";
import { SKUS, skuById } from "@/lib/skus";
import type { IngestReport, SkippedRow } from "@/lib/types";
import { warningLabel } from "@/lib/validate";

type State =
  | { status: "idle" }
  | { status: "uploading"; fileNames?: string[] }
  | { status: "done"; reports: IngestReport[]; failures: FileFailure[] }
  | { status: "error"; message: string; unmapped?: string[]; failures?: FileFailure[] };

type FileFailure = { filename: string; error: string };

function detectSkuInText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const sku of SKUS) {
    if (lower.includes(sku.name.toLowerCase())) return sku.id;
    if (sku.model && lower.includes(sku.model.toLowerCase())) return sku.id;
    for (const name of sku.sheetNames) {
      if (name.length > 3 && lower.includes(name.toLowerCase())) return sku.id;
    }
  }
  return null;
}

export function UploadForm() {
  const [mode, setMode] = useState<"drop" | "paste">("drop");
  const [state, setState] = useState<State>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [selectedSku, setSelectedSku] = useState(SKUS[0]?.id ?? "ninja-blast");
  const [pasteText, setPasteText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [userPickedSku, setUserPickedSku] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedText(pasteText);
    }, 200);
    return () => clearTimeout(handler);
  }, [pasteText]);

  // Client-side parsing debounced to prevent keypress lag on large review pastes
  const parsedReviews = useMemo(() => {
    if (!debouncedText.trim() || !selectedSku) return [];
    return parseSheet(selectedSku, debouncedText.split(/\r?\n/));
  }, [selectedSku, debouncedText]);

  // Screen reader live status message
  const liveStatus = useMemo(() => {
    if (state.status === "uploading") {
      return "Importing reviews into database, please wait.";
    }
    if (state.status === "error") {
      return `Import failed: ${state.message}`;
    }
    if (state.status === "done") {
      const count = state.reports.reduce((acc, r) => acc + r.inserted, 0);
      return `Import complete. ${count} new reviews added.`;
    }
    if (mode === "paste" && parsedReviews.length > 0) {
      return `${parsedReviews.length} reviews recognized for ${skuById(selectedSku)?.name}.`;
    }
    return "";
  }, [state, mode, parsedReviews.length, selectedSku]);

  const sendFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files].filter((f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
      if (list.length === 0) {
        setState({
          status: "error",
          message: "Those are not spreadsheets. Send .xlsx, .xls or .csv files.",
        });
        return;
      }

      setState({ status: "uploading", fileNames: list.map((f) => f.name) });
      const form = new FormData();
      for (const f of list) form.append("file", f);

      try {
        const res = await fetch("/api/ingest", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          setState({
            status: "error",
            message: json.error ?? "Import failed.",
            unmapped: json.unmappedSheets,
            failures: json.failures,
          });
          return;
        }
        setState({
          status: "done",
          reports: json.reports as IngestReport[],
          failures: (json.failures ?? []) as FileFailure[],
        });
        router.refresh();
      } catch (err) {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Import failed.",
        });
      }
    },
    [router],
  );

  // "Blind" global paste: Cmd+V anywhere on the page works
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        setMode("drop");
        void sendFiles(e.clipboardData.files);
        return;
      }
      const text = e.clipboardData?.getData("text");
      if (text && text.trim()) {
        e.preventDefault();
        setMode("paste");
        setPasteText(text);
        if (!userPickedSku) {
          const detected = detectSkuInText(text);
          if (detected) setSelectedSku(detected);
        }
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [userPickedSku, sendFiles]);

  async function sendPaste() {
    if (parsedReviews.length === 0) return;
    setState({ status: "uploading" });

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: selectedSku,
          text: pasteText,
          filename: `Pasted reviews (${skuById(selectedSku)?.name ?? selectedSku})`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({
          status: "error",
          message: json.error ?? "Import failed.",
        });
        return;
      }
      setState({ status: "done", reports: json.reports as IngestReport[], failures: [] });
      setPasteText("");
      setDebouncedText("");
      router.refresh();
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Import failed.",
      });
    }
  }

  function handlePasteTextChange(val: string) {
    setPasteText(val);
    if (!userPickedSku) {
      const detected = detectSkuInText(val);
      if (detected) setSelectedSku(detected);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Only clear dragging if leaving current container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        setMode("drop");
        void sendFiles(e.dataTransfer.files);
      }}
    >
      {/* Polite live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveStatus}
      </div>

      {/* Mode navigation tabs with full ARIA tablist semantics */}
      <div
        role="tablist"
        aria-label="Review import method"
        className="flex border-b border-line mb-5"
      >
        <button
          role="tab"
          id="tab-drop"
          aria-selected={mode === "drop"}
          aria-controls="panel-drop"
          tabIndex={mode === "drop" ? 0 : -1}
          type="button"
          onClick={() => setMode("drop")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              setMode("paste");
              document.getElementById("tab-paste")?.focus();
            }
          }}
          className={`pb-2.5 px-4 text-[13px] font-semibold transition border-b-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal rounded-t ${
            mode === "drop"
              ? "border-teal text-teal-text"
              : "border-transparent text-ink-60 hover:text-ink"
          }`}
        >
          Drop workbook (.xlsx / .csv)
        </button>
        <button
          role="tab"
          id="tab-paste"
          aria-selected={mode === "paste"}
          aria-controls="panel-paste"
          tabIndex={mode === "paste" ? 0 : -1}
          type="button"
          onClick={() => setMode("paste")}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              setMode("drop");
              document.getElementById("tab-drop")?.focus();
            }
          }}
          className={`pb-2.5 px-4 text-[13px] font-semibold transition border-b-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal rounded-t ${
            mode === "paste"
              ? "border-teal text-teal-text"
              : "border-transparent text-ink-60 hover:text-ink"
          }`}
        >
          Paste reviews directly
        </button>
      </div>

      {mode === "drop" ? (
        <div
          role="tabpanel"
          id="panel-drop"
          aria-labelledby="tab-drop"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition focus:outline-none focus:ring-2 focus:ring-teal ${
            dragging ? "border-teal bg-teal-tint" : "border-line bg-white hover:border-teal"
          }`}
          aria-label="Upload review workbook: Drop file here or press Enter to browse files"
        >
          <input
            ref={inputRef}
            id="file-upload-input"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => e.target.files && void sendFiles(e.target.files)}
          />
          <p className="text-[15px] font-semibold">
            {state.status === "uploading"
              ? "Reading the file…"
              : "Drop your review workbook here"}
          </p>
          <p className="mt-1 text-[13px] text-ink-60">
            Multi-tab workbooks (one sheet per product) or single-sheet CSVs work as they are. Re-importing is safe: duplicates are skipped automatically.
          </p>
          <span className="mt-3 inline-block rounded border border-line px-3 py-1 text-[11px] font-medium text-ink-60">
            Press Enter or click to browse files
          </span>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-paste"
          aria-labelledby="tab-paste"
          tabIndex={0}
          className="space-y-4 focus:outline-none"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label htmlFor="sku-select" className="text-[13px] font-semibold text-ink whitespace-nowrap">
              Product SKU:
            </label>
            <select
              id="sku-select"
              aria-describedby="sku-hint"
              value={selectedSku}
              onChange={(e) => {
                setSelectedSku(e.target.value);
                setUserPickedSku(true);
              }}
              className="rounded-md border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            >
              <optgroup label="Ninja Products">
                {SKUS.filter((s) => s.brand === "Ninja").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.model ?? s.asin ? ` (${s.model ?? s.asin})` : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Shark Products">
                {SKUS.filter((s) => s.brand === "Shark").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.model ?? s.asin ? ` (${s.model ?? s.asin})` : ""}
                  </option>
                ))}
              </optgroup>
            </select>
            <span id="sku-hint" className="text-[12px] text-ink-60">
              Pasted reviews will be assigned to this product (auto-detects if product name is in text)
            </span>
          </div>

          <div>
            <label htmlFor="paste-textarea" className="block text-[13px] font-semibold text-ink mb-1.5">
              Paste raw reviews:
            </label>
            <textarea
              id="paste-textarea"
              aria-describedby="paste-hint"
              value={pasteText}
              onChange={(e) => handlePasteTextChange(e.target.value)}
              placeholder={`Paste reviews copied directly from Amazon or spreadsheet rows here...\n\nExample:\nShepali\n5.0 out of 5 stars Good Product 👍\nReviewed in India on 12 June 2026\nColour: Cranberrry RedVerified Purchase\nThis blender is really good for on the go shakes...`}
              rows={6}
              className="w-full rounded-md border border-line bg-white p-3 font-mono text-[12px] leading-relaxed text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <p id="paste-hint" className="mt-1 text-[11px] text-ink-60">
              Tip: You can also hit Cmd+V anywhere on this page to paste.
            </p>
          </div>

          {parsedReviews.length > 0 ? (
            <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-teal-tint px-2.5 py-0.5 text-[12px] font-semibold text-teal-text">
                    ✓ {parsedReviews.length} review{parsedReviews.length === 1 ? "" : "s"} parsed
                  </span>
                  <span className="text-[12px] text-ink-60">
                    for <strong>{skuById(selectedSku)?.name}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={state.status === "uploading"}
                  onClick={sendPaste}
                  className="rounded-md bg-teal px-4 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-teal-dark hover:text-white disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  {state.status === "uploading"
                    ? "Importing…"
                    : `Import ${parsedReviews.length} Review${parsedReviews.length === 1 ? "" : "s"}`}
                </button>
              </div>

              {/* Accessible sheet-esque preview table */}
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-line rounded">
                <table className="w-full text-left text-[12px]" aria-label="Parsed reviews preview">
                  <caption className="sr-only">
                    Preview of reviews recognized in the pasted text for {skuById(selectedSku)?.name}
                  </caption>
                  <thead className="sticky top-0 bg-canvas border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-60">
                    <tr>
                      <th scope="col" className="py-2 px-3 w-10">#</th>
                      <th scope="col" className="py-2 px-3 w-36">Reviewer</th>
                      <th scope="col" className="py-2 px-3 w-24">Rating</th>
                      <th scope="col" className="py-2 px-3 w-28">Date</th>
                      <th scope="col" className="py-2 px-3">Title &amp; Snippet</th>
                      <th scope="col" className="py-2 px-3 w-20">Verified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {parsedReviews.map((r, i) => (
                      <tr key={i} className="hover:bg-canvas/60">
                        <td className="py-2 px-3 text-ink-40 tabular">{i + 1}</td>
                        <td className="py-2 px-3 font-medium text-ink">{r.reviewer}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-semibold text-amber-700">★ {r.rating}</span>
                          <span className="sr-only"> out of 5 stars</span>
                        </td>
                        <td className="py-2 px-3 text-ink-60 tabular">{r.reviewDate}</td>
                        <td className="py-2 px-3">
                          <p className="font-medium text-ink">{r.title}</p>
                          <p className="text-[11px] text-ink-60 line-clamp-1">{r.body}</p>
                        </td>
                        <td className="py-2 px-3">
                          {r.verified ? (
                            <span className="text-[11px] font-medium text-teal-text">Yes</span>
                          ) : (
                            <span className="text-[11px] text-ink-40">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : pasteText.trim().length > 0 ? (
            <div
              role="status"
              className="rounded-md border border-warn-line bg-warn-bg p-3 text-[12px] text-warn"
            >
              No reviews recognized in this text yet. Make sure it includes star rating lines (e.g. &quot;5.0 out of 5 stars&quot;).
            </div>
          ) : null}
        </div>
      )}

      {state.status === "uploading" ? (
        <div className="mt-5 rounded-lg border border-line bg-white p-4" role="status">
          <p className="text-[13px] font-semibold">
            Importing{state.fileNames && state.fileNames.length > 0 ? ` ${state.fileNames.length} file${state.fileNames.length === 1 ? "" : "s"}` : ""}…
          </p>
          {state.fileNames && state.fileNames.length > 0 ? (
            <p className="mt-0.5 truncate text-[12px] text-ink-60">{state.fileNames.join(", ")}</p>
          ) : null}
          <div
            role="progressbar"
            aria-label="Import in progress"
            className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-line-soft"
          >
            <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-teal" />
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-brand-line bg-brand-tint p-4"
        >
          <p className="text-[13px] font-semibold text-brand-dark">
            Nothing was imported.
          </p>
          <p className="mt-1 text-[13px] text-brand-dark">{state.message}</p>
          {state.unmapped && state.unmapped.length > 0 ? (
            <p className="mt-1 text-[12px] text-brand-dark">
              Tabs we could not match: {state.unmapped.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === "done" ? (
        <div className="mt-5 space-y-4">
          {state.failures.length > 0 ? (
            <div role="alert" className="rounded-lg border border-brand-line bg-brand-tint p-4">
              <p className="text-[13px] font-semibold text-brand-dark">
                {state.failures.length} file{state.failures.length === 1 ? " was" : "s were"} not imported. The others were saved.
              </p>
              <ul className="mt-1 space-y-1 text-[13px] text-brand-dark">
                {state.failures.map((f) => (
                  <li key={f.filename}>
                    <b className="font-semibold">{f.filename}</b>: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {state.reports.map((r, i) => (
            <ReportCard key={`${r.filename}-${i}`} report={r} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReportCard({ report }: { report: IngestReport }) {
  const nothingNew = report.inserted === 0 && report.duplicates > 0;
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-bold">{report.filename}</h3>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            nothingNew
              ? "bg-line-soft text-ink-60"
              : "bg-teal-tint text-teal-text"
          }`}
        >
          {nothingNew ? "Already up to date" : `${report.inserted} new reviews`}
        </span>
      </div>

      {nothingNew ? (
        <div className="mt-3 rounded-md border border-line bg-canvas p-3 text-[12px] text-ink-60">
          All {report.duplicates} review{report.duplicates === 1 ? "" : "s"} in this import are already in the database. Duplicates were skipped to prevent double-counting.
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between rounded-md border border-teal-line bg-teal-tint p-3 text-[12px] text-teal-text">
          <span>
            Added {report.inserted} new review{report.inserted === 1 ? "" : "s"} to the database.
          </span>
          <Link
            href="/"
            className="font-semibold underline hover:text-ink ml-2 whitespace-nowrap"
          >
            View on dashboard →
          </Link>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-4">
        <Row label="Rows read" value={report.rowsRead} />
        <Row label="Reviews parsed" value={report.parsed} />
        <Row label="Added" value={report.inserted} />
        <Row label="Already had" value={report.duplicates} />
      </dl>

      {report.dateRange ? (
        <p className="mt-3 text-[12px] text-ink-60">
          Reviews dated {report.dateRange.from} to {report.dateRange.to}.
        </p>
      ) : null}

      {report.warnings.length > 0 ? (
        <div className="mt-4 rounded-md border border-warn-line bg-warn-bg p-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-warn">
            {report.warnings.length} thing
            {report.warnings.length === 1 ? "" : "s"} to look at
          </p>
          <ul className="mt-1.5 space-y-1 text-[12px] text-warn">
            {report.warnings.map((w, i) => (
              <li key={i}>{warningLabel(w)}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-warn">
            These are notes on the file, not errors. Everything else was imported.
          </p>
        </div>
      ) : null}

      {report.skippedRows.length > 0 ? (
        <SkippedRows rows={report.skippedRows} />
      ) : null}

      {report.perSku.length > 0 ? (
        <table className="mt-4 w-full text-[13px]" aria-label="Per product breakdown">
          <caption className="sr-only">Breakdown of parsed and inserted reviews per product SKU</caption>
          <thead>
            <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-wider text-ink-60">
              <th scope="col" className="py-1.5 font-semibold">Product</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Parsed</th>
              <th scope="col" className="py-1.5 text-right font-semibold">New</th>
            </tr>
          </thead>
          <tbody>
            {report.perSku.map((s) => (
              <tr key={s.skuId} className="border-t border-line-soft">
                <td className="py-1.5">{s.name}</td>
                <td className="tabular py-1.5 text-right text-ink-60">
                  {s.parsed} parsed
                </td>
                <td className="tabular w-24 py-1.5 text-right">
                  {s.inserted} new
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * Rows the parser could not read. Listed with their spreadsheet row number so
 * the file can be opened and fixed, rather than left to be noticed as a total
 * that came out lower than expected.
 */
function SkippedRows({ rows }: { rows: SkippedRow[] }) {
  const shown = rows.slice(0, 12);
  return (
    <div className="mt-4 rounded-md border border-brand-line bg-brand-tint p-3">
      <p className="text-[12px] font-bold uppercase tracking-wide text-brand-dark">
        {rows.length} row{rows.length === 1 ? "" : "s"} not imported
      </p>
      <ul className="mt-1.5 space-y-1 text-[12px] text-brand-dark">
        {shown.map((r) => (
          <li key={`${r.sheetName}-${r.row}`}>
            <b className="font-semibold">
              {r.sheetName} row {r.row}
            </b>{" "}
            - {r.detail}
          </li>
        ))}
      </ul>
      {rows.length > shown.length ? (
        <p className="mt-1.5 text-[11px] text-brand-dark">
          and {rows.length - shown.length} more.
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-brand-dark">
        Everything else in the file was imported. Fix these rows and import
        again - what is already in will not be counted twice.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-60">{label}</dt>
      <dd className="tabular text-[15px] font-semibold">{value}</dd>
    </div>
  );
}
