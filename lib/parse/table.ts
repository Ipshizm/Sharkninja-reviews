import * as XLSX from "xlsx";
import { SKUS } from "../skus";
import { headerMatch, looksLikeTemplate } from "../template";
import type { ParsedReview, SkippedRow } from "../types";

export type TableResult = {
  /** Spreadsheet row number the headers were found on, 1-based. */
  headerRow: number;
  /** Data rows considered, header excluded. */
  rows: number;
  reviews: ParsedReview[];
  skipped: SkippedRow[];
};

type Cell = unknown;

/**
 * Reads the model template: a headed table, one row per review. Also the shape
 * a scraper export arrives in, which is why the header matching is by alias
 * rather than by exact column name.
 *
 * Nothing is dropped quietly. A row that cannot be read comes back in
 * `skipped` with the spreadsheet row number and the reason, because a silently
 * shorter import is the failure nobody notices until the numbers are wrong.
 */
export function parseTable(ws: XLSX.WorkSheet, sheetName: string): TableResult | null {
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: true,
  });
  if (grid.length === 0) return null;

  // The header is usually row 1, but exported and hand-made sheets often carry
  // a title or a blank line above it. Look a little way down before giving up.
  const limit = Math.min(grid.length, 12);
  let headerIndex = -1;
  for (let i = 0; i < limit; i++) {
    const cells = (grid[i] ?? []).map(asString);
    if (cells.some(Boolean) && looksLikeTemplate(cells)) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return null;

  const headers = (grid[headerIndex] ?? []).map(asString);
  const columns = assignColumns(headers);

  const reviews: ParsedReview[] = [];
  const skipped: SkippedRow[] = [];
  let rows = 0;

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    const at = (key: string): Cell => {
      const idx = columns.get(key);
      return idx == null ? "" : row[idx];
    };
    const str = (key: string) => asString(at(key)).trim();

    // A wholly empty row is spreadsheet padding, not a missing review.
    if (row.every((c) => asString(c).trim() === "")) continue;
    rows++;

    const productText = str("product");
    const asinText = str("asin");
    const sku = resolveSku(productText, asinText);
    if (!sku) {
      skipped.push({
        sheetName,
        row: rowNumber,
        reason: "unknown-product",
        detail:
          productText || asinText
            ? `"${truncate(productText || asinText)}" does not match any SKU. Check it against the Products sheet in the template.`
            : "Neither Product nor ASIN was filled in.",
      });
      continue;
    }

    const rating = parseRating(at("rating"));
    if (rating == null) {
      skipped.push({
        sheetName,
        row: rowNumber,
        reason: "bad-rating",
        detail: `Rating "${truncate(str("rating"))}" is not a number from 1 to 5.`,
      });
      continue;
    }

    const rawDate = at("date");
    const reviewDate = parseDateCell(rawDate);
    if (!reviewDate) {
      skipped.push({
        sheetName,
        row: rowNumber,
        reason: "bad-date",
        detail: str("date")
          ? `Date "${truncate(str("date"))}" could not be read. Use YYYY-MM-DD.`
          : "The Date column is empty.",
      });
      continue;
    }

    const title = collapse(str("title"));
    const body = collapse(str("review"));
    if (!title && !body) {
      skipped.push({
        sheetName,
        row: rowNumber,
        reason: "empty-review",
        detail: `A ${rating}-star row dated ${reviewDate} has neither a title nor any text.`,
      });
      continue;
    }

    const { variant, verifiedInVariant } = splitVariant(str("variant"));

    reviews.push({
      skuId: sku.id,
      reviewer: collapse(str("reviewer")) || "Amazon Customer",
      rating,
      title,
      body,
      reviewDate,
      verified: parseVerified(at("verified")) || verifiedInVariant,
      country: str("country") || countryFrom(asString(rawDate)) || "India",
      variant: variant || null,
    });
  }

  return { headerRow: headerIndex + 1, rows, reviews, skipped };
}

/**
 * Header text to column index.
 *
 * Two passes, because column order is not evidence. A sheet headed
 * `Title, Review Title` in that order used to read the product title as the
 * review headline and ignore the real one, on nothing but position. Clear
 * headers claim their column first; the vague ones only fill what is left.
 */
function assignColumns(headers: string[]): Map<string, number> {
  const columns = new Map<string, number>();
  const later: { key: string; idx: number }[] = [];

  headers.forEach((h, idx) => {
    const m = headerMatch(h);
    if (!m) return;
    if (m.ambiguous) {
      later.push({ key: m.key, idx });
      return;
    }
    // Among equally clear headers the first still wins, so a stray duplicate
    // cannot shadow the real one.
    if (!columns.has(m.key)) columns.set(m.key, idx);
  });

  for (const { key, idx } of later) if (!columns.has(key)) columns.set(key, idx);
  return columns;
}

function asString(c: Cell): string {
  if (c == null) return "";
  if (c instanceof Date) return isoLocal(c);
  return String(c);
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const truncate = (s: string) => (s.length > 50 ? `${s.slice(0, 50)}...` : s);

/**
 * Product names are typed by hand, so match on more than exact equality: the
 * SKU id, the model code, the ASIN, and a punctuation-insensitive form of the
 * name ("Ninja Air Fryer 6.2 L" and "ninja air fryer 6.2l" are the same thing).
 */
function resolveSku(product: string, asin: string) {
  const a = asin.trim().toLowerCase();
  if (a) {
    const byAsin = SKUS.find((s) => s.asin?.toLowerCase() === a);
    if (byAsin) return byAsin;
  }
  const p = product.trim().toLowerCase();
  if (!p) return undefined;

  const exact = SKUS.find((s) => s.name.toLowerCase() === p);
  if (exact) return exact;

  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const k = key(p);
  return SKUS.find(
    (s) =>
      key(s.name) === k ||
      key(s.id) === k ||
      s.asin?.toLowerCase() === p ||
      (s.model ? key(s.model) === k : false),
  );
}

/** "4", 4, "4.0", "4.0 out of 5 stars", "4/5", "★★★★" all mean four. */
export function parseRating(cell: Cell): number | null {
  if (typeof cell === "number") return inRange(cell);
  const s = asString(cell).trim();
  if (!s) return null;

  const stars = s.match(/★/g);
  if (stars && !/\d/.test(s)) return inRange(stars.length);

  // A number that says what it is, wherever it sits in the cell.
  const qualified = s.match(/(\d(?:\.\d+)?)\s*(?:out of\s*5\b|\/\s*5\b|stars?\b)/i);
  if (qualified) return inRange(Number(qualified[1]));

  // Otherwise the cell has to be the number and nothing else. Digging a digit
  // out of free text finds the 2 in "Reviewed 2026" and calls it two stars.
  const bare = s.match(/^(\d(?:\.\d+)?)$/);
  return bare ? inRange(Number(bare[1])) : null;
}

function inRange(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Dates arrive as Excel date cells, as serial numbers when the column was never
 * formatted, and as every way a person writes a date into a spreadsheet.
 * Day-first is assumed for ambiguous slash dates: the data is Amazon.in.
 */
export function parseDateCell(cell: Cell): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return isoLocal(cell);
  }
  if (typeof cell === "number") return fromSerial(cell);

  let s = asString(cell).trim();
  if (!s) return null;

  // "Reviewed in India on 10 August 2026"
  const reviewedOn = s.match(/\bon\s+(.+)$/i);
  if (/^reviewed in/i.test(s) && reviewedOn) s = reviewedOn[1].trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // A serial number that was saved as text.
  if (/^\d{4,6}(\.\d+)?$/.test(s)) return fromSerial(Number(s));

  // "10 August 2026" / "10 Aug 2026"
  const dmy = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dmy) {
    const mm = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    if (mm) return `${dmy[3]}-${mm}-${dmy[1].padStart(2, "0")}`;
  }

  // "August 10, 2026"
  const mdy = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const mm = MONTHS[mdy[1].slice(0, 3).toLowerCase()];
    if (mm) return `${mdy[3]}-${mm}-${mdy[2].padStart(2, "0")}`;
  }

  // "10/08/2026", "10-08-26". Day first unless that is impossible.
  const numeric = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (numeric) {
    let [d, m] = [Number(numeric[1]), Number(numeric[2])];
    const twoDigitYear = numeric[3].length <= 2;
    // "26-08-10" is either the 26th of August 2010 read day-first, or the 10th
    // of August 2026 read year-first, and nothing in the cell says which.
    // Refuse it and name the row rather than pick one and be silently wrong.
    if (twoDigitYear && d > 12) return null;
    if (d > 12 && m > 12) return null;
    if (d <= 12 && m > 12) [d, m] = [m, d];
    if (d > 31 || m > 12 || d < 1 || m < 1) return null;
    const y = twoDigitYear ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // A date with a time and a zone on it — what scrapers export. Read the
  // calendar day that is written down. Handing the whole string to Date and
  // taking its local day turns "10 Aug 2026 23:00 GMT" into the 11th in India.
  const embedded =
    s.match(/\b(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})\b/) ??
    s.match(/\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (embedded) {
    const dayFirst = /^\d/.test(embedded[1]);
    const day = dayFirst ? embedded[1] : embedded[2];
    const monthWord = dayFirst ? embedded[2] : embedded[1];
    const mm = MONTHS[monthWord.slice(0, 3).toLowerCase()];
    if (mm) return `${embedded[3]}-${mm}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : isoLocal(parsed);
}

/** Excel's day count, 1900-based, including its deliberate 1900 leap-year bug. */
function fromSerial(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : isoUtc(d);
}

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A date cell comes back from SheetJS as local midnight. Reading its UTC
 * calendar day instead moves every review one day earlier everywhere east of
 * Greenwich, which for an Amazon.in export is everywhere. Read the local day.
 */
function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TRUE_WORDS = new Set([
  "y", "yes", "true", "1", "verified", "verified purchase", "verifiedpurchase", "x", "✓",
]);

export function parseVerified(cell: Cell): boolean {
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number") return cell === 1;
  return TRUE_WORDS.has(asString(cell).trim().toLowerCase());
}

/**
 * Amazon glues the verified flag onto the end of the variant line, and the
 * block-paste path already deals with that. A pasted template can carry it too.
 */
function splitVariant(raw: string): { variant: string; verifiedInVariant: boolean } {
  const verified = /verified purchase/i.test(raw);
  const variant = collapse(raw.replace(/verified purchase/i, ""));
  return { variant, verifiedInVariant: verified };
}

function countryFrom(raw: string): string | null {
  const m = raw.match(/^reviewed in ([A-Za-z ]+?)\s+on\b/i);
  return m ? m[1].trim() : null;
}
