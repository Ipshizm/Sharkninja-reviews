export type Brand = "Ninja" | "Shark";

export type Sentiment = "positive" | "neutral" | "negative";

export const BUCKETS = [
  "Product",
  "Delivery / DOA",
  "Customer Service",
  "Installation / Demo",
  "Returns / Replacement",
  "Marketplace",
] as const;

export type Bucket = (typeof BUCKETS)[number];

/** One review as parsed out of a workbook, before it is stored. */
export type ParsedReview = {
  skuId: string;
  reviewer: string;
  rating: number;
  title: string;
  body: string;
  reviewDate: string; // ISO yyyy-mm-dd
  verified: boolean;
  country: string;
  variant: string | null;
};

/**
 * A row of a headed table that could not become a review. Reported rather than
 * dropped: an import that is quietly short is the failure nobody catches.
 */
export type SkippedRow = {
  sheetName: string;
  /** 1-based spreadsheet row, so it can be opened and looked at. */
  row: number;
  reason: "unknown-product" | "bad-rating" | "bad-date" | "empty-review";
  detail: string;
};

/** A stored review: parsed, hashed, classified. */
export type Review = ParsedReview & {
  hash: string;
  buckets: Bucket[];
};

export type IngestReport = {
  filename: string;
  sheetsRead: number;
  rowsRead: number;
  parsed: number;
  inserted: number;
  duplicates: number;
  unmappedSheets: string[];
  skippedRows: SkippedRow[];
  perSku: { skuId: string; name: string; parsed: number; inserted: number }[];
  dateRange: { from: string; to: string } | null;
  warnings: Warning[];
};

/**
 * Reviews are pasted in by hand, so paste errors are routine rather than
 * exceptional. These do not block an import — they tell whoever ran it which
 * rows to go and look at.
 */
export type Warning = {
  kind:
    | "suspicious-reviewer"
    | "duplicate-in-file"
    | "empty-review"
    | "future-date"
    | "skipped-rows"
    | "unrecognised-sheet";
  skuId: string;
  detail: string;
};

export function sentimentOf(rating: number): Sentiment {
  if (rating >= 4) return "positive";
  if (rating === 3) return "neutral";
  return "negative";
}
