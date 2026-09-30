import {
  brandStats,
  bucketTable,
  dateRange,
  direction,
  portfolio,
  summarise,
  themesFor,
  trend,
  type BucketRow,
  type BucketTable,
  type DirectionResult,
  type RatingSummary,
  type SkuStats,
  type TrendResult,
} from "../aggregate";
import { deriveTone, getAllInsights, getSkuInsight } from "../insights";
import type { InsightTone, SkuInsight } from "../insights/types";
import { skuById, type Sku } from "../skus";
import type { Theme } from "../text";
import type { Brand, Review } from "../types";

/**
 * Everything the PDF report prints, worked out before any layout happens.
 *
 * Built from the same aggregate and insight functions the dashboard renders
 * from, so the report and the page cannot disagree, and kept free of
 * react-pdf so it can be tested as plain data.
 */
export type ReportScope =
  | { kind: "portfolio" }
  | { kind: "brand"; brand: Brand }
  | { kind: "sku"; skuId: string };

export type SkuSection = {
  sku: Sku;
  stats: SkuStats;
  direction: DirectionResult;
  buckets: BucketTable;
  trend: TrendResult;
  praise: Theme[];
  complaints: Theme[];
  /** From live numbers, as on the dashboard, not the tone baked into the file. */
  tone: InsightTone;
  insight: SkuInsight | null;
  /** The analysis was written from a different set of reviews than today's. */
  isStale: boolean;
};

export type ReportData = {
  scope: ReportScope;
  title: string;
  scopeLabel: string;
  generatedAt: Date;
  source: string;
  range: { from: string; to: string } | null;
  all: RatingSummary;
  verified: RatingSummary;
  falling: Sku[];
  topProblem: BucketRow | null;
  /** Per-brand totals. Portfolio only. */
  brands: {
    brand: Brand;
    all: RatingSummary;
    verified: RatingSummary;
    skuCount: number;
  }[];
  /** Critical first, then action needed; worst verified average first within each. */
  priorities: SkuSection[];
  /** Attention order: worst verified average first, too-small-to-judge last. */
  ranked: SkuSection[];
  buckets: BucketTable;
  model: string;
  /** Earliest and latest date an analysis in this report was written. */
  insightsWritten: { from: string; to: string } | null;
};

export const TONE_LABEL: Record<InsightTone, string> = {
  critical: "Critical concern",
  warning: "Action needed",
  watch: "Watch item",
  healthy: "Healthy performer",
  unknown: "Insufficient evidence",
};

const TONE_RANK: Record<InsightTone, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  healthy: 3,
  unknown: 4,
};

export function buildReport(
  reviews: Review[],
  scope: ReportScope,
  opts: { source: string; generatedAt: Date },
): ReportData {
  const inScope = reviews.filter((r) => {
    if (scope.kind === "sku") return r.skuId === scope.skuId;
    if (scope.kind === "brand") return skuById(r.skuId)?.brand === scope.brand;
    return true;
  });

  // portfolio() ranks every SKU against the whole data set; keep its order and
  // drop the rows outside the scope, so a brand report ranks the same way.
  const port = portfolio(reviews);
  const rows = port.skus.filter((row) => {
    if (scope.kind === "sku") return row.sku.id === scope.skuId;
    if (scope.kind === "brand") return row.brand === scope.brand;
    return true;
  });

  const ranked: SkuSection[] = rows.map((row) => {
    const mine = reviews.filter((r) => r.skuId === row.sku.id);
    const { insight, isStale } = getSkuInsight(row.sku.id, mine);
    return {
      sku: row.sku,
      stats: row,
      direction: direction(mine),
      buckets: bucketTable(mine),
      trend: trend(mine),
      praise: themesFor(mine, "positive", row.sku, 3),
      complaints: themesFor(mine, "negative", row.sku, 3),
      tone: insight?.tone ?? deriveTone(mine),
      insight,
      isStale,
    };
  });

  const priorities = ranked
    .filter((s) => s.tone === "critical" || s.tone === "warning")
    .sort(
      (a, b) =>
        TONE_RANK[a.tone] - TONE_RANK[b.tone] ||
        (a.stats.verified.avg ?? 99) - (b.stats.verified.avg ?? 99),
    );

  const buckets = bucketTable(inScope);
  const named = buckets.rows.filter(
    (r) => r.bucket !== "Unclassified" && r.count > 0,
  );
  const file = getAllInsights();

  let title: string;
  let scopeLabel: string;
  if (scope.kind === "sku") {
    const sku = skuById(scope.skuId);
    title = `${sku?.name ?? scope.skuId}: insights report`;
    scopeLabel = `${sku?.brand ?? ""} · one listing`;
  } else if (scope.kind === "brand") {
    title = `${scope.brand}: insights report`;
    scopeLabel = `${scope.brand} · ${rows.length} listings`;
  } else {
    title = "SharkNinja India: insights report";
    scopeLabel = `Ninja and Shark · ${rows.length} listings`;
  }

  return {
    scope,
    title,
    scopeLabel,
    generatedAt: opts.generatedAt,
    source: opts.source,
    range: dateRange(inScope),
    all: summarise(inScope),
    verified: summarise(inScope.filter((r) => r.verified)),
    falling: ranked
      .filter((s) => s.direction.dir === "falling")
      .map((s) => s.sku),
    topProblem: named[0] ?? null,
    brands:
      scope.kind === "portfolio"
        ? port.brands
        : scope.kind === "brand"
          ? [
              (() => {
                const b = brandStats(scope.brand, reviews);
                return {
                  brand: scope.brand,
                  all: b.all,
                  verified: b.verified,
                  skuCount: b.skus.length,
                };
              })(),
            ]
          : [],
    priorities,
    ranked,
    buckets,
    model: cleanModel(file.model),
    // Per listing, not the file's own stamp: some analyses were rewritten
    // after the file was first generated.
    insightsWritten: (() => {
      const days = ranked
        .map((r) => r.insight?.generatedAt.slice(0, 10))
        .filter((d): d is string => Boolean(d))
        .sort();
      return days.length ? { from: days[0], to: days[days.length - 1] } : null;
    })(),
  };
}

/** "openrouter/anthropic/claude-3.5-sonnet" reads as "claude-3.5-sonnet", as on the page. */
function cleanModel(model: string) {
  return model.replace("openrouter/", "").replace("anthropic/", "");
}

/** "sharkninja-insights-2026-09-30.pdf", "ninja-blast-insights-2026-09-30.pdf". */
export function reportFilename(scope: ReportScope, now: Date): string {
  const name =
    scope.kind === "sku"
      ? scope.skuId
      : scope.kind === "brand"
        ? scope.brand.toLowerCase()
        : "sharkninja";
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return `${name}-insights-${day}.pdf`;
}
