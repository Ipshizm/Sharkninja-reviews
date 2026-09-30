import * as XLSX from "xlsx";
import { skuForSheet } from "../skus";
import type { ParsedReview, SkippedRow } from "../types";
import { parseSheet } from "./records";
import { parseTable } from "./table";

export type SheetResult = {
  sheetName: string;
  skuId: string | null;
  /** How the sheet was read, which is worth saying out loud in the report. */
  shape: "template" | "pasted-blocks";
  rows: number;
  reviews: ParsedReview[];
};

export type WorkbookResult = {
  sheets: SheetResult[];
  unmappedSheets: string[];
  skippedRows: SkippedRow[];
  reviews: ParsedReview[];
  rowsRead: number;
};

/**
 * Sheets that carry the product list or the instructions rather than reviews.
 * Only consulted after the template check, because a CSV is handed to us as a
 * single sheet named "Sheet1" and skipping it on the name alone silently threw
 * every row away. "Summary" and "About this file" are the dashboard's own
 * export, which is meant to import straight back in.
 */
const INDEX_SHEETS = /^(sheet1|index|products?|links?|how to fill this in|guide|instructions?|readme|summary|about this file)$/i;

/**
 * Spreadsheet formats are binary containers; a CSV is just text, and SheetJS
 * decodes an undeclared byte buffer as Windows-1252. Every curly apostrophe and
 * emoji in the real reviews then arrives as mojibake, silently, because the
 * import still succeeds. So sniff the container and decode text ourselves.
 */
function readWorkbook(input: ArrayBuffer | Buffer): XLSX.WorkBook {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const isZip = buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b; // xlsx, xlsm
  const isOle =
    buf.length > 7 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11; // legacy xls
  if (isZip || isOle) return XLSX.read(buf, { type: "buffer", cellDates: true });

  let text: string;
  if (buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.subarray(2).toString("utf16le");
  } else if (buf.length > 1 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    text = swapped.toString("utf16le");
  } else {
    text = buf.toString("utf8").replace(/^\uFEFF/, "");
  }
  // raw: true leaves every CSV cell as the text it was. Without it SheetJS
  // reads "10/08/2026" as the eighth of October: month-first, US convention,
  // on an Amazon.in export. Dates are ours to interpret, not its.
  return XLSX.read(text, { type: "string", raw: true });
}

/** Flatten one worksheet into row-ordered strings (all columns joined). */
function sheetToLines(ws: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: false,
  });
  return rows.map((r) =>
    (Array.isArray(r) ? r : [])
      .map((c) => (c == null ? "" : String(c)))
      .join(" ")
      .replace(/ /g, " ")
      .trim(),
  );
}

/**
 * Two shapes go in and reviews come out.
 *
 * The model template is a headed table, one row per review, and is what we ask
 * for. The other shape is how the data actually arrives today: one sheet per
 * SKU holding raw blocks pasted out of the browser, matched to a SKU by tab
 * name. Every sheet is offered to the template reader first, so a file in the
 * asked-for shape works whatever its tabs are called, and a .csv works at all.
 */
export function parseWorkbook(buf: ArrayBuffer | Buffer): WorkbookResult {
  const wb = readWorkbook(buf);
  const sheets: SheetResult[] = [];
  const unmapped: string[] = [];
  const skippedRows: SkippedRow[] = [];
  let rowsRead = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const table = parseTable(ws, sheetName);
    if (table) {
      rowsRead += table.rows;
      skippedRows.push(...table.skipped);
      sheets.push({
        sheetName,
        skuId: null,
        shape: "template",
        rows: table.rows,
        reviews: table.reviews,
      });
      continue;
    }

    if (INDEX_SHEETS.test(sheetName.trim())) continue;

    const sku = skuForSheet(sheetName);
    const lines = sheetToLines(ws);
    rowsRead += lines.length;

    if (!sku) {
      unmapped.push(sheetName);
      continue;
    }

    sheets.push({
      sheetName,
      skuId: sku.id,
      shape: "pasted-blocks",
      rows: lines.length,
      reviews: parseSheet(sku.id, lines),
    });
  }

  return {
    sheets,
    unmappedSheets: unmapped,
    skippedRows,
    reviews: sheets.flatMap((s) => s.reviews),
    rowsRead,
  };
}
