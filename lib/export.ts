import * as XLSX from "xlsx";
import { dateRange, MIN_VERIFIED_FOR_CONFIDENCE, summarise } from "./aggregate";
import { describeFilter, type ReviewFilter } from "./filter";
import { SKUS, skuById } from "./skus";
import { sentimentOf, type Review } from "./types";

/**
 * Reviews out of the dashboard, as a file someone can open in Excel.
 *
 * The review columns carry the import template's own headers, so an export
 * can be edited and imported again without renaming anything. Brand,
 * Sentiment and Problem areas are extra columns the importer ignores: they are
 * the dashboard's reading of each review, handed over alongside it.
 */
type Column = {
  header: string;
  width: number;
  value: (r: Review) => string | number;
};

const product = (r: Review) => skuById(r.skuId);

const COLUMNS: Column[] = [
  { header: "Product", width: 26, value: (r) => product(r)?.name ?? r.skuId },
  { header: "Brand", width: 8, value: (r) => product(r)?.brand ?? "" },
  { header: "ASIN", width: 13, value: (r) => product(r)?.asin ?? "" },
  { header: "Rating", width: 7, value: (r) => r.rating },
  { header: "Sentiment", width: 10, value: (r) => capitalise(sentimentOf(r.rating)) },
  { header: "Date", width: 11, value: (r) => r.reviewDate },
  { header: "Title", width: 34, value: (r) => r.title },
  { header: "Review", width: 70, value: (r) => r.body },
  { header: "Reviewer", width: 20, value: (r) => r.reviewer },
  { header: "Verified purchase", width: 10, value: (r) => (r.verified ? "Yes" : "No") },
  { header: "Variant", width: 22, value: (r) => r.variant ?? "" },
  { header: "Country", width: 9, value: (r) => r.country },
  { header: "Problem areas", width: 28, value: (r) => r.buckets.join("; ") },
];

export const EXPORT_HEADERS = COLUMNS.map((c) => c.header);

const DATE_COL = EXPORT_HEADERS.indexOf("Date");

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Excel's serial day for a calendar date, worked out from the date's parts so
 * no time zone can move it. A real date cell rather than text, so the Date
 * column sorts and filters by month in Excel.
 */
function excelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000 + 25_569;
}

export type ExportMeta = {
  filter: ReviewFilter;
  /** Where the rows came from, in words: "Read-only Snapshot", "PostgreSQL". */
  source: string;
  generatedAt: Date;
};

export function exportWorkbook(reviews: Review[], meta: ExportMeta): Buffer {
  const wb = XLSX.utils.book_new();

  const sheet = XLSX.utils.aoa_to_sheet([
    EXPORT_HEADERS,
    ...reviews.map((r) => COLUMNS.map((c) => c.value(r))),
  ]);
  for (let i = 0; i < reviews.length; i++) {
    const ref = XLSX.utils.encode_cell({ r: i + 1, c: DATE_COL });
    sheet[ref] = { t: "n", v: excelSerial(reviews[i].reviewDate), z: "yyyy-mm-dd" };
  }
  sheet["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));
  if (reviews.length > 0) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: reviews.length, c: COLUMNS.length - 1 },
      }),
    };
  }
  XLSX.utils.book_append_sheet(wb, sheet, "Reviews");

  const summary = XLSX.utils.aoa_to_sheet(summaryRows(reviews));
  summary["!cols"] = [
    { wch: 26 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 44 },
  ];
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  const about = XLSX.utils.aoa_to_sheet(aboutRows(reviews, meta));
  about["!cols"] = [{ wch: 18 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, about, "About this file");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * One row per product in the file, counted from the rows in the file. Averages
 * are verified purchases only, as everywhere on the dashboard, and a thin
 * average says so rather than sitting in the column looking like the others.
 */
function summaryRows(reviews: Review[]): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["Product", "Brand", "Reviews", "Verified", "Verified avg ★", "% negative", "% positive", "Note"],
  ];
  for (const sku of SKUS) {
    const mine = reviews.filter((r) => r.skuId === sku.id);
    if (mine.length === 0) continue;
    const all = summarise(mine);
    const verified = summarise(mine.filter((r) => r.verified));
    rows.push([
      sku.name,
      sku.brand,
      all.n,
      verified.n,
      verified.avg === null ? "" : round(verified.avg, 2),
      round(all.pctNegative, 0),
      round(all.pctPositive, 0),
      verified.n < MIN_VERIFIED_FOR_CONFIDENCE
        ? `Under ${MIN_VERIFIED_FOR_CONFIDENCE} verified reviews: anecdote, not measurement`
        : "",
    ]);
  }
  return rows;
}

function aboutRows(reviews: Review[], meta: ExportMeta): string[][] {
  const stamp = (d: Date) =>
    d.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST";
  const range = dateRange(reviews);
  const rows: string[][] = [
    ["SharkNinja India: Amazon.in reviews"],
    [],
    ["Rows", String(reviews.length)],
    ["Filters", describeFilter(meta.filter).join(" · ")],
    ["Reviews dated", range ? `${longDate(range.from)} to ${longDate(range.to)}` : "No reviews match"],
    ["Downloaded", stamp(meta.generatedAt)],
    ["Data source", meta.source],
  ];
  rows.push(
    [],
    ["Sentiment", "From the star rating: 4 to 5 stars is Positive, 3 is Neutral, 1 to 2 is Negative."],
    ["Problem areas", "Keyword tags on negative reviews. One review can carry more than one."],
    ["Summary sheet", "Counted from the rows in this file only. Averages use verified purchases, as on the dashboard."],
    ["Re-importing", "The review columns match the import template, so this file can go back in through Import data. Duplicates are skipped."],
  );
  return rows;
}

function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Spreadsheet programs run a CSV cell that starts with one of these as a
 * formula. Reviews are written by strangers, so text columns get the standard
 * guard: a leading apostrophe, which Excel shows as plain text.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function exportCsv(reviews: Review[]): string {
  const rows = [
    EXPORT_HEADERS,
    ...reviews.map((r) =>
      COLUMNS.map((c) => {
        const v = c.value(r);
        return typeof v === "string" && FORMULA_START.test(v) ? `'${v}` : v;
      }),
    ),
  ];
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows));
  // Without a byte-order mark Excel opens UTF-8 as the local code page, and
  // every curly quote and emoji in the reviews turns to mojibake.
  return `﻿${csv}`;
}

/** "ninja-blast-reviews-1-star-2026-09-30" and so on. */
export function exportFilename(f: ReviewFilter, now: Date, ext: "xlsx" | "csv"): string {
  const scope = f.skuId ?? f.brand?.toLowerCase() ?? "sharkninja";
  const parts = [scope, "reviews"];
  if (f.rating !== undefined) parts.push(`${f.rating}-star`);
  if (f.verified === "verified") parts.push("verified");
  if (f.verified === "unverified") parts.push("unverified");
  if (f.bucket) parts.push(slug(f.bucket));
  if (f.q?.trim()) parts.push("search");
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return `${parts.join("-")}-${day}.${ext}`;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
