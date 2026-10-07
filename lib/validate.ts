import type { ParsedReview, SkippedRow, Warning } from "./types";
import { skuById } from "./skus";

/** Data-entry noise seen in real exports. */
const PLACEHOLDER_NAMES = /^(placeholder|test|xxx|na|n\/a|-+|reviewer)$/i;

/**
 * A reviewer field holding a whole sentence means a line from somewhere else
 * was pasted where the name belongs — the September export has exactly this,
 * a speaker review's text sitting above a steam mop review.
 */
function looksLikeProse(name: string): boolean {
  const n = name.trim();
  if (PLACEHOLDER_NAMES.test(n)) return true;
  if (n.length > 45) return true;
  // A full stop followed by a lower-case word is mid-sentence. Initials
  // ("K. Agarwal", "Dr T.N. Manohara") are followed by a capital, so they pass.
  if (/[.!?]\s+[a-z]/.test(n)) return true;
  return n.split(/\s+/).length > 6;
}

export function validate(
  reviews: ParsedReview[],
  duplicateHashes: number,
  skippedRows: SkippedRow[] = [],
  unmappedSheets: string[] = [],
): Warning[] {
  const warnings: Warning[] = [];

  if (unmappedSheets.length > 0) {
    warnings.push({
      kind: "unrecognised-sheet",
      skuId: "",
      detail: `${unmappedSheets.length === 1 ? "Tab" : "Tabs"} not imported because no product matches: ${unmappedSheets.join(", ")}. Rename ${unmappedSheets.length === 1 ? "it" : "them"} after the product, or ask the dashboard maintainer to add ${unmappedSheets.length === 1 ? "a new product" : "new products"}. Reviews already loaded are skipped automatically.`,
    });
  }
  const today = new Date().toISOString().slice(0, 10);

  for (const r of reviews) {
    if (looksLikeProse(r.reviewer)) {
      warnings.push({
        kind: "suspicious-reviewer",
        skuId: r.skuId,
        detail: `"${r.title}" (${r.reviewDate}) has "${truncate(r.reviewer)}" as the reviewer name — check that row in the sheet.`,
      });
    }
    if (!r.title && !r.body) {
      warnings.push({
        kind: "empty-review",
        skuId: r.skuId,
        detail: `A ${r.rating}-star review dated ${r.reviewDate} has neither title nor text.`,
      });
    }
    if (r.reviewDate > today) {
      warnings.push({
        kind: "future-date",
        skuId: r.skuId,
        detail: `"${r.title}" is dated ${r.reviewDate}, which is in the future.`,
      });
    }
  }

  if (duplicateHashes > 0) {
    warnings.push({
      kind: "duplicate-in-file",
      skuId: "",
      detail: `${duplicateHashes} review${duplicateHashes === 1 ? " was" : "s were"} pasted more than once inside this file. Counted once.`,
    });
  }

  for (const [reason, rows] of groupByReason(skippedRows)) {
    warnings.push({
      kind: "skipped-rows",
      skuId: "",
      detail: `${rows.length} row${rows.length === 1 ? "" : "s"} could not be read (${SKIP_LABEL[reason]}): ${rows
        .slice(0, 4)
        .map((r) => `${r.sheetName} row ${r.row}`)
        .join(", ")}${rows.length > 4 ? `, and ${rows.length - 4} more` : ""}. ${rows[0].detail}`,
    });
  }

  return warnings;
}

const SKIP_LABEL: Record<SkippedRow["reason"], string> = {
  "unknown-product": "the product did not match a SKU",
  "bad-rating": "no usable rating",
  "bad-date": "no usable date",
  "empty-review": "nothing written in it",
};

function groupByReason(rows: SkippedRow[]): [SkippedRow["reason"], SkippedRow[]][] {
  const byReason = new Map<SkippedRow["reason"], SkippedRow[]>();
  for (const r of rows) {
    const list = byReason.get(r.reason);
    if (list) list.push(r);
    else byReason.set(r.reason, [r]);
  }
  return [...byReason.entries()];
}

export function warningLabel(w: Warning): string {
  const sku = w.skuId ? (skuById(w.skuId)?.name ?? w.skuId) : "This file";
  return `${sku}: ${w.detail}`;
}

const truncate = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}...` : s);
