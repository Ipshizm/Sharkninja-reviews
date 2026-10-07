import * as XLSX from "xlsx";
import { SKUS } from "./skus";

/**
 * The model template: the one shape this app promises to accept.
 *
 * Everything else on the import path is a concession to how the data actually
 * arrives today (blocks of text pasted out of a browser, one sheet per SKU).
 * This is the shape we ask for — a plain table, one row per review, readable in
 * Excel, Sheets or Numbers, and identical whether it is saved as .csv or .xlsx.
 *
 * The column list is the single source of truth. The blank template handed to
 * whoever fills it in, the header matching done at import, and the column
 * documentation on the import page are all generated from this array, so they
 * cannot drift apart.
 */
export type TemplateColumn = {
  /** Canonical key used inside the parser. */
  key: string;
  /** Header text written into the generated template. */
  label: string;
  /**
   * Other headers accepted for this column, normalised. Existing exports and
   * the Apify actor both use their own names, and someone typing the sheet by
   * hand will write "Review Date" rather than "date".
   */
  aliases: string[];
  /**
   * Headers that mean this column here but something else in a product export:
   * "Title" and "Description" are the item's, not the review's, in an Amazon
   * catalogue dump. They are only used when no clearer header claims the
   * column, and a sheet made of nothing but these is not treated as a review
   * table at all.
   */
  ambiguous?: string[];
  required: boolean;
  note: string;
  example: string;
};

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  {
    key: "product",
    label: "Product",
    aliases: ["productname", "sku", "skuname", "item", "model", "titleproduct"],
    ambiguous: ["item", "model"],
    required: true,
    note:
      "The product name exactly as it appears in the SKU list on the second sheet. Its model code or slug works too. Leave blank only if you have filled in ASIN.",
    example: "Ninja Air Fryer 6.2L",
  },
  {
    key: "asin",
    label: "ASIN",
    aliases: ["amazonasin", "productasin", "asincode"],
    required: false,
    note: "Amazon's product code. An alternative to Product, not an extra requirement.",
    example: "B0FWY8R9W8",
  },
  {
    key: "rating",
    label: "Rating",
    aliases: ["stars", "score", "star", "starrating", "reviewrating", "overall"],
    ambiguous: ["score", "overall"],
    required: true,
    note:
      "1 to 5. \"4\", \"4.0\" and \"4.0 out of 5 stars\" are all read as 4. A row without a usable rating is reported, not imported.",
    example: "1",
  },
  {
    key: "title",
    label: "Title",
    aliases: ["reviewtitle", "headline", "summary", "reviewheadline"],
    ambiguous: ["title", "summary"],
    required: false,
    note:
      "The bold line above the review. Title or Review has to have something in it — plenty of real reviews are title-only.",
    example: "Damaged on Arrival & No Response",
  },
  {
    key: "review",
    label: "Review",
    aliases: ["reviewtext", "body", "text", "content", "comment", "description", "reviewbody"],
    ambiguous: ["text", "content", "description"],
    required: false,
    note: "The review itself. Line breaks inside the cell are fine.",
    example: "Arrived with a broken basket straight out of the box and nobody replied.",
  },
  {
    key: "date",
    label: "Date",
    aliases: ["reviewdate", "posted", "postedon", "datereviewed", "reviewedon", "submittime"],
    required: true,
    note:
      "The date the review was posted. YYYY-MM-DD is safest. \"10 August 2026\", a real Excel date cell, and \"Reviewed in India on 10 August 2026\" are all understood. A bare 10/08/2026 is read day-first.",
    example: "2026-08-10",
  },
  {
    key: "reviewer",
    label: "Reviewer",
    aliases: ["author", "name", "username", "customer", "reviewername", "profilename"],
    ambiguous: ["name", "customer"],
    required: false,
    note: "Blank becomes \"Amazon Customer\". Used to tell two reviews apart, so keep it if you have it.",
    example: "Surendhran S",
  },
  {
    key: "verified",
    label: "Verified purchase",
    aliases: ["verifiedpurchase", "isverified", "verifiedbuyer", "purchaseverified"],
    required: false,
    note:
      "Yes or No. Blank means no. The headline averages and the rankings only count verified rows, so this column changes the numbers.",
    example: "Yes",
  },
  {
    key: "variant",
    label: "Variant",
    aliases: ["colour", "color", "size", "style", "option", "configuration"],
    required: false,
    note: "Colour or size bought, if the review shows one. \"Sea Salt Grey\" or \"Colour: Sea Salt Grey\".",
    example: "Colour: BLACK",
  },
  {
    key: "country",
    label: "Country",
    aliases: ["countryofreview", "marketplace", "locale", "region"],
    required: false,
    note:
      "Where the review was posted. Blank becomes India, which is right for every listing here.",
    example: "India",
  },
];

/** Header text -> canonical key. Comparison ignores case, spaces and punctuation. */
export const normaliseHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export type HeaderMatch = { key: string; ambiguous: boolean };

const HEADER_LOOKUP: Map<string, HeaderMatch> = new Map(
  TEMPLATE_COLUMNS.flatMap((c) => {
    const vague = new Set((c.ambiguous ?? []).map(normaliseHeader));
    const entry = (h: string): [string, HeaderMatch] => [
      normaliseHeader(h),
      { key: c.key, ambiguous: vague.has(normaliseHeader(h)) },
    ];
    return [entry(c.label), entry(c.key), ...c.aliases.map(entry)];
  }),
);

export function headerMatch(header: string): HeaderMatch | undefined {
  return HEADER_LOOKUP.get(normaliseHeader(header));
}

export function columnKeyFor(header: string): string | undefined {
  return headerMatch(header)?.key;
}

/**
 * A sheet is the model template if it carries a rating, something to identify
 * the product, and something to read.
 *
 * At least one of its headers has to name itself unambiguously. Otherwise
 * `Model, Score, Summary` — an ML evaluation, a scorecard, anything — reads as
 * product, rating and title, and a wrong file uploaded by mistake fills the
 * dashboard with rows that are not reviews instead of being refused.
 */
export function looksLikeTemplate(headers: string[]): boolean {
  const matches = headers
    .map((h) => headerMatch(h))
    .filter((m): m is HeaderMatch => Boolean(m));

  const keys = new Set(matches.map((m) => m.key));
  const hasSubject = keys.has("product") || keys.has("asin");
  const hasContent = keys.has("review") || keys.has("title");
  const namesItself = matches.some((m) => !m.ambiguous);

  return keys.has("rating") && hasSubject && hasContent && namesItself;
}

const HEADERS = TEMPLATE_COLUMNS.map((c) => c.label);

/**
 * Two filled rows ship with the blank template. Without them the first question
 * is always "what goes in Variant", and an empty grid gives no answer.
 */
const EXAMPLE_ROWS = [
  TEMPLATE_COLUMNS.map((c) => c.example),
  [
    "Shark Steam & Scrub",
    "",
    "5",
    "Does what it says",
    "Cleans the floor properly in one pass. Refilling is easy.",
    "2026-08-02",
    "K. Agarwal",
    "Yes",
    "",
    "India",
  ],
];

/** The SKU reference sheet: what may go in the Product column. */
function skuReferenceRows(): string[][] {
  return [
    ["Product", "Brand", "ASIN", "Model", "Also accepted"],
    ...SKUS.map((s) => [s.name, s.brand, s.asin ?? "", s.model ?? "", s.id]),
  ];
}

/** The column guide, written into the template rather than only onto the page. */
function guideRows(): string[][] {
  return [
    ["Column", "Required", "What goes in it"],
    ...TEMPLATE_COLUMNS.map((c) => [
      c.label,
      c.required ? "Required" : "Optional",
      c.note,
    ]),
    [],
    [
      "Notes",
      "",
      "One row per review. Delete the two example rows before importing. Extra columns are ignored, column order does not matter, and re-importing a file you have already loaded adds only what is new.",
    ],
  ];
}

export function templateWorkbook(opts?: { blank?: boolean }): Buffer {
  const wb = XLSX.utils.book_new();

  const rows = opts?.blank ? [HEADERS] : [HEADERS, ...EXAMPLE_ROWS];
  const reviews = XLSX.utils.aoa_to_sheet(rows);
  reviews["!cols"] = [
    { wch: 26 }, { wch: 13 }, { wch: 8 }, { wch: 34 }, { wch: 60 },
    { wch: 13 }, { wch: 20 }, { wch: 17 }, { wch: 22 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, reviews, "Reviews");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(skuReferenceRows()),
    "Products",
  );

  const guide = XLSX.utils.aoa_to_sheet(guideRows());
  guide["!cols"] = [{ wch: 18 }, { wch: 11 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, guide, "How to fill this in");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function templateCsv(opts?: { blank?: boolean }): string {
  const rows = opts?.blank ? [HEADERS] : [HEADERS, ...EXAMPLE_ROWS];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(sheet);
}
